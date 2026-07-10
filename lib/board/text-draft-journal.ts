import type { BoardDocument, BoardNode } from "./types";

const STORAGE_KEY = "imagine_board_text_drafts";
const MAX_DRAFTS = 200;
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface TextDraftRecord {
  updatedAt: number;
  value: string;
}

export function writeBoardTextDraft(nodeId: string, value: string): void {
  if (typeof window === "undefined" || !nodeId) return;
  const drafts = readDrafts();
  drafts[nodeId] = { updatedAt: Date.now(), value };
  const entries = Object.entries(drafts).sort((left, right) => right[1].updatedAt - left[1].updatedAt);
  for (const [staleNodeId] of entries.slice(MAX_DRAFTS)) delete drafts[staleNodeId];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function applyBoardTextDrafts(board: BoardDocument): BoardDocument {
  const drafts = readDrafts();
  let changed = false;
  const nodes = board.nodes.map(node => {
    const draft = drafts[node.id]?.value;
    if (draft === undefined) return node;
    const next = applyNodeText(node, draft);
    changed ||= next !== node;
    return next;
  });
  return changed ? { ...board, nodes } : board;
}

export function clearCommittedBoardTextDrafts(board: BoardDocument): void {
  if (typeof window === "undefined") return;
  const drafts = readDrafts();
  let changed = false;
  for (const node of board.nodes) {
    if (drafts[node.id]?.value === readNodeText(node)) {
      delete drafts[node.id];
      changed = true;
    }
  }
  if (!changed) return;
  if (Object.keys(drafts).length === 0) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function readDrafts(): Record<string, TextDraftRecord> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed).flatMap(([nodeId, value]) => {
      if (typeof value === "string") return [[nodeId, { updatedAt: now, value }]];
      if (!isRecord(value) || typeof value.value !== "string" || typeof value.updatedAt !== "number") return [];
      if (now - value.updatedAt > MAX_DRAFT_AGE_MS) return [];
      return [[nodeId, { updatedAt: value.updatedAt, value: value.value }]];
    }));
  } catch {
    return {};
  }
}

function applyNodeText(node: BoardNode, value: string): BoardNode {
  if (node.kind === "agent") return node.instruction === value ? node : { ...node, instruction: value };
  if (node.kind === "note") return node.body === value ? node : { ...node, body: value };
  if (
    node.kind === "prompt" ||
    node.kind === "image-generate" ||
    node.kind === "video-generate" ||
    node.kind === "audio-operation" ||
    node.kind === "runninghub-app"
  ) {
    return node.prompt === value ? node : { ...node, prompt: value };
  }
  return node;
}

function readNodeText(node: BoardNode): string | undefined {
  if (node.kind === "agent") return node.instruction;
  if (node.kind === "note") return node.body;
  if (
    node.kind === "prompt" ||
    node.kind === "image-generate" ||
    node.kind === "video-generate" ||
    node.kind === "audio-operation" ||
    node.kind === "runninghub-app"
  ) return node.prompt;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
