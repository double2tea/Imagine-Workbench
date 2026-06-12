import {
  GENERATION_TASK_STORE,
  openDatabase,
  type GenerationRequestSnapshot,
  type StorageItem,
} from "./db";

export type GenerationTaskStatus = "pending" | "processing" | "complete" | "failed" | "canceled";
export type GenerationTaskSourceSurface = "workspace" | "board" | "agent";
export type GenerationTaskMediaType = StorageItem["type"];
export type GenerationTaskRequestSnapshot = Omit<GenerationRequestSnapshot, "runningHubAccessPassword">;

export interface GenerationTaskSource {
  surface: GenerationTaskSourceSurface;
  boardId?: string;
  boardNodeId?: string;
  resultStackKey?: string;
}

export interface GenerationTask {
  id: string;
  mediaType: GenerationTaskMediaType;
  prompt: string;
  model: string;
  status: GenerationTaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  source: GenerationTaskSource;
  resultAssetIds: string[];
  activeResultAssetId?: string;
  operationName?: string;
  errorMessage?: string;
  request?: GenerationTaskRequestSnapshot;
  legacyAssetId?: string;
  canCancelRemote: boolean;
}

export interface CreateGenerationTaskInput {
  id: string;
  mediaType: GenerationTaskMediaType;
  prompt: string;
  model: string;
  status: GenerationTaskStatus;
  progress: number;
  createdAt: string;
  source: GenerationTaskSource;
  activeResultAssetId?: string;
  canCancelRemote?: boolean;
  errorMessage?: string;
  legacyAssetId?: string;
  operationName?: string;
  request?: GenerationRequestSnapshot;
  resultAssetIds?: string[];
  updatedAt?: string;
}

export interface ListGenerationTasksOptions {
  boardId?: string;
  statuses?: GenerationTaskStatus[];
  sourceBoardNodeIds?: string[];
  limit?: number;
  offset?: number;
}

export interface CreateGenerationTaskRetryInput {
  id: string;
  createdAt: string;
  progress?: number;
}

export type GenerationTaskUpdate = Partial<Omit<GenerationTask, "id" | "createdAt">>;

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(id => id.trim().length > 0)));
}

function sortedTasks(tasks: GenerationTask[]): GenerationTask[] {
  return [...tasks].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function legacyGenerationTaskId(assetId: string): string {
  return `legacy:${assetId}`;
}

export function generationTaskRequestSnapshot(
  request: GenerationRequestSnapshot | undefined,
): GenerationTaskRequestSnapshot | undefined {
  if (!request) return undefined;
  const { runningHubAccessPassword: _runningHubAccessPassword, ...snapshot } = request;
  return snapshot;
}

export function createGenerationTask(input: CreateGenerationTaskInput): GenerationTask {
  return {
    id: input.id,
    mediaType: input.mediaType,
    prompt: input.prompt,
    model: input.model,
    status: input.status,
    progress: clampProgress(input.progress),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    source: input.source,
    resultAssetIds: dedupeIds(input.resultAssetIds ?? []),
    activeResultAssetId: input.activeResultAssetId,
    operationName: input.operationName,
    errorMessage: input.errorMessage,
    request: generationTaskRequestSnapshot(input.request),
    legacyAssetId: input.legacyAssetId,
    canCancelRemote: input.canCancelRemote ?? false,
  };
}

export function legacyStorageItemToGenerationTask(item: StorageItem): GenerationTask | null {
  if (item.status === "complete") return null;
  return createGenerationTask({
    id: legacyGenerationTaskId(item.id),
    mediaType: item.type,
    prompt: item.prompt,
    model: item.model,
    status: item.status,
    progress: item.progress,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    source: {
      surface: item.sourceBoardNodeId || item.boardId ? "board" : "workspace",
      ...(item.boardId ? { boardId: item.boardId } : {}),
      ...(item.sourceBoardNodeId ? { boardNodeId: item.sourceBoardNodeId } : {}),
      ...(item.sourceBoardResultStackKey ? { resultStackKey: item.sourceBoardResultStackKey } : {}),
    },
    operationName: item.operationName,
    errorMessage: item.errorMessage,
    request: item.generationRequest,
    legacyAssetId: item.id,
    canCancelRemote: item.operationName?.startsWith("12ai:video:") === true,
  });
}

export function legacyStorageItemsToGenerationTasks(items: StorageItem[]): GenerationTask[] {
  return sortedTasks(items.map(legacyStorageItemToGenerationTask).filter((task): task is GenerationTask => task !== null));
}

export function generationTaskToGalleryItem(task: GenerationTask): StorageItem | null {
  if (task.status !== "pending" && task.status !== "processing" && task.status !== "failed" && task.status !== "canceled") {
    return null;
  }
  const status: StorageItem["status"] = task.status === "canceled" ? "failed" : task.status;
  return {
    id: task.id,
    type: task.mediaType,
    url: "",
    prompt: task.prompt,
    model: task.model,
    aspectRatio: task.request?.aspectRatio ?? (task.mediaType === "audio" ? "audio" : task.mediaType === "transcript" ? "transcript" : "auto"),
    createdAt: task.createdAt,
    status,
    progress: task.progress,
    scope: task.source.boardId ? "board" : "workspace",
    boardId: task.source.boardId ?? "",
    operationName: task.operationName,
    errorMessage: task.errorMessage ?? (task.status === "canceled" ? "任务已取消" : undefined),
    generationRequest: task.request,
    sourceBoardNodeId: task.source.boardNodeId,
    sourceBoardResultStackKey: task.source.resultStackKey,
    hasBlob: false,
  };
}

function sortedUniqueTasks(tasks: GenerationTask[]): GenerationTask[] {
  const unique = new Map<string, GenerationTask>();
  for (const task of tasks) unique.set(task.id, task);
  return sortedTasks(Array.from(unique.values()));
}

async function readAllGenerationTasks(): Promise<GenerationTask[]> {
  const db = await openDatabase();
  return new Promise<GenerationTask[]>((resolve, reject) => {
    const transaction = db.transaction(GENERATION_TASK_STORE, "readonly");
    const request = transaction.objectStore(GENERATION_TASK_STORE).getAll();
    request.onsuccess = () => resolve(request.result as GenerationTask[]);
    request.onerror = () => reject(request.error ?? new Error("Generation task list failed"));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("Generation task list transaction failed"));
  });
}

async function readGenerationTasksByIndex(indexName: "by_boardId" | "by_status", value: string): Promise<GenerationTask[]> {
  const db = await openDatabase();
  return new Promise<GenerationTask[]>((resolve, reject) => {
    const transaction = db.transaction(GENERATION_TASK_STORE, "readonly");
    const request = transaction.objectStore(GENERATION_TASK_STORE).index(indexName).getAll(value);
    request.onsuccess = () => resolve(request.result as GenerationTask[]);
    request.onerror = () => reject(request.error ?? new Error("Generation task indexed list failed"));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("Generation task indexed list transaction failed"));
  });
}

async function readGenerationTaskCandidates(options: ListGenerationTasksOptions): Promise<GenerationTask[]> {
  if (options.boardId && options.boardId.trim()) {
    return readGenerationTasksByIndex("by_boardId", options.boardId);
  }
  if (options.statuses?.length === 1) {
    return readGenerationTasksByIndex("by_status", options.statuses[0]);
  }
  if (options.statuses && options.statuses.length > 1) {
    const groups = await Promise.all(options.statuses.map(status => readGenerationTasksByIndex("by_status", status)));
    return sortedUniqueTasks(groups.flat());
  }
  return readAllGenerationTasks();
}

export async function saveGenerationTask(task: GenerationTask): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(GENERATION_TASK_STORE, "readwrite");
    transaction.objectStore(GENERATION_TASK_STORE).put(task);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Generation task save failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Generation task save aborted"));
  });
}

export async function getGenerationTask(id: string): Promise<GenerationTask | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(GENERATION_TASK_STORE, "readonly");
    const request = transaction.objectStore(GENERATION_TASK_STORE).get(id);
    request.onsuccess = () => resolve((request.result as GenerationTask | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Generation task read failed"));
  });
}

export async function listGenerationTasks(options: ListGenerationTasksOptions = {}): Promise<GenerationTask[]> {
  const tasks = await readGenerationTaskCandidates(options);
  const allowedStatuses = options.statuses ? new Set(options.statuses) : null;
  const allowedNodeIds = options.sourceBoardNodeIds ? new Set(options.sourceBoardNodeIds) : null;
  let filtered = tasks;
  if (options.boardId !== undefined) {
    filtered = filtered.filter(task => (task.source.boardId ?? "") === options.boardId);
  }
  if (allowedStatuses) {
    filtered = filtered.filter(task => allowedStatuses.has(task.status));
  }
  if (allowedNodeIds) {
    filtered = filtered.filter(task => task.source.boardNodeId !== undefined && allowedNodeIds.has(task.source.boardNodeId));
  }
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit;
  const sorted = sortedTasks(filtered);
  if (limit !== undefined && limit >= 0) return sorted.slice(offset, offset + limit);
  if (offset > 0) return sorted.slice(offset);
  return sorted;
}

export async function updateGenerationTask(id: string, update: GenerationTaskUpdate): Promise<GenerationTask> {
  const current = await getGenerationTask(id);
  if (!current) throw new Error(`Generation task not found: ${id}`);
  const next: GenerationTask = {
    ...current,
    ...update,
    progress: update.progress === undefined ? current.progress : clampProgress(update.progress),
    source: update.source ?? current.source,
    resultAssetIds: update.resultAssetIds ? dedupeIds(update.resultAssetIds) : current.resultAssetIds,
    updatedAt: update.updatedAt ?? new Date().toISOString(),
  };
  await saveGenerationTask(next);
  return next;
}

export async function cancelGenerationTask(id: string): Promise<GenerationTask> {
  return updateGenerationTask(id, {
    status: "canceled",
    progress: 100,
  });
}

export async function deleteGenerationTask(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(GENERATION_TASK_STORE, "readwrite");
    transaction.objectStore(GENERATION_TASK_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Generation task delete failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Generation task delete aborted"));
  });
}

export function createRetryGenerationTask(
  task: GenerationTask,
  input: CreateGenerationTaskRetryInput,
): GenerationTask {
  if (task.status !== "failed") {
    throw new Error(`Only failed generation tasks can be retried: ${task.id}`);
  }
  return createGenerationTask({
    id: input.id,
    mediaType: task.mediaType,
    prompt: task.prompt,
    model: task.model,
    status: "pending",
    progress: input.progress ?? 0,
    createdAt: input.createdAt,
    source: task.source,
    request: task.request,
  });
}
