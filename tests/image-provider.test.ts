import assert from "node:assert/strict";
import test from "node:test";

import { editImage } from "../lib/providers/image";
import type { ProviderConfig } from "../lib/providers/types";

const PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgo=";

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
