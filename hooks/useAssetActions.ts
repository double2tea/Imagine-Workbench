import type { Dispatch, MouseEvent, MutableRefObject, SetStateAction } from "react";
import JSZip from "jszip";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import type { CompareViewType } from "@/components/assets/ComparePanel";
import { readFetchError } from "@/lib/client-fetch-error";
import { readImageGenerationPayload } from "@/lib/client-image-response";
import {
  clearAllDB,
  deleteFromDB,
  getGenerationReferenceMedia,
  saveToDB,
  type StorageItem,
} from "@/lib/db";
import type { MediaReferenceRole, MediaReferenceType } from "@/lib/media-references";
import { mediaReferenceFileExtension, mediaReferenceMimeFromDataUri } from "@/lib/media-references";
import { parseProviderModel, type AiProvider } from "@/lib/providers/model-catalog";
import type { RunningHubTaskNodeBinding } from "@/lib/providers/types";
import { getReferenceImagePayloadError, getReferenceMediaPayloadError, prepareReferenceImageUrlForRequest, prepareReferenceMediaUrlForRequest } from "@/lib/reference-images";
import { createVideoFrameStorageItem, getVideoFrameCaptureLabel, type CapturedVideoFrame } from "@/lib/video-frame";

type NoticeType = "error" | "info" | "success";

interface RetryRequestBody {
  prompt: string;
  model: string;
  aspectRatio: string;
  durationSeconds?: string;
  imageQuality?: string;
  imageResolution?: string;
  preset?: string;
  referenceMode?: "reference" | "firstLast";
  thinkingLevel?: string;
  resolutionName?: string;
  referenceImage?: string;
  referenceImages?: string[];
  referenceMedia?: Array<{ dataUri: string; type: MediaReferenceType; role?: MediaReferenceRole }>;
  images?: string[];
  runningHubAccessPassword?: string;
  runningHubNodeInfoList?: RunningHubTaskNodeBinding[];
}

interface UseAssetActionsParams {
  buildProviderHeaders: (target?: string) => Record<string, string>;
  compareItemIds: string[];
  filteredItems: StorageItem[];
  generationAbortControllersRef: MutableRefObject<Record<string, AbortController>>;
  items: StorageItem[];
  locallyCanceledItemIdsRef: MutableRefObject<Set<string>>;
  pollingFailuresRef: MutableRefObject<Record<string, number>>;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
  selectedItemIdSet: Set<string>;
  selectedItemIds: string[];
  selectedProvider: AiProvider;
  setCancelingItemIds: Dispatch<SetStateAction<string[]>>;
  setCompareItemIds: Dispatch<SetStateAction<string[]>>;
  setCompareSliderPos: Dispatch<SetStateAction<number>>;
  setCompareViewType: Dispatch<SetStateAction<CompareViewType>>;
  setIsCompareMode: Dispatch<SetStateAction<boolean>>;
  setItems: Dispatch<SetStateAction<StorageItem[]>>;
  setSelectedItemIds: Dispatch<SetStateAction<string[]>>;
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

function getStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function defaultDownloadMimeType(type: StorageItem["type"]): string {
  if (type === "image") return "image/png";
  if (type === "video") return "video/mp4";
  return "audio/mpeg";
}

function assetDownloadExtension(item: StorageItem): string {
  return mediaReferenceFileExtension(mediaReferenceMimeFromDataUri(item.url), item.type);
}

function assetDownloadMimeType(item: StorageItem): string {
  return mediaReferenceMimeFromDataUri(item.url) ?? defaultDownloadMimeType(item.type);
}

function readVideoGenerationPayload(data: unknown): { imageUrl: string | null; operationName: string | null } {
  return {
    imageUrl: getStringField(data, "imageUrl"),
    operationName: getStringField(data, "operationName"),
  };
}

function buildRetryRequestBody(item: StorageItem): RetryRequestBody {
  const request = item.generationRequest;
  const referenceMedia = getGenerationReferenceMedia(request);
  const referenceUrls = referenceMedia.map(reference => reference.url);
  const body: RetryRequestBody = {
    prompt: request?.prompt ?? item.prompt,
    model: request?.model ?? item.model,
    aspectRatio: request?.aspectRatio ?? item.aspectRatio,
    runningHubAccessPassword: request?.runningHubAccessPassword,
    runningHubNodeInfoList: request?.runningHubNodeInfoList,
  };

  if (item.type === "image") {
    body.imageQuality = request?.imageQuality;
    body.imageResolution = request?.imageResolution ?? request?.aspectRatio ?? item.aspectRatio;
    body.thinkingLevel = request?.thinkingLevel;
    body.referenceImage = referenceUrls[0];
    body.referenceImages = referenceUrls;
  } else {
    body.durationSeconds = request?.videoDurationSeconds;
    body.preset = request?.videoPreset;
    body.referenceMode = request?.videoReferenceMode;
    body.resolutionName = request?.videoResolution;
    body.referenceMedia = referenceMedia.map(reference => ({
      dataUri: reference.url,
      type: reference.type,
      ...(reference.role ? { role: reference.role } : {}),
    }));
  }

  return body;
}

async function prepareRetryReferenceImages(body: RetryRequestBody): Promise<void> {
  if (body.referenceImages) {
    const referenceImages = await Promise.all(body.referenceImages.map(prepareReferenceImageUrlForRequest));
    body.referenceImages = referenceImages;
    body.referenceImage = referenceImages[0];
  }
  if (body.images) {
    body.images = await Promise.all(body.images.map(prepareReferenceMediaUrlForRequest));
  }
  if (body.referenceMedia) {
    const prepared = await Promise.all(body.referenceMedia.map(async reference => ({
      ...reference,
      dataUri: await prepareReferenceMediaUrlForRequest(reference.dataUri),
    })));
    body.referenceMedia = prepared;
  }
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

export function useAssetActions({
  buildProviderHeaders,
  compareItemIds,
  filteredItems,
  generationAbortControllersRef,
  items,
  locallyCanceledItemIdsRef,
  pollingFailuresRef,
  pushWorkspaceNotice,
  selectedItemIdSet,
  selectedItemIds,
  selectedProvider,
  setCancelingItemIds,
  setCompareItemIds,
  setCompareSliderPos,
  setCompareViewType,
  setIsCompareMode,
  setItems,
  setSelectedItemIds,
}: UseAssetActionsParams) {
  const confirmAction = useConfirm();

  const toggleSelectItem = (id: string, event?: MouseEvent) => {
    if (event?.shiftKey && selectedItemIds.length > 0) {
      const lastSelectedIdx = filteredItems.findIndex(item => item.id === selectedItemIds[selectedItemIds.length - 1]);
      const currentSelectedIdx = filteredItems.findIndex(item => item.id === id);

      if (lastSelectedIdx !== -1 && currentSelectedIdx !== -1) {
        const start = Math.min(lastSelectedIdx, currentSelectedIdx);
        const end = Math.max(lastSelectedIdx, currentSelectedIdx);
        const slicedIds = filteredItems.slice(start, end + 1).map(item => item.id);

        setSelectedItemIds(prev => Array.from(new Set([...prev, ...slicedIds])));
        return;
      }
    }

    if (selectedItemIds.includes(id)) {
      setSelectedItemIds(prev => prev.filter(itemId => itemId !== id));
    } else {
      setSelectedItemIds(prev => [...prev, id]);
    }
  };

  const handleClearSelection = () => {
    setSelectedItemIds([]);
  };

  const handleBatchDelete = async () => {
    if (selectedItemIds.length === 0) return;
    if (await confirmAction({
      message: `确定要彻底删除已选中的 ${selectedItemIds.length} 项创意资产吗？`,
      tone: "danger",
      confirmLabel: "删除",
    })) {
      for (const id of selectedItemIds) {
        await deleteFromDB(id);
      }
      setItems(prev => prev.filter(item => !selectedItemIds.includes(item.id)));
      setSelectedItemIds([]);
      setCompareItemIds([]);
    }
  };

  const deleteItemsByStatus = async (statuses: StorageItem["status"][]) => {
    const ids = items.filter(item => statuses.includes(item.status)).map(item => item.id);
    if (ids.length === 0) return;
    if (await confirmAction({
      message: `确定要删除 ${ids.length} 个 ${statuses.join("/")} 任务吗？`,
      tone: "danger",
      confirmLabel: "删除",
    })) {
      for (const id of ids) {
        await deleteFromDB(id);
      }
      setItems(prev => prev.filter(item => !ids.includes(item.id)));
      setSelectedItemIds(prev => prev.filter(id => !ids.includes(id)));
      setCompareItemIds(prev => prev.filter(id => !ids.includes(id)));
    }
  };

  const cancelProcessingItem = async (item: StorageItem) => {
    const operationName = item.operationName;
    const canCancelRemote = operationName?.startsWith("12ai:video:") === true;
    const confirmText = canCancelRemote
      ? "确定要取消这个视频生成任务吗？"
      : "确定要本地取消这个任务吗？远端生成可能仍会继续。";
    if (!(await confirmAction({ message: confirmText, tone: "danger", confirmLabel: "取消任务" }))) return;

    setCancelingItemIds(prev => [...prev, item.id]);
    try {
      const controller = generationAbortControllersRef.current[item.id];
      if (controller) {
        locallyCanceledItemIdsRef.current.add(item.id);
        controller.abort();
      }
      if (!canCancelRemote) {
        locallyCanceledItemIdsRef.current.add(item.id);
      }

      if (canCancelRemote) {
        const res = await fetch("/api/gemini/cancel-media", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildProviderHeaders(operationName) },
          body: JSON.stringify({ operationName }),
        });

        if (!res.ok) {
          throw new Error(await readFetchError(res, "任务取消失败"));
        }
      }

      await deleteFromDB(item.id);
      delete pollingFailuresRef.current[item.id];
      setItems(prev => prev.filter(current => current.id !== item.id));
      setSelectedItemIds(prev => prev.filter(id => id !== item.id));
      setCompareItemIds(prev => prev.filter(id => id !== item.id));
      pushWorkspaceNotice("success", canCancelRemote ? "视频生成任务已取消" : "任务已从本地取消");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "任务取消失败"));
    } finally {
      setCancelingItemIds(prev => prev.filter(id => id !== item.id));
    }
  };

  const handleDeleteItem = async (item: StorageItem) => {
    if (await confirmAction({ message: "确定要删除此创意项吗？", tone: "danger", confirmLabel: "删除" })) {
      await deleteFromDB(item.id);
      setItems(prev => prev.filter(current => current.id !== item.id));
      setSelectedItemIds(prev => prev.filter(id => id !== item.id));
      setCompareItemIds(prev => prev.filter(id => id !== item.id));
    }
  };

  const handleResetLocalData = async () => {
    if (await confirmAction({
      message: "这会清空所有生成的历史卡片，无法恢复！",
      tone: "danger",
      confirmLabel: "清空",
    })) {
      await clearAllDB();
      setItems([]);
      setCompareItemIds([]);
      setSelectedItemIds([]);
    }
  };

  const exportMetadataJson = () => {
    const sourceItems = selectedItemIds.length > 0
      ? items.filter(item => selectedItemIdSet.has(item.id))
      : filteredItems;
    if (sourceItems.length === 0) return;
    const metadata = sourceItems.map(item => ({
      id: item.id,
      type: item.type,
      prompt: item.prompt,
      model: item.model,
      provider: parseProviderModel(item.model, selectedProvider).provider,
      aspectRatio: item.aspectRatio,
      status: item.status,
      progress: item.progress,
      operationName: item.operationName,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
    }));
    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${makeClientId("imagine_metadata")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const retryFailedItem = async (item: StorageItem) => {
    if (item.status !== "failed") return;
    if (item.type === "audio") {
      pushWorkspaceNotice("error", "音频资产不支持生成重试");
      return;
    }
    const retryingItem: StorageItem = {
      ...item,
      status: item.type === "image" ? "pending" : "processing",
      progress: item.type === "image" ? 30 : 12,
      errorMessage: undefined,
      operationName: undefined,
    };
    if (!await saveItemOrWarn(retryingItem, pushWorkspaceNotice)) return;
    setItems(prev => prev.map(current => current.id === item.id ? retryingItem : current));

    try {
      const retryRequestBody = buildRetryRequestBody(item);
      await prepareRetryReferenceImages(retryRequestBody);
      const retryPayloadError = retryRequestBody.referenceMedia
        ? getReferenceMediaPayloadError(retryRequestBody.referenceMedia.map(reference => reference.dataUri))
        : getReferenceImagePayloadError(retryRequestBody.referenceImages ?? []);
      if (retryPayloadError) throw new Error(retryPayloadError);

      const headers = buildProviderHeaders(retryRequestBody.model);
      const endpoint = item.type === "image" ? "/api/gemini/generate-image" : "/api/gemini/generate-video";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(retryRequestBody),
      });

      if (!res.ok) {
        throw new Error(await readFetchError(res, "任务重试失败"));
      }

      const { operationName, imageUrl } = item.type === "image"
        ? await readImageGenerationPayload(res)
        : readVideoGenerationPayload(await res.json());

      if (operationName) {
        const processingItem: StorageItem = {
          ...retryingItem,
          status: "processing",
          progress: 15,
          operationName,
        };
        if (!await saveItemOrWarn(processingItem, pushWorkspaceNotice)) {
          setItems(prev => prev.map(current => current.id === item.id ? processingItem : current));
          return;
        }
        setItems(prev => prev.map(current => current.id === item.id ? processingItem : current));
        return;
      }

      if (item.type === "image" && imageUrl) {
        const completedItem: StorageItem = {
          ...retryingItem,
          url: imageUrl,
          status: "complete",
          progress: 100,
        };
        if (!await saveItemOrWarn(completedItem, pushWorkspaceNotice)) {
          setItems(prev => prev.map(current => current.id === item.id ? completedItem : current));
          return;
        }
        setItems(prev => prev.map(current => current.id === item.id ? completedItem : current));
        return;
      }

      throw new Error(item.type === "image" ? "图片接口返回缺少 imageUrl 或 operationName" : "视频接口返回缺少 operationName");
    } catch (error) {
      const message = toErrorMessage(error, "任务重试失败");
      const failedItem: StorageItem = {
        ...retryingItem,
        status: "failed",
        progress: 100,
        errorMessage: message,
      };
      await saveItemOrWarn(failedItem, pushWorkspaceNotice);
      setItems(prev => prev.map(current => current.id === item.id ? failedItem : current));
      pushWorkspaceNotice("error", message);
    }
  };

  const handleDownloadItem = async (item: StorageItem) => {
    const extension = assetDownloadExtension(item);
    const fileName = `imagine_${item.id}.${extension}`;

    try {
      let blob: Blob;
      if (item.url && item.url.startsWith("data:")) {
        const parts = item.url.split(";base64,");
        if (parts.length === 2) {
          const byteChars = atob(parts[1]);
          const bytes = new Uint8Array(byteChars.length);
          for (let index = 0; index < byteChars.length; index += 1) {
            bytes[index] = byteChars.charCodeAt(index);
          }
          blob = new Blob([bytes], { type: assetDownloadMimeType(item) });
        } else {
          throw new Error("Invalid data URI");
        }
      } else {
        const fileRes = await fetch(item.url);
        if (!fileRes.ok) throw new Error(`Fetch failed: HTTP ${fileRes.status}`);
        blob = await fileRes.blob();
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download item failed:", error);
      alert("下载失败，请检查网络或文件是否可访问。");
    }
  };

  const handleCaptureVideoFrame = async (item: StorageItem, frame: CapturedVideoFrame): Promise<StorageItem | null> => {
    if (item.type !== "video") {
      throw new Error("只有视频资产可以截帧");
    }

    const frameItem = createVideoFrameStorageItem(item, frame, makeClientId("frame"));
    if (!await saveItemOrWarn(frameItem, pushWorkspaceNotice)) return null;
    setItems(prev => [frameItem, ...prev]);
    pushWorkspaceNotice("success", `已保存${getVideoFrameCaptureLabel(frame.mode)}为图片资产`);
    return frameItem;
  };

  const handleBatchDownloadZip = async () => {
    if (selectedItemIds.length === 0) return;
    const itemsToExport = items.filter(item => selectedItemIds.includes(item.id));

    const zip = new JSZip();
    const metadataList: Array<{
      id: string;
      fileName: string;
      type: StorageItem["type"];
      prompt: string;
      model: string;
      aspectRatio: string;
      createdAt: string;
    }> = [];

    await Promise.all(itemsToExport.map(async (item) => {
      const extension = assetDownloadExtension(item);
      const fileName = `creation_${item.id}.${extension}`;

      metadataList.push({
        id: item.id,
        fileName,
        type: item.type,
        prompt: item.prompt,
        model: item.model,
        aspectRatio: item.aspectRatio,
        createdAt: item.createdAt,
      });

      try {
        if (item.url && item.url.startsWith("data:")) {
          const parts = item.url.split(";base64,");
          if (parts.length === 2) {
            zip.file(fileName, parts[1], { base64: true });
          }
        } else if (item.url) {
          const fileRes = await fetch(item.url);
          if (fileRes.ok) {
            const blob = await fileRes.blob();
            zip.file(fileName, blob);
          } else {
            zip.file(`link_fallback_${item.id}.txt`, item.url);
          }
        }
      } catch (error) {
        console.error(`Error adding file ${item.id} to zip:`, error);
        zip.file(`error_log_${item.id}.txt`, `Failed to fetch from: ${item.url}\nError: ${error}`);
      }
    }));

    zip.file("workspace_metadata.json", JSON.stringify(metadataList, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${makeClientId("Imagine_Workbench_Export")}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const toggleCompare = (id: string) => {
    if (compareItemIds.includes(id)) {
      setCompareItemIds(prev => prev.filter(itemId => itemId !== id));
    } else {
      const nextBatch = compareItemIds.length >= 2 ? [compareItemIds[1], id] : [...compareItemIds, id];
      setCompareItemIds(nextBatch);
      if (nextBatch.length === 2) {
        setIsCompareMode(true);
        setCompareSliderPos(50);

        const matchA = items.find(item => item.id === nextBatch[0]);
        const matchB = items.find(item => item.id === nextBatch[1]);
        if (matchA?.type === "image" && matchB?.type === "image") {
          setCompareViewType("wipe-slider");
        } else {
          setCompareViewType("side-by-side");
        }
      }
    }
  };

  return {
    cancelProcessingItem,
    deleteItemsByStatus,
    exportMetadataJson,
    handleBatchDelete,
    handleBatchDownloadZip,
    handleCaptureVideoFrame,
    handleClearSelection,
    handleDeleteItem,
    handleDownloadItem,
    handleResetLocalData,
    retryFailedItem,
    toggleCompare,
    toggleSelectItem,
  };
}
