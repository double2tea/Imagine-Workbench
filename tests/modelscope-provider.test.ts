import assert from "node:assert/strict";
import test from "node:test";

import { generateImage, getAsyncImageStatus } from "../lib/providers/image";
import type { ProviderConfig } from "../lib/providers/types";

const modelScopeConfig: ProviderConfig = {
  provider: "modelscope",
  apiKey: "ms_test_key",
  baseUrl: "https://api-inference.modelscope.cn",
  videoBaseUrl: "https://api-inference.modelscope.cn",
};

test("modelscope image generation sends current API-Inference body shape", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  let requestHeaders: Headers;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(input.toString(), "https://api-inference.modelscope.cn/v1/images/generations");
    requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;
    requestHeaders = new Headers(init?.headers);
    return Response.json({ task_id: "task_123" });
  };

  try {
    const result = await generateImage(modelScopeConfig, {
      prompt: "poster",
      model: "Qwen/Qwen-Image-Edit-2511",
      aspectRatio: "1:1",
      imageResolution: "1328x1328",
      referenceImages: [{ dataUri: "data:image/png;base64,aW1n" }],
      async: true,
    });

    assert.equal(result.operationName, "modelscope:image:task_123");
    assert.deepEqual(requestBody, {
      model: "Qwen/Qwen-Image-Edit-2511",
      prompt: "poster",
      size: "1328x1328",
      width: 1328,
      height: 1328,
      image_url: "data:image/png;base64,aW1n",
    });
    assert.equal(requestHeaders!.get("Authorization"), "Bearer ms_test_key");
    assert.equal(requestHeaders!.get("X-ModelScope-Async-Mode"), "true");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("modelscope status polling accepts documented SUCCEED output_images response", async () => {
  const originalFetch = globalThis.fetch;
  let requestHeaders: Headers;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(input.toString(), "https://api-inference.modelscope.cn/v1/tasks/task_123");
    requestHeaders = new Headers(init?.headers);
    return Response.json({ task_status: "SUCCEED", output_images: ["https://example.test/result.png"] });
  };

  try {
    const status = await getAsyncImageStatus(modelScopeConfig, "task_123");

    assert.deepEqual(status, {
      done: true,
      mediaType: "image",
      progress: 100,
      status: "succeed",
      url: "https://example.test/result.png",
    });
    assert.equal(requestHeaders!.get("Authorization"), "Bearer ms_test_key");
    assert.equal(requestHeaders!.get("X-ModelScope-Task-Type"), "image_generation");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
