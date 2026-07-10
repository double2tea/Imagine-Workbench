import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyBoard } from "../lib/board/defaults";
import { createBoardSaveCoordinator } from "../lib/board/save-coordinator";
import { applyBoardTextDrafts, clearCommittedBoardTextDrafts, writeBoardTextDraft } from "../lib/board/text-draft-journal";
import type { BoardDocument, BoardPromptNode } from "../lib/board/types";

test("board save coordinator serializes autosave and saveNow writes", async () => {
  const calls: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const coordinator = createBoardSaveCoordinator(async board => {
    calls.push(`start:${board.title}`);
    if (board.title === "first") await new Promise<void>(resolve => { releaseFirst = resolve; });
    calls.push(`end:${board.title}`);
  });
  const first = coordinator.save({ ...createEmptyBoard("board"), title: "first" });
  const second = coordinator.save({ ...createEmptyBoard("board"), title: "second" });
  await Promise.resolve();
  assert.deepEqual(calls, ["start:first"]);
  releaseFirst?.();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ["start:first", "end:first", "start:second", "end:second"]);
});

test("board text draft journal restores unsaved prompt text and clears after persistence", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  try {
    const empty = createEmptyBoard("board");
    const node: BoardPromptNode = {
      id: "prompt_1",
      kind: "prompt",
      title: "Prompt",
      prompt: "old",
      position: { x: 0, y: 0 },
      size: { width: 320, height: 180 },
      createdAt: empty.createdAt,
      updatedAt: empty.updatedAt,
    };
    const board: BoardDocument = { ...empty, nodes: [node] };
    writeBoardTextDraft(node.id, "new unsaved text");
    const restored = applyBoardTextDrafts(board);
    assert.equal(restored.nodes[0]?.kind === "prompt" ? restored.nodes[0].prompt : undefined, "new unsaved text");
    clearCommittedBoardTextDrafts(restored);
    assert.equal(values.size, 0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
