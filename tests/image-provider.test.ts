import assert from "node:assert/strict";
import test from "node:test";

import { editImage, generateImage, getAsyncImageStatus } from "../lib/providers/image";
import type { ProviderConfig } from "../lib/providers/types";

const PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgo=";

const twelveAiConfig: ProviderConfig = {
  provider: "12ai",
  apiKey: "twelve_ai_key",
  baseUrl: "https://cdn.12ai.org",
  videoBaseUrl: "https://new.12ai.org",
};

test("12AI async image generation uses the unified task submit API", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestHeaders: Headers;
  let requestBody: unknown;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requestUrl = input.toString();
    requestHeaders = new Headers(init?.headers);
    requestBody = init?.body ? JSON.parse(String(init.body)) as unknown : null;
    return Response.json({ id: "task_123", status: "queued" });
  };

  try {
    const result = await generateImage(twelveAiConfig, {
      prompt: "poster",
      model: "gemini-3.1-flash-image-preview",
      aspectRatio: "16:9",
      imageResolution: "2K",
      referenceImages: [{ dataUri: PNG_DATA_URI }],
      async: true,
    });

    assert.equal(result.operationName, "12ai:image:task_123");
    assert.equal(requestUrl, "https://cdn.12ai.org/v1/task/submit");
    assert.equal(requestHeaders!.get("Authorization"), "Bearer twelve_ai_key");
    assert.deepEqual(requestBody, {
      model: "gemini-3.1-flash-image-preview",
      input: {
        prompt: "poster",
        n: 1,
        images: [PNG_DATA_URI],
        aspect_ratio: "16:9",
        image_size: "2K",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("12AI GPT async image generation maps size and quality inside task input", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requestBody = init?.body ? JSON.parse(String(init.body)) as unknown : null;
    return Response.json({ id: "task_gpt", status: "queued" });
  };

  try {
    const result = await generateImage(twelveAiConfig, {
      prompt: "product image",
      model: "gpt-image-2",
      aspectRatio: "1:1",
      imageResolution: "1536x1024",
      imageQuality: "high",
      referenceImages: [],
      async: true,
    });

    assert.equal(result.operationName, "12ai:image:task_gpt");
    assert.deepEqual(requestBody, {
      model: "gpt-image-2",
      input: {
        prompt: "product image",
        n: 1,
        size: "1536x1024",
        quality: "high",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("12AI async image status polling reads task outputs", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    requestUrl = input.toString();
    return Response.json({
      status: "completed",
      outputs: ["https://img.12ai.org/images/task_123_0.png"],
    });
  };

  try {
    const status = await getAsyncImageStatus(twelveAiConfig, "task_123");

    assert.equal(requestUrl, "https://cdn.12ai.org/v1/task/task_123");
    assert.deepEqual(status, {
      done: true,
      mediaType: "image",
      progress: 100,
      status: "completed",
      url: "https://img.12ai.org/images/task_123_0.png",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("12AI async image tasks accept base URLs that already include v1", async () => {
  const originalFetch = globalThis.fetch;
  const requestUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = input.toString();
    requestUrls.push(url);
    if (url.endsWith("/task/submit")) {
      return Response.json({ id: "task_v1", status: "queued" });
    }
    return Response.json({
      status: "completed",
      outputs: ["https://img.12ai.org/images/task_v1_0.png"],
    });
  };

  try {
    const config = { ...twelveAiConfig, baseUrl: "https://cdn.12ai.org/v1" };
    const result = await generateImage(config, {
      prompt: "poster",
      model: "gemini-3.1-flash-image-preview",
      aspectRatio: "1:1",
      imageResolution: "1K",
      referenceImages: [],
      async: true,
    });
    const status = await getAsyncImageStatus(config, "task_v1");

    assert.equal(result.operationName, "12ai:image:task_v1");
    assert.equal(status.url, "https://img.12ai.org/images/task_v1_0.png");
    assert.deepEqual(requestUrls, [
      "https://cdn.12ai.org/v1/task/submit",
      "https://cdn.12ai.org/v1/task/task_v1",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI-compatible image edit includes guide image when provided", async () => {
  const originalFetch = globalThis.fetch;
  const uploadedFiles: Array<{ field: string; name: string }> = [];
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.ok(init?.body instanceof FormData);
    for (const [field, value] of init.body.entries()) {
      if (typeof value !== "string") {
        uploadedFiles.push({ field, name: value.name });
      }
    }
    return new Response(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const config: ProviderConfig = {
    provider: "custom-provider",
    apiKey: "test-key",
    baseUrl: "https://provider.test",
    videoBaseUrl: "https://provider.test",
  };

  try {
    const result = await editImage(config, {
      operation: "redraw",
      model: "image-edit-model",
      prompt: "replace the object",
      image: { dataUri: PNG_DATA_URI },
      mask: { dataUri: PNG_DATA_URI },
      guide: { dataUri: PNG_DATA_URI },
      imageResolution: "auto",
    });

    assert.equal(result.imageUrl, "data:image/png;base64,aW1hZ2U=");
    assert.deepEqual(uploadedFiles, [
      { field: "image", name: "image.png" },
      { field: "mask", name: "mask.png" },
      { field: "image", name: "guide.png" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
