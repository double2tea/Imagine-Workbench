export const BOARD_IMAGE_GRID_SPLIT_PRESETS = [2, 3, 4] as const;
export const BOARD_IMAGE_GRID_SPLIT_MAX_CROPS = 16;

export type BoardImageGridSplitPreset = (typeof BOARD_IMAGE_GRID_SPLIT_PRESETS)[number];
export type BoardImageGridSplitMode = "auto" | BoardImageGridSplitPreset;

export interface BoardImageSplitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardImageSplitCrop {
  index: number;
  rect: BoardImageSplitRect;
  url: string;
}

export interface BoardImageSplitResult {
  crops: BoardImageSplitCrop[];
  sourceHeight: number;
  sourceWidth: number;
}

export interface BoardImageGridPixelData {
  data: Uint8ClampedArray;
  height: number;
  width: number;
}

const SEPARATOR_RATIO_THRESHOLD = 0.62;
const COMPONENT_SEPARATOR_DARK_LUMA = 32;
const COMPONENT_SEPARATOR_LIGHT_LUMA = 250;
const MIN_CELL_SIZE = 24;
const MIN_COMPONENT_AREA_RATIO = 0.01;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded for grid split"));
    image.src = url;
  });
}

function createSourceCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Browser cannot create a readable canvas");
  context.drawImage(image, 0, 0);
  return canvas;
}

function isSeparatorPixel(data: Uint8ClampedArray, offset: number): boolean {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  const alpha = data[offset + 3] ?? 255;
  if (alpha < 16) return true;
  const luma = red * 0.299 + green * 0.587 + blue * 0.114;
  return luma < 42 || luma > 246;
}

function isComponentSeparatorPixel(data: Uint8ClampedArray, offset: number): boolean {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  const alpha = data[offset + 3] ?? 255;
  if (alpha < 16) return true;
  const luma = red * 0.299 + green * 0.587 + blue * 0.114;
  return luma < COMPONENT_SEPARATOR_DARK_LUMA || luma > COMPONENT_SEPARATOR_LIGHT_LUMA;
}

function groupedLineCenters(lines: number[]): number[] {
  const centers: number[] = [];
  let start: number | null = null;
  let previous: number | null = null;
  for (const line of lines) {
    if (start === null || previous === null || line > previous + 1) {
      if (start !== null && previous !== null) centers.push(Math.round((start + previous) / 2));
      start = line;
    }
    previous = line;
  }
  if (start !== null && previous !== null) centers.push(Math.round((start + previous) / 2));
  return centers;
}

function separatorCentersForAxis(
  imageData: BoardImageGridPixelData,
  axis: "x" | "y",
): number[] {
  const { data, width, height } = imageData;
  const length = axis === "x" ? width : height;
  const crossLength = axis === "x" ? height : width;
  const start = Math.max(1, Math.floor(length * 0.04));
  const end = Math.min(length - 1, Math.ceil(length * 0.96));
  const candidates: number[] = [];
  for (let line = start; line < end; line += 1) {
    let separatorPixels = 0;
    for (let cross = 0; cross < crossLength; cross += 1) {
      const x = axis === "x" ? line : cross;
      const y = axis === "x" ? cross : line;
      const offset = (y * width + x) * 4;
      if (isSeparatorPixel(data, offset)) separatorPixels += 1;
    }
    if (separatorPixels / crossLength >= SEPARATOR_RATIO_THRESHOLD) {
      candidates.push(line);
    }
  }
  return groupedLineCenters(candidates);
}

function sortRectsByReadingOrder(rects: BoardImageSplitRect[]): BoardImageSplitRect[] {
  const medianHeight = [...rects].sort((left, right) => left.height - right.height)[Math.floor(rects.length / 2)]?.height ?? MIN_CELL_SIZE;
  const rowTolerance = Math.max(MIN_CELL_SIZE, Math.round(medianHeight * 0.35));
  return [...rects].sort((left, right) => {
    if (Math.abs(left.y - right.y) > rowTolerance) return left.y - right.y;
    return left.x - right.x;
  });
}

function mergeSimilarRects(rects: BoardImageSplitRect[]): BoardImageSplitRect[] {
  const uniqueRects: BoardImageSplitRect[] = [];
  for (const rect of rects) {
    const duplicate = uniqueRects.some(existing =>
      Math.abs(existing.x - rect.x) <= 1 &&
      Math.abs(existing.y - rect.y) <= 1 &&
      Math.abs(existing.width - rect.width) <= 2 &&
      Math.abs(existing.height - rect.height) <= 2,
    );
    if (!duplicate) uniqueRects.push(rect);
  }
  return uniqueRects;
}

function rectsFromSeparators(width: number, height: number, verticalLines: number[], horizontalLines: number[]): BoardImageSplitRect[] {
  const xs = [0, ...verticalLines, width];
  const ys = [0, ...horizontalLines, height];
  const rects: BoardImageSplitRect[] = [];
  for (let row = 0; row < ys.length - 1; row += 1) {
    for (let column = 0; column < xs.length - 1; column += 1) {
      const left = xs[column] ?? 0;
      const right = xs[column + 1] ?? width;
      const top = ys[row] ?? 0;
      const bottom = ys[row + 1] ?? height;
      const rect = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
      if (rect.width >= MIN_CELL_SIZE && rect.height >= MIN_CELL_SIZE) rects.push(rect);
    }
  }
  return sortRectsByReadingOrder(rects);
}

export function createPresetBoardImageGridRects(width: number, height: number, gridSize: BoardImageGridSplitPreset): BoardImageSplitRect[] {
  const rects: BoardImageSplitRect[] = [];
  for (let row = 0; row < gridSize; row += 1) {
    const top = Math.round((height * row) / gridSize);
    const bottom = Math.round((height * (row + 1)) / gridSize);
    for (let column = 0; column < gridSize; column += 1) {
      const left = Math.round((width * column) / gridSize);
      const right = Math.round((width * (column + 1)) / gridSize);
      rects.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return rects;
}

function componentRects(imageData: BoardImageGridPixelData): BoardImageSplitRect[] {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const rects: BoardImageSplitRect[] = [];
  const minArea = totalPixels * MIN_COMPONENT_AREA_RATIO;

  for (let start = 0; start < totalPixels; start += 1) {
    if (visited[start] === 1) continue;
    const startOffset = start * 4;
    if (isComponentSeparatorPixel(data, startOffset)) {
      visited[start] = 1;
      continue;
    }

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const stack = [start];
    visited[start] = 1;

    while (stack.length > 0) {
      const index = stack.pop();
      if (index === undefined) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor] === 1) continue;
        visited[neighbor] = 1;
        if (!isComponentSeparatorPixel(data, neighbor * 4)) stack.push(neighbor);
      }
    }

    const rect = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
    if (area >= minArea && rect.width >= MIN_CELL_SIZE && rect.height >= MIN_CELL_SIZE) rects.push(rect);
  }

  return sortRectsByReadingOrder(mergeSimilarRects(rects));
}

export function detectBoardImageGridRects(imageData: BoardImageGridPixelData): BoardImageSplitRect[] {
  const connectedRects = componentRects(imageData);
  if (connectedRects.length >= 2 && connectedRects.length <= BOARD_IMAGE_GRID_SPLIT_MAX_CROPS) {
    return connectedRects;
  }
  const verticalLines = separatorCentersForAxis(imageData, "x").slice(0, 3);
  const horizontalLines = separatorCentersForAxis(imageData, "y").slice(0, 3);
  return rectsFromSeparators(imageData.width, imageData.height, verticalLines, horizontalLines);
}

function autoRects(canvas: HTMLCanvasElement): BoardImageSplitRect[] {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Browser cannot read the source image");
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rects = detectBoardImageGridRects(imageData);
  if (rects.length < 2 || rects.length > BOARD_IMAGE_GRID_SPLIT_MAX_CROPS) {
    throw new Error("Grid split could not detect clear panel boundaries. Try a 2x2, 3x3, or 4x4 preset.");
  }
  return rects;
}

function cropDataUrl(source: HTMLCanvasElement, rect: BoardImageSplitRect): string {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser cannot crop the image");
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas.toDataURL("image/png");
}

export async function splitBoardImageGrid(url: string, mode: BoardImageGridSplitMode): Promise<BoardImageSplitResult> {
  const image = await loadImage(url);
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("Image has invalid dimensions");
  }
  const source = createSourceCanvas(image);
  const rects = mode === "auto"
    ? autoRects(source)
    : createPresetBoardImageGridRects(source.width, source.height, mode);
  if (rects.length > BOARD_IMAGE_GRID_SPLIT_MAX_CROPS) {
    throw new Error(`Grid split supports at most ${BOARD_IMAGE_GRID_SPLIT_MAX_CROPS} images per action`);
  }
  return {
    sourceWidth: source.width,
    sourceHeight: source.height,
    crops: rects.map((rect, index) => ({
      index,
      rect,
      url: cropDataUrl(source, rect),
    })),
  };
}
