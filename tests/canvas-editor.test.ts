import assert from "node:assert/strict";
import test from "node:test";

import {
  clampRectToBounds,
  createAspectRectFromDrag,
  createCenteredAspectRect,
  isUsableCrop,
  moveRectWithinBounds,
  normalizeRect,
  pointInRect,
  resizeRectFromHandle,
  scaleToFitSize,
} from "../lib/canvas-editor";

test("scaleToFitSize keeps images inside bounds without upscaling", () => {
  assert.deepEqual(scaleToFitSize({ width: 1200, height: 800 }, { width: 600, height: 500 }), {
    width: 600,
    height: 400,
  });
  assert.deepEqual(scaleToFitSize({ width: 320, height: 240 }, { width: 600, height: 500 }), {
    width: 320,
    height: 240,
  });
});

test("normalizeRect accepts drag direction from any corner", () => {
  assert.deepEqual(normalizeRect(90, 80, 10, 20), {
    x: 10,
    y: 20,
    width: 80,
    height: 60,
  });
});

test("clampRectToBounds constrains crop rectangles to the canvas", () => {
  assert.deepEqual(
    clampRectToBounds({ x: 480, y: 390, width: 80, height: 40 }, { width: 500, height: 400 }),
    {
      x: 480,
      y: 390,
      width: 20,
      height: 10,
    },
  );
});

test("isUsableCrop rejects tiny accidental drags", () => {
  assert.equal(isUsableCrop({ x: 0, y: 0, width: 7, height: 20 }), false);
  assert.equal(isUsableCrop({ x: 0, y: 0, width: 8, height: 8 }), true);
});

test("pointInRect detects crop selection hits", () => {
  const rect = { x: 20, y: 30, width: 100, height: 80 };

  assert.equal(pointInRect(20, 30, rect), true);
  assert.equal(pointInRect(119, 109, rect), true);
  assert.equal(pointInRect(10, 30, rect), false);
});

test("moveRectWithinBounds clamps moved crop selections", () => {
  assert.deepEqual(
    moveRectWithinBounds({ x: 20, y: 30, width: 100, height: 80 }, 450, -10, { width: 500, height: 400 }),
    {
      x: 400,
      y: 0,
      width: 100,
      height: 80,
    },
  );
});

test("resizeRectFromHandle freely resizes crop selections from edges", () => {
  assert.deepEqual(
    resizeRectFromHandle(
      { x: 20, y: 30, width: 100, height: 80 },
      "e",
      180,
      30,
      { width: 500, height: 400 },
      null,
      8,
    ),
    {
      x: 20,
      y: 30,
      width: 160,
      height: 80,
    },
  );
});

test("resizeRectFromHandle preserves aspect ratio from corner handles", () => {
  assert.deepEqual(
    resizeRectFromHandle(
      { x: 20, y: 30, width: 100, height: 100 },
      "se",
      220,
      180,
      { width: 500, height: 400 },
      { width: 1, height: 1 },
      8,
    ),
    {
      x: 20,
      y: 30,
      width: 150,
      height: 150,
    },
  );
});

test("createCenteredAspectRect creates centered preset crops", () => {
  assert.deepEqual(createCenteredAspectRect({ width: 800, height: 600 }, { width: 1, height: 1 }, 0.8), {
    x: 160,
    y: 60,
    width: 480,
    height: 480,
  });
});

test("createAspectRectFromDrag constrains drag crops to a preset aspect ratio", () => {
  assert.deepEqual(
    createAspectRectFromDrag(10, 20, 410, 320, { width: 16, height: 9 }, { width: 500, height: 400 }),
    {
      x: 10,
      y: 20,
      width: 400,
      height: 225,
    },
  );
});
