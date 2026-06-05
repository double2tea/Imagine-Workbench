import assert from "node:assert/strict";
import test from "node:test";

import { calculateModelPrice, getModelPrice, getShowPriceSetting, setShowPriceSetting } from "../lib/providers/pricing";
import { selectVideoReferenceTypesForMode } from "../lib/video-reference-selection";

function withMockLocalStorage(run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  try {
    run();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
}

test("getModelPrice returns known RunningHub price", () => {
  assert.deepEqual(
    getModelPrice("runninghub", "runninghub:api:/openapi/v2/rhart-image-g-2-official/text-to-image"),
    { price: 0.06, unit: "次" },
  );
  assert.deepEqual(
    getModelPrice("runninghub", "runninghub:api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video"),
    { price: 2.35, unit: "次" },
  );
  assert.deepEqual(
    getModelPrice("runninghub", "runninghub:api:/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra"),
    { price: 0.98, unit: "次" },
  );
});

test("getModelPrice returns null for unknown model and provider", () => {
  assert.equal(getModelPrice("runninghub", "runninghub:api:/openapi/v2/not-real/text-to-image"), null);
  assert.equal(getModelPrice("12ai", "runninghub:api:/openapi/v2/rhart-image-g-2-official/text-to-image"), null);
});

test("calculateModelPrice multiplies per-second prices by duration", () => {
  assert.deepEqual(
    calculateModelPrice("runninghub", "runninghub:api:/openapi/v2/rhart-video-v3.1-lite-official/text-to-video", { duration: "6" }),
    { price: 0.32, unit: "秒", totalPrice: 1.92, isCalculated: true, detail: "¥0.32/秒 × 6s" },
  );
});

test("calculateModelPrice routes RunningHub video references to the billed model", () => {
  assert.deepEqual(
    calculateModelPrice("runninghub", "runninghub:api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video", {
      referenceTypes: ["image"],
      videoReferenceMode: "firstLast",
    }),
    { price: 2.35, unit: "次", totalPrice: 2.35, isCalculated: false },
  );
  assert.deepEqual(
    calculateModelPrice("runninghub", "runninghub:api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video", {
      referenceTypes: ["video"],
      videoReferenceMode: "reference",
    }),
    { price: 4.03, unit: "次", totalPrice: 4.03, isCalculated: false },
  );
  assert.deepEqual(
    calculateModelPrice("runninghub", "runninghub:api:/openapi/v2/rhart-video-v3.1-lite-official/text-to-video", {
      duration: "8",
      referenceTypes: ["image", "image"],
      videoReferenceMode: "firstLast",
    }),
    { price: 2.52, unit: "次", totalPrice: 2.52, isCalculated: false },
  );
  assert.deepEqual(
    calculateModelPrice("runninghub", "runninghub:api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video", {
      referenceTypes: ["image", "video"],
      videoReferenceMode: "none",
    }),
    { price: 2.35, unit: "次", totalPrice: 2.35, isCalculated: false },
  );
});

test("selectVideoReferenceTypesForMode mirrors video generation reference selection", () => {
  assert.deepEqual(
    selectVideoReferenceTypesForMode(
      [
        { id: "middle", type: "video", url: "https://example.test/middle.mp4", role: "general" },
        { id: "end", type: "image", url: "https://example.test/end.png", role: "end" },
      ],
      null,
      "firstLast",
      2,
    ),
    ["video", "image"],
  );
  assert.deepEqual(
    selectVideoReferenceTypesForMode(
      [{ id: "stale", type: "image", url: "https://example.test/stale.png", role: "general" }],
      "https://example.test/fallback.png",
      "none",
      3,
    ),
    [],
  );
});

test("show price setting defaults true and roundtrips false", () => {
  withMockLocalStorage(() => {
    assert.equal(getShowPriceSetting(), true);
    setShowPriceSetting(false);
    assert.equal(getShowPriceSetting(), false);
    setShowPriceSetting(true);
    assert.equal(getShowPriceSetting(), true);
  });
});
