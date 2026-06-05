import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenRouterInputSupportIndex,
  buildOpenRouterVisionIndex,
  lookupOpenRouterInputSupport,
  lookupOpenRouterVisionSupport,
  normalizeOpenRouterModelKey,
  openRouterModelInputSupport,
  openRouterModelSupportsImageInput,
  resetOpenRouterVisionCacheForTests,
  scoreOpenRouterModelTokenOverlap,
} from "../lib/openrouter/capabilities";

test("openRouterModelSupportsImageInput reads architecture.input_modalities", () => {
  assert.equal(
    openRouterModelSupportsImageInput({
      id: "google/gemini-2.5-flash-preview",
      canonical_slug: "google/gemini-2.5-flash-preview",
      architecture: { input_modalities: ["text", "image"] },
    }),
    true,
  );
  assert.equal(
    openRouterModelSupportsImageInput({
      id: "deepseek/deepseek-r1",
      canonical_slug: "deepseek/deepseek-r1",
      architecture: { input_modalities: ["text"] },
    }),
    false,
  );
});

test("openRouterModelInputSupport reads image video and audio modalities", () => {
  assert.deepEqual(
    openRouterModelInputSupport({
      id: "google/gemini-2.5-pro",
      canonical_slug: "google/gemini-2.5-pro",
      architecture: { input_modalities: ["text", "image", "video", "audio"] },
    }),
    { audio: true, image: true, video: true },
  );
  assert.deepEqual(
    openRouterModelInputSupport({
      id: "deepseek/deepseek-r1",
      canonical_slug: "deepseek/deepseek-r1",
      architecture: { input_modalities: ["text"] },
    }),
    { audio: false, image: false, video: false },
  );
});

test("lookupOpenRouterInputSupport matches provider-prefixed model ids without changing provider", () => {
  const index = buildOpenRouterInputSupportIndex([
    {
      id: "google/gemini-2.5-pro",
      canonical_slug: "google/gemini-2.5-pro",
      architecture: { input_modalities: ["text", "image", "video", "audio"] },
    },
  ]);

  const match = lookupOpenRouterInputSupport(index, "12ai:gemini-2.5-pro");
  assert.deepEqual(match?.inputSupport, { audio: true, image: true, video: true });
  assert.equal(match?.openRouterId, "google/gemini-2.5-pro");
});

test("lookupOpenRouterVisionSupport matches provider-prefixed model ids", () => {
  resetOpenRouterVisionCacheForTests();
  const index = buildOpenRouterVisionIndex([
    {
      id: "google/gemini-2.5-flash-preview-05-20",
      canonical_slug: "google/gemini-2.5-flash-preview-05-20",
      architecture: { input_modalities: ["text", "image"] },
    },
    {
      id: "deepseek/deepseek-r1",
      canonical_slug: "deepseek/deepseek-r1",
      architecture: { input_modalities: ["text"] },
    },
  ]);

  const visionMatch = lookupOpenRouterVisionSupport(index, "12ai:gemini-2.5-flash-preview-05-20");
  assert.equal(visionMatch?.supportsVision, true);

  const textOnlyMatch = lookupOpenRouterVisionSupport(index, "xstx:deepseek-r1");
  assert.equal(textOnlyMatch?.supportsVision, false);
});

test("normalizeOpenRouterModelKey strips provider punctuation", () => {
  assert.equal(
    normalizeOpenRouterModelKey("gemini-3.1-flash-lite-preview"),
    "gemini-3-1-flash-lite-preview",
  );
});

test("token overlap matches same family across provider-specific ids", () => {
  const index = buildOpenRouterVisionIndex([
    {
      id: "google/gemini-2.5-flash-preview-05-20",
      canonical_slug: "google/gemini-2.5-flash-preview-05-20",
      architecture: { input_modalities: ["text", "image"] },
    },
  ]);

  const match = lookupOpenRouterVisionSupport(index, "xstx:gemini-2.5-flash-custom-alias");
  assert.equal(match?.supportsVision, true);
  assert.ok(
    scoreOpenRouterModelTokenOverlap(
      "gemini-2-5-flash-custom-alias",
      "gemini-2-5-flash-preview-05-20",
    ) >= 0.5,
  );
});

test("lookupOpenRouterVisionSupport tolerates unknown provider prefixes", () => {
  const index = buildOpenRouterVisionIndex([
    {
      id: "google/gemini-2.5-flash-preview-05-20",
      canonical_slug: "google/gemini-2.5-flash-preview-05-20",
      architecture: { input_modalities: ["text", "image"] },
    },
  ]);

  assert.equal(lookupOpenRouterVisionSupport(index, "unknown:gemini-2.5-flash-preview-05-20")?.supportsVision, true);
});
