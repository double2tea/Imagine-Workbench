import assert from "node:assert/strict";
import test from "node:test";

import { generateMimoTts, generateMimoTtsVoiceClone, generateMimoTtsVoiceDesign } from "../lib/providers/mimo-tts";
import { generateAudioOperation } from "../lib/providers/audio";
import { listProviderModels } from "../lib/providers/models";
import type { ProviderConfig } from "../lib/providers/types";

const mimoConfig: ProviderConfig = {
  provider: "mimo",
  apiKey: "mimo_test_key",
  baseUrl: "https://api.xiaomimimo.com",
  videoBaseUrl: "https://api.xiaomimimo.com",
};

test("mimo model listing uses static chat models without fetching", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => {
    throw new Error("MiMo static model listing should not fetch");
  };

  try {
    const chatModels = await listProviderModels(mimoConfig, "chat");
    const allModels = await listProviderModels(mimoConfig, "all");
    const audioModels = await listProviderModels(mimoConfig, "audio");

    assert.equal(chatModels.some(option => option.value === "mimo:mimo-v2.5-pro"), true);
    assert.equal(allModels.some(option => option.value === "mimo:mimo-v2.5"), true);
    assert.deepEqual(audioModels, [
      { value: "mimo:mimo-v2.5-tts", label: "MiMo V2.5 TTS" },
      { value: "mimo:mimo-v2.5-tts-voicedesign", label: "MiMo V2.5 Voice Design" },
      { value: "mimo:mimo-v2.5-tts-voiceclone", label: "MiMo V2.5 Voice Clone" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mimo built-in TTS sends chat completions audio request", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Headers; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: input.toString(),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) as unknown : null,
    });
    return Response.json({ choices: [{ message: { audio: { data: "audio_base64" } } }] });
  };

  try {
    const result = await generateMimoTts(mimoConfig, {
      text: "Hello world",
      stylePrompt: "Bright voice",
      voice: "Chloe",
      format: "wav",
    });

    assert.deepEqual(result, {
      audioBase64: "audio_base64",
      format: "wav",
      model: "mimo-v2.5-tts",
      mimeType: "audio/wav",
    });
    assert.equal(calls[0]?.url, "https://api.xiaomimimo.com/v1/chat/completions");
    assert.equal(calls[0]?.headers.get("api-key"), "mimo_test_key");
    assert.deepEqual(calls[0]?.body, {
      model: "mimo-v2.5-tts",
      messages: [
        { role: "user", content: "Bright voice" },
        { role: "assistant", content: "Hello world" },
      ],
      audio: { format: "wav", voice: "Chloe" },
      stream: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mimo voice design maps optimizeTextPreview inside audio object", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) as unknown : null);
    return Response.json({ choices: [{ message: { audio: { data: "pcm_base64" } } }] });
  };

  try {
    const result = await generateMimoTtsVoiceDesign(mimoConfig, {
      text: "Designed voice text",
      stylePrompt: "Warm young narrator",
      format: "pcm16",
      optimizeTextPreview: true,
    });

    assert.deepEqual(result, {
      audioBase64: "pcm_base64",
      format: "pcm16",
      model: "mimo-v2.5-tts-voicedesign",
      mimeType: "audio/pcm",
      sampleRateHz: 24000,
    });
    assert.deepEqual(bodies[0], {
      model: "mimo-v2.5-tts-voicedesign",
      messages: [
        { role: "user", content: "Warm young narrator" },
        { role: "assistant", content: "Designed voice text" },
      ],
      audio: { format: "pcm16", optimize_text_preview: true },
      stream: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mimo voice clone sends reference audio as voice", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) as unknown : null);
    return Response.json({ choices: [{ message: { audio: { data: "clone_base64" } } }] });
  };

  try {
    const result = await generateMimoTtsVoiceClone(mimoConfig, {
      text: "Clone this line",
      stylePrompt: "Calm narration",
      voice: "data:audio/mpeg;base64,voice_audio",
      format: "wav",
    });

    assert.deepEqual(result, {
      audioBase64: "clone_base64",
      format: "wav",
      model: "mimo-v2.5-tts-voiceclone",
      mimeType: "audio/wav",
    });
    assert.deepEqual(bodies[0], {
      model: "mimo-v2.5-tts-voiceclone",
      messages: [
        { role: "user", content: "Calm narration" },
        { role: "assistant", content: "Clone this line" },
      ],
      audio: { format: "wav", voice: "data:audio/mpeg;base64,voice_audio" },
      stream: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mimo audio operation routes voice design to direct adapter", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) as unknown : null);
    return Response.json({ choices: [{ message: { audio: { data: "designed_audio" } } }] });
  };

  try {
    const result = await generateAudioOperation(mimoConfig, {
      mode: "voice_design",
      prompt: "Read this line",
      model: "mimo-v2.5-tts-voicedesign",
      referenceMedia: [],
      format: "wav",
      stylePrompt: "Warm documentary narrator",
    });

    assert.equal(result.type, "direct");
    assert.equal(result.audioBase64, "designed_audio");
    assert.deepEqual(bodies[0], {
      model: "mimo-v2.5-tts-voicedesign",
      messages: [
        { role: "user", content: "Warm documentary narrator" },
        { role: "assistant", content: "Read this line" },
      ],
      audio: { format: "wav" },
      stream: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mimo audio operation routes voice clone to direct adapter", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) as unknown : null);
    return Response.json({ choices: [{ message: { audio: { data: "cloned_audio" } } }] });
  };

  try {
    const result = await generateAudioOperation(mimoConfig, {
      mode: "voice_clone",
      prompt: "Read this line",
      model: "mimo-v2.5-tts-voiceclone",
      referenceMedia: [{ dataUri: "data:audio/wav;base64,voice_audio", type: "audio" }],
      format: "wav",
      stylePrompt: "Bright ad read",
      voiceCloneConsentAccepted: true,
    });

    assert.equal(result.type, "direct");
    assert.equal(result.audioBase64, "cloned_audio");
    assert.deepEqual(bodies[0], {
      model: "mimo-v2.5-tts-voiceclone",
      messages: [
        { role: "user", content: "Bright ad read" },
        { role: "assistant", content: "Read this line" },
      ],
      audio: { format: "wav", voice: "data:audio/wav;base64,voice_audio" },
      stream: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("audio operation rejects unresolved voice profile ids", async () => {
  await assert.rejects(
    () => generateAudioOperation(mimoConfig, {
      mode: "tts",
      prompt: "Read this line",
      model: "mimo-v2.5-tts",
      referenceMedia: [],
      voiceProfileId: "voice_profile_only_in_indexeddb",
    }),
    /Voice profile IDs must be resolved/,
  );
});

test("mimo audio operation rejects voice clone without one audio reference", async () => {
  await assert.rejects(
    () => generateAudioOperation(mimoConfig, {
      mode: "voice_clone",
      prompt: "Read this line",
      model: "mimo-v2.5-tts-voiceclone",
      referenceMedia: [],
      voiceCloneConsentAccepted: true,
    }),
    /requires exactly one audio reference/,
  );
});

test("audio operation requires consent for voice clone mode", async () => {
  await assert.rejects(
    () => generateAudioOperation(mimoConfig, {
      mode: "voice_clone",
      prompt: "Read this line",
      model: "mimo-v2.5-tts-voiceclone",
      referenceMedia: [],
    }),
    /音色克隆需要先确认参考音频授权/,
  );
});
