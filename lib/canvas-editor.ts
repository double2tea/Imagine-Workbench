export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasRect extends CanvasSize {
  x: number;
  y: number;
}

export interface AspectRatio {
  width: number;
  height: number;
}

export type CropResizeHandle = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";

export function scaleToFitSize(source: CanvasSize, bounds: CanvasSize): CanvasSize {
  const scale = Math.min(bounds.width / source.width, bounds.height / source.height, 1);

  return {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  };
}

export function normalizeRect(startX: number, startY: number, endX: number, endY: number): CanvasRect {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function clampRectToBounds(rect: CanvasRect, bounds: CanvasSize): CanvasRect {
  const x = Math.max(0, Math.min(rect.x, bounds.width));
  const y = Math.max(0, Math.min(rect.y, bounds.height));
  const maxWidth = bounds.width - x;
  const maxHeight = bounds.height - y;

  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.width, maxWidth)),
    height: Math.max(0, Math.min(rect.height, maxHeight)),
  };
}

export function isUsableCrop(rect: CanvasRect): boolean {
  return rect.width >= 8 && rect.height >= 8;
}

export function pointInRect(x: number, y: number, rect: CanvasRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function moveRectWithinBounds(rect: CanvasRect, x: number, y: number, bounds: CanvasSize): CanvasRect {
  return {
    ...rect,
    x: Math.round(Math.max(0, Math.min(x, bounds.width - rect.width))),
    y: Math.round(Math.max(0, Math.min(y, bounds.height - rect.height))),
  };
}

export function resizeRectFromHandle(
  rect: CanvasRect,
  handle: CropResizeHandle,
  pointX: number,
  pointY: number,
  bounds: CanvasSize,
  aspectRatio: AspectRatio | null,
  minSize: number,
): CanvasRect {
  if (!aspectRatio) {
    return resizeFreeRectFromHandle(rect, handle, pointX, pointY, bounds, minSize);
  }

  return resizeAspectRectFromHandle(rect, handle, pointX, pointY, bounds, aspectRatio, minSize);
}

function resizeFreeRectFromHandle(
  rect: CanvasRect,
  handle: CropResizeHandle,
  pointX: number,
  pointY: number,
  bounds: CanvasSize,
  minSize: number,
): CanvasRect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle.includes("w")) left = Math.max(0, Math.min(pointX, right - minSize));
  if (handle.includes("e")) right = Math.min(bounds.width, Math.max(pointX, left + minSize));
  if (handle.includes("n")) top = Math.max(0, Math.min(pointY, bottom - minSize));
  if (handle.includes("s")) bottom = Math.min(bounds.height, Math.max(pointY, top + minSize));

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

function resizeAspectRectFromHandle(
  rect: CanvasRect,
  handle: CropResizeHandle,
  pointX: number,
  pointY: number,
  bounds: CanvasSize,
  aspectRatio: AspectRatio,
  minSize: number,
): CanvasRect {
  const ratio = aspectRatio.width / aspectRatio.height;
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const movesWest = handle.includes("w");
  const movesEast = handle.includes("e");
  const movesNorth = handle.includes("n");
  const movesSouth = handle.includes("s");

  if ((movesEast || movesWest) && (movesNorth || movesSouth)) {
    const anchorX = movesEast ? left : right;
    const anchorY = movesSouth ? top : bottom;
    const maxWidth = movesEast ? bounds.width - anchorX : anchorX;
    const maxHeight = movesSouth ? bounds.height - anchorY : anchorY;
    const pointerWidth = Math.abs(pointX - anchorX);
    const pointerHeight = Math.abs(pointY - anchorY);
    const widthFromPointer = Math.max(minSize, Math.min(pointerWidth, pointerHeight * ratio, maxWidth, maxHeight * ratio));
    const height = widthFromPointer / ratio;
    const x = movesEast ? anchorX : anchorX - widthFromPointer;
    const y = movesSouth ? anchorY : anchorY - height;

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(widthFromPointer),
      height: Math.round(height),
    };
  }

  if (movesEast || movesWest) {
    const anchorX = movesEast ? left : right;
    const maxWidth = movesEast ? bounds.width - anchorX : anchorX;
    const pointerWidth = Math.abs(pointX - anchorX);
    const width = Math.max(minSize, Math.min(pointerWidth, maxWidth, bounds.height * ratio));
    const height = width / ratio;
    const x = movesEast ? anchorX : anchorX - width;
    const y = Math.max(0, Math.min(centerY - height / 2, bounds.height - height));

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  const anchorY = movesSouth ? top : bottom;
  const maxHeight = movesSouth ? bounds.height - anchorY : anchorY;
  const pointerHeight = Math.abs(pointY - anchorY);
  const height = Math.max(minSize, Math.min(pointerHeight, maxHeight, bounds.width / ratio));
  const width = height * ratio;
  const x = Math.max(0, Math.min(centerX - width / 2, bounds.width - width));
  const y = movesSouth ? anchorY : anchorY - height;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function createCenteredAspectRect(bounds: CanvasSize, aspectRatio: AspectRatio, coverage: number): CanvasRect {
  const ratio = aspectRatio.width / aspectRatio.height;
  const widthFromBounds = bounds.width * coverage;
  const heightFromWidth = widthFromBounds / ratio;
  const height = heightFromWidth <= bounds.height * coverage ? heightFromWidth : bounds.height * coverage;
  const width = height * ratio;

  return {
    x: Math.round((bounds.width - width) / 2),
    y: Math.round((bounds.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function createAspectRectFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  aspectRatio: AspectRatio,
  bounds: CanvasSize,
): CanvasRect {
  const dragRect = clampRectToBounds(normalizeRect(startX, startY, endX, endY), bounds);
  const ratio = aspectRatio.width / aspectRatio.height;
  const widthFromDrag = dragRect.width;
  const heightFromWidth = widthFromDrag / ratio;
  const height = heightFromWidth <= dragRect.height ? heightFromWidth : dragRect.height;
  const width = height * ratio;

  return {
    x: Math.round(dragRect.x),
    y: Math.round(dragRect.y),
    width: Math.round(width),
    height: Math.round(height),
  };
}
