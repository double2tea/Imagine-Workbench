import assert from "node:assert/strict";
import test from "node:test";

import {
  createPresetBoardImageGridRects,
  detectBoardImageGridRects,
  type BoardImageSplitRect,
} from "../lib/board/image-grid-split";

function syntheticGridImage(width: number, height: number, rects: BoardImageSplitRect[]): { data: Uint8ClampedArray; height: number; width: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 255;
  }
  rects.forEach((rect, rectIndex) => {
    const value = 96 + rectIndex * 18;
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
  });
  return { data, height, width };
}

test("preset grid rects are deterministic row-major crops", () => {
  assert.deepEqual(createPresetBoardImageGridRects(90, 60, 3), [
    { x: 0, y: 0, width: 30, height: 20 },
    { x: 30, y: 0, width: 30, height: 20 },
    { x: 60, y: 0, width: 30, height: 20 },
    { x: 0, y: 20, width: 30, height: 20 },
    { x: 30, y: 20, width: 30, height: 20 },
    { x: 60, y: 20, width: 30, height: 20 },
    { x: 0, y: 40, width: 30, height: 20 },
    { x: 30, y: 40, width: 30, height: 20 },
    { x: 60, y: 40, width: 30, height: 20 },
  ]);
});

test("auto grid detection supports irregular rectangular panels", () => {
  const panels = [
    { x: 4, y: 4, width: 42, height: 30 },
    { x: 50, y: 4, width: 76, height: 30 },
    { x: 4, y: 38, width: 122, height: 38 },
  ];
  const imageData = syntheticGridImage(130, 80, panels);

  assert.deepEqual(detectBoardImageGridRects(imageData), panels);
});
