import assert from "node:assert/strict";
import test from "node:test";

import { buildBoardResultStackKey, type BoardResultStackValue } from "../lib/board/result-stack";

function imageStackKey(input: {
  params?: BoardResultStackValue;
  prompt?: string;
  references?: Array<{ id: string; role?: string; type?: string; url?: string }>;
}): string {
  return buildBoardResultStackKey({
    kind: "image-generate",
    model: "openai:gpt-image-1",
    params: input.params ?? { aspectRatio: "1:1", imageQuality: "auto", lighting: "soft-window" },
    prompt: input.prompt ?? "A quiet studio portrait",
    references: input.references ?? [{ id: "asset_1", role: "general", type: "image", url: "data:image/png;base64,AA==" }],
  });
}

test("board result stack key is stable for equivalent object field order", () => {
  const left = imageStackKey({
    params: { aspectRatio: "1:1", imageQuality: "auto", lighting: "soft-window" },
  });
  const right = imageStackKey({
    params: { lighting: "soft-window", imageQuality: "auto", aspectRatio: "1:1" },
  });

  assert.equal(left, right);
});

test("board result stack key ignores undefined object fields", () => {
  const left = imageStackKey({
    params: { aspectRatio: "1:1", imageQuality: "auto", lighting: "soft-window" },
  });
  const right = imageStackKey({
    params: { aspectRatio: "1:1", imageQuality: "auto", lighting: "soft-window", optional: undefined },
  });

  assert.equal(left, right);
});

test("board result stack key changes when prompt, references, or params change", () => {
  const base = imageStackKey({});

  assert.notEqual(base, imageStackKey({ prompt: "A high-key studio portrait" }));
  assert.notEqual(base, imageStackKey({ references: [{ id: "asset_2", role: "general", type: "image", url: "data:image/png;base64,BB==" }] }));
  assert.notEqual(base, imageStackKey({ params: { aspectRatio: "1:1", imageQuality: "high", lighting: "soft-window" } }));
});
