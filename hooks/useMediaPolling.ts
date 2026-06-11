import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { API_ROUTES } from "@/lib/api/routes";
import { saveItemWithPreview } from "@/lib/assets/previews";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { buildStorageItem, deleteFromDB, type GenerationRequestSnapshot, type StorageItem } from "@/lib/db";
import { updateGenerationTask, type GenerationTask, type GenerationTaskUpdate } from "@/lib/generation-tasks";

type NoticeType = "error" | "info" | "success";
const PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000;

interface UseMediaPollingParams {
  buildProviderHeaders: (target?: string) => Record<string, string>;
  generationTasks: GenerationTask[];
  locallyCanceledItemIdsRef: MutableRefObject<Set<string>>;
  pollingFailuresRef: MutableRefObject<Record<string, number>>;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
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
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<StorageItem | null> {
  try {
    return await saveItemWithPreview(item);
  } catch (error) {
    const message = toErrorMessage(error, "IndexedDB 写入失败");
    console.error("IndexedDB Save Failed:", error);
    pushWorkspaceNotice("error", `本地存储失败，刷新后可能丢失：${message}`);
    return null;
  }
}

async function deleteItemOrWarn(
  itemId: string,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<void> {
  try {
    await deleteFromDB(itemId);
  } catch (error) {
    const message = toErrorMessage(error, "IndexedDB 删除失败");
    console.error("IndexedDB Delete Failed:", error);
    pushWorkspaceNotice("error", `已取消任务，但本地结果清理失败：${message}`);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("结果文件读取失败"));
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("结果文件读取失败"));
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
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<GenerationTask | null> {
  try {
    return await updateGenerationTask(id, update);
  } catch (error) {
    const message = toErrorMessage(error, "任务更新失败");
    console.error("Generation Task Update Failed:", error);
    pushWorkspaceNotice("error", `任务状态更新失败：${message}`);
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
  setGenerationTasks: Dispatch<SetStateAction<GenerationTask[]>>,
): Promise<boolean> {
  if (!isTaskLocallyCanceled(task, locallyCanceledItemIdsRef)) return false;
  const canceledTask = await updateTaskOrWarn(task.id, {
    status: "canceled",
    progress: 100,
  }, pushWorkspaceNotice);
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
  setGenerationTasks,
  setItems,
}: UseMediaPollingParams) {
  useEffect(() => {
    const activeTasks = generationTasks.filter(task => task.status === "pending" || task.status === "processing");
    if (activeTasks.length === 0) return;

    const interval = setInterval(async () => {
      const completedItems: StorageItem[] = [];

      for (const task of activeTasks) {
        if (task.status === "pending") {
          if (!isProcessingTimedOut(task)) continue;
          const timeoutMessage = "任务超过 2 小时仍未进入远端队列，已停止等待。";
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
          const failedTask = await updateTaskOrWarn(task.id, {
            status: "failed",
            progress: 100,
            errorMessage: timeoutMessage,
          }, pushWorkspaceNotice);
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
          delete pollingFailuresRef.current[task.id];
          if (failedTask) setGenerationTasks(current => upsertGenerationTask(current, failedTask));
          pushWorkspaceNotice("error", timeoutMessage);
          continue;
        }

        if (!task.operationName) {
          if (!isProcessingTimedOut(task)) continue;
          const timeoutMessage = "任务超过 2 小时仍缺少远端任务 ID，已停止等待。";
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
          const failedTask = await updateTaskOrWarn(task.id, {
            status: "failed",
            progress: 100,
            errorMessage: timeoutMessage,
          }, pushWorkspaceNotice);
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
          delete pollingFailuresRef.current[task.id];
          if (failedTask) setGenerationTasks(current => upsertGenerationTask(current, failedTask));
          pushWorkspaceNotice("error", timeoutMessage);
          continue;
        }

        if (task.operationName) {
          if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
          try {
            const headers = buildProviderHeaders(task.operationName);

            const res = await fetch(API_ROUTES.media.status, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ operationName: task.operationName, model: task.model }),
            });

            if (!res.ok) {
              throw new Error(await readFetchError(res, "任务状态查询失败"));
            }

            const statusData: unknown = await res.json();
            if (typeof statusData !== "object" || statusData === null) {
              throw new Error("任务状态接口返回格式不正确");
            }
            const statusRecord = statusData as Record<string, unknown>;
            pollingFailuresRef.current[task.id] = 0;
            if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;

            if (statusRecord.done === true && statusRecord.status === "failed") {
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
              const failedTask = await updateTaskOrWarn(task.id, {
                status: "failed",
                progress: 100,
                errorMessage: getStringField(statusData, "errorMessage") ?? "异步任务失败",
              }, pushWorkspaceNotice);
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
              delete pollingFailuresRef.current[task.id];
              if (failedTask) {
                setGenerationTasks(current => upsertGenerationTask(current, failedTask));
                pushWorkspaceNotice("error", `异步任务失败：${failedTask.errorMessage}`);
              }
              continue;
            }

            if (statusRecord.done === true) {
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
                const dlRes = await fetch(downloadEndpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...headers },
                  body: JSON.stringify({ operationName: task.operationName, model: task.model, outputIndex }),
                });

                if (!dlRes.ok) {
                  throw new Error(await readFetchError(dlRes, "结果下载失败"));
                }

                const blob = await dlRes.blob();
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) {
                  wasCanceled = true;
                  break;
                }
                const completedUrl = await blobToDataUrl(blob);
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) {
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
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) {
                  wasCanceled = true;
                  break;
                }
                completedItemsToSave.push(completedItem);
              }

              if (wasCanceled) continue;
              const savedCompletedItems: StorageItem[] = [];
              for (const completedItem of completedItemsToSave) {
                const savedCompletedItem = await saveItemOrWarn(completedItem, pushWorkspaceNotice);
                if (savedCompletedItem) savedCompletedItems.push(savedCompletedItem);
              }
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) {
                for (const savedItem of savedCompletedItems) await deleteItemOrWarn(savedItem.id, pushWorkspaceNotice);
                continue;
              }
              if (savedCompletedItems.length === 0) {
                const failedTask = await updateTaskOrWarn(task.id, {
                  status: "failed",
                  progress: 100,
                  errorMessage: "结果资产本地存储失败",
                }, pushWorkspaceNotice);
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
              }, pushWorkspaceNotice);
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) {
                for (const savedItem of savedCompletedItems) await deleteItemOrWarn(savedItem.id, pushWorkspaceNotice);
                continue;
              }
              delete pollingFailuresRef.current[task.id];
              if (completedTask) {
                completedItems.push(...savedCompletedItems);
                setGenerationTasks(current => upsertGenerationTask(current, completedTask));
              }
            } else {
              if (isProcessingTimedOut(task)) {
                const timeoutMessage = "任务超过 2 小时仍未完成，已停止自动轮询。";
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
                const failedTask = await updateTaskOrWarn(task.id, {
                  status: "failed",
                  progress: 100,
                  errorMessage: timeoutMessage,
                }, pushWorkspaceNotice);
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
                delete pollingFailuresRef.current[task.id];
                if (failedTask) setGenerationTasks(current => upsertGenerationTask(current, failedTask));
                pushWorkspaceNotice("error", timeoutMessage);
                continue;
              }

              const nextProgress = typeof statusRecord.progress === "number" ? statusRecord.progress : task.progress;
              if (task.progress !== nextProgress) {
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
                const progressTask = await updateTaskOrWarn(task.id, {
                  progress: nextProgress,
                  errorMessage: undefined,
                }, pushWorkspaceNotice);
                if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
                if (progressTask) setGenerationTasks(current => upsertGenerationTask(current, progressTask));
              }
            }
          } catch (error) {
            if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
            const previousFailures = pollingFailuresRef.current[task.id] ?? 0;
            const nextFailures = previousFailures + 1;
            pollingFailuresRef.current[task.id] = nextFailures;
            console.error(`Polling failed for ${task.id}:`, error);

            if (nextFailures >= 3) {
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
              const waitingTask = await updateTaskOrWarn(task.id, {
                status: "failed",
                progress: 100,
                errorMessage: toErrorMessage(error, "任务轮询失败"),
              }, pushWorkspaceNotice);
              if (await stopIfTaskLocallyCanceled(task, locallyCanceledItemIdsRef, pushWorkspaceNotice, setGenerationTasks)) continue;
              delete pollingFailuresRef.current[task.id];
              if (waitingTask) {
                setGenerationTasks(current => upsertGenerationTask(current, waitingTask));
                pushWorkspaceNotice("error", `任务轮询失败：${waitingTask.errorMessage}`);
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
  }, [buildProviderHeaders, generationTasks, locallyCanceledItemIdsRef, pollingFailuresRef, pushWorkspaceNotice, setGenerationTasks, setItems]);
}
