import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenRouterVisionIndex,
  lookupOpenRouterVisionSupport,
  normalizeOpenRouterModelKey,
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