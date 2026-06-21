import assert from "node:assert/strict";
import test from "node:test";

import {
  postOpenAiAudioSpeech,
  postOpenAiAudioTranscriptions,
  postOpenAiImageEdits,
  postOpenAiImageGenerations,
} from "../lib/api/openai-media";
import { assertPublicHttpUrl } from "../lib/api/url-safety";
import { REFERENCE_IMAGE_MAX_BYTES, REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES } from "../lib/reference-images";

test("OpenAI-compatible image generations maps JSON to provider image adapter", async () => {
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://newapi.example.test/v1/images/generations");
    assert.equal(readHeader(init?.headers, "Authorization"), "Bearer image_key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "image-model",
      prompt: "a small studio product photo",
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    });
    return jsonResponse({ data: [{ b64_json: "aW1hZ2U=" }] });
  });

  try {
    const response = await postOpenAiImageGenerations(jsonRequest("/v1/images/generations", {
      model: "newapi:image-model",
      prompt: "a small studio product photo",
    }, {
      "x-ai-api-key": "image_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));

    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
    const body = await response.json() as { created?: unknown; data?: Array<{ b64_json?: string }> };
    assert.equal(typeof body.created, "number");
    assert.equal(body.data?.[0]?.b64_json, "aW1hZ2U=");
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible image generations separates gateway auth from provider auth", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://newapi.example.test/v1/images/generations");
    assert.equal(readHeader(init?.headers, "Authorization"), "Bearer image_key");
    return jsonResponse({ data: [{ b64_json: "aW1hZ2U=" }] });
  });

  try {
    const response = await postOpenAiImageGenerations(jsonRequest("/v1/images/generations", {
      model: "newapi:image-model",
      prompt: "a small studio product photo",
    }, {
      Authorization: "Bearer gateway_key",
      "x-ai-api-key": "image_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));

    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
    mock.restore();
  }
});

test("OpenAI-compatible image generations rejects missing gateway auth when configured", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";
  const mock = withFetchMock(async () => {
    throw new Error("Gateway auth failure must be rejected before fetch");
  });

  try {
    const response = await postOpenAiImageGenerations(jsonRequest("/v1/images/generations", {
      model: "newapi:image-model",
      prompt: "cat",
    }, {
      "x-ai-api-key": "image_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));

    assert.equal(response.status, 401);
    assert.match(await response.text(), /gateway API key/);
    assert.equal(mock.calls.count, 0);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
    mock.restore();
  }
});

test("OpenAI-compatible image generations checks gateway auth before parsing JSON", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";

  try {
    const response = await postOpenAiImageGenerations(new Request("http://local.test/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }));

    assert.equal(response.status, 401);
    assert.match(await response.text(), /gateway API key/);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
  }
});

test("OpenAI-compatible image edits checks gateway auth before parsing multipart bodies", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";

  try {
    const response = await postOpenAiImageEdits(new Request("http://local.test/v1/images/edits", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not multipart",
    }));

    assert.equal(response.status, 401);
    assert.match(await response.text(), /gateway API key/);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
  }
});

test("OpenAI-compatible image generations rejects impossible multi-image requests", async () => {
  const response = await postOpenAiImageGenerations(jsonRequest("/v1/images/generations", {
    model: "newapi:image-model",
    prompt: "cat",
    n: 2,
  }, {
    "x-ai-api-key": "image_key",
    "x-ai-base-url": "https://newapi.example.test/v1",
  }));

  assert.equal(response.status, 400);
  assert.match(await response.text(), /n=1 only/);
});

test("OpenAI-compatible image generations rejects async targets before provider submission", async () => {
  const mock = withFetchMock(async () => {
    throw new Error("async image target must be rejected before fetch");
  });

  try {
    const response = await postOpenAiImageGenerations(jsonRequest("/v1/images/generations", {
      model: "12ai-async:gpt-image-2",
      prompt: "cat",
    }));

    assert.equal(response.status, 400);
    assert.match(await response.text(), /immediate OpenAI-compatible image targets only/);
    assert.equal(mock.calls.count, 0);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible image generations rejects workflow providers before provider submission", async () => {
  const mock = withFetchMock(async () => {
    throw new Error("workflow image target must be rejected before fetch");
  });

  try {
    const response = await postOpenAiImageGenerations(jsonRequest("/v1/images/generations", {
      model: "runninghub:api:/openapi/v2/example/image-model",
      prompt: "cat",
    }));

    assert.equal(response.status, 400);
    assert.match(await response.text(), /immediate OpenAI-compatible image targets only/);
    assert.equal(mock.calls.count, 0);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible image generations blocks private provider result URLs when converting to base64", async () => {
  const mock = withFetchMock(async () => {
    return jsonResponse({ data: [{ url: "http://127.0.0.1/private.png" }] });
  });

  try {
    const response = await postOpenAiImageGenerations(jsonRequest("/v1/images/generations", {
      model: "newapi:image-model",
      prompt: "cat",
    }, {
      "x-ai-api-key": "image_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));

    assert.equal(response.status, 502);
    assert.match(await response.text(), /local or private network/);
    assert.equal(mock.calls.count, 1);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible image generations blocks IPv4-mapped IPv6 provider result URLs", async () => {
  assert.throws(
    () => assertPublicHttpUrl("http://[::ffff:127.0.0.1]/private.png", "unsafe_image_result_url"),
    /local or private network/,
  );
});

test("OpenAI-compatible image generations rejects oversized provider image downloads", async () => {
  const mock = withFetchMock(async input => {
    if (String(input).includes("/v1/images/generations")) {
      return jsonResponse({ data: [{ url: "https://cdn.example.test/huge.png" }] });
    }

    return new Response(oversizedImageStream(), {
      headers: {
        "Content-Type": "image/png",
      },
    });
  });

  try {
    const response = await postOpenAiImageGenerations(jsonRequest("/v1/images/generations", {
      model: "newapi:image-model",
      prompt: "cat",
    }, {
      "x-ai-api-key": "image_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));

    assert.equal(response.status, 502);
    assert.match(await response.text(), /too large/);
    assert.equal(mock.calls.count, 2);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible image edits rejects oversized multipart bodies before parsing files", async () => {
  const response = await postOpenAiImageEdits(new Request("http://local.test/v1/images/edits", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": String(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES + 1),
    },
    body: "not multipart",
  }));

  assert.equal(response.status, 413);
  assert.match(await response.text(), /too large/);
});

test("OpenAI-compatible image edits rejects oversized data URI form fields without content length", async () => {
  const mock = withFetchMock(async () => {
    throw new Error("Oversized data URI must be rejected before provider submission");
  });

  try {
    const form = new FormData();
    form.set("model", "newapi:image-edit-model");
    form.set("prompt", "make it blue");
    form.set("image", makeDataUri(REFERENCE_IMAGE_MAX_BYTES + 1));

    const response = await postOpenAiImageEdits(formRequest("/v1/images/edits", form, {
      "x-ai-api-key": "image_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));

    assert.equal(response.status, 413);
    assert.match(await response.text(), /too large/);
    assert.equal(mock.calls.count, 0);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible image edits accepts multipart image upload", async () => {
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://newapi.example.test/v1/images/edits");
    assert.equal(readHeader(init?.headers, "Authorization"), "Bearer image_key");
    assert.ok(init?.body instanceof FormData);
    const form = init.body;
    assert.equal(form.get("model"), "image-edit-model");
    assert.match(String(form.get("prompt")), /Edit instruction: make it blue/);
    assert.equal(form.get("response_format"), "b64_json");
    assert.ok(form.get("image") instanceof Blob);
    return jsonResponse({ data: [{ b64_json: "ZWRpdA==" }] });
  });

  try {
    const form = new FormData();
    form.set("model", "newapi:image-edit-model");
    form.set("prompt", "make it blue");
    form.set("image", new Blob(["input image"], { type: "image/png" }), "image.png");

    const response = await postOpenAiImageEdits(formRequest("/v1/images/edits", form, {
      "x-ai-api-key": "image_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));
    const body = await response.json() as { data?: Array<{ b64_json?: string }> };

    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
    assert.equal(body.data?.[0]?.b64_json, "ZWRpdA==");
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible image edits accepts OpenAI-style multiple image uploads", async () => {
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://newapi.example.test/v1/images/edits");
    assert.ok(init?.body instanceof FormData);
    const form = init.body;
    const images = form.getAll("image[]");
    assert.equal(images.length, 3);
    assert.ok(images.every(value => value instanceof Blob));
    assert.equal(form.get("image"), null);
    assert.match(String(form.get("prompt")), /Additional input images are visual references/);
    return jsonResponse({ data: [{ b64_json: "bXVsdGk=" }] });
  });

  try {
    const form = new FormData();
    form.set("model", "newapi:image-edit-model");
    form.set("prompt", "combine the references");
    form.append("image[]", new Blob(["source image"], { type: "image/png" }), "source.png");
    form.append("image[]", new Blob(["reference one"], { type: "image/png" }), "reference-one.png");
    form.append("image[]", new Blob(["reference two"], { type: "image/png" }), "reference-two.png");

    const response = await postOpenAiImageEdits(formRequest("/v1/images/edits", form, {
      "x-ai-api-key": "image_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));
    const body = await response.json() as { data?: Array<{ b64_json?: string }> };

    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
    assert.equal(body.data?.[0]?.b64_json, "bXVsdGk=");
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible image edits rejects async image targets before provider submission", async () => {
  const mock = withFetchMock(async () => {
    throw new Error("async image edit target must be rejected before fetch");
  });

  try {
    const form = new FormData();
    form.set("model", "modelscope:Qwen/Qwen-Image");
    form.set("prompt", "make it blue");
    form.set("image", new Blob(["input image"], { type: "image/png" }), "image.png");

    const response = await postOpenAiImageEdits(formRequest("/v1/images/edits", form, {
      Authorization: "Bearer modelscope_key",
    }));

    assert.equal(response.status, 400);
    assert.match(await response.text(), /immediate OpenAI-compatible image targets only/);
    assert.equal(mock.calls.count, 0);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible audio speech returns binary TTS output", async () => {
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://api.xiaomimimo.com/v1/chat/completions");
    assert.equal(readHeader(init?.headers, "api-key"), "mimo_key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "mimo-v2.5-tts",
      messages: [
        { role: "user", content: "calm narrator" },
        { role: "assistant", content: "Hello world" },
      ],
      audio: { format: "wav", voice: "Chloe" },
      stream: false,
    });
    return jsonResponse({ choices: [{ message: { audio: { data: "SGk=" } } }] });
  });

  try {
    const response = await postOpenAiAudioSpeech(jsonRequest("/v1/audio/speech", {
      model: "mimo-v2.5-tts",
      input: "Hello world",
      instructions: "calm narrator",
      voice: "Chloe",
      response_format: "wav",
    }, { Authorization: "Bearer mimo_key" }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "audio/wav");
    assert.equal(await response.text(), "Hi");
    assert.equal(mock.calls.count, 1);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible audio transcriptions accepts multipart audio upload", async () => {
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://api.xiaomimimo.com/v1/chat/completions");
    assert.equal(readHeader(init?.headers, "api-key"), "mimo_key");
    const body = JSON.parse(String(init?.body)) as {
      messages?: Array<{ content?: Array<{ input_audio?: { data?: string } }> }>;
      model?: string;
      asr_options?: { language?: string };
    };
    const audioData = body.messages?.[0]?.content?.[0]?.input_audio?.data;
    assert.equal(body.model, "mimo-v2.5-asr");
    assert.equal(body.asr_options?.language, "zh");
    assert.equal(audioData?.startsWith("data:audio/wav;base64,"), true);
    return jsonResponse({ choices: [{ message: { content: "你好" } }] });
  });

  try {
    const form = new FormData();
    form.set("model", "mimo-v2.5-asr");
    form.set("language", "zh");
    form.set("file", new Blob(["audio bytes"], { type: "audio/wav" }), "audio.wav");

    const response = await postOpenAiAudioTranscriptions(formRequest("/v1/audio/transcriptions", form, {
      Authorization: "Bearer mimo_key",
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: "你好" });
    assert.equal(mock.calls.count, 1);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible audio transcriptions checks gateway auth before parsing multipart bodies", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";

  try {
    const response = await postOpenAiAudioTranscriptions(new Request("http://local.test/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not multipart",
    }));

    assert.equal(response.status, 401);
    assert.match(await response.text(), /gateway API key/);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
  }
});

test("OpenAI-compatible audio transcriptions rejects oversized multipart bodies before parsing files", async () => {
  const response = await postOpenAiAudioTranscriptions(new Request("http://local.test/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": String(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES + 1),
    },
    body: "not multipart",
  }));

  assert.equal(response.status, 413);
  assert.match(await response.text(), /too large/);
});

test("OpenAI-compatible audio transcriptions does not use the image file size cap", async () => {
  const mock = withFetchMock(async () => {
    throw new Error("Oversized MiMo ASR audio must be rejected before fetch");
  });

  try {
    const form = new FormData();
    form.set("model", "mimo-v2.5-asr");
    form.set("file", new Blob([new Uint8Array(REFERENCE_IMAGE_MAX_BYTES + 1)], { type: "audio/wav" }), "audio.wav");

    const response = await postOpenAiAudioTranscriptions(formRequest("/v1/audio/transcriptions", form, {
      Authorization: "Bearer mimo_key",
    }));

    assert.equal(response.status, 400);
    assert.match(await response.text(), /base64 payload exceeds 10MB/);
    assert.equal(mock.calls.count, 0);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible audio transcriptions rejects unsupported languages", async () => {
  const form = new FormData();
  form.set("model", "mimo-v2.5-asr");
  form.set("language", "ja");
  form.set("file", new Blob(["audio bytes"], { type: "audio/wav" }), "audio.wav");

  const response = await postOpenAiAudioTranscriptions(formRequest("/v1/audio/transcriptions", form, {
    Authorization: "Bearer mimo_key",
  }));

  assert.equal(response.status, 400);
  assert.match(await response.text(), /auto, zh, or en/);
});

test("OpenAI-compatible audio transcriptions rejects unsupported MiMo ASR audio formats before provider submission", async () => {
  const mock = withFetchMock(async () => {
    throw new Error("Unsupported ASR audio must be rejected before fetch");
  });

  try {
    const form = new FormData();
    form.set("model", "mimo-v2.5-asr");
    form.set("file", new Blob(["audio bytes"], { type: "audio/ogg" }), "audio.ogg");

    const response = await postOpenAiAudioTranscriptions(formRequest("/v1/audio/transcriptions", form, {
      Authorization: "Bearer mimo_key",
    }));

    assert.equal(response.status, 400);
    assert.match(await response.text(), /wav or mp3/);
    assert.equal(mock.calls.count, 0);
  } finally {
    mock.restore();
  }
});

test("OpenAI-compatible audio transcriptions rejects empty audio uploads as request errors", async () => {
  const mock = withFetchMock(async () => {
    throw new Error("Empty ASR audio must be rejected before fetch");
  });

  try {
    const form = new FormData();
    form.set("model", "mimo-v2.5-asr");
    form.set("file", new Blob([], { type: "audio/wav" }), "audio.wav");

    const response = await postOpenAiAudioTranscriptions(formRequest("/v1/audio/transcriptions", form, {
      Authorization: "Bearer mimo_key",
    }));

    assert.equal(response.status, 400);
    assert.match(await response.text(), /payload is required/);
    assert.equal(mock.calls.count, 0);
  } finally {
    mock.restore();
  }
});

function jsonRequest(pathname: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://local.test${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function formRequest(pathname: string, form: FormData, headers: Record<string, string> = {}): Request {
  return new Request(`http://local.test${pathname}`, {
    method: "POST",
    headers,
    body: form,
  });
}

function makeDataUri(bytes: number): string {
  return `data:image/png;base64,${Buffer.alloc(bytes).toString("base64")}`;
}

function oversizedImageStream(): ReadableStream<Uint8Array> {
  let remainingBytes = REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES + 1;
  const chunk = new Uint8Array(1024 * 1024);

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remainingBytes <= 0) {
        controller.close();
        return;
      }

      const nextSize = Math.min(chunk.byteLength, remainingBytes);
      controller.enqueue(chunk.subarray(0, nextSize));
      remainingBytes -= nextSize;
    },
  });
}

function jsonResponse(body: unknown): Response {
  return Response.json(body);
}

function readHeader(headers: HeadersInit | undefined, name: string): string | undefined {
  return new Headers(headers).get(name) ?? undefined;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function withFetchMock(handler: typeof fetch): { calls: { count: number }; restore: () => void } {
  const originalFetch = globalThis.fetch;
  const calls = { count: 0 };
  globalThis.fetch = (async (input, init) => {
    calls.count += 1;
    return handler(input, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
