import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { readFetchError } from "@/lib/client-fetch-error";
import { buildStorageItem, saveToDB, type GenerationRequestSnapshot, type StorageItem } from "@/lib/db";
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

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function getStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function isProcessingTimedOut(task: GenerationTask): boolean {
  const createdAt = Date.parse(task.createdAt);
  return Number.isFinite(createdAt) && Date.now() - createdAt > PROCESSING_TIMEOUT_MS;
}

async function saveItemOrWarn(
  item: StorageItem,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<boolean> {
  try {
    await saveToDB(item);
    return true;
  } catch (error) {
    const message = toErrorMessage(error, "IndexedDB 写入失败");
    console.error("IndexedDB Save Failed:", error);
    pushWorkspaceNotice("error", `本地存储失败，刷新后可能丢失：${message}`);
    return false;
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
  return "vid";
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
    const processingTasks = generationTasks.filter(task => task.status === "processing" && task.operationName);
    if (processingTasks.length === 0) return;

    const interval = setInterval(async () => {
      const completedItems: StorageItem[] = [];

      for (const task of processingTasks) {
        if (task.operationName) {
          if (locallyCanceledItemIdsRef.current.has(task.id)) continue;
          try {
            const headers = buildProviderHeaders(task.operationName);

            const res = await fetch("/api/gemini/video-status", {
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

            if (statusRecord.done === true && statusRecord.status === "failed") {
              const failedTask = await updateTaskOrWarn(task.id, {
                status: "failed",
                progress: 100,
                errorMessage: getStringField(statusData, "errorMessage") ?? "异步任务失败",
              }, pushWorkspaceNotice);
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
                  ? "/api/gemini/image-download"
                  : mediaType === "audio"
                    ? "/api/gemini/audio-download"
                    : "/api/gemini/video-download";

              const dlRes = await fetch(downloadEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ operationName: task.operationName, model: task.model }),
              });

              if (dlRes.ok) {
                const blob = await dlRes.blob();
                const completedAssetId = makeClientId(completedAssetIdPrefix(mediaType));
                const completedItem = buildStorageItem(
                  {
                    id: completedAssetId,
                    type: mediaType,
                    url: await blobToDataUrl(blob),
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
                if (!await saveItemOrWarn(completedItem, pushWorkspaceNotice)) continue;
                completedItems.push(completedItem);
                const completedTask = await updateTaskOrWarn(task.id, {
                  activeResultAssetId: completedAssetId,
                  resultAssetIds: [completedAssetId],
                  status: "complete",
                  progress: 100,
                }, pushWorkspaceNotice);
                delete pollingFailuresRef.current[task.id];
                if (completedTask) {
                  setGenerationTasks(current => upsertGenerationTask(current, completedTask));
                }
              } else {
                throw new Error(await readFetchError(dlRes, "结果下载失败"));
              }
            } else {
              if (isProcessingTimedOut(task)) {
                const timeoutMessage = "任务超过 2 小时仍未完成，已停止自动轮询。";
                const failedTask = await updateTaskOrWarn(task.id, {
                  status: "failed",
                  progress: 100,
                  errorMessage: timeoutMessage,
                }, pushWorkspaceNotice);
                delete pollingFailuresRef.current[task.id];
                if (failedTask) setGenerationTasks(current => upsertGenerationTask(current, failedTask));
                pushWorkspaceNotice("error", timeoutMessage);
                continue;
              }

              const nextProgress = typeof statusRecord.progress === "number" ? statusRecord.progress : task.progress;
              if (task.progress !== nextProgress) {
                const progressTask = await updateTaskOrWarn(task.id, {
                  progress: nextProgress,
                  errorMessage: undefined,
                }, pushWorkspaceNotice);
                if (progressTask) setGenerationTasks(current => upsertGenerationTask(current, progressTask));
              }
            }
          } catch (error) {
            const previousFailures = pollingFailuresRef.current[task.id] ?? 0;
            const nextFailures = previousFailures + 1;
            pollingFailuresRef.current[task.id] = nextFailures;
            console.error(`Polling failed for ${task.id}:`, error);

            if (nextFailures >= 3) {
              const waitingTask = await updateTaskOrWarn(task.id, {
                status: "failed",
                progress: 100,
                errorMessage: toErrorMessage(error, "任务轮询失败"),
              }, pushWorkspaceNotice);
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
