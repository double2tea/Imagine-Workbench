import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { isRunningHubWorkflowAudioTarget } from "@/lib/audio-generation-routing";
import { API_ROUTES } from "@/lib/api/routes";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { saveItemWithPreview } from "@/lib/assets/previews";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { readImageGenerationPayload } from "@/lib/client-image-response";
import {
  buildStorageItem,
  getAssetMeta,
  getAssetMetasByIds,
  hydrateAssets,
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
import { audioOperationMissingReferenceMessage, audioOperationRequiresTextInput, readOptionalAudioFormat } from "@/lib/audio-operation-rules";
import { getMediaReferenceType, mediaReferenceLabel } from "@/lib/media-references";
import { getAudioModelCapabilities, getImageModelCapabilities, getVideoModelCapabilities, parseProviderModel, type AudioOperationMode, type VideoReferenceMode } from "@/lib/providers/model-catalog";
import { getProviderMeta } from "@/lib/providers/registry";
import { getReferenceImagePayloadError, getReferenceMediaPayloadError, prepareReferenceImageUrlForRequest, prepareReferenceMediaUrlForRequest } from "@/lib/reference-images";
import { transcriptPreview, transcriptToDataUrl } from "@/lib/transcripts";
import { selectVideoReferencesForMode } from "@/lib/video-reference-selection";
import { getVoiceProfile, isVoiceProfileUsableForAudioModel } from "@/lib/voice-profiles";

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
  setAudioSubmitCount: Dispatch<SetStateAction<number>>;
  setImageSubmitCount: Dispatch<SetStateAction<number>>;
  setItems: Dispatch<SetStateAction<StorageItem[]>>;
  setVideoSubmitCount: Dispatch<SetStateAction<number>>;
  videoReferenceLimit: number;
  videoReferenceMode: VideoReferenceMode;
}

interface GenerationOverrides {
  allowEmptyPrompt?: boolean;
  audioMode?: AudioOperationMode;
  audioFormat?: string;
  audioStylePrompt?: string;
  asrLanguage?: "auto" | "zh" | "en";
  optimizeTextPreview?: boolean;
  voiceProfileId?: string;
  voiceCloneConsentAccepted?: boolean;
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

function audioGenerationEndpoint(model: string, runningHubNodeInfoList?: RunningHubTaskNodeBinding[]): string {
  return isRunningHubWorkflowAudioTarget(model, runningHubNodeInfoList)
    ? API_ROUTES.media.generateAudioWorkflow
    : API_ROUTES.media.generateAudio;
}

async function readVoiceProfileReferences(assetIds: string[]): Promise<ReferenceImageRef[]> {
  if (assetIds.length === 0) return [];
  const metas = await getAssetMetasByIds(assetIds);
  const items = await hydrateAssets(metas);
  const itemsById = new Map(items.map(item => [item.id, item]));
  return assetIds.map(id => {
    const item = itemsById.get(id);
    if (!item || item.type !== "audio" || !item.url) {
      throw new Error("选中的音色参考音频已不存在");
    }
    return { id: item.id, type: "audio", url: item.url };
  });
}

function mergeReferences(
  baseReferences: ReferenceImageRef[],
  profileReferences: ReferenceImageRef[],
): ReferenceImageRef[] {
  const merged = new Map(baseReferences.map(reference => [reference.id, reference]));
  for (const reference of profileReferences) {
    merged.set(reference.id, reference);
  }
  return Array.from(merged.values());
}

async function resolveOriginalReference(reference: ReferenceImageRef): Promise<ReferenceImageRef> {
  const meta = await getAssetMeta(reference.id);
  if (!meta) return reference;
  const originalUrl = await resolveAssetOriginalUrl(meta);
  if (!originalUrl.trim()) {
    throw new Error("找不到参考媒体原图");
  }
  return { ...reference, url: originalUrl };
}

async function resolveOriginalReferences(references: ReferenceImageRef[]): Promise<ReferenceImageRef[]> {
  return Promise.all(references.map(resolveOriginalReference));
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

async function saveDirectItemOrWarn(
  item: StorageItem,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<StorageItem | null> {
  try {
    await saveToDB(item);
    return item;
  } catch (error) {
    const message = toErrorMessage(error, "IndexedDB 写入失败");
    console.error("IndexedDB Direct Asset Save Failed:", error);
    pushWorkspaceNotice("error", `本地结果存储失败，刷新后可能丢失：${message}`);
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
  setAudioSubmitCount,
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
    const selectedReferenceImage = overrides.referenceImage ?? referenceImage;
    const selectedReferenceImages = overrides.referenceImages ?? referenceImages;
    let activeReferenceImages: ReferenceImageRef[];
    try {
      activeReferenceImages = await resolveOriginalReferences(selectedReferenceImages);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "参考媒体读取失败"));
      return false;
    }
    const activeReferenceImage = activeReferenceImages[0]?.url ?? selectedReferenceImage;
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

      const res = await fetch(API_ROUTES.media.generateImage, {
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
    const selectedReferenceImage = overrides.referenceImage ?? referenceImage;
    const selectedReferenceImages = overrides.referenceImages ?? referenceImages;
    let activeReferenceImages: ReferenceImageRef[];
    try {
      activeReferenceImages = await resolveOriginalReferences(selectedReferenceImages);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "参考媒体读取失败"));
      return false;
    }
    const activeReferenceImage = activeReferenceImages[0]?.url ?? selectedReferenceImage;
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
      const res = await fetch(API_ROUTES.media.generateVideo, {
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
    const selectedReferenceImage = overrides.referenceImage ?? referenceImage;
    const selectedReferenceImages = overrides.referenceImages ?? referenceImages;
    let activeReferenceImages: ReferenceImageRef[];
    try {
      activeReferenceImages = await resolveOriginalReferences(selectedReferenceImages);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "参考媒体读取失败"));
      return false;
    }
    const activeReferenceImage = activeReferenceImages[0]?.url ?? selectedReferenceImage;
    const requestModel = overrides.model?.trim();

    if (!requestModel) {
      pushWorkspaceNotice("error", "音频生成需要明确音频模型");
      return false;
    }
    const isRunningHubWorkflowAudio = isRunningHubWorkflowAudioTarget(requestModel, overrides.runningHubNodeInfoList);
    const audioCapabilities = isRunningHubWorkflowAudio ? null : getAudioModelCapabilities(requestModel);
    const audioMode = overrides.audioMode ?? audioCapabilities?.defaultMode;
    if (!activePrompt.trim() && audioMode !== undefined && audioOperationRequiresTextInput(audioMode) && overrides.allowEmptyPrompt !== true) return false;
    let profileStylePrompt: string | undefined;
    let profileVoice: string | undefined;
    let profileReferences: ReferenceImageRef[] = [];
    let profileCloneConsentAccepted = false;
    if (overrides.voiceProfileId) {
      try {
        const profile = await getVoiceProfile(overrides.voiceProfileId);
        if (!profile) throw new Error("找不到选中的音色");
        if (!audioMode || !isVoiceProfileUsableForAudioModel(profile, requestModel, audioMode)) {
          throw new Error("当前模型不能使用选中的音色");
        }
        profileStylePrompt = profile.designPrompt;
        profileVoice = profile.providerVoiceId;
        profileCloneConsentAccepted = profile.source === "cloned" && Boolean(profile.consentAcceptedAt);
        profileReferences = await readVoiceProfileReferences(profile.referenceAudioAssetIds);
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, "音色读取失败"));
        return false;
      }
    }
    if (audioMode === "voice_clone" && overrides.voiceCloneConsentAccepted !== true && !profileCloneConsentAccepted) {
      pushWorkspaceNotice("error", "音色克隆需要先确认参考音频授权");
      return false;
    }
    const resolvedAudioStylePrompt = profileStylePrompt ?? overrides.audioStylePrompt;
    const audioReferences = mergeReferences(activeReferenceImages, profileReferences);
    if (audioReferences.length === 0 && activeReferenceImage) {
      audioReferences.push({ id: "legacy-reference", url: activeReferenceImage });
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
    const audioReferenceTypes = audioReferences.map(reference => getMediaReferenceType(reference) ?? "image");
    if (audioCapabilities && audioReferenceTypes.some(type => !audioCapabilities.referenceMediaTypes.includes(type))) {
      pushWorkspaceNotice("error", "当前音频模型不支持所选参考媒体类型");
      return false;
    }
    if (audioCapabilities && audioReferences.length < audioCapabilities.minReferenceMedia) {
      pushWorkspaceNotice("error", audioOperationMissingReferenceMessage(audioCapabilities));
      return false;
    }
    if (audioCapabilities && audioCapabilities.maxReferenceMedia >= 0 && audioReferences.length > audioCapabilities.maxReferenceMedia) {
      pushWorkspaceNotice("error", `当前音频模型最多支持 ${audioCapabilities.maxReferenceMedia} 个参考媒体`);
      return false;
    }

    setAudioSubmitCount(prev => prev + 1);
    const generationPrompt = buildPromptWithReferenceMap(activePrompt, audioReferences, audioReferenceUrls);
    const resultMediaType: StorageItem["type"] = audioMode === "asr" ? "transcript" : "audio";
    const requestAudioFormat = readOptionalAudioFormat(overrides.audioFormat);
    const generationRequest: GenerationRequestSnapshot = {
      prompt: generationPrompt,
      model: requestModel,
      aspectRatio: resultMediaType === "transcript" ? "transcript" : "audio",
      runningHubAccessPassword: overrides.runningHubAccessPassword,
      runningHubNodeInfoList: overrides.runningHubNodeInfoList,
      referenceMedia: buildReferenceMediaSnapshot(audioReferences, audioReferencePayloads),
      audioFormat: requestAudioFormat,
      audioMode,
      audioStylePrompt: resolvedAudioStylePrompt,
      asrLanguage: overrides.asrLanguage,
      optimizeTextPreview: overrides.optimizeTextPreview,
      voiceProfileId: overrides.voiceProfileId,
    };

    const taskId = makeClientId(resultMediaType === "transcript" ? "task_txt" : "task_aud");
    const task = createGenerationTask({
      id: taskId,
      mediaType: resultMediaType,
      prompt: activePrompt.trim() || (resultMediaType === "transcript" ? "音频转写" : activePrompt),
      model: requestModel,
      status: "pending",
      progress: 12,
      createdAt: new Date().toISOString(),
      source: resolveTaskSource(overrides),
      request: generationRequest,
    });
    if (!await saveTaskOrWarn(task, pushWorkspaceNotice)) {
      setAudioSubmitCount(prev => Math.max(0, prev - 1));
      return true;
    }
    recordGenerationTask(task);

    const controller = new AbortController();
    generationAbortControllersRef.current[taskId] = controller;

    try {
      const headers = buildProviderHeaders(requestModel);
      const res = await fetch(audioGenerationEndpoint(requestModel, generationRequest.runningHubNodeInfoList), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          mode: audioMode,
          prompt: generationRequest.prompt,
          model: generationRequest.model,
          format: requestAudioFormat,
          stylePrompt: resolvedAudioStylePrompt,
          asrLanguage: overrides.asrLanguage,
          voice: profileVoice,
          voiceCloneConsentAccepted: overrides.voiceCloneConsentAccepted,
          optimizeTextPreview: overrides.optimizeTextPreview,
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
        const resultType = getStringField(data, "type");
        if (resultType === "direct") {
          const outputKind = getStringField(data, "outputKind");
          if (outputKind === "transcript") {
            const transcript = getStringField(data, "transcript");
            if (!transcript) {
              throw new Error("音频接口返回转写格式不正确");
            }
            const completedAssetId = makeClientId("txt");
            const completedItem = buildStorageItem(
              {
                id: completedAssetId,
                type: "transcript",
                url: transcriptToDataUrl(transcript),
                prompt: activePrompt.trim() || transcriptPreview(transcript, 80) || "音频转写",
                model: requestModel,
                aspectRatio: "transcript",
                createdAt: task.createdAt,
                status: "complete",
                progress: 100,
                generationRequest,
                sourceBoardNodeId: overrides.boardNodeId,
                sourceBoardResultStackKey: overrides.boardResultStackKey,
              },
              { boardId: resolveScopeBoardId(overrides) },
            );
            const savedCompletedItem = await saveDirectItemOrWarn(completedItem, pushWorkspaceNotice);
            if (!savedCompletedItem) {
              const failedTask = await updateTaskOrWarn(taskId, {
                status: "failed",
                progress: 100,
                errorMessage: "结果资产本地存储失败",
              }, pushWorkspaceNotice);
              if (failedTask) recordGenerationTask(failedTask);
              return true;
            }
            const completeTask = await updateTaskOrWarn(taskId, {
              activeResultAssetId: completedAssetId,
              resultAssetIds: [completedAssetId],
              status: "complete",
              progress: 100,
            }, pushWorkspaceNotice);
            if (completeTask) recordGenerationTask(completeTask);
            setItems(prev => [savedCompletedItem, ...prev]);
            pushWorkspaceNotice("success", "音频转写完成");
            return true;
          }
          const audioBase64 = getStringField(data, "audioBase64");
          const mimeType = getStringField(data, "mimeType");
          if (!audioBase64 || !mimeType) {
            throw new Error("音频接口返回格式不正确");
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
              createdAt: task.createdAt,
              status: "complete",
              progress: 100,
              generationRequest,
              sourceBoardNodeId: overrides.boardNodeId,
              sourceBoardResultStackKey: overrides.boardResultStackKey,
            },
            { boardId: resolveScopeBoardId(overrides) },
          );
          const savedCompletedItem = await saveDirectItemOrWarn(completedItem, pushWorkspaceNotice);
          if (!savedCompletedItem) {
            const failedTask = await updateTaskOrWarn(taskId, {
              status: "failed",
              progress: 100,
              errorMessage: "结果资产本地存储失败",
            }, pushWorkspaceNotice);
            if (failedTask) recordGenerationTask(failedTask);
            return true;
          }
          const completeTask = await updateTaskOrWarn(taskId, {
            activeResultAssetId: completedAssetId,
            resultAssetIds: [completedAssetId],
            status: "complete",
            progress: 100,
          }, pushWorkspaceNotice);
          if (completeTask) recordGenerationTask(completeTask);
          setItems(prev => [savedCompletedItem, ...prev]);
          pushWorkspaceNotice("success", "音频生成完成");
          return true;
        }
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
        const parsedModel = parseProviderModel(requestModel, "12ai");
        const providerLabel = getProviderMeta(parsedModel.provider).label;
        const message = await readFetchError(res, "音频生成请求失败");
        throw new Error(`${providerLabel}（${requestModel}）音频生成请求失败：${message}`);
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
      setAudioSubmitCount(prev => Math.max(0, prev - 1));
    }
    return true;
  };

  return {
    generateManualAudio,
    generateManualImage,
    generateManualVideo,
  };
}
