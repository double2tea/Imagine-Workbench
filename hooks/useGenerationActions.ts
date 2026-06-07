import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { saveItemWithPreview } from "@/lib/assets/previews";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { readImageGenerationPayload } from "@/lib/client-image-response";
import {
  buildStorageItem,
  saveToDB,
  type GenerationReferenceMediaSnapshot,
  type GenerationRequestSnapshot,
  type StorageItem,
} from "@/lib/db";
import {
  cancelGenerationTask,
  createGenerationTask,
  saveGenerationTask,
  updateGenerationTask,
  type GenerationTask,
  type GenerationTaskSource,
  type GenerationTaskUpdate,
} from "@/lib/generation-tasks";
import type { RunningHubTaskNodeBinding } from "@/lib/providers/types";
import { buildPromptWithReferenceMap } from "@/hooks/useReferenceState";
import { getMediaReferenceType, mediaReferenceLabel } from "@/lib/media-references";
import { getImageModelCapabilities, getVideoModelCapabilities, isMimoWorkbenchTtsModel, type VideoReferenceMode } from "@/lib/providers/model-catalog";
import { getReferenceImagePayloadError, getReferenceMediaPayloadError, prepareReferenceImageUrlForRequest, prepareReferenceMediaUrlForRequest } from "@/lib/reference-images";
import { selectVideoReferencesForMode } from "@/lib/video-reference-selection";

type NoticeType = "error" | "info" | "success";

interface UseGenerationActionsParams {
  boardId?: string;
  activeImageAspectRatio: string;
  activeImageModel: string;
  activeImageQuality: string | undefined;
  activeImageResolution: string;
  activeVideoDuration: string | undefined;
  activeVideoPreset: string | undefined;
  activeVideoReferenceMode: VideoReferenceMode;
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
  setGenerationTasks: Dispatch<SetStateAction<GenerationTask[]>>;
  setImageSubmitCount: Dispatch<SetStateAction<number>>;
  setItems: Dispatch<SetStateAction<StorageItem[]>>;
  setVideoSubmitCount: Dispatch<SetStateAction<number>>;
  videoReferenceLimit: number;
  videoReferenceMode: VideoReferenceMode;
}

interface GenerationOverrides {
  allowEmptyPrompt?: boolean;
  boardId?: string;
  boardNodeId?: string;
  boardResultStackKey?: string;
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
  videoReferenceMode?: VideoReferenceMode;
  videoResolution?: string;
  runningHubAccessPassword?: string;
  runningHubNodeInfoList?: RunningHubTaskNodeBinding[];
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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

async function saveAudioItemOrWarn(
  item: StorageItem,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<StorageItem | null> {
  try {
    await saveToDB(item);
    return item;
  } catch (error) {
    const message = toErrorMessage(error, "IndexedDB 写入失败");
    console.error("IndexedDB Audio Save Failed:", error);
    pushWorkspaceNotice("error", `本地音频存储失败，刷新后可能丢失：${message}`);
    return null;
  }
}

function upsertGenerationTask(tasks: GenerationTask[], task: GenerationTask): GenerationTask[] {
  const merged = new Map(tasks.map(entry => [entry.id, entry]));
  merged.set(task.id, task);
  return Array.from(merged.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

async function saveTaskOrWarn(
  task: GenerationTask,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<boolean> {
  try {
    await saveGenerationTask(task);
    return true;
  } catch (error) {
    const message = toErrorMessage(error, "任务写入失败");
    console.error("Generation Task Save Failed:", error);
    pushWorkspaceNotice("error", `任务存储失败，未启动远端生成：${message}`);
    return false;
  }
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

async function cancelTaskOrWarn(
  id: string,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<GenerationTask | null> {
  try {
    return await cancelGenerationTask(id);
  } catch (error) {
    const message = toErrorMessage(error, "任务取消状态更新失败");
    console.error("Generation Task Cancel Failed:", error);
    pushWorkspaceNotice("error", `任务取消状态更新失败：${message}`);
    return null;
  }
}

function validateCustomImageSize(size: string): string | null {
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

function buildReferenceMediaSnapshot(
  references: ReferenceImageRef[],
  payloads: string[],
): GenerationReferenceMediaSnapshot[] {
  return payloads.map((url, index) => {
    const reference = references[index];
    return {
      url,
      type: reference ? getMediaReferenceType(reference) : "image",
      ...(reference?.role ? { role: reference.role } : {}),
    };
  });
}

function customImageSizeAspectRatio(size: string): string | null {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return null;
  return pixelSizeAspectRatio(width, height);
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
  boardId,
  activeImageAspectRatio,
  activeImageModel,
  activeImageQuality,
  activeImageResolution,
  activeVideoDuration,
  activeVideoPreset,
  activeVideoReferenceMode,
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
  setGenerationTasks,
  setImageSubmitCount,
  setItems,
  setVideoSubmitCount,
}: UseGenerationActionsParams) {
  const resolveScopeBoardId = (overrides: GenerationOverrides): string | undefined =>
    overrides.boardId ?? boardId;

  const resolveTaskSource = (overrides: GenerationOverrides): GenerationTaskSource => {
    const scopedBoardId = resolveScopeBoardId(overrides);
    if (scopedBoardId || overrides.boardNodeId || overrides.boardResultStackKey) {
      return {
        surface: "board",
        ...(scopedBoardId ? { boardId: scopedBoardId } : {}),
        ...(overrides.boardNodeId ? { boardNodeId: overrides.boardNodeId } : {}),
        ...(overrides.boardResultStackKey ? { resultStackKey: overrides.boardResultStackKey } : {}),
      };
    }
    return { surface: "workspace" };
  };

  const recordGenerationTask = (task: GenerationTask) => {
    setGenerationTasks(prev => upsertGenerationTask(prev, task));
  };

  const generateManualImage = async (overrides: GenerationOverrides = {}) => {
    const activePrompt = overrides.prompt ?? prompt;
    const activeReferenceImage = overrides.referenceImage ?? referenceImage;
    const activeReferenceImages = overrides.referenceImages ?? referenceImages;
    const requestModel = overrides.model ?? activeImageModel;
    const requestImageResolution = overrides.imageResolution ?? activeImageResolution;
    const requestImageQuality = overrides.imageQuality ?? activeImageQuality;
    const requestIsCustomImageResolution = overrides.isCustomImageResolution ?? isCustomImageResolution;
    const requestThinkingLevel = overrides.thinkingLevel ?? imageThinkingLevel;
    const requestImageCapabilities = getImageModelCapabilities(requestModel);
    const requestAspectRatio =
      requestIsCustomImageResolution
        ? customImageSizeAspectRatio(requestImageResolution) ?? (overrides.size ?? activeImageAspectRatio)
        : overrides.size ?? activeImageAspectRatio;

    if (!activePrompt.trim() && overrides.allowEmptyPrompt !== true) return false;
    if (requestIsCustomImageResolution) {
      const sizeError = validateCustomImageSize(requestImageResolution);
      if (sizeError) {
        pushWorkspaceNotice("error", `自定义图片尺寸无效：${sizeError}`);
        return false;
      }
    }
    const unsupportedImageReference = activeReferenceImages.find(reference => getMediaReferenceType(reference) !== "image");
    if (unsupportedImageReference) {
      pushWorkspaceNotice("error", `图片生成不支持${mediaReferenceLabel(getMediaReferenceType(unsupportedImageReference))}参考`);
      return false;
    }
    const imageReferenceUrls = activeReferenceImages.map(reference => reference.url);
    if (imageReferenceUrls.length === 0 && activeReferenceImage) {
      imageReferenceUrls.push(activeReferenceImage);
    }
    if (imageReferenceUrls.length < requestImageCapabilities.minReferenceImages) {
      pushWorkspaceNotice("error", `当前图片模型需要至少 ${requestImageCapabilities.minReferenceImages} 张参考图`);
      return false;
    }
    if (imageReferenceUrls.length > requestImageCapabilities.maxReferenceImages) {
      pushWorkspaceNotice("error", `当前图片模型最多支持 ${requestImageCapabilities.maxReferenceImages} 张参考图`);
      return false;
    }
    let imageReferencePayloads: string[];
    try {
      imageReferencePayloads = await Promise.all(imageReferenceUrls.map(prepareReferenceImageUrlForRequest));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "参考图读取失败"));
      return false;
    }
    const imagePayloadError = getReferenceImagePayloadError(imageReferencePayloads);
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
      runningHubAccessPassword: overrides.runningHubAccessPassword,
      runningHubNodeInfoList: overrides.runningHubNodeInfoList,
      referenceMedia: buildReferenceMediaSnapshot(activeReferenceImages, imageReferencePayloads),
    };
    const displayedImageSize = /^\d+x\d+$/.test(requestImageResolution) ? requestImageResolution : requestAspectRatio;

    const taskId = makeClientId("task_img");
    const createdAt = new Date().toISOString();
    const task = createGenerationTask({
      id: taskId,
      mediaType: "image",
      prompt: activePrompt,
      model: requestModel,
      status: "pending",
      progress: 30,
      createdAt,
      source: resolveTaskSource(overrides),
      request: generationRequest,
    });
    if (!await saveTaskOrWarn(task, pushWorkspaceNotice)) {
      setImageSubmitCount(prev => Math.max(0, prev - 1));
      return true;
    }
    recordGenerationTask(task);

    const controller = new AbortController();
    generationAbortControllersRef.current[taskId] = controller;

    try {
      const headers = buildProviderHeaders(overrides.model ?? selectedModel);

      const res = await fetch("/api/gemini/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          ...generationRequest,
          referenceImage: imageReferencePayloads[0],
        }),
      });

      if (res.ok) {
        const { operationName, imageUrl } = await readImageGenerationPayload(res);
        if (operationName) {
          const processingTask = await updateTaskOrWarn(taskId, {
            operationName,
            status: "processing",
            progress: 15,
            canCancelRemote: operationName.startsWith("12ai:video:"),
          }, pushWorkspaceNotice);
          if (processingTask) recordGenerationTask(processingTask);
          return true;
        }

        if (!imageUrl) {
          throw new Error("图片接口返回缺少 imageUrl 或 operationName");
        }
        const completedAssetId = makeClientId("img");
        const completedItem = buildStorageItem(
          {
            id: completedAssetId,
            type: "image",
            url: imageUrl,
            prompt: activePrompt,
            model: requestModel,
            aspectRatio: displayedImageSize,
            createdAt,
            status: "complete",
            progress: 100,
            generationRequest,
            sourceBoardNodeId: overrides.boardNodeId,
            sourceBoardResultStackKey: overrides.boardResultStackKey,
          },
          { boardId: resolveScopeBoardId(overrides) },
        );

        const savedCompletedItem = await saveItemOrWarn(completedItem, pushWorkspaceNotice);
        if (!savedCompletedItem) {
          const failedTask = await updateTaskOrWarn(taskId, {
            status: "failed",
            progress: 100,
            errorMessage: "结果资产本地存储失败",
          }, pushWorkspaceNotice);
          if (failedTask) recordGenerationTask(failedTask);
          return true;
        }
        setItems(prev => [savedCompletedItem, ...prev]);
        const completeTask = await updateTaskOrWarn(taskId, {
          activeResultAssetId: completedAssetId,
          resultAssetIds: [completedAssetId],
          status: "complete",
          progress: 100,
        }, pushWorkspaceNotice);
        if (completeTask) recordGenerationTask(completeTask);
      } else {
        throw new Error(await readFetchError(res, "图片生成请求失败"));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(taskId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(taskId);
        const canceledTask = await cancelTaskOrWarn(taskId, pushWorkspaceNotice);
        if (canceledTask) recordGenerationTask(canceledTask);
        return true;
      }
      console.error(error);
      const message = toErrorMessage(error, "图片生成失败");
      const failedTask = await updateTaskOrWarn(taskId, {
        status: "failed",
        progress: 100,
        errorMessage: message,
      }, pushWorkspaceNotice);
      if (failedTask) recordGenerationTask(failedTask);
      pushWorkspaceNotice("error", message);
      return true;
    } finally {
      delete generationAbortControllersRef.current[taskId];
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
    const requestVideoReferenceMode = overrides.videoReferenceMode ?? activeVideoReferenceMode;
    const requestVideoResolution = overrides.videoResolution ?? activeVideoResolution;
    const requestVideoCapabilities = getVideoModelCapabilities(requestModel);

    if (!activePrompt.trim() && overrides.allowEmptyPrompt !== true) return false;
    const videoReferences = selectVideoReferencesForMode(
      activeReferenceImages,
      activeReferenceImage,
      requestVideoReferenceMode,
      requestVideoCapabilities.maxReferenceImages,
    );
    const unsupportedReference = videoReferences.find(reference => !requestVideoCapabilities.referenceMediaTypes.includes(getMediaReferenceType(reference)));
    if (unsupportedReference) {
      pushWorkspaceNotice("error", `当前视频模型不支持${mediaReferenceLabel(getMediaReferenceType(unsupportedReference))}输入`);
      return false;
    }
    const videoReferenceUrls = videoReferences.map(reference => reference.url);
    let videoReferencePayloads: string[];
    try {
      videoReferencePayloads = await Promise.all(videoReferenceUrls.map(prepareReferenceMediaUrlForRequest));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "参考媒体读取失败"));
      return false;
    }
    const videoPayloadError = getReferenceMediaPayloadError(videoReferencePayloads);
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
      videoReferenceMode: requestVideoReferenceMode === "none" ? undefined : requestVideoReferenceMode,
      videoResolution: requestVideoResolution,
      runningHubAccessPassword: overrides.runningHubAccessPassword,
      runningHubNodeInfoList: overrides.runningHubNodeInfoList,
      referenceMedia: buildReferenceMediaSnapshot(videoReferences, videoReferencePayloads),
    };

    const taskId = makeClientId("task_vid");
    const task = createGenerationTask({
      id: taskId,
      mediaType: "video",
      prompt: activePrompt,
      model: requestModel,
      status: "pending",
      progress: 12,
      createdAt: new Date().toISOString(),
      source: resolveTaskSource(overrides),
      request: generationRequest,
    });
    if (!await saveTaskOrWarn(task, pushWorkspaceNotice)) {
      setVideoSubmitCount(prev => Math.max(0, prev - 1));
      return true;
    }
    recordGenerationTask(task);

    const controller = new AbortController();
    generationAbortControllersRef.current[taskId] = controller;

    try {
      const headers = buildProviderHeaders(requestModel);
      const res = await fetch("/api/gemini/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: generationRequest.prompt,
          images: videoReferencePayloads,
          aspectRatio: generationRequest.aspectRatio,
          durationSeconds: generationRequest.videoDurationSeconds,
          preset: generationRequest.videoPreset,
          referenceMode: generationRequest.videoReferenceMode,
          resolutionName: generationRequest.videoResolution,
          model: generationRequest.model,
          runningHubAccessPassword: generationRequest.runningHubAccessPassword,
          runningHubNodeInfoList: generationRequest.runningHubNodeInfoList,
        }),
      });

      if (res.ok) {
        const data: unknown = await res.json();
        const activeOperationName = getStringField(data, "operationName");
        if (!activeOperationName) {
          throw new Error("视频接口返回缺少 operationName");
        }

        const processingTask = await updateTaskOrWarn(taskId, {
          operationName: activeOperationName,
          status: "processing",
          progress: 15,
          canCancelRemote: activeOperationName.startsWith("12ai:video:"),
        }, pushWorkspaceNotice);
        if (processingTask) recordGenerationTask(processingTask);
      } else {
        throw new Error(await readFetchError(res, "视频生成请求失败"));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(taskId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(taskId);
        const canceledTask = await cancelTaskOrWarn(taskId, pushWorkspaceNotice);
        if (canceledTask) recordGenerationTask(canceledTask);
        return true;
      }
      console.error(error);
      const message = toErrorMessage(error, "视频生成失败");
      const failedTask = await updateTaskOrWarn(taskId, {
        status: "failed",
        progress: 100,
        errorMessage: message,
      }, pushWorkspaceNotice);
      if (failedTask) recordGenerationTask(failedTask);
      pushWorkspaceNotice("error", message);
      return true;
    } finally {
      delete generationAbortControllersRef.current[taskId];
      setVideoSubmitCount(prev => Math.max(0, prev - 1));
    }
    return true;
  };

  const generateManualAudio = async (overrides: GenerationOverrides = {}) => {
    const activePrompt = overrides.prompt ?? prompt;
    const activeReferenceImage = overrides.referenceImage ?? referenceImage;
    const activeReferenceImages = overrides.referenceImages ?? referenceImages;
    const requestModel = overrides.model?.trim();

    if (!requestModel) {
      pushWorkspaceNotice("error", "音频生成需要明确音频模型");
      return false;
    }
    if (!activePrompt.trim() && overrides.allowEmptyPrompt !== true) return false;
    const audioReferences = [...activeReferenceImages];
    if (audioReferences.length === 0 && activeReferenceImage) {
      audioReferences.push({ id: "legacy-reference", url: activeReferenceImage });
    }
    if (isMimoWorkbenchTtsModel(requestModel)) {
      if (audioReferences.length > 0) {
        pushWorkspaceNotice("error", "MiMo 内置 TTS 不支持参考媒体");
        return false;
      }

      setVideoSubmitCount(prev => prev + 1);
      const createdAt = new Date().toISOString();
      const generationRequest: GenerationRequestSnapshot = {
        prompt: activePrompt,
        model: requestModel,
        aspectRatio: "audio",
      };
      const taskId = makeClientId("task_aud");
      const task = createGenerationTask({
        id: taskId,
        mediaType: "audio",
        prompt: activePrompt,
        model: requestModel,
        status: "pending",
        progress: 12,
        createdAt,
        source: resolveTaskSource(overrides),
        request: generationRequest,
      });
      if (!await saveTaskOrWarn(task, pushWorkspaceNotice)) {
        setVideoSubmitCount(prev => Math.max(0, prev - 1));
        return true;
      }
      recordGenerationTask(task);

      const controller = new AbortController();
      generationAbortControllersRef.current[taskId] = controller;

      try {
        const headers = buildProviderHeaders(requestModel);
        const res = await fetch("/api/mimo/generate-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          signal: controller.signal,
          body: JSON.stringify({
            model: "mimo-v2.5-tts",
            text: generationRequest.prompt,
          }),
        });

        if (!res.ok) {
          throw new Error(await readFetchError(res, "MiMo 音频生成请求失败"));
        }

        const data: unknown = await res.json();
        const audioBase64 = getStringField(data, "audioBase64");
        const mimeType = getStringField(data, "mimeType");
        if (!audioBase64 || !mimeType) {
          throw new Error("MiMo 音频接口返回格式不正确");
        }
        const completedAssetId = makeClientId("aud");
        const completedItem = buildStorageItem(
          {
            id: completedAssetId,
            type: "audio",
            url: `data:${mimeType};base64,${audioBase64}`,
            prompt: activePrompt,
            model: requestModel,
            aspectRatio: "audio",
            createdAt,
            status: "complete",
            progress: 100,
            generationRequest,
            sourceBoardNodeId: overrides.boardNodeId,
            sourceBoardResultStackKey: overrides.boardResultStackKey,
          },
          { boardId: resolveScopeBoardId(overrides) },
        );

        const savedCompletedItem = await saveAudioItemOrWarn(completedItem, pushWorkspaceNotice);
        if (!savedCompletedItem) {
          const failedTask = await updateTaskOrWarn(taskId, {
            status: "failed",
            progress: 100,
            errorMessage: "结果资产本地存储失败",
          }, pushWorkspaceNotice);
          if (failedTask) recordGenerationTask(failedTask);
          return true;
        }
        setItems(prev => [savedCompletedItem, ...prev]);
        const completeTask = await updateTaskOrWarn(taskId, {
          activeResultAssetId: completedAssetId,
          resultAssetIds: [completedAssetId],
          status: "complete",
          progress: 100,
        }, pushWorkspaceNotice);
        if (completeTask) recordGenerationTask(completeTask);
        pushWorkspaceNotice("success", "MiMo 音频生成完成");
      } catch (error) {
        if (locallyCanceledItemIdsRef.current.has(taskId) || isAbortError(error)) {
          locallyCanceledItemIdsRef.current.delete(taskId);
          const canceledTask = await cancelTaskOrWarn(taskId, pushWorkspaceNotice);
          if (canceledTask) recordGenerationTask(canceledTask);
          return true;
        }
        console.error(error);
        const message = toErrorMessage(error, "MiMo 音频生成失败");
        const failedTask = await updateTaskOrWarn(taskId, {
          status: "failed",
          progress: 100,
          errorMessage: message,
        }, pushWorkspaceNotice);
        if (failedTask) recordGenerationTask(failedTask);
        pushWorkspaceNotice("error", message);
        return true;
      } finally {
        delete generationAbortControllersRef.current[taskId];
        setVideoSubmitCount(prev => Math.max(0, prev - 1));
      }
      return true;
    }
    const audioReferenceUrls = audioReferences.map(reference => reference.url);
    let audioReferencePayloads: string[];
    try {
      audioReferencePayloads = await Promise.all(audioReferenceUrls.map(prepareReferenceMediaUrlForRequest));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "参考媒体读取失败"));
      return false;
    }
    const audioPayloadError = getReferenceMediaPayloadError(audioReferencePayloads);
    if (audioPayloadError) {
      pushWorkspaceNotice("error", audioPayloadError);
      return false;
    }

    setVideoSubmitCount(prev => prev + 1);
    const generationPrompt = buildPromptWithReferenceMap(activePrompt, audioReferences, audioReferenceUrls);
    const generationRequest: GenerationRequestSnapshot = {
      prompt: generationPrompt,
      model: requestModel,
      aspectRatio: "audio",
      runningHubAccessPassword: overrides.runningHubAccessPassword,
      runningHubNodeInfoList: overrides.runningHubNodeInfoList,
      referenceMedia: buildReferenceMediaSnapshot(audioReferences, audioReferencePayloads),
    };

    const taskId = makeClientId("task_aud");
    const task = createGenerationTask({
      id: taskId,
      mediaType: "audio",
      prompt: activePrompt,
      model: requestModel,
      status: "pending",
      progress: 12,
      createdAt: new Date().toISOString(),
      source: resolveTaskSource(overrides),
      request: generationRequest,
    });
    if (!await saveTaskOrWarn(task, pushWorkspaceNotice)) {
      setVideoSubmitCount(prev => Math.max(0, prev - 1));
      return true;
    }
    recordGenerationTask(task);

    const controller = new AbortController();
    generationAbortControllersRef.current[taskId] = controller;

    try {
      const headers = buildProviderHeaders(requestModel);
      const res = await fetch("/api/gemini/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: generationRequest.prompt,
          model: generationRequest.model,
          referenceMedia: generationRequest.referenceMedia?.map(reference => ({
            dataUri: reference.url,
            type: reference.type,
          })),
          runningHubAccessPassword: generationRequest.runningHubAccessPassword,
          runningHubNodeInfoList: generationRequest.runningHubNodeInfoList,
        }),
      });

      if (res.ok) {
        const data: unknown = await res.json();
        const activeOperationName = getStringField(data, "operationName");
        if (!activeOperationName) {
          throw new Error("音频接口返回缺少 operationName");
        }

        const processingTask = await updateTaskOrWarn(taskId, {
          operationName: activeOperationName,
          status: "processing",
          progress: 15,
          canCancelRemote: activeOperationName.startsWith("12ai:video:"),
        }, pushWorkspaceNotice);
        if (processingTask) recordGenerationTask(processingTask);
      } else {
        throw new Error(await readFetchError(res, "音频生成请求失败"));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(taskId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(taskId);
        const canceledTask = await cancelTaskOrWarn(taskId, pushWorkspaceNotice);
        if (canceledTask) recordGenerationTask(canceledTask);
        return true;
      }
      console.error(error);
      const message = toErrorMessage(error, "音频生成失败");
      const failedTask = await updateTaskOrWarn(taskId, {
        status: "failed",
        progress: 100,
        errorMessage: message,
      }, pushWorkspaceNotice);
      if (failedTask) recordGenerationTask(failedTask);
      pushWorkspaceNotice("error", message);
      return true;
    } finally {
      delete generationAbortControllersRef.current[taskId];
      setVideoSubmitCount(prev => Math.max(0, prev - 1));
    }
    return true;
  };

  return {
    generateManualAudio,
    generateManualImage,
    generateManualVideo,
  };
}
