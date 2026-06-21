import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_IMAGE_EDIT_FEATURE_TARGETS,
  RUNNINGHUB_CUTOUT_TARGET_ID,
  getImageQuickEditTargetOptions,
  imageEditFeatureMeta,
  imageQuickEditFallbackPrompt,
  imageQuickEditProcessingTitleFromPrompt,
  normalizeImageQuickEditTargetId,
  resolveImageQuickEditTarget,
  submitImageQuickEdit,
} from "../lib/image-quick-edit-targets";
import {
  buildAngleAdjustmentPrompt,
  buildLightingAdjustmentPrompt,
} from "../lib/image-visual-adjustment-prompts";
import { getImageEditResolutionOptions } from "../lib/image-edit-geometry";
import { formatProviderModel } from "../lib/providers/model-catalog";
import { RUNNINGHUB_CONTROL_IMAGE_APP_MODEL } from "../lib/providers/runninghub";

const RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE = formatProviderModel("runninghub", RUNNINGHUB_CONTROL_IMAGE_APP_MODEL);

function scopedT(namespace: string, messages: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const value = messages[key];
    if (!value) return `${namespace}.${key}`;
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in params ? String(params[name]) : `{${name}}`,
    );
  };
}

test("quick edit defaults cutout to RunningHub dedicated target", () => {
  assert.equal(DEFAULT_IMAGE_EDIT_FEATURE_TARGETS.cutout, RUNNINGHUB_CUTOUT_TARGET_ID);
  assert.equal(resolveImageQuickEditTarget("cutout", RUNNINGHUB_CUTOUT_TARGET_ID).model, RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE);
  assert.equal(DEFAULT_IMAGE_EDIT_FEATURE_TARGETS.angle, "model:12ai:gemini-3-pro-image-preview");
  assert.equal(DEFAULT_IMAGE_EDIT_FEATURE_TARGETS.lighting, "model:12ai:gemini-3-pro-image-preview");
});

test("quick edit labels resolve scoped translation functions", () => {
  const creationT = scopedT("creation", {
    "imageEdit.features.redraw.label": "重绘",
    "imageEdit.features.redraw.description": "局部重绘",
    "imageEdit.fallbackPrompt": "{label}：{prompt}",
    "imageEdit.processingTitle": "{label}处理中",
  });
  const commonT = scopedT("common", {
    "imageEdit.targets.runningHubCutout": "RunningHub 抠图",
  });

  const meta = imageEditFeatureMeta("redraw", creationT);

  assert.equal(meta.label, "重绘");
  assert.equal(meta.description, "局部重绘");
  assert.equal(imageQuickEditFallbackPrompt("redraw", "source", creationT), "重绘：source");
  assert.equal(imageQuickEditProcessingTitleFromPrompt("重绘：source", creationT), "重绘处理中");
  assert.equal(resolveImageQuickEditTarget("cutout", RUNNINGHUB_CUTOUT_TARGET_ID, commonT).label, "RunningHub 抠图");
});

test("angle and lighting targets use prompt-only image edit route", () => {
  const angle = resolveImageQuickEditTarget("angle", "model:12ai:gpt-image-2");
  const lighting = resolveImageQuickEditTarget("lighting", "model:12ai:gemini-3-pro-image-preview");

  assert.equal(angle.executionMode, "image-edit-route");
  assert.equal(angle.promptRequired, true);
  assert.equal(angle.maskRequired, false);
  assert.equal(angle.guideSupported, false);
  assert.equal(lighting.executionMode, "image-edit-route");
  assert.equal(lighting.promptRequired, true);
  assert.equal(lighting.maskRequired, false);
  assert.equal(lighting.guideSupported, true);
});

test("quick edit target options expose dedicated cutout app without generic RunningHub duplicate", () => {
  const options = getImageQuickEditTargetOptions("cutout", [
    { value: "12ai:gemini-3-pro-image-preview", label: "12AI Gemini" },
    { value: RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE, label: "RunningHub Control Image AI App" },
  ]);

  assert.equal(options.filter(option => option.id === RUNNINGHUB_CUTOUT_TARGET_ID).length, 1);
  assert.equal(options.some(option => option.id === `model:${RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE}`), false);
  assert.equal(options.some(option => option.id === "model:12ai:gemini-3-pro-image-preview"), true);
});

test("quick edit target normalization migrates legacy raw model values", () => {
  assert.equal(
    normalizeImageQuickEditTargetId("cutout", RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE),
    RUNNINGHUB_CUTOUT_TARGET_ID,
  );
  assert.equal(
    normalizeImageQuickEditTargetId("erase", "12ai:gemini-3-pro-image-preview"),
    "model:12ai:gemini-3-pro-image-preview",
  );
});

test("quick edit target normalization drops legacy RunningHub values for generic edit features", () => {
  assert.equal(
    normalizeImageQuickEditTargetId("erase", RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE),
    DEFAULT_IMAGE_EDIT_FEATURE_TARGETS.erase,
  );
  assert.equal(
    normalizeImageQuickEditTargetId("redraw", `model:${RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE}`),
    DEFAULT_IMAGE_EDIT_FEATURE_TARGETS.redraw,
  );
});

test("generic quick edit targets submit through image edit route", async () => {
  const calls: Array<{ url: string; body: unknown; providerHeader: string | null }> = [];
  const restore = mockFetch(async (url, init) => {
    calls.push(readCall(url, init));
    return Response.json({ imageUrl: "data:image/png;base64,abc" });
  });

  try {
    const imageUrl = await submitImageQuickEdit({
      target: resolveImageQuickEditTarget("erase", "model:12ai:gemini-3-pro-image-preview"),
      operation: "erase",
      aspectRatio: "auto",
      image: "data:image/png;base64,source",
      mask: "data:image/png;base64,mask",
      guide: "data:image/png;base64,guide",
      prompt: "",
      imageResolution: "auto",
      buildProviderHeaders: target => ({ "x-provider-target": target ?? "" }),
    });

    assert.equal(imageUrl, "data:image/png;base64,abc");
    assert.equal(calls[0]?.url, "/api/image/edit");
    assert.deepEqual(calls[0]?.body, {
      operation: "erase",
      model: "12ai:gemini-3-pro-image-preview",
      image: "data:image/png;base64,source",
      mask: "data:image/png;base64,mask",
      guide: "data:image/png;base64,guide",
      prompt: "",
      imageResolution: "auto",
    });
    assert.equal(calls[0]?.providerHeader, "12ai:gemini-3-pro-image-preview");
  } finally {
    restore();
  }
});

test("quick edit resolution options prefer concrete source-aspect sizes over auto", () => {
  const options = getImageEditResolutionOptions("12ai:gpt-image-2", { width: 1792, height: 1024 });

  assert.equal(options[0]?.value, "1792x1024");
  assert.equal(options.some(option => option.value === "auto"), false);
});

test("quick edit resolution options keep auto only when no concrete size matches", () => {
  const options = getImageEditResolutionOptions("12ai:gpt-image-2", { width: 123, height: 456 });

  assert.deepEqual(options, [{ value: "auto", label: "Auto" }]);
});

test("visual adjustment prompt compiler branches by model family", () => {
  const anglePrompt = buildAngleAdjustmentPrompt(
    { rotation: 90, tilt: -30, zoom: 80, wideAngle: true },
    "12ai:gpt-image-2",
  );
  const lightingPrompt = buildLightingAdjustmentPrompt(
    { direction: "left", height: 40, intensity: 80, temperature: 3200, rimLight: true },
    "12ai:gemini-3-pro-image-preview",
  );

  assert.match(anglePrompt, /Goal:/);
  assert.match(anglePrompt, /right side view/);
  assert.match(anglePrompt, /Preserve:/);
  assert.match(lightingPrompt, /Use Image 1 as the source image/);
  assert.match(lightingPrompt, /camera left/);
  assert.match(lightingPrompt, /warm tungsten/);
});

test("RunningHub cutout target submits through generate image route and downloads async result", async () => {
  const calls: Array<{ url: string; body: unknown; providerHeader: string | null }> = [];
  const restore = mockFetch(async (url, init) => {
    calls.push(readCall(url, init));
    if (url === "/api/media/generate-image") {
      return Response.json({ operationName: "runninghub:image:task-output:task_123" });
    }
    if (url === "/api/media/status") {
      return Response.json({ done: true, status: "SUCCESS" });
    }
    if (url === "/api/media/image-download") {
      return Response.json({ imageUrl: "data:image/png;base64,result" });
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const imageUrl = await submitImageQuickEdit({
      target: resolveImageQuickEditTarget("cutout", RUNNINGHUB_CUTOUT_TARGET_ID),
      operation: "cutout",
      aspectRatio: "1792x1024",
      image: "data:image/png;base64,source",
      prompt: "",
      imageResolution: "auto",
      buildProviderHeaders: target => ({ "x-provider-target": target ?? "" }),
    });

    assert.equal(imageUrl, "data:image/png;base64,result");
    assert.equal(calls[0]?.url, "/api/media/generate-image");
    assert.deepEqual(calls[0]?.body, {
      model: RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE,
      prompt: "",
      referenceImages: ["data:image/png;base64,source"],
      aspectRatio: "7:4",
      imageResolution: "auto",
    });
    assert.equal(calls[0]?.providerHeader, RUNNINGHUB_CONTROL_IMAGE_MODEL_VALUE);
    assert.equal(calls[1]?.url, "/api/media/status");
    assert.deepEqual(calls[1]?.body, { operationName: "runninghub:image:task-output:task_123" });
    assert.equal(calls[1]?.providerHeader, "runninghub:image:task-output:task_123");
    assert.equal(calls[2]?.url, "/api/media/image-download");
  } finally {
    restore();
  }
});

test("RunningHub cutout target stops async polling when aborted", async () => {
  const calls: Array<{ url: string; body: unknown; providerHeader: string | null }> = [];
  const controller = new AbortController();
  const restore = mockFetch(async (url, init) => {
    calls.push(readCall(url, init));
    if (url === "/api/media/generate-image") {
      controller.abort();
      return Response.json({ operationName: "runninghub:image:task-output:task_abort" });
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    await assert.rejects(
      () => submitImageQuickEdit({
        target: resolveImageQuickEditTarget("cutout", RUNNINGHUB_CUTOUT_TARGET_ID),
        operation: "cutout",
        aspectRatio: "auto",
        image: "data:image/png;base64,source",
        prompt: "",
        imageResolution: "auto",
        buildProviderHeaders: target => ({ "x-provider-target": target ?? "" }),
        signal: controller.signal,
      }),
      error => error instanceof DOMException && error.name === "AbortError",
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "/api/media/generate-image");
  } finally {
    restore();
  }
});

function mockFetch(handler: (url: string, init: RequestInit | undefined) => Promise<Response>): () => void {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout,
      setTimeout: (callback: () => void) => setTimeout(callback, 0),
    },
  });
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  };
}

function readCall(url: string, init: RequestInit | undefined): { url: string; body: unknown; providerHeader: string | null } {
  return {
    url,
    body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
    providerHeader: readProviderHeader(init?.headers),
  };
}

function readProviderHeader(headers: HeadersInit | undefined): string | null {
  if (!headers || Array.isArray(headers)) return null;
  if (headers instanceof Headers) return headers.get("x-provider-target");
  return typeof headers["x-provider-target"] === "string" ? headers["x-provider-target"] : null;
}
