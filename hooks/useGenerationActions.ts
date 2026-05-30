import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { readImageGenerationPayload } from "@/lib/client-image-response";
import { saveToDB, type GenerationRequestSnapshot, type StorageItem } from "@/lib/db";
import { buildPromptWithReferenceMap } from "@/hooks/useReferenceState";
import type { VideoReferenceMode } from "@/lib/providers/model-catalog";
import { getReferenceImagePayloadError } from "@/lib/reference-images";

type NoticeType = "error" | "info" | "success";

interface UseGenerationActionsParams {
  activeImageModel: string;
  activeImageSize: string;
  activeVideoSize: string;
  buildProviderHeaders: (target?: string) => Record<string, string>;
  generationAbortControllersRef: MutableRefObject<Record<string, AbortController>>;
  imageSize: string;
  imageThinkingLevel: string;
  isGptImageModel: boolean;
  locallyCanceledItemIdsRef: MutableRefObject<Set<string>>;
  prompt: string;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
  referenceImage: string | null;
  referenceImages: ReferenceImageRef[];
  selectedModel: string;
  selectedVideoModel: string;
  setImageSubmitCount: Dispatch<SetStateAction<number>>;
  setItems: Dispatch<SetStateAction<StorageItem[]>>;
  setVideoSubmitCount: Dispatch<SetStateAction<number>>;
  videoReferenceLimit: number;
  videoReferenceMode: VideoReferenceMode;
}

interface GenerationOverrides {
  prompt?: string;
  referenceImage?: string | null;
  referenceImages?: ReferenceImageRef[];
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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

async function readFetchError(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    return getStringField(data, "error") ?? getStringField(data, "message") ?? `${fallback} (HTTP ${response.status})`;
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

function buildVideoReferenceUrls(
  references: ReferenceImageRef[],
  fallbackReference: string | null,
  mode: VideoReferenceMode,
  maxCount: number,
): string[] {
  if (maxCount === 0 || mode === "none") return [];

  if (mode === "firstLast") {
    const start = references.find(reference => reference.role === "start")?.url ?? references[0]?.url ?? fallbackReference;
    const end =
      references.find(reference => reference.role === "end")?.url ??
      references.find(reference => reference.url !== start)?.url;
    return [start, end].filter((url): url is string => typeof url === "string" && url.length > 0).slice(0, maxCount);
  }

  const urls = references.map(reference => reference.url);
  if (urls.length === 0 && fallbackReference) urls.push(fallbackReference);
  return urls.filter(url => url.length > 0).slice(0, maxCount);
}

function validateGptImageSize(size: string): string | null {
  if (size === "auto") return null;
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return "尺寸格式必须是 widthxheight，例如 2560x1440";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width > 3840 || height > 3840) return "最大边长不能超过 3840px";
  if (width % 16 !== 0 || height % 16 !== 0) return "宽高都必须是 16px 的倍数";
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (longSide / shortSide > 3) return "长短边比例不能超过 3:1";
  const pixels = width * height;
  if (pixels < 655360 || pixels > 8294400) return "总像素必须在 655,360 到 8,294,400 之间";
  return null;
}

export function useGenerationActions({
  activeImageModel,
  activeImageSize,
  activeVideoSize,
  buildProviderHeaders,
  generationAbortControllersRef,
  imageSize,
  imageThinkingLevel,
  isGptImageModel,
  locallyCanceledItemIdsRef,
  prompt,
  pushWorkspaceNotice,
  referenceImage,
  referenceImages,
  selectedModel,
  selectedVideoModel,
  setImageSubmitCount,
  setItems,
  setVideoSubmitCount,
  videoReferenceLimit,
  videoReferenceMode,
}: UseGenerationActionsParams) {
  const generateManualImage = async (overrides: GenerationOverrides = {}) => {
    const activePrompt = overrides.prompt ?? prompt;
    const activeReferenceImage = overrides.referenceImage ?? referenceImage;
    const activeReferenceImages = overrides.referenceImages ?? referenceImages;

    if (!activePrompt.trim()) return;
    if (isGptImageModel) {
      const sizeError = validateGptImageSize(activeImageSize);
      if (sizeError) {
        pushWorkspaceNotice("error", `GPT Image 2 尺寸无效：${sizeError}`);
        return;
      }
    }
    const imageReferenceUrls = activeReferenceImages.map(reference => reference.url);
    if (imageReferenceUrls.length === 0 && activeReferenceImage) {
      imageReferenceUrls.push(activeReferenceImage);
    }
    const imagePayloadError = getReferenceImagePayloadError(imageReferenceUrls);
    if (imagePayloadError) {
      pushWorkspaceNotice("error", imagePayloadError);
      return;
    }
    setImageSubmitCount(prev => prev + 1);
    const generationPrompt = buildPromptWithReferenceMap(activePrompt, activeReferenceImages, imageReferenceUrls);
    const generationRequest: GenerationRequestSnapshot = {
      prompt: generationPrompt,
      model: activeImageModel,
      aspectRatio: activeImageSize,
      imageSize,
      thinkingLevel: imageThinkingLevel,
      referenceImages: imageReferenceUrls,
    };

    const tempId = makeClientId("temp_img");
    const newItem: StorageItem = {
      id: tempId,
      type: "image",
      url: "https://picsum.photos/800/800",
      prompt: activePrompt,
      model: activeImageModel,
      aspectRatio: activeImageSize,
      createdAt: new Date().toISOString(),
      status: "pending",
      progress: 30,
      generationRequest,
    };

    setItems(prev => [newItem, ...prev]);

    const controller = new AbortController();
    generationAbortControllersRef.current[tempId] = controller;

    try {
      const headers = buildProviderHeaders(selectedModel);

      const res = await fetch("/api/gemini/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          ...generationRequest,
          referenceImage: imageReferenceUrls[0],
        }),
      });

      if (res.ok) {
        const { operationName, imageUrl } = await readImageGenerationPayload(res);
        if (operationName) {
          const compilingItem: StorageItem = {
            ...newItem,
            id: makeClientId("img"),
            operationName,
            status: "processing",
            progress: 15,
          };
          if (!await saveItemOrWarn(compilingItem, pushWorkspaceNotice)) {
            setItems(prev => [compilingItem, ...prev.filter(item => item.id !== tempId)]);
            return;
          }
          setItems(prev => [compilingItem, ...prev.filter(item => item.id !== tempId)]);
          return;
        }

        const completedItem: StorageItem = {
          ...newItem,
          id: makeClientId("img"),
          url: imageUrl ?? "",
          status: "complete",
          progress: 100,
        };
        if (!imageUrl) {
          throw new Error("图片接口返回缺少 imageUrl 或 operationName");
        }

        if (!await saveItemOrWarn(completedItem, pushWorkspaceNotice)) {
          setItems(prev => [completedItem, ...prev.filter(item => item.id !== tempId)]);
          return;
        }
        setItems(prev => [completedItem, ...prev.filter(item => item.id !== tempId)]);
      } else {
        throw new Error(await readFetchError(res, "图片生成请求失败"));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(tempId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(tempId);
        return;
      }
      console.error(error);
      const message = toErrorMessage(error, "图片生成失败");
      const failedItem: StorageItem = {
        ...newItem,
        status: "failed",
        progress: 100,
        errorMessage: message,
      };
      await saveItemOrWarn(failedItem, pushWorkspaceNotice);
      setItems(prev => [failedItem, ...prev.filter(item => item.id !== tempId)]);
      pushWorkspaceNotice("error", message);
    } finally {
      delete generationAbortControllersRef.current[tempId];
      setImageSubmitCount(prev => Math.max(0, prev - 1));
    }
  };

  const generateManualVideo = async (overrides: GenerationOverrides = {}) => {
    const activePrompt = overrides.prompt ?? prompt;
    const activeReferenceImage = overrides.referenceImage ?? referenceImage;
    const activeReferenceImages = overrides.referenceImages ?? referenceImages;

    if (!activePrompt.trim()) return;
    const videoReferenceUrls = buildVideoReferenceUrls(
      activeReferenceImages,
      activeReferenceImage,
      videoReferenceMode,
      videoReferenceLimit,
    );
    const videoPayloadError = getReferenceImagePayloadError(videoReferenceUrls);
    if (videoPayloadError) {
      pushWorkspaceNotice("error", videoPayloadError);
      return;
    }
    setVideoSubmitCount(prev => prev + 1);
    const generationPrompt = buildPromptWithReferenceMap(activePrompt, activeReferenceImages, videoReferenceUrls);
    const generationRequest: GenerationRequestSnapshot = {
      prompt: generationPrompt,
      model: selectedVideoModel,
      aspectRatio: activeVideoSize,
      referenceImages: videoReferenceUrls,
    };

    const tempId = makeClientId("temp_vid");
    const newItem: StorageItem = {
      id: tempId,
      type: "video",
      url: "",
      prompt: activePrompt,
      model: selectedVideoModel,
      aspectRatio: activeVideoSize,
      createdAt: new Date().toISOString(),
      status: "processing",
      progress: 12,
      generationRequest,
    };

    setItems(prev => [newItem, ...prev]);

    const controller = new AbortController();
    generationAbortControllersRef.current[tempId] = controller;

    try {
      const headers = buildProviderHeaders(selectedVideoModel);
      const res = await fetch("/api/gemini/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: generationRequest.prompt,
          images: videoReferenceUrls,
          aspectRatio: generationRequest.aspectRatio,
          model: generationRequest.model,
        }),
      });

      if (res.ok) {
        const data: unknown = await res.json();
        const activeOperationName = getStringField(data, "operationName");
        if (!activeOperationName) {
          throw new Error("视频接口返回缺少 operationName");
        }

        const compilingItem: StorageItem = {
          ...newItem,
          id: makeClientId("vid"),
          operationName: activeOperationName,
          status: "processing",
        };

        if (!await saveItemOrWarn(compilingItem, pushWorkspaceNotice)) {
          setItems(prev => [compilingItem, ...prev.filter(item => item.id !== tempId)]);
          return;
        }
        setItems(prev => [compilingItem, ...prev.filter(item => item.id !== tempId)]);
      } else {
        throw new Error(await readFetchError(res, "视频生成请求失败"));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(tempId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(tempId);
        return;
      }
      console.error(error);
      const message = toErrorMessage(error, "视频生成失败");
      const failedItem: StorageItem = {
        ...newItem,
        status: "failed",
        progress: 100,
        errorMessage: message,
      };
      await saveItemOrWarn(failedItem, pushWorkspaceNotice);
      setItems(prev => [failedItem, ...prev.filter(item => item.id !== tempId)]);
      pushWorkspaceNotice("error", message);
    } finally {
      delete generationAbortControllersRef.current[tempId];
      setVideoSubmitCount(prev => Math.max(0, prev - 1));
    }
  };

  return {
    generateManualImage,
    generateManualVideo,
  };
}
