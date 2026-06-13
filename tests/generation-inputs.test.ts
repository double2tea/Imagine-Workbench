import assert from "node:assert/strict";
import test from "node:test";

import type { GenerationRequestSnapshot } from "../lib/db";
import {
  createGenerationInputSnapshot,
  generationInputSnapshotFromRequest,
} from "../lib/generation-inputs";
import { MODEL_CAPABILITY_CATALOG_VERSION } from "../lib/providers/model-catalog";

test("generationInputSnapshotFromRequest captures image request inputs without leaking secrets", () => {
  const request: GenerationRequestSnapshot = {
    prompt: "A polished product photo",
    model: "runninghub:api:/openapi/v2/youchuan/text-to-image-v7",
    aspectRatio: "1:1",
    imageResolution: "1024x1024",
    imageQuality: "high",
    thinkingLevel: "medium",
    runningHubAccessPassword: "secret-password",
    runningHubNodeInfoList: [
      {
        nodeId: "12",
        fieldName: "prompt",
        source: "prompt",
        deliveryMode: "raw",
      },
    ],
    runningHubYouchuan: {
      chaos: 10,
      stylize: 200,
      raw: false,
      iw: 1,
      sw: 2,
    },
    referenceMedia: [
      {
        url: "data:image/png;base64,AAAA",
        type: "image",
        role: "general",
      },
    ],
  };

  const snapshot = generationInputSnapshotFromRequest({
    kind: "image",
    request,
    source: {
      surface: "board",
      boardId: "board-1",
      boardNodeId: "node-1",
      resultStackKey: "main",
    },
    promptTemplate: {
      id: "product-clean",
      category: "product",
      title: "Clean Product",
      scene: "Product",
      positivePrompt: "clean commercial product photography",
      negativePrompt: "blur",
    },
  });

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.capabilityCatalogVersion, MODEL_CAPABILITY_CATALOG_VERSION);
  assert.equal(snapshot.kind, "image");
  assert.equal(snapshot.provider, "runninghub");
  assert.equal(snapshot.model, "api:/openapi/v2/youchuan/text-to-image-v7");
  assert.equal(snapshot.prompt.text, "A polished product photo");
  assert.deepEqual(snapshot.prompt.template, {
    id: "product-clean",
    category: "product",
    title: "Clean Product",
    negativePrompt: "blur",
  });
  assert.deepEqual(snapshot.source, {
    surface: "board",
    boardId: "board-1",
    boardNodeId: "node-1",
    resultStackKey: "main",
  });
  assert.deepEqual(snapshot.references, [
    {
      url: "data:image/png;base64,AAAA",
      type: "image",
      role: "general",
    },
  ]);
  assert.equal(snapshot.modelControls.aspectRatio, "1:1");
  assert.equal(snapshot.modelControls.imageResolution, "1024x1024");
  assert.equal(snapshot.providerSettings?.runningHubAccessPasswordPresent, true);
  assert.equal(snapshot.providerSettings?.runningHubNodeInfoList?.[0]?.nodeId, "12");
  assert.equal(snapshot.providerSettings?.runningHubYouchuan?.stylize, 200);
  assert.deepEqual(snapshot.pricing, {
    price: 0.54,
    unit: "次",
    totalPrice: 0.54,
    isCalculated: false,
  });
  assert.equal(JSON.stringify(snapshot).includes("secret-password"), false);
});

test("generationInputSnapshotFromRequest derives video pricing from duration and references", () => {
  const request: GenerationRequestSnapshot = {
    prompt: "A slow cinematic push-in",
    model: "runninghub:api:/openapi/v2/rhart-video-v3.1-lite-official/text-to-video",
    aspectRatio: "16:9",
    videoDurationSeconds: "8",
    videoReferenceMode: "firstLast",
    videoResolution: "1080p",
    referenceMedia: [
      {
        url: "https://example.test/start.png",
        type: "image",
        role: "start",
      },
      {
        url: "https://example.test/end.png",
        type: "image",
        role: "end",
      },
    ],
  };

  const snapshot = generationInputSnapshotFromRequest({
    kind: "video",
    request,
    source: { surface: "workspace" },
  });

  assert.equal(snapshot.kind, "video");
  assert.deepEqual(snapshot.references.map(reference => reference.role), ["start", "end"]);
  assert.equal(snapshot.modelControls.videoDurationSeconds, "8");
  assert.equal(snapshot.modelControls.videoReferenceMode, "firstLast");
  assert.deepEqual(snapshot.pricing, {
    price: 2.52,
    unit: "次",
    totalPrice: 2.52,
    isCalculated: false,
  });
});

test("createGenerationInputSnapshot preserves explicit mask and audio controls", () => {
  const snapshot = createGenerationInputSnapshot({
    kind: "audio",
    model: "mimo:mimo-v2.5-asr",
    prompt: { text: "Transcribe this interview" },
    source: { surface: "agent" },
    references: [
      {
        url: "data:audio/wav;base64,AAAA",
        type: "audio",
      },
    ],
    modelControls: {
      audioMode: "asr",
      asrLanguage: "zh",
    },
    mask: {
      originalUrl: "data:image/png;base64,ORIGINAL",
      maskUrl: "data:image/png;base64,MASK",
      operation: "erase",
    },
  });

  assert.equal(snapshot.kind, "audio");
  assert.equal(snapshot.provider, "mimo");
  assert.deepEqual(snapshot.references, [
    {
      url: "data:audio/wav;base64,AAAA",
      type: "audio",
    },
  ]);
  assert.deepEqual(snapshot.modelControls, {
    audioMode: "asr",
    asrLanguage: "zh",
  });
  assert.deepEqual(snapshot.mask, {
    originalUrl: "data:image/png;base64,ORIGINAL",
    maskUrl: "data:image/png;base64,MASK",
    operation: "erase",
  });
});
