import { DEFAULT_NOTE_NODE_SIZE, DEFAULT_PROMPT_NODE_SIZE } from "./defaults";
import type { BoardNoteVariant, BoardSize } from "./types";

export const MAX_TEXT_NODE_SIZE: BoardSize = {
  width: DEFAULT_NOTE_NODE_SIZE.width * 3,
  height: DEFAULT_NOTE_NODE_SIZE.height * 3,
};

const MIN_BODY_LINES = 5;
const LINE_HEIGHT = 20;
const HORIZONTAL_PADDING = 48;
const TRANSCRIPT_HEADER_HEIGHT = 48;

export function estimateBoardNoteSize(body: string, variant: BoardNoteVariant = "plain"): BoardSize {
  return estimateBoardTextNodeSize(body, DEFAULT_NOTE_NODE_SIZE, variant === "transcript" ? TRANSCRIPT_HEADER_HEIGHT : 0);
}

export function estimateBoardPromptSize(prompt: string): BoardSize {
  return estimateBoardTextNodeSize(prompt, DEFAULT_PROMPT_NODE_SIZE, 0);
}

export function clampBoardTextNodeSize(size: BoardSize, minSize: BoardSize): BoardSize {
  return {
    width: clamp(size.width, minSize.width, MAX_TEXT_NODE_SIZE.width),
    height: clamp(size.height, minSize.height, MAX_TEXT_NODE_SIZE.height),
  };
}

function estimateBoardTextNodeSize(body: string, minSize: BoardSize, extraHeaderHeight: number): BoardSize {
  const text = body.trim();
  if (!text) return minSize;

  const lines = text.split(/\r?\n/);
  const longestLine = Math.max(...lines.map(line => line.length), 0);
  const width = clamp(
    minSize.width + Math.max(0, Math.ceil(longestLine / 32) - 1) * 160,
    minSize.width,
    MAX_TEXT_NODE_SIZE.width,
  );
  const charactersPerLine = Math.max(24, Math.floor((width - HORIZONTAL_PADDING) / 7));
  const visualLineCount = lines.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  const height = clamp(
    minSize.height + extraHeaderHeight + Math.max(0, visualLineCount - MIN_BODY_LINES) * LINE_HEIGHT,
    minSize.height,
    MAX_TEXT_NODE_SIZE.height,
  );

  return { width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
