import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { readImageGenerationPayload } from "@/lib/client-image-response";
import { saveToDB, type GenerationRequestSnapshot, type StorageItem } from "@/lib/db";
import { buildPromptWithReferenceMap } from "@/hooks/useReferenceState";
import { getVideoModelCapabilities, type VideoReferenceMode } from "@/lib/providers/model-catalog";
import { getReferenceImagePayloadError } from "@/lib/reference-images";

type NoticeType = "error" | "info" | "success";

interface UseGenerationActionsParams {
  activeImageAspectRatio: string;
  activeImageModel: string;
  activeImageQuality: string | undefined;
  activeImageResolution: string;
  activeVideoDuration: string | undefined;
  activeVideoPreset: string | undefined;
  activeVideoResolution: string | undefined;
  activeVideoSize: string;
  buildProviderHeaders: (target?: string) => Record<string, string>;
  generationAbortControllersRef: MutableRefObject<Record<string, AbortController>>;
  imageThinkingLevel: string;
  isCustomImageResolution: boolean;
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
  boardNodeId?: string;
  imageQuality?: string;
  imageResolution?: string;
  isCustomImageResolution?: boolean;
  model?: string;
  prompt?: string;
  referenceImage?: string | null;
  referenceImages?: ReferenceImageRef[];
  size?: string;
  thinkingLevel?: string;
  videoDuration?: string;
  videoPreset?: string;
  videoResolution?: string;
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

function validateCustomImageSize(size: string, aspectRatio: string): string | null {
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
  if (pixelSizeAspectRatio(width, height) !== aspectRatio) return `自定义尺寸比例必须匹配 ${aspectRatio}`;
  return null;
}

function pixelSizeAspectRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = a;
  let right = b;
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

export function useGenerationActions({
  activeImageAspectRatio,
  activeImageModel,
  activeImageQuality,
  activeImageResolution,
  activeVideoDuration,
  activeVideoPreset,
  activeVideoResolution,
  activeVideoSize,
  buildProviderHeaders,
  generationAbortControllersRef,
  imageThinkingLevel,
  isCustomImageResolution,
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
}: UseGenerationActionsParams) {
  const generateManualImage = async (overrides: GenerationOverrides = {}) => {
    const activePrompt = overrides.prompt ?? prompt;
    const activeReferenceImage = overrides.referenceImage ?? referenceImage;
    const activeReferenceImages = overrides.referenceImages ?? referenceImages;
    const requestModel = overrides.model ?? activeImageModel;
    const requestAspectRatio = overrides.size ?? activeImageAspectRatio;
    const requestImageResolution = overrides.imageResolution ?? activeImageResolution;
    const requestImageQuality = overrides.imageQuality ?? activeImageQuality;
    const requestIsCustomImageResolution = overrides.isCustomImageResolution ?? isCustomImageResolution;
    const requestThinkingLevel = overrides.thinkingLevel ?? imageThinkingLevel;

    if (!activePrompt.trim()) return false;
    if (requestIsCustomImageResolution) {
      const sizeError = validateCustomImageSize(requestImageResolution, requestAspectRatio);
      if (sizeError) {
        pushWorkspaceNotice("error", `自定义图片尺寸无效：${sizeError}`);
        return false;
      }
    }
    const imageReferenceUrls = activeReferenceImages.map(reference => reference.url);
    if (imageReferenceUrls.length === 0 && activeReferenceImage) {
      imageReferenceUrls.push(activeReferenceImage);
    }
    const imagePayloadError = getReferenceImagePayloadError(imageReferenceUrls);
    if (imagePayloadError) {
      pushWorkspaceNotice("error", imagePayloadError);
      return false;
    }
    setImageSubmitCount(prev => prev + 1);
    const generationPrompt = buildPromptWithReferenceMap(activePrompt, activeReferenceImages, imageReferenceUrls);
    const generationRequest: GenerationRequestSnapshot = {
      prompt: generationPrompt,
      model: requestModel,
      aspectRatio: requestAspectRatio,
      imageResolution: requestImageResolution,
      imageQuality: requestImageQuality,
      thinkingLevel: requestThinkingLevel,
      referenceImages: imageReferenceUrls,
    };
    const displayedImageSize = /^\d+x\d+$/.test(requestImageResolution) ? requestImageResolution : requestAspectRatio;

    const tempId = makeClientId("temp_img");
    const newItem: StorageItem = {
      id: tempId,
      type: "image",
      url: "https://picsum.photos/800/800",
      prompt: activePrompt,
      model: requestModel,
      aspectRatio: displayedImageSize,
      createdAt: new Date().toISOString(),
      status: "pending",
      progress: 30,
      generationRequest,
      sourceBoardNodeId: overrides.boardNodeId,
    };

    setItems(prev => [newItem, ...prev]);

    const controller = new AbortController();
    generationAbortControllersRef.current[tempId] = controller;

    try {
      const headers = buildProviderHeaders(overrides.model ?? selectedModel);

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
            return true;
          }
          setItems(prev => [compilingItem, ...prev.filter(item => item.id !== tempId)]);
          return true;
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
          return true;
        }
        setItems(prev => [completedItem, ...prev.filter(item => item.id !== tempId)]);
      } else {
        throw new Error(await readFetchError(res, "图片生成请求失败"));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(tempId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(tempId);
        return true;
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
      return true;
    } finally {
      delete generationAbortControllersRef.current[tempId];
      setImageSubmitCount(prev => Math.max(0, prev - 1));
    }
    return true;
  };

  const generateManualVideo = async (overrides: GenerationOverrides = {}) => {
    const activePrompt = overrides.prompt ?? prompt;
    const activeReferenceImage = overrides.referenceImage ?? referenceImage;
    const activeReferenceImages = overrides.referenceImages ?? referenceImages;
    const requestModel = overrides.model ?? selectedVideoModel;
    const requestSize = overrides.size ?? activeVideoSize;
    const requestVideoDuration = overrides.videoDuration ?? activeVideoDuration;
    const requestVideoPreset = overrides.videoPreset ?? activeVideoPreset;
    const requestVideoResolution = overrides.videoResolution ?? activeVideoResolution;
    const requestVideoCapabilities = getVideoModelCapabilities(requestModel);

    if (!activePrompt.trim()) return false;
    const videoReferenceUrls = buildVideoReferenceUrls(
      activeReferenceImages,
      activeReferenceImage,
      requestVideoCapabilities.referenceMode,
      requestVideoCapabilities.maxReferenceImages,
    );
    const videoPayloadError = getReferenceImagePayloadError(videoReferenceUrls);
    if (videoPayloadError) {
      pushWorkspaceNotice("error", videoPayloadError);
      return false;
    }
    setVideoSubmitCount(prev => prev + 1);
    const generationPrompt = buildPromptWithReferenceMap(activePrompt, activeReferenceImages, videoReferenceUrls);
    const generationRequest: GenerationRequestSnapshot = {
      prompt: generationPrompt,
      model: requestModel,
      aspectRatio: requestSize,
      videoDurationSeconds: requestVideoDuration,
      videoPreset: requestVideoPreset,
      videoResolution: requestVideoResolution,
      referenceImages: videoReferenceUrls,
    };

    const tempId = makeClientId("temp_vid");
    const newItem: StorageItem = {
      id: tempId,
      type: "video",
      url: "",
      prompt: activePrompt,
      model: requestModel,
      aspectRatio: requestSize,
      createdAt: new Date().toISOString(),
      status: "processing",
      progress: 12,
      generationRequest,
      sourceBoardNodeId: overrides.boardNodeId,
    };

    setItems(prev => [newItem, ...prev]);

    const controller = new AbortController();
    generationAbortControllersRef.current[tempId] = controller;

    try {
      const headers = buildProviderHeaders(requestModel);
      const res = await fetch("/api/gemini/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: generationRequest.prompt,
          images: videoReferenceUrls,
          aspectRatio: generationRequest.aspectRatio,
          durationSeconds: generationRequest.videoDurationSeconds,
          preset: generationRequest.videoPreset,
          resolutionName: generationRequest.videoResolution,
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
          return true;
        }
        setItems(prev => [compilingItem, ...prev.filter(item => item.id !== tempId)]);
      } else {
        throw new Error(await readFetchError(res, "视频生成请求失败"));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(tempId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(tempId);
        return true;
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
      return true;
    } finally {
      delete generationAbortControllersRef.current[tempId];
      setVideoSubmitCount(prev => Math.max(0, prev - 1));
    }
    return true;
  };

  return {
    generateManualImage,
    generateManualVideo,
  };
}
