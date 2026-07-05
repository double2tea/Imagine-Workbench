import { t } from "@/lib/i18n";
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { API_ROUTES } from "@/lib/api/routes";
import { browserByokFetch } from "@/lib/browser-byok-fetch";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { buildStorageItem, type GenerationRequestSnapshot, type StorageItem } from "@/lib/db";
import type { GenerationTask, GenerationTaskStorage, GenerationTaskUpdate } from "@/lib/generation-tasks";

type NoticeType = "error" | "info" | "success";
const PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000;

interface UseMediaPollingParams {
  buildProviderHeaders: (target?: string) => Record<string, string>;
  generationTasks: GenerationTask[];
  locallyCanceledItemIdsRef: MutableRefObject<Set<string>>;
  pollingFailuresRef: MutableRefObject<Record<string, number>>;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
  deleteAssetById: (id: string) => Promise<void>;
  saveAssetWithPreview: (item: StorageItem) => Promise<StorageItem>;
  updateGenerationTask: GenerationTaskStorage["update"];
  setGenerationTasks: Dispatch<SetStateAction<GenerationTask[]>>;
  setItems: Dispatch<SetStateAction<StorageItem[]>>;
}

function getStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function getStringArrayField(value: unknown, field: string): string[] {
  if (typeof value !== "object" || value === null || !(field in value)) return [];
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  if (!Array.isArray(fieldValue)) return [];
  return fieldValue.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function statusOutputCount(statusData: unknown): number {
  return Math.max(1, getStringArrayField(statusData, "urls").length);
}

function isProcessingTimedOut(task: GenerationTask): boolean {
  const createdAt = Date.parse(task.createdAt);
  return Number.isFinite(createdAt) && Date.now() - createdAt > PROCESSING_TIMEOUT_MS;
}

async function saveItemOrWarn(
  item: StorageItem,
  saveAssetWithPreview: (item: StorageItem) => Promise<StorageItem>,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<StorageItem | null> {
  try {
    return await saveAssetWithPreview(item);
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.fileReadFailed"));
    console.error("Asset Save Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.localSaveFailed", { error: message }));
    return null;
  }
}

async function deleteItemOrWarn(
  itemId: string,
  deleteAssetById: (id: string) => Promise<void>,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<void> {
  try {
    await deleteAssetById(itemId);
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.originalMediaReadFailed"));
    console.error("Asset Delete Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.localResultClearFailed", { error: message }));
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t("common.notices.fileReadFailed")));
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(t("common.notices.fileReadFailed")));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

function upsertGenerationTask(tasks: GenerationTask[], task: GenerationTask): GenerationTask[] {
  const merged = new Map(tasks.map(entry => [entry.id, entry]));
  merged.set(task.id, task);
  return Array.from(merged.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

async function updateTaskOrWarn(
  id: string,
  update: GenerationTaskUpdate,
  updateGenerationTask: GenerationTaskStorage["update"],
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<GenerationTask | null> {
  try {
    return await updateGenerationTask(id, update);
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.taskUpdateFailed"));
    console.error("Generation Task Update Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.taskUpdateFailed", { error: message }));
    return null;
  }
}

function completedAssetIdPrefix(mediaType: StorageItem["type"]): string {
  if (mediaType === "image") return "img";
  if (mediaType === "audio") return "aud";
  if (mediaType === "transcript") return "txt";
  return "vid";
}

function isTaskLocallyCanceled(
  task: GenerationTask,
  locallyCanceledItemIdsRef: MutableRefObject<Set<string>>,
): boolean {
  return locallyCanceledItemIdsRef.current.has(task.id);
}

async function stopIfTaskLocallyCanceled(
  task: GenerationTask,
  locallyCanceledItemIdsRef: MutableRefObject<Set<string>>,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
  updateGenerationTask: GenerationTaskStorage["update"],
  setGenerationTasks: Dispatch<SetStateAction<GenerationTask[]>>,
): Promise<boolean> {
  if (!isTaskLocallyCanceled(task, locallyCanceledItemIdsRef)) return false;
  const canceledTask = await updateTaskOrWarn(task.id, {
    status: "canceled",
    progress: 100,
  }, updateGenerationTask, pushWorkspaceNotice);
  if (canceledTask) setGenerationTasks(current => upsertGenerationTask(current, canceledTask));
  return true;
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

function taskRequestForAsset(task: GenerationTask): GenerationRequestSnapshot | undefined {
  return task.request;
}

export function useMediaPolling({
  buildProviderHeaders,
  generationTasks,
  locallyCanceledItemIdsRef,
  pollingFailuresRef,
  pushWorkspaceNotice,
  deleteAssetById,
  saveAssetWithPreview,
  updateGenerationTask,
  setGenerationTasks,
  setItems,
}: UseMediaPollingParams) {
  const materializingTaskIdsRef = useRef<Set<string>>(new Set());
  const materializedTaskIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeTasks = generationTasks.filter(task => task.status === "pending" || task.status === "processing");
    const activeTaskIds = new Set(activeTasks.map(task => task.id));
    for (const taskId of materializingTaskIdsRef.current) {
      if (!activeTaskIds.has(taskId)) materializingTaskIdsRef.current.delete(taskId);
    }
    for (const taskId of materializedTaskIdsRef.current) {
      if (!activeTaskIds.has(taskId)) materializedTaskIdsRef.current.delete(taskId);
    }
    if (activeTasks.length === 0) return;

    const interval = setInterval(async () => {
      const completedItems: StorageItem[] = [];

      for (const task of activeTasks) {
        if (materializedTaskIdsRef.current.has(task.id)) continue;

        if (task.status === "pending") {
          if (!isProcessingTimedOut(task)) continue;
          const timeoutMessage = t("common.notices.taskTimeoutPending");
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
          const failedTask = await updateTaskOrWarn(task.id, {
            status: "failed",
            progress: 100,
            errorMessage: timeoutMessage,
          }, updateGenerationTask, pushWorkspaceNotice);
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
          delete pollingFailuresRef.current[task.id];
          if (failedTask) setGenerationTasks(current => upsertGenerationTask(current, failedTask));
          pushWorkspaceNotice("error", timeoutMessage);
          continue;
        }

        if (!task.operationName) {
          if (!isProcessingTimedOut(task)) continue;
          const timeoutMessage = t("common.notices.taskTimeoutOperation");
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
          const failedTask = await updateTaskOrWarn(task.id, {
            status: "failed",
            progress: 100,
            errorMessage: timeoutMessage,
          }, updateGenerationTask, pushWorkspaceNotice);
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
          delete pollingFailuresRef.current[task.id];
          if (failedTask) setGenerationTasks(current => upsertGenerationTask(current, failedTask));
          pushWorkspaceNotice("error", timeoutMessage);
          continue;
        }

        if (task.operationName) {
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
          try {
            const headers = buildProviderHeaders(task.operationName);

            const res = await browserByokFetch(API_ROUTES.media.status, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ operationName: task.operationName, model: task.model }),
            });

            if (!res.ok) {
              throw new Error(await readFetchError(res, t("common.notices.taskStatusQueryFailed")));
            }

            const statusData: unknown = await res.json();
            if (typeof statusData !== "object" || statusData === null) {
              throw new Error(t("common.notices.taskStatusFormatIncorrect"));
            }
            const statusRecord = statusData as Record<string, unknown>;
            pollingFailuresRef.current[task.id] = 0;
            if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;

            if (statusRecord.done === true && statusRecord.status === "failed") {
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
              const failedTask = await updateTaskOrWarn(task.id, {
                status: "failed",
                progress: 100,
                errorMessage: getStringField(statusData, "errorMessage") ?? t("common.notices.asyncTaskFailed"),
              }, updateGenerationTask, pushWorkspaceNotice);
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
              delete pollingFailuresRef.current[task.id];
              if (failedTask) {
                setGenerationTasks(current => upsertGenerationTask(current, failedTask));
                pushWorkspaceNotice("error", `${t("common.notices.asyncTaskFailed")}：${failedTask.errorMessage}`);
              }
              continue;
            }

            if (statusRecord.done === true) {
              if (materializingTaskIdsRef.current.has(task.id)) continue;
              materializingTaskIdsRef.current.add(task.id);
              try {
                const mediaType = statusRecord.mediaType === "image"
                  ? "image"
                  : statusRecord.mediaType === "audio"
                    ? "audio"
                    : "video";
                const downloadEndpoint =
                  mediaType === "image"
                    ? API_ROUTES.media.imageDownload
                    : mediaType === "audio"
                      ? API_ROUTES.media.audioDownload
                      : API_ROUTES.media.videoDownload;

                const completedItemsToSave: StorageItem[] = [];
                let wasCanceled = false;
                for (let outputIndex = 0; outputIndex < statusOutputCount(statusData); outputIndex += 1) {
                  const dlRes = await browserByokFetch(downloadEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...headers },
                    body: JSON.stringify({ operationName: task.operationName, model: task.model, outputIndex }),
                  });

                  if (!dlRes.ok) {
                    throw new Error(await readFetchError(dlRes, t("common.notices.resultDownloadFailed")));
                  }

                  const blob = await dlRes.blob();
                  if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) {
                    wasCanceled = true;
                    break;
                  }
                  const completedUrl = await blobToDataUrl(blob);
                  if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) {
                    wasCanceled = true;
                    break;
                  }
                  const completedAssetId = makeClientId(`${completedAssetIdPrefix(mediaType)}_${outputIndex}`);
                  const completedItem = buildStorageItem(
                    {
                      id: completedAssetId,
                      type: mediaType,
                      url: completedUrl,
                      prompt: task.prompt,
                      model: task.model,
                      aspectRatio: task.request?.aspectRatio ?? (mediaType === "audio" ? "audio" : "auto"),
                      createdAt: task.createdAt,
                      status: "complete",
                      progress: 100,
                      generationRequest: taskRequestForAsset(task),
                      sourceBoardNodeId: task.source.boardNodeId,
                      sourceBoardResultStackKey: task.source.resultStackKey,
                    },
                    { boardId: task.source.boardId },
                  );
                  if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) {
                    wasCanceled = true;
                    break;
                  }
                  completedItemsToSave.push(completedItem);
                }

                if (wasCanceled) continue;
                const savedCompletedItems: StorageItem[] = [];
                for (const completedItem of completedItemsToSave) {
                  const savedCompletedItem = await saveItemOrWarn(completedItem, saveAssetWithPreview, pushWorkspaceNotice);
                  if (savedCompletedItem) savedCompletedItems.push(savedCompletedItem);
                }
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) {
                  for (const savedItem of savedCompletedItems) await deleteItemOrWarn(savedItem.id, deleteAssetById, pushWorkspaceNotice);
                  continue;
                }
                  if (savedCompletedItems.length !== completedItemsToSave.length) {
                    for (const savedItem of savedCompletedItems) await deleteItemOrWarn(savedItem.id, deleteAssetById, pushWorkspaceNotice);
                    const failedTask = await updateTaskOrWarn(task.id, {
                      status: "failed",
                      progress: 100,
                      errorMessage: t("common.notices.imageResultAssetSaveFailed"),
                    }, updateGenerationTask, pushWorkspaceNotice);
                  delete pollingFailuresRef.current[task.id];
                  if (failedTask) setGenerationTasks(current => upsertGenerationTask(current, failedTask));
                  continue;
                }
                const resultAssetIds = savedCompletedItems.map(item => item.id);
                const completedTask = await updateTaskOrWarn(task.id, {
                  activeResultAssetId: resultAssetIds[0],
                  resultAssetIds,
                  status: "complete",
                  progress: 100,
                }, updateGenerationTask, pushWorkspaceNotice);
                if (!completedTask) {
                  for (const savedItem of savedCompletedItems) await deleteItemOrWarn(savedItem.id, deleteAssetById, pushWorkspaceNotice);
                  continue;
                }
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) {
                  for (const savedItem of savedCompletedItems) await deleteItemOrWarn(savedItem.id, deleteAssetById, pushWorkspaceNotice);
                  continue;
                }
                delete pollingFailuresRef.current[task.id];
                materializedTaskIdsRef.current.add(task.id);
                completedItems.push(...savedCompletedItems);
                setGenerationTasks(current => upsertGenerationTask(current, completedTask));
              } finally {
                materializingTaskIdsRef.current.delete(task.id);
              }
            } else {
              if (isProcessingTimedOut(task)) {
                const timeoutMessage = t("common.notices.taskTimeoutProcessing");
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
                const failedTask = await updateTaskOrWarn(task.id, {
                  status: "failed",
                  progress: 100,
                  errorMessage: timeoutMessage,
                }, updateGenerationTask, pushWorkspaceNotice);
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
                delete pollingFailuresRef.current[task.id];
                if (failedTask) setGenerationTasks(current => upsertGenerationTask(current, failedTask));
                pushWorkspaceNotice("error", timeoutMessage);
                continue;
              }

              const nextProgress = typeof statusRecord.progress === "number" ? statusRecord.progress : task.progress;
              if (task.progress !== nextProgress) {
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
                const progressTask = await updateTaskOrWarn(task.id, {
                  progress: nextProgress,
                  errorMessage: undefined,
                }, updateGenerationTask, pushWorkspaceNotice);
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
                if (progressTask) setGenerationTasks(current => upsertGenerationTask(current, progressTask));
              }
            }
          } catch (error) {
            if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
            const previousFailures = pollingFailuresRef.current[task.id] ?? 0;
            const nextFailures = previousFailures + 1;
            pollingFailuresRef.current[task.id] = nextFailures;
            console.error(`Polling failed for ${task.id}:`, error);

            if (nextFailures >= 3) {
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
              const waitingTask = await updateTaskOrWarn(task.id, {
                status: "failed",
                progress: 100,
                errorMessage: toErrorMessage(error, t("common.notices.taskPollingFailed")),
              }, updateGenerationTask, pushWorkspaceNotice);
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, updateGenerationTask, setGenerationTasks)) continue;
              delete pollingFailuresRef.current[task.id];
              if (waitingTask) {
                setGenerationTasks(current => upsertGenerationTask(current, waitingTask));
                pushWorkspaceNotice("error", `${t("common.notices.taskPollingFailed")}：${waitingTask.errorMessage}`);
              }
            }
          }
        }
      }

      if (completedItems.length > 0) {
        setItems(current => {
          const merged = new Map(current.map(entry => [entry.id, entry]));
          for (const entry of completedItems) {
            merged.set(entry.id, entry);
          }
          return Array.from(merged.values()).sort(
            (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
          );
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [buildProviderHeaders, deleteAssetById, generationTasks, locallyCanceledItemIdsRef, pollingFailuresRef, pushWorkspaceNotice, saveAssetWithPreview, setGenerationTasks, setItems, updateGenerationTask]);
}
