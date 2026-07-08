import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { generateAudioOperation } from "../lib/providers/audio";
import { generateSeedAudio } from "../lib/providers/seed-audio";
import { listProviderModels } from "../lib/providers/models";
import { GET as listModelsRoute } from "../app/api/models/route";
import type { ProviderConfig } from "../lib/providers/types";

const seedAudioConfig: ProviderConfig = {
  provider: "volcengine",
  apiKey: "seed_audio_test_key",
  baseUrl: "https://openspeech.bytedance.com",
  videoBaseUrl: "https://openspeech.bytedance.com",
};

test("Seed Audio model listing uses static audio capabilities without fetching", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => {
    throw new Error("Seed Audio static model listing should not fetch");
  };

  try {
    assert.deepEqual(await listProviderModels(seedAudioConfig, "audio"), [
      { value: "volcengine:seed-audio-1.0", label: "Seed Audio 1.0" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Volcengine audio model route uses Seed Audio credential scope", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => {
    throw new Error("Seed Audio scoped model listing should not fetch Ark models");
  };

  try {
    const response = await listModelsRoute(new NextRequest("http://local.test/api/models?provider=volcengine&kind=audio", {
      headers: { "x-ai-audio-api-key": "seed_audio_test_key" },
    }));
    assert.equal(response.status, 200);
    const body = await response.json() as { models?: Array<{ value?: unknown; label?: unknown }>; kind?: unknown };
    assert.equal(body.kind, "audio");
    assert.deepEqual(body.models, [
      { value: "volcengine:seed-audio-1.0", label: "Seed Audio 1.0" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Volcengine Ark model listing uses api/v3 OpenAI-compatible paths", async () => {
  const config: ProviderConfig = {
    provider: "volcengine",
    apiKey: "volcengine_test_key",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    videoBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  };
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input.toString(), headers: new Headers(init?.headers) });
    return Response.json({ data: [{ id: "doubao-seed-test" }] });
  };

  try {
    assert.deepEqual(await listProviderModels(config, "chat"), [
      { value: "volcengine:doubao-seed-test", label: "Volcengine Ark doubao-seed-test" },
    ]);
    assert.equal(calls[0]?.url, "https://ark.cn-beijing.volces.com/api/v3/models");
    assert.equal(calls[0]?.headers.get("Authorization"), "Bearer volcengine_test_key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Seed Audio prompt generation sends OpenSpeech create request", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Headers; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: input.toString(),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) as unknown : null,
    });
    return Response.json({ audio: "seed_audio_base64", duration: 1.2, original_duration: 1.2 });
  };

  try {
    const result = await generateAudioOperation(seedAudioConfig, {
      mode: "tts",
      prompt: "生成一个清脆的金币音效。",
      model: "seed-audio-1.0",
      referenceMedia: [],
      format: "mp3",
      parameterValues: {
        sample_rate: "44100",
        speech_rate: 12,
        loudness_rate: -4,
        pitch_rate: 2,
        aigc_watermark: true,
        aigc_metadata_enable: true,
        aigc_metadata_content_producer: "Imagine Workbench",
        aigc_metadata_produce_id: "asset-1",
      },
      voice: "S_test_speaker",
    });

    assert.deepEqual(result, {
      type: "direct",
      outputKind: "audio",
      source: "volcengine",
      audioBase64: "seed_audio_base64",
      format: "mp3",
      model: "seed-audio-1.0",
      mimeType: "audio/mpeg",
    });
    assert.equal(calls[0]?.url, "https://openspeech.bytedance.com/api/v3/tts/create");
    assert.equal(calls[0]?.headers.get("X-Api-Key"), "seed_audio_test_key");
    assert.ok(calls[0]?.headers.get("X-Api-Request-Id"));
    assert.deepEqual(calls[0]?.body, {
      model: "seed-audio-1.0",
      text_prompt: "生成一个清脆的金币音效。",
      references: [{ speaker: "S_test_speaker" }],
      audio_config: {
        format: "mp3",
        sample_rate: 44100,
        speech_rate: 12,
        loudness_rate: -4,
        pitch_rate: 2,
      },
      watermark: {
        aigc_watermark: true,
        aigc_metadata: {
          enable: true,
          content_producer: "Imagine Workbench",
          produce_id: "asset-1",
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Seed Audio maps audio and image data URI references", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) as unknown : null);
    return Response.json({ audio: "reference_audio_base64" });
  };

  try {
    await generateSeedAudio(seedAudioConfig, {
      mode: "voice_clone",
      prompt: "参考@音频1的音色，说：欢迎回家。",
      model: "seed-audio-1.0",
      referenceMedia: [{ dataUri: "data:audio/wav;base64,voice_audio", type: "audio" }],
      format: "wav",
      voiceCloneConsentAccepted: true,
    });
    assert.deepEqual(bodies[0], {
      model: "seed-audio-1.0",
      text_prompt: "参考@音频1的音色，说：欢迎回家。",
      references: [{ audio_data: "voice_audio" }],
      audio_config: { format: "wav" },
    });

    await generateSeedAudio(seedAudioConfig, {
      mode: "sfx",
      prompt: "生成这张图对应的夏夜街区环境音。",
      model: "seed-audio-1.0",
      referenceMedia: [{ dataUri: "data:image/png;base64,scene_image", type: "image" }],
      format: "ogg_opus",
    });
    assert.deepEqual(bodies[1], {
      model: "seed-audio-1.0",
      text_prompt: "生成这张图对应的夏夜街区环境音。",
      references: [{ image_data: "scene_image" }],
      audio_config: { format: "ogg_opus" },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Seed Audio rejects mixed image and audio references before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (): Promise<Response> => {
    fetchCount += 1;
    throw new Error("Mixed references must be rejected before fetch");
  };

  try {
    await assert.rejects(
      () => generateSeedAudio(seedAudioConfig, {
        mode: "sfx",
        prompt: "Generate a scene.",
        model: "seed-audio-1.0",
        referenceMedia: [
          { dataUri: "data:image/png;base64,scene_image", type: "image" },
          { dataUri: "data:audio/wav;base64,voice_audio", type: "audio" },
        ],
        format: "wav",
      }),
      /cannot be mixed/,
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Seed Audio rejects image and speaker references before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (): Promise<Response> => {
    fetchCount += 1;
    throw new Error("Image and speaker references must be rejected before fetch");
  };

  try {
    await assert.rejects(
      () => generateSeedAudio(seedAudioConfig, {
        mode: "tts",
        prompt: "Describe the scene.",
        model: "seed-audio-1.0",
        referenceMedia: [{ dataUri: "data:image/png;base64,scene_image", type: "image" }],
        format: "wav",
        voice: "speaker-1",
      }),
      /cannot be mixed/,
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Seed Audio rejects multiple image references before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (): Promise<Response> => {
    fetchCount += 1;
    throw new Error("Multiple image references must be rejected before fetch");
  };

  try {
    await assert.rejects(
      () => generateSeedAudio(seedAudioConfig, {
        mode: "sfx",
        prompt: "Generate a scene.",
        model: "seed-audio-1.0",
        referenceMedia: [
          { dataUri: "data:image/png;base64,scene_image_1", type: "image" },
          { dataUri: "data:image/png;base64,scene_image_2", type: "image" },
        ],
        format: "wav",
      }),
      /at most one image/,
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Seed Audio rejects voice clone without audio reference or speaker before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (): Promise<Response> => {
    fetchCount += 1;
    throw new Error("Missing clone audio must be rejected before fetch");
  };

  try {
    await assert.rejects(
      () => generateSeedAudio(seedAudioConfig, {
        mode: "voice_clone",
        prompt: "Clone this voice.",
        model: "seed-audio-1.0",
        referenceMedia: [{ dataUri: "data:image/png;base64,scene_image", type: "image" }],
        format: "wav",
        voiceCloneConsentAccepted: true,
      }),
      /voice clone requires an audio reference or speaker ID/,
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Seed Audio rejects reference payloads larger than 10MB before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (): Promise<Response> => {
    fetchCount += 1;
    throw new Error("Oversized references must be rejected before fetch");
  };

  try {
    const oversizedBase64 = "a".repeat(Math.ceil(((10 * 1024 * 1024) + 1) * 4 / 3));
    await assert.rejects(
      () => generateSeedAudio(seedAudioConfig, {
        mode: "voice_clone",
        prompt: "Say hello.",
        model: "seed-audio-1.0",
        referenceMedia: [{ dataUri: `data:audio/wav;base64,${oversizedBase64}`, type: "audio" }],
        format: "wav",
        voiceCloneConsentAccepted: true,
      }),
      /at most 10MB/,
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
