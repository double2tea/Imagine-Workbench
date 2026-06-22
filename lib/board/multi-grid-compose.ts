import { t } from "@/lib/i18n-core";
import type { BoardMultiGridAspectRatio, BoardMultiGridItem, BoardMultiGridNode } from "@/lib/board/types";
import { boardMultiGridCellCount } from "@/lib/board/multi-grid";

const EXPORT_MAX_DIMENSION = 1600;
const EMPTY_CELL_FILL = "#14161b";
const GRID_LINE_FILL = "rgba(255, 255, 255, 0.12)";

function parseAspectRatio(ratio: BoardMultiGridAspectRatio): number {
  const [width, height] = ratio.split(":").map(Number);
  if (!width || !height) throw new Error(t("board.node.types.multiGrid"));
  return width / height;
}

function exportCanvasSize(ratio: BoardMultiGridAspectRatio): { height: number; width: number } {
  const value = parseAspectRatio(ratio);
  if (value >= 1) {
    return {
      width: EXPORT_MAX_DIMENSION,
      height: Math.round(EXPORT_MAX_DIMENSION / value),
    };
  }
  return {
    width: Math.round(EXPORT_MAX_DIMENSION * value),
    height: EXPORT_MAX_DIMENSION,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t("board.workspace.dragUrlNotImage")));
    image.src = url;
  });
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  item: BoardMultiGridItem,
  cellX: number,
  cellY: number,
  cellWidth: number,
  cellHeight: number,
): void {
  const baseScale = Math.max(cellWidth / image.naturalWidth, cellHeight / image.naturalHeight);
  const drawWidth = image.naturalWidth * baseScale * item.scale;
  const drawHeight = image.naturalHeight * baseScale * item.scale;
  const drawX = cellX + (cellWidth - drawWidth) / 2 + (cellWidth * item.offsetX) / 100;
  const drawY = cellY + (cellHeight - drawHeight) / 2 + (cellHeight * item.offsetY) / 100;
  context.save();
  context.beginPath();
  context.rect(cellX, cellY, cellWidth, cellHeight);
  context.clip();
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  context.restore();
}

export async function composeBoardMultiGridImage(node: BoardMultiGridNode): Promise<string> {
  const visibleItems = node.items.filter((item): item is BoardMultiGridItem & { cellIndex: number } => typeof item.cellIndex === "number");
  if (visibleItems.length === 0) throw new Error(t("board.workspace.noSelectableImageNode"));

  const size = exportCanvasSize(node.aspectRatio);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t("board.workspace.browserNotSupportClipboard"));

  context.fillStyle = EMPTY_CELL_FILL;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const imageByAssetId = new Map<string, HTMLImageElement>();
  await Promise.all(visibleItems.map(async item => {
    imageByAssetId.set(item.assetId, await loadImage(item.url));
  }));

  const cellWidth = canvas.width / node.gridSize;
  const cellHeight = canvas.height / node.gridSize;
  for (const item of visibleItems) {
    const image = imageByAssetId.get(item.assetId);
    if (!image) continue;
    const column = item.cellIndex % node.gridSize;
    const row = Math.floor(item.cellIndex / node.gridSize);
    drawCoverImage(context, image, item, column * cellWidth, row * cellHeight, cellWidth, cellHeight);
  }

  context.strokeStyle = GRID_LINE_FILL;
  context.lineWidth = Math.max(1, Math.round(canvas.width / 900));
  for (let index = 1; index < node.gridSize; index += 1) {
    const x = Math.round(cellWidth * index);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();

    const y = Math.round(cellHeight * index);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  const cellCount = boardMultiGridCellCount(node.gridSize);
  if (cellCount <= 0) throw new Error(t("board.node.types.multiGrid"));
  return canvas.toDataURL("image/png");
}
