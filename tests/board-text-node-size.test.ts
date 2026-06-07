import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NOTE_NODE_SIZE, DEFAULT_PROMPT_NODE_SIZE } from "../lib/board/defaults";
import { estimateBoardNoteSize, estimateBoardPromptSize, MAX_TEXT_NODE_SIZE } from "../lib/board/text-node-size";

test("board text node sizing keeps short prompt and note compact", () => {
  assert.deepEqual(estimateBoardPromptSize("short prompt"), DEFAULT_PROMPT_NODE_SIZE);
  assert.deepEqual(estimateBoardNoteSize("short note"), DEFAULT_NOTE_NODE_SIZE);
});

test("board text node sizing grows long prompt and note within cap", () => {
  const longText = Array.from({ length: 40 }, (_, index) => `Line ${index + 1}: whether you can live inside your heart`).join("\n");
  const promptSize = estimateBoardPromptSize(longText);
  const noteSize = estimateBoardNoteSize(longText, "transcript");

  assert.ok(promptSize.width > DEFAULT_PROMPT_NODE_SIZE.width);
  assert.ok(promptSize.height > DEFAULT_PROMPT_NODE_SIZE.height);
  assert.ok(noteSize.width > DEFAULT_NOTE_NODE_SIZE.width);
  assert.ok(noteSize.height > DEFAULT_NOTE_NODE_SIZE.height);
  assert.ok(promptSize.width <= MAX_TEXT_NODE_SIZE.width);
  assert.ok(promptSize.height <= MAX_TEXT_NODE_SIZE.height);
  assert.ok(noteSize.width <= MAX_TEXT_NODE_SIZE.width);
  assert.ok(noteSize.height <= MAX_TEXT_NODE_SIZE.height);
});
