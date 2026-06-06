import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationTask,
  createRetryGenerationTask,
  generationTaskToGalleryItem,
  generationTaskRequestSnapshot,
  legacyStorageItemToGenerationTask,
  legacyStorageItemsToGenerationTasks,
} from "../lib/generation-tasks";
import { buildStorageItem, type GenerationRequestSnapshot, type StorageItem } from "../lib/db";

const timestamp = "2026-06-05T00:00:00.000Z";

const requestWithPassword: GenerationRequestSnapshot = {
  prompt: "a calm studio scene",
  model: "runninghub:ai-app-image:123",
  aspectRatio: "1:1",
  runningHubAccessPassword: "secret-password",
  referenceMedia: [{ url: "data:image/png;base64,AA==", type: "image" }],
};

function storageItem(input: Partial<StorageItem>): StorageItem {
  return buildStorageItem({
    id: input.id ?? "asset_1",
    type: input.type ?? "image",
    url: input.url ?? "",
    prompt: input.prompt ?? "prompt",
    model: input.model ?? "model",
    aspectRatio: input.aspectRatio ?? "1:1",
    createdAt: input.createdAt ?? timestamp,
    status: input.status ?? "processing",
    progress: input.progress ?? 42,
    operationName: input.operationName,
    errorMessage: input.errorMessage,
    generationRequest: input.generationRequest,
    sourceBoardNodeId: input.sourceBoardNodeId,
    sourceBoardResultStackKey: input.sourceBoardResultStackKey,
  }, { boardId: input.boardId });
}

test("generationTaskRequestSnapshot removes provider access passwords", () => {
  assert.deepEqual(generationTaskRequestSnapshot(requestWithPassword), {
    prompt: "a calm studio scene",
    model: "runninghub:ai-app-image:123",
    aspectRatio: "1:1",
    referenceMedia: [{ url: "data:image/png;base64,AA==", type: "image" }],
  });
});

test("createGenerationTask normalizes progress and result asset ids", () => {
  assert.deepEqual(createGenerationTask({
    id: "task_1",
    mediaType: "image",
    prompt: "prompt",
    model: "model",
    status: "processing",
    progress: 108.4,
    createdAt: timestamp,
    source: { surface: "board", boardId: "board_1", boardNodeId: "node_1" },
    resultAssetIds: ["asset_a", "asset_a", ""],
    request: requestWithPassword,
  }), {
    id: "task_1",
    mediaType: "image",
    prompt: "prompt",
    model: "model",
    status: "processing",
    progress: 100,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: { surface: "board", boardId: "board_1", boardNodeId: "node_1" },
    resultAssetIds: ["asset_a"],
    activeResultAssetId: undefined,
    operationName: undefined,
    errorMessage: undefined,
    request: {
      prompt: "a calm studio scene",
      model: "runninghub:ai-app-image:123",
      aspectRatio: "1:1",
      referenceMedia: [{ url: "data:image/png;base64,AA==", type: "image" }],
    },
    legacyAssetId: undefined,
    canCancelRemote: false,
  });
});

test("legacyStorageItemToGenerationTask maps board processing assets", () => {
  const task = legacyStorageItemToGenerationTask(storageItem({
    id: "asset_processing",
    boardId: "board_1",
    sourceBoardNodeId: "node_1",
    sourceBoardResultStackKey: "stack_1",
    operationName: "12ai:video:operation_1",
    generationRequest: requestWithPassword,
    type: "video",
  }));

  assert.equal(task?.id, "legacy:asset_processing");
  assert.equal(task?.mediaType, "video");
  assert.equal(task?.source.surface, "board");
  assert.equal(task?.source.boardId, "board_1");
  assert.equal(task?.source.boardNodeId, "node_1");
  assert.equal(task?.source.resultStackKey, "stack_1");
  assert.equal(task?.legacyAssetId, "asset_processing");
  assert.equal(task?.canCancelRemote, true);
  assert.equal("runningHubAccessPassword" in (task?.request ?? {}), false);
});

test("legacyStorageItemsToGenerationTasks excludes completed assets and sorts newest first", () => {
  const tasks = legacyStorageItemsToGenerationTasks([
    storageItem({ id: "complete", status: "complete", createdAt: "2026-06-05T03:00:00.000Z" }),
    storageItem({ id: "older", status: "failed", createdAt: "2026-06-05T01:00:00.000Z" }),
    storageItem({ id: "newer", status: "pending", createdAt: "2026-06-05T02:00:00.000Z" }),
  ]);

  assert.deepEqual(tasks.map(task => task.legacyAssetId), ["newer", "older"]);
});

test("generationTaskToGalleryItem maps active workspace tasks to gallery placeholders", () => {
  const task = createGenerationTask({
    id: "task_gallery",
    mediaType: "video",
    prompt: "人物拿着汉堡走向海边",
    model: "12ai/video-model",
    status: "processing",
    progress: 35,
    createdAt: timestamp,
    source: { surface: "workspace" },
    operationName: "12ai:video:task_1",
    request: requestWithPassword,
  });

  assert.deepEqual(generationTaskToGalleryItem(task), {
    id: "task_gallery",
    type: "video",
    url: "",
    prompt: "人物拿着汉堡走向海边",
    model: "12ai/video-model",
    aspectRatio: "1:1",
    createdAt: timestamp,
    status: "processing",
    progress: 35,
    scope: "workspace",
    boardId: "",
    operationName: "12ai:video:task_1",
    errorMessage: undefined,
    generationRequest: {
      prompt: "a calm studio scene",
      model: "runninghub:ai-app-image:123",
      aspectRatio: "1:1",
      referenceMedia: [{ url: "data:image/png;base64,AA==", type: "image" }],
    },
    sourceBoardNodeId: undefined,
    sourceBoardResultStackKey: undefined,
    hasBlob: false,
  });
});

test("createRetryGenerationTask creates a new pending attempt from a failed task", () => {
  const failedTask = createGenerationTask({
    id: "task_failed",
    mediaType: "image",
    prompt: "prompt",
    model: "model",
    status: "failed",
    progress: 100,
    createdAt: timestamp,
    source: { surface: "workspace" },
    request: requestWithPassword,
    resultAssetIds: ["asset_old"],
    activeResultAssetId: "asset_old",
  });

  const retryTask = createRetryGenerationTask(failedTask, {
    id: "task_retry",
    createdAt: "2026-06-05T04:00:00.000Z",
    progress: 12,
  });

  assert.equal(retryTask.id, "task_retry");
  assert.equal(retryTask.status, "pending");
  assert.equal(retryTask.progress, 12);
  assert.deepEqual(retryTask.resultAssetIds, []);
  assert.equal(retryTask.activeResultAssetId, undefined);
  assert.equal(retryTask.prompt, failedTask.prompt);
  assert.equal(retryTask.source.surface, "workspace");
  assert.equal("runningHubAccessPassword" in (retryTask.request ?? {}), false);
});

test("createRetryGenerationTask rejects non-failed tasks", () => {
  const processingTask = createGenerationTask({
    id: "task_processing",
    mediaType: "video",
    prompt: "prompt",
    model: "model",
    status: "processing",
    progress: 50,
    createdAt: timestamp,
    source: { surface: "workspace" },
  });

  assert.throws(
    () => createRetryGenerationTask(processingTask, { id: "task_retry", createdAt: timestamp }),
    /Only failed generation tasks can be retried/,
  );
});
