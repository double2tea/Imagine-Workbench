import type { TFunction } from "@/lib/i18n";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import type { CompareViewType } from "@/components/assets/ComparePanel";
import { API_ROUTES } from "@/lib/api/routes";
import { downloadStorageItemsZip, storageItemDownloadExtension, storageItemDownloadMimeType } from "@/lib/assets/download-zip";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { readImageGenerationPayload } from "@/lib/client-image-response";
import {
  clearAllDB,
  deleteFromDB,
  getGenerationReferenceMedia,
  saveToDB,
  type StorageItem,
} from "@/lib/db";
import { createWorkspaceSafetySnapshot } from "@/lib/data-management";
import type { MediaReferenceRole, MediaReferenceType } from "@/lib/media-references";
import { createPanoramaScreenshotStorageItem, type PanoramaScreenshot } from "@/lib/panorama/capture";
import { tryParseProviderModel, type AiProvider } from "@/lib/providers/model-catalog";
import type { RunningHubTaskNodeBinding, RunningHubYouchuanAdvancedSettings } from "@/lib/providers/types";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
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
  runningHubYouchuan?: RunningHubYouchuanAdvancedSettings;
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
  t: TFunction;
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

async function resolveOriginalStorageItem(item: StorageItem, items: StorageItem[], t: TFunction): Promise<StorageItem> {
  const storedItem = items.find(entry => entry.id === item.id) ?? item;
  const originalUrl = await resolveAssetOriginalUrl(storedItem);
  if (!originalUrl.trim()) {
    throw new Error(t("common.notices.originalMediaNotFound"));
  }
  return { ...storedItem, url: originalUrl };
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
    runningHubYouchuan: request?.runningHubYouchuan,
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
  t: TFunction,
): Promise<boolean> {
  try {
    await saveToDB(item);
    return true;
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.indexedDbWriteFailed"));
    console.error("IndexedDB Save Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.localSaveFailed", { error: message }));
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
  t,
}: UseAssetActionsParams) {
  const confirmAction = useConfirm();

  const toggleSelectItem = (id: string, event?: { shiftKey?: boolean }) => {
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
      message: t("common.confirmDialogs.deleteSelectedItems", { count: selectedItemIds.length }),
      tone: "danger",
      confirmLabel: t("common.buttons.delete"),
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
      message: t("common.confirmDialogs.deleteTasksByStatus", { count: ids.length, statuses: statuses.join("/") }),
      tone: "danger",
      confirmLabel: t("common.buttons.delete"),
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
      ? t("common.confirmDialogs.cancelVideoTask")
      : t("common.confirmDialogs.cancelLocalTask");
    if (!(await confirmAction({ message: confirmText, tone: "danger", confirmLabel: t("common.buttons.cancelTask") }))) return;

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
        const res = await fetch(API_ROUTES.media.cancel, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildProviderHeaders(operationName) },
          body: JSON.stringify({ operationName }),
        });

        if (!res.ok) {
          throw new Error(await readFetchError(res, t("common.notices.taskCancelFailed")));
        }
      }

      await deleteFromDB(item.id);
      delete pollingFailuresRef.current[item.id];
      setItems(prev => prev.filter(current => current.id !== item.id));
      setSelectedItemIds(prev => prev.filter(id => id !== item.id));
      setCompareItemIds(prev => prev.filter(id => id !== item.id));
      pushWorkspaceNotice("success", canCancelRemote ? t("common.notices.taskCancelFailed") : t("common.notices.taskCancelStatusUpdateFailed"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.taskCancelFailed")));
    } finally {
      setCancelingItemIds(prev => prev.filter(id => id !== item.id));
    }
  };

  const handleDeleteItem = async (item: StorageItem) => {
    if (await confirmAction({ message: t("common.confirmDialogs.deleteSingleItem"), tone: "danger", confirmLabel: t("common.buttons.delete") })) {
      await deleteFromDB(item.id);
      setItems(prev => prev.filter(current => current.id !== item.id));
      setSelectedItemIds(prev => prev.filter(id => id !== item.id));
      setCompareItemIds(prev => prev.filter(id => id !== item.id));
    }
  };

  const handleResetLocalData = async () => {
    if (await confirmAction({
      message: t("common.confirmDialogs.resetAllHistory"),
      tone: "danger",
      confirmLabel: t("common.confirmDialogs.resetAllHistoryLabel"),
    })) {
      await createWorkspaceSafetySnapshot("clear-assets");
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
      provider: tryParseProviderModel(item.model, selectedProvider)?.provider ?? selectedProvider,
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
    if (item.type === "audio" || item.type === "transcript") {
      pushWorkspaceNotice("error", t("common.notices.audioAssetNotSupportRetry"));
      return;
    }
    const retryingItem: StorageItem = {
      ...item,
      status: item.type === "image" ? "pending" : "processing",
      progress: item.type === "image" ? 30 : 12,
      errorMessage: undefined,
      operationName: undefined,
    };
    if (!await saveItemOrWarn(retryingItem, pushWorkspaceNotice, t)) return;
    setItems(prev => prev.map(current => current.id === item.id ? retryingItem : current));

    try {
      const retryRequestBody = buildRetryRequestBody(item);
      await prepareRetryReferenceImages(retryRequestBody);
      const retryPayloadError = retryRequestBody.referenceMedia
        ? getReferenceMediaPayloadError(retryRequestBody.referenceMedia.map(reference => reference.dataUri))
        : getReferenceImagePayloadError(retryRequestBody.referenceImages ?? []);
      if (retryPayloadError) throw new Error(retryPayloadError);

      const headers = buildProviderHeaders(retryRequestBody.model);
      const endpoint = item.type === "image" ? API_ROUTES.media.generateImage : API_ROUTES.media.generateVideo;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(retryRequestBody),
      });

      if (!res.ok) {
        throw new Error(await readFetchError(res, t("common.notices.taskRetryFailed")));
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
        if (!await saveItemOrWarn(processingItem, pushWorkspaceNotice, t)) {
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
        if (!await saveItemOrWarn(completedItem, pushWorkspaceNotice, t)) {
          setItems(prev => prev.map(current => current.id === item.id ? completedItem : current));
          return;
        }
        setItems(prev => prev.map(current => current.id === item.id ? completedItem : current));
        return;
      }

      throw new Error(item.type === "image" ? t("common.notices.imageInterfaceMissingResult") : t("common.notices.videoInterfaceMissingOperation"));
    } catch (error) {
      const message = toErrorMessage(error, t("common.notices.taskRetryFailed"));
      const failedItem: StorageItem = {
        ...retryingItem,
        status: "failed",
        progress: 100,
        errorMessage: message,
      };
      await saveItemOrWarn(failedItem, pushWorkspaceNotice, t);
      setItems(prev => prev.map(current => current.id === item.id ? failedItem : current));
      pushWorkspaceNotice("error", message);
    }
  };

  const handleDownloadItem = async (item: StorageItem) => {
    let originalItem: StorageItem;
    try {
      originalItem = await resolveOriginalStorageItem(item, items, t);
    } catch (error) {
      console.error("Download item failed to resolve original:", error);
      alert(t("common.notices.downloadFailedNoOriginal"));
      return;
    }

    try {
      const extension = storageItemDownloadExtension(originalItem);
      const fileName = `imagine_${originalItem.id}.${extension}`;
      let blob: Blob;
      if (originalItem.url && originalItem.url.startsWith("data:")) {
        const parts = originalItem.url.split(";base64,");
        if (parts.length === 2) {
          const byteChars = atob(parts[1]);
          const bytes = new Uint8Array(byteChars.length);
          for (let index = 0; index < byteChars.length; index += 1) {
            bytes[index] = byteChars.charCodeAt(index);
          }
          blob = new Blob([bytes], { type: storageItemDownloadMimeType(originalItem) });
        } else {
          throw new Error("Invalid data URI");
        }
      } else {
        const fileRes = await fetch(originalItem.url);
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
      alert(t("common.notices.downloadFailedNetwork"));
    }
  };

  const handleCaptureVideoFrame = async (item: StorageItem, frame: CapturedVideoFrame): Promise<StorageItem | null> => {
    if (item.type !== "video") {
      throw new Error(t("common.notices.videoFrameCaptureFailed"));
    }

    const frameItem = createVideoFrameStorageItem(item, frame, makeClientId("frame"));
    if (!await saveItemOrWarn(frameItem, pushWorkspaceNotice, t)) return null;
    setItems(prev => [frameItem, ...prev]);
    pushWorkspaceNotice("success", t("common.notices.videoFrameSaved", { label: getVideoFrameCaptureLabel(frame.mode) }));
    return frameItem;
  };

  const handleSavePanoramaScreenshots = async (
    item: StorageItem,
    screenshots: PanoramaScreenshot[],
  ): Promise<void> => {
    if (item.type !== "image") {
      throw new Error(t("common.notices.panoramaViewFailed"));
    }

    const savedItems: StorageItem[] = [];
    for (const [index, screenshot] of screenshots.entries()) {
      const screenshotItem = createPanoramaScreenshotStorageItem(item, screenshot, makeClientId(`pano_${index}`));
      if (await saveItemOrWarn(screenshotItem, pushWorkspaceNotice, t)) savedItems.push(screenshotItem);
    }
    if (savedItems.length === 0) return;
    setItems(prev => [
      ...savedItems,
      ...prev.filter(prevItem => !savedItems.some(savedItem => savedItem.id === prevItem.id)),
    ]);
    pushWorkspaceNotice("success", t("common.notices.panoramaScreenshotsSaved", { count: savedItems.length }));
  };

  const handleBatchDownloadZip = async () => {
    if (selectedItemIds.length === 0) return;
    const itemsToExport = items.filter(item => selectedItemIds.includes(item.id));
    await downloadStorageItemsZip({
      archiveName: makeClientId("Imagine_Workbench_Export"),
      fileNamePrefix: "creation",
      items: itemsToExport,
      resolveOriginalItem: item => resolveOriginalStorageItem(item, items, t),
    });
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
    handleSavePanoramaScreenshots,
    retryFailedItem,
    toggleCompare,
    toggleSelectItem,
  };
}
