import assert from "node:assert/strict";
import test from "node:test";

import { includeCurrentModelOption, type BoardModelOptionGroup } from "../lib/board/model-options";

test("includeCurrentModelOption preserves groups when the current model already exists", () => {
  const groups: BoardModelOptionGroup[] = [
    {
      provider: "modelscope",
      label: "ModelScope",
      options: [{ value: "modelscope:Qwen/Qwen-Image", label: "ModelScope Qwen Image" }],
    },
  ];

  assert.equal(includeCurrentModelOption(groups, "modelscope:Qwen/Qwen-Image"), groups);
});

test("includeCurrentModelOption adds an unlisted current model to its provider group", () => {
  const groups: BoardModelOptionGroup[] = [
    {
      provider: "12ai",
      label: "12AI",
      options: [{ value: "12ai:gemini-3.1-flash-image-preview", label: "12AI Gemini 3.1 Flash Image" }],
    },
    {
      provider: "modelscope",
      label: "ModelScope",
      options: [],
    },
  ];

  const nextGroups = includeCurrentModelOption(groups, "modelscope:Qwen/Qwen-Image");

  assert.deepEqual(nextGroups[1], {
    provider: "modelscope",
    label: "ModelScope",
    options: [{ value: "modelscope:Qwen/Qwen-Image", label: "ModelScope Qwen/Qwen-Image" }],
  });
});

test("includeCurrentModelOption creates a provider group when none exists", () => {
  const groups: BoardModelOptionGroup[] = [];

  assert.deepEqual(includeCurrentModelOption(groups, "runninghub:workflow-image:123"), [
    {
      provider: "runninghub",
      label: "RunningHub",
      options: [{ value: "runninghub:workflow-image:123", label: "RunningHub workflow-image:123" }],
    },
  ]);
});
