import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { readFetchError } from "@/lib/client-fetch-error";
import { saveToDB, type StorageItem } from "@/lib/db";

type NoticeType = "error" | "info" | "success";
const PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000;

interface UseMediaPollingParams {
  buildProviderHeaders: (target?: string) => Record<string, string>;
  items: StorageItem[];
  locallyCanceledItemIdsRef: MutableRefObject<Set<string>>;
  pollingFailuresRef: MutableRefObject<Record<string, number>>;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
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

function isProcessingTimedOut(item: StorageItem): boolean {
  const createdAt = Date.parse(item.createdAt);
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

export function useMediaPolling({
  buildProviderHeaders,
  items,
  locallyCanceledItemIdsRef,
  pollingFailuresRef,
  pushWorkspaceNotice,
  setItems,
}: UseMediaPollingParams) {
  useEffect(() => {
    const processingItems = items.filter(item => item.status === "processing" && item.operationName);
    if (processingItems.length === 0) return;

    const interval = setInterval(async () => {
      let changed = false;
      const updatedList = [...items];

      for (let index = 0; index < updatedList.length; index++) {
        const item = updatedList[index];
        if (item.status === "processing" && item.operationName) {
          if (locallyCanceledItemIdsRef.current.has(item.id)) continue;
          try {
            const headers = buildProviderHeaders(item.operationName);

            const res = await fetch("/api/gemini/video-status", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ operationName: item.operationName, model: item.model }),
            });

            if (!res.ok) {
              throw new Error(await readFetchError(res, "任务状态查询失败"));
            }

            const statusData: unknown = await res.json();
            if (typeof statusData !== "object" || statusData === null) {
              throw new Error("任务状态接口返回格式不正确");
            }
            const statusRecord = statusData as Record<string, unknown>;
            pollingFailuresRef.current[item.id] = 0;

            if (statusRecord.done === true && statusRecord.status === "failed") {
              const failedItem: StorageItem = {
                ...item,
                status: "failed",
                progress: 100,
                errorMessage: getStringField(statusData, "errorMessage") ?? "异步任务失败",
              };
              updatedList[index] = failedItem;
              delete pollingFailuresRef.current[item.id];
              await saveItemOrWarn(failedItem, pushWorkspaceNotice);
              pushWorkspaceNotice("error", `异步任务失败：${failedItem.errorMessage}`);
              changed = true;
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
                body: JSON.stringify({ operationName: item.operationName, model: item.model }),
              });

              if (dlRes.ok) {
                const blob = await dlRes.blob();
                const completedItem: StorageItem = {
                  ...item,
                  url: await blobToDataUrl(blob),
                  status: "complete",
                  progress: 100,
                  errorMessage: undefined,
                };
                updatedList[index] = completedItem;
                delete pollingFailuresRef.current[item.id];
                await saveItemOrWarn(completedItem, pushWorkspaceNotice);
                changed = true;
              } else {
                throw new Error(await readFetchError(dlRes, "结果下载失败"));
              }
            } else {
              if (isProcessingTimedOut(item)) {
                const timeoutMessage = "任务超过 2 小时仍未完成，已停止自动轮询。";
                const failedItem: StorageItem = {
                  ...item,
                  status: "failed",
                  progress: 100,
                  errorMessage: timeoutMessage,
                };
                updatedList[index] = failedItem;
                delete pollingFailuresRef.current[item.id];
                await saveItemOrWarn(failedItem, pushWorkspaceNotice);
                pushWorkspaceNotice("error", timeoutMessage);
                changed = true;
                continue;
              }

              const nextProgress = typeof statusRecord.progress === "number" ? statusRecord.progress : item.progress;
              if (item.progress !== nextProgress) {
                updatedList[index] = {
                  ...item,
                  progress: nextProgress,
                  errorMessage: undefined,
                };
                await saveItemOrWarn(updatedList[index], pushWorkspaceNotice);
                changed = true;
              }
            }
          } catch (error) {
            const previousFailures = pollingFailuresRef.current[item.id] ?? 0;
            const nextFailures = previousFailures + 1;
            pollingFailuresRef.current[item.id] = nextFailures;
            console.error(`Polling failed for ${item.id}:`, error);

            if (nextFailures >= 3) {
              const waitingItem: StorageItem = {
                ...item,
                status: "failed",
                progress: 100,
                errorMessage: toErrorMessage(error, "任务轮询失败"),
              };
              updatedList[index] = waitingItem;
              delete pollingFailuresRef.current[item.id];
              await saveItemOrWarn(waitingItem, pushWorkspaceNotice);
              pushWorkspaceNotice("error", `任务轮询失败：${waitingItem.errorMessage}`);
              changed = true;
            }
          }
        }
      }

      if (changed) {
        setItems(current => {
          const merged = new Map(current.map(entry => [entry.id, entry]));
          for (const entry of updatedList) {
            if (entry.status === "processing" || merged.has(entry.id)) {
              merged.set(entry.id, entry);
            }
          }
          return Array.from(merged.values()).sort(
            (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
          );
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [buildProviderHeaders, items, locallyCanceledItemIdsRef, pollingFailuresRef, pushWorkspaceNotice, setItems]);
}
