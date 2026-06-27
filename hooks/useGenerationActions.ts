import type { TFunction } from "@/lib/i18n";
import { useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { isRunningHubWorkflowAudioTarget } from "@/lib/audio-generation-routing";
import { API_ROUTES } from "@/lib/api/routes";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { readImageGenerationPayload } from "@/lib/client-image-response";
import {
  buildStorageItem,
  getAssetMeta,
  getAssetMetasByIds,
  getGenerationReferenceMedia,
  hydrateAssets,
  type GenerationReferenceMediaSnapshot,
  type GenerationRequestSnapshot,
  type StorageItem,
} from "@/lib/db";
import {
  createGenerationTask,
  type GenerationTask,
  type GenerationTaskStorage,
  type GenerationTaskSource,
  type GenerationTaskUpdate,
} from "@/lib/generation-tasks";
import type { RunningHubTaskNodeBinding, RunningHubYouchuanAdvancedSettings } from "@/lib/providers/types";
import { buildPromptWithReferenceMap } from "@/hooks/useReferenceState";
import { audioOperationMissingReferenceMessage, audioOperationRequiresTextInput, readOptionalAudioFormat } from "@/lib/audio-operation-rules";
import {
  CUSTOM_IMAGE_SIZE_GRID,
  CUSTOM_IMAGE_SIZE_MAX_ASPECT_RATIO,
  CUSTOM_IMAGE_SIZE_MAX_EDGE,
  CUSTOM_IMAGE_SIZE_MAX_PIXELS,
  CUSTOM_IMAGE_SIZE_MIN_PIXELS,
  getMediaReferenceType,
  mediaReferenceLabel,
  parseMediaReferenceDimensions,
} from "@/lib/media-references";
import { getAudioModelCapabilities, getImageModelCapabilities, getVideoModelCapabilities, imageParameterValuesFromLegacy, imageParameterValuesToRunningHubYouchuan, parseProviderModel, resolveImageModelQuality, type AudioOperationMode, type VideoReferenceMode } from "@/lib/providers/model-catalog";
import { isRunningHubTaskTarget } from "@/lib/providers/runninghub-node-info";
import { getProviderMeta } from "@/lib/providers/registry";
import { runningHubAppPresetRequiresPrompt } from "@/lib/providers/runninghub";
import { getReferenceImagePayloadError, getReferenceMediaPayloadError, prepareReferenceImageUrlForRequest, prepareReferenceMediaUrlForRequest } from "@/lib/reference-images";
import { transcriptPreview, transcriptToDataUrl } from "@/lib/transcripts";
import { selectVideoReferencesForMode } from "@/lib/video-reference-selection";
import { getVoiceProfile, isVoiceProfileUsableForAudioModel } from "@/lib/voice-profiles";
import {
  applyCinematicProfileToPrompt,
  hasActiveCinematicProfile,
  type CinematicProfile,
} from "@/lib/cinematic-controls";

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
  cinematicProfile?: CinematicProfile;
  generationAbortControllersRef: MutableRefObject<Record<string, AbortController>>;
  imageThinkingLevel: string;
  isCustomImageResolution: boolean;
  locallyCanceledItemIdsRef: MutableRefObject<Set<string>>;
  prompt: string;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
  referenceImage: string | null;
  referenceImages: ReferenceImageRef[];
  runningHubYouchuan: RunningHubYouchuanAdvancedSettings;
  deleteAssetById: (id: string) => Promise<void>;
  generationTaskStorage: Pick<GenerationTaskStorage, "cancel" | "save" | "update">;
  saveAssetDirect: (item: StorageItem) => Promise<StorageItem>;
  saveAssetWithPreview: (item: StorageItem) => Promise<StorageItem>;
  selectedModel: string;
  selectedVideoModel: string;
  setGenerationTasks: Dispatch<SetStateAction<GenerationTask[]>>;
  setAudioSubmitCount: Dispatch<SetStateAction<number>>;
  setImageSubmitCount: Dispatch<SetStateAction<number>>;
  setItems: Dispatch<SetStateAction<StorageItem[]>>;
  setVideoSubmitCount: Dispatch<SetStateAction<number>>;
  t: TFunction;
  videoReferenceLimit: number;
  videoReferenceMode: VideoReferenceMode;
}

interface GenerationOverrides {
  allowEmptyPrompt?: boolean;
  audioMode?: AudioOperationMode;
  audioFormat?: string;
  audioStylePrompt?: string;
  asrLanguage?: "auto" | "zh" | "en";
  cinematicProfile?: CinematicProfile;
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
  runningHubYouchuan?: RunningHubYouchuanAdvancedSettings;
}

let generationClientIdSequence = 0;

function makeClientId(prefix: string): string {
  generationClientIdSequence += 1;
  return `${prefix}_${Date.now()}_${generationClientIdSequence}`;
}

function runningHubYouchuanSettingsForModel(
  model: string,
  settings: RunningHubYouchuanAdvancedSettings,
): RunningHubYouchuanAdvancedSettings | undefined {
  return imageParameterValuesToRunningHubYouchuan(
    model,
    imageParameterValuesFromLegacy(model, { runningHubYouchuan: settings }),
  );
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

async function readVoiceProfileReferences(assetIds: string[], t: TFunction): Promise<ReferenceImageRef[]> {
  if (assetIds.length === 0) return [];
  const metas = await getAssetMetasByIds(assetIds);
  const items = await hydrateAssets(metas);
  const itemsById = new Map(items.map(item => [item.id, item]));
  return assetIds.map(id => {
    const item = itemsById.get(id);
    if (!item || item.type !== "audio" || !item.url) {
      throw new Error(t("common.notices.voiceProfileAudioMissing"));
    }
    return { id: item.id, sourceAssetId: item.id, type: "audio", url: item.url };
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

async function resolveOriginalReference(reference: ReferenceImageRef, t: TFunction): Promise<ReferenceImageRef> {
  const meta = await getAssetMeta(reference.id);
  if (!meta) return reference;
  const originalUrl = await resolveAssetOriginalUrl(meta);
  if (!originalUrl.trim()) {
    throw new Error(t("common.notices.referenceMediaOriginalNotFound"));
  }
  return { ...reference, sourceAssetId: meta.id, url: originalUrl };
}

async function resolveOriginalReferences(references: ReferenceImageRef[], t: TFunction): Promise<ReferenceImageRef[]> {
  const results = await Promise.allSettled(references.map(reference => resolveOriginalReference(reference, t)));
  const successful: ReferenceImageRef[] = [];
  const failedIds: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    } else {
      failedIds.push(references[index].id);
    }
  });
  if (failedIds.length > 0 && failedIds.length < references.length) {
    console.warn(t("common.notices.partialReferenceMediaParseFailed", { ids: failedIds.join(", ") }));
  }
  if (successful.length === 0 && failedIds.length > 0) {
    throw new Error(t("common.notices.allReferenceMediaParseFailed"));
  }
  return successful;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function saveItemOrWarn(
  item: StorageItem,
  saveAssetWithPreview: (item: StorageItem) => Promise<StorageItem>,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
  t: TFunction,
): Promise<StorageItem | null> {
  try {
    return await saveAssetWithPreview(item);
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.indexedDbWriteFailed"));
    console.error("Asset Save Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.localSaveFailed", { error: message }));
    return null;
  }
}

async function deleteItemOrWarn(
  itemId: string,
  deleteAssetById: (id: string) => Promise<void>,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
  t: TFunction,
): Promise<void> {
  try {
    await deleteAssetById(itemId);
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.indexedDbDeleteFailed"));
    console.error("Asset Delete Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.localResultClearFailed", { error: message }));
  }
}

async function saveDirectItemOrWarn(
  item: StorageItem,
  saveAssetDirect: (item: StorageItem) => Promise<StorageItem>,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
  t: TFunction,
): Promise<StorageItem | null> {
  try {
    return await saveAssetDirect(item);
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.indexedDbWriteFailed"));
    console.error("Direct Asset Save Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.localResultSaveFailed", { error: message }));
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
  saveGenerationTask: GenerationTaskStorage["save"],
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
  t: TFunction,
): Promise<boolean> {
  try {
    await saveGenerationTask(task);
    return true;
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.taskWriteFailed"));
    console.error("Generation Task Save Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.localTaskSaveFailed", { error: message }));
    return false;
  }
}

async function updateTaskOrWarn(
  id: string,
  update: GenerationTaskUpdate,
  updateGenerationTask: GenerationTaskStorage["update"],
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
  t: TFunction,
): Promise<GenerationTask | null> {
  try {
    return await updateGenerationTask(id, update);
  } catch (error) {
    const message = toErrorMessage(error, t("common.notices.taskUpdateError"));
    console.error("Generation Task Update Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.taskUpdateFailed", { error: message }));
    return null;
  }
}

async function cancelTaskOrWarn(
  id: string,
  cancelGenerationTask: GenerationTaskStorage["cancel"],
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
  t: TFunction,
): Promise<GenerationTask | null> {
  try {
    return await cancelGenerationTask(id);
  } catch (error) {
    console.error("Generation Task Cancel Failed:", error);
    pushWorkspaceNotice("error", t("common.notices.taskCancelStatusUpdateFailed"));
    return null;
  }
}

function validateCustomImageSize(size: string, t: TFunction): string | null {
  if (size === "auto") return null;
  const dimensions = parseMediaReferenceDimensions(size);
  if (!dimensions) return t("common.notices.imageSizeInvalid");
  const { height, width } = dimensions;
  if (width > CUSTOM_IMAGE_SIZE_MAX_EDGE || height > CUSTOM_IMAGE_SIZE_MAX_EDGE) return t("common.notices.maxDimensionExceeded");
  if (width % CUSTOM_IMAGE_SIZE_GRID !== 0 || height % CUSTOM_IMAGE_SIZE_GRID !== 0) return t("common.notices.dimensionMustBe16x");
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (longSide / shortSide > CUSTOM_IMAGE_SIZE_MAX_ASPECT_RATIO) return t("common.notices.aspectRatioExceeded");
  const pixels = width * height;
  if (pixels < CUSTOM_IMAGE_SIZE_MIN_PIXELS || pixels > CUSTOM_IMAGE_SIZE_MAX_PIXELS) return t("common.notices.totalPixelsInvalid");
  return null;
}

function buildReferenceMediaSnapshot(
  references: ReferenceImageRef[],
  payloads: string[],
): GenerationReferenceMediaSnapshot[] {
  return payloads.map((url, index) => {
    const reference = references[index];
    const sourceAssetId = reference?.sourceAssetId?.trim();
    return {
      height: reference?.height,
      ...(sourceAssetId ? { sourceAssetId } : {}),
      url: sourceAssetId ? "" : url,
      type: reference ? getMediaReferenceType(reference) : "image",
      ...(reference?.role ? { role: reference.role } : {}),
      width: reference?.width,
    };
  });
}

function taskRequestReferences(request: GenerationRequestSnapshot): ReferenceImageRef[] {
  return getGenerationReferenceMedia(request).map((reference, index) => ({
    height: reference.height,
    id: reference.sourceAssetId ?? `retry_reference_${index + 1}`,
    ...(reference.sourceAssetId ? { sourceAssetId: reference.sourceAssetId } : {}),
    type: reference.type,
    url: reference.url,
    ...(reference.role ? { role: reference.role } : {}),
    width: reference.width,
  }));
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
  cinematicProfile,
  generationAbortControllersRef,
  imageThinkingLevel,
  isCustomImageResolution,
  locallyCanceledItemIdsRef,
  prompt,
  pushWorkspaceNotice,
  referenceImage,
  referenceImages,
  runningHubYouchuan,
  deleteAssetById,
  generationTaskStorage,
  saveAssetDirect,
  saveAssetWithPreview,
  selectedModel,
  selectedVideoModel,
  setGenerationTasks,
  setAudioSubmitCount,
  setImageSubmitCount,
  setItems,
  setVideoSubmitCount,
  t,
}: UseGenerationActionsParams) {
  const audioSubmissionKeysInFlightRef = useRef<Set<string>>(new Set());

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
      activeReferenceImages = await resolveOriginalReferences(selectedReferenceImages, t);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.referenceMediaReadFailed")));
      return false;
    }
    const activeReferenceImage = activeReferenceImages[0]?.url ?? selectedReferenceImage;
    const requestModel = overrides.model ?? activeImageModel;
    const requestImageResolution = overrides.imageResolution ?? activeImageResolution;
    const requestIsCustomImageResolution = overrides.isCustomImageResolution ?? isCustomImageResolution;
    const requestThinkingLevel = overrides.thinkingLevel ?? imageThinkingLevel;
    const isRunningHubImageTask = isRunningHubTaskTarget(requestModel, "image");
    const requestRunningHubYouchuan = isRunningHubImageTask
      ? undefined
      : runningHubYouchuanSettingsForModel(
        requestModel,
        overrides.runningHubYouchuan ?? runningHubYouchuan,
      );
    const requestCinematicProfile = overrides.cinematicProfile ?? cinematicProfile;
    const requestImageCapabilities = isRunningHubImageTask ? null : getImageModelCapabilities(requestModel);
    const requestedImageQuality = overrides.imageQuality ?? activeImageQuality;
    const requestImageQuality = isRunningHubImageTask ? requestedImageQuality : resolveImageModelQuality(requestModel, requestedImageQuality);
    const requestAspectRatio =
      requestIsCustomImageResolution
        ? customImageSizeAspectRatio(requestImageResolution) ?? (overrides.size ?? activeImageAspectRatio)
        : overrides.size ?? activeImageAspectRatio;

    if (!activePrompt.trim() && overrides.allowEmptyPrompt !== true && runningHubAppPresetRequiresPrompt(requestModel)) return false;
    if (requestIsCustomImageResolution) {
      const sizeError = validateCustomImageSize(requestImageResolution, t);
      if (sizeError) {
        pushWorkspaceNotice("error", t("common.notices.customImageSizeInvalid", { error: sizeError }));
        return false;
      }
    }
    const unsupportedImageReference = isRunningHubImageTask ? undefined : activeReferenceImages.find(reference => getMediaReferenceType(reference) !== "image");
    if (unsupportedImageReference) {
      pushWorkspaceNotice("error", t("common.notices.imageGenNotSupportMediaReference", { type: mediaReferenceLabel(getMediaReferenceType(unsupportedImageReference)) }));
      return false;
    }
    const imageReferenceUrls = activeReferenceImages.map(reference => reference.url);
    if (imageReferenceUrls.length === 0 && activeReferenceImage) {
      imageReferenceUrls.push(activeReferenceImage);
    }
    if (requestImageCapabilities && imageReferenceUrls.length < requestImageCapabilities.minReferenceImages) {
      pushWorkspaceNotice("error", t("common.notices.imageModelNeedMinReferences", { min: requestImageCapabilities.minReferenceImages }));
      return false;
    }
    if (requestImageCapabilities && imageReferenceUrls.length > requestImageCapabilities.maxReferenceImages) {
      pushWorkspaceNotice("error", t("common.notices.imageModelMaxReferences", { max: requestImageCapabilities.maxReferenceImages }));
      return false;
    }
    let imageReferencePayloads: string[];
    try {
      imageReferencePayloads = await Promise.all(imageReferenceUrls.map(isRunningHubImageTask ? prepareReferenceMediaUrlForRequest : prepareReferenceImageUrlForRequest));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.referenceImageReadFailed")));
      return false;
    }
    const imagePayloadError = isRunningHubImageTask
      ? getReferenceMediaPayloadError(imageReferencePayloads)
      : getReferenceImagePayloadError(imageReferencePayloads);
    if (imagePayloadError) {
      pushWorkspaceNotice("error", imagePayloadError);
      return false;
    }
    setImageSubmitCount(prev => prev + 1);
    const cinematicPrompt = applyCinematicProfileToPrompt(activePrompt, requestCinematicProfile, "image");
    const generationPrompt = buildPromptWithReferenceMap(cinematicPrompt, activeReferenceImages, imageReferenceUrls);
    const generationRequest: GenerationRequestSnapshot = {
      prompt: generationPrompt,
      model: requestModel,
      aspectRatio: requestAspectRatio,
      imageResolution: requestImageResolution,
      imageQuality: requestImageQuality,
      thinkingLevel: requestThinkingLevel,
      ...(hasActiveCinematicProfile(requestCinematicProfile, "image") ? { cinematicProfile: requestCinematicProfile } : {}),
      runningHubAccessPassword: overrides.runningHubAccessPassword,
      runningHubNodeInfoList: overrides.runningHubNodeInfoList,
      ...(requestRunningHubYouchuan ? { runningHubYouchuan: requestRunningHubYouchuan } : {}),
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
    if (!await saveTaskOrWarn(task, generationTaskStorage.save, pushWorkspaceNotice, t)) {
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
          referenceMedia: activeReferenceImages.map((reference, index) => ({
            dataUri: imageReferencePayloads[index] ?? "",
            type: getMediaReferenceType(reference),
            ...(reference.role ? { role: reference.role } : {}),
          })),
        }),
      });

      if (res.ok) {
        const { operationName, imageUrl, imageUrls } = await readImageGenerationPayload(res);
        if (operationName) {
          const processingTask = await updateTaskOrWarn(taskId, {
            operationName,
            status: "processing",
            progress: 15,
            canCancelRemote: operationName.startsWith("12ai:video:"),
          }, generationTaskStorage.update, pushWorkspaceNotice, t);
          if (processingTask) recordGenerationTask(processingTask);
          return true;
        }

        const outputUrls = imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [];
        if (outputUrls.length === 0) {
          throw new Error(t("common.notices.imageInterfaceMissingResult"));
        }
        const savedCompletedItems: StorageItem[] = [];
        for (const [index, outputUrl] of outputUrls.entries()) {
          const completedAssetId = makeClientId(`img_${index}`);
          const completedItem = buildStorageItem(
            {
              id: completedAssetId,
              type: "image",
              url: outputUrl,
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
          const savedCompletedItem = await saveItemOrWarn(completedItem, saveAssetWithPreview, pushWorkspaceNotice, t);
          if (savedCompletedItem) savedCompletedItems.push(savedCompletedItem);
        }

        if (savedCompletedItems.length !== outputUrls.length) {
          for (const item of savedCompletedItems) await deleteItemOrWarn(item.id, deleteAssetById, pushWorkspaceNotice, t);
          const failedTask = await updateTaskOrWarn(taskId, {
            status: "failed",
            progress: 100,
            errorMessage: t("common.notices.imageResultAssetSaveFailed"),
          }, generationTaskStorage.update, pushWorkspaceNotice, t);
          if (failedTask) recordGenerationTask(failedTask);
          return true;
        }
        const resultAssetIds = savedCompletedItems.map(item => item.id);
        const completeTask = await updateTaskOrWarn(taskId, {
          activeResultAssetId: resultAssetIds[0],
          resultAssetIds,
          status: "complete",
          progress: 100,
        }, generationTaskStorage.update, pushWorkspaceNotice, t);
        if (completeTask) recordGenerationTask(completeTask);
        setItems(prev => [...savedCompletedItems, ...prev]);
      } else {
        throw new Error(await readFetchError(res, t("common.notices.imageGenRequestFailed")));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(taskId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(taskId);
        const canceledTask = await cancelTaskOrWarn(taskId, generationTaskStorage.cancel, pushWorkspaceNotice, t);
        if (canceledTask) recordGenerationTask(canceledTask);
        return true;
      }
      console.error(error);
      const message = toErrorMessage(error, t("common.notices.imageGenFailed"));
      const failedTask = await updateTaskOrWarn(taskId, {
        status: "failed",
        progress: 100,
        errorMessage: message,
      }, generationTaskStorage.update, pushWorkspaceNotice, t);
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
      activeReferenceImages = await resolveOriginalReferences(selectedReferenceImages, t);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.referenceMediaReadFailed")));
      return false;
    }
    const activeReferenceImage = activeReferenceImages[0]?.url ?? selectedReferenceImage;
    const requestModel = overrides.model ?? selectedVideoModel;
    const requestSize = overrides.size ?? activeVideoSize;
    const requestVideoDuration = overrides.videoDuration ?? activeVideoDuration;
    const requestVideoPreset = overrides.videoPreset ?? activeVideoPreset;
    const requestVideoReferenceMode = overrides.videoReferenceMode ?? activeVideoReferenceMode;
    const requestVideoResolution = overrides.videoResolution ?? activeVideoResolution;
    const isRunningHubVideoTask = isRunningHubTaskTarget(requestModel, "video");
    const requestVideoCapabilities = isRunningHubVideoTask ? null : getVideoModelCapabilities(requestModel);
    const requestCinematicProfile = overrides.cinematicProfile ?? cinematicProfile;

    if (!activePrompt.trim() && overrides.allowEmptyPrompt !== true && runningHubAppPresetRequiresPrompt(requestModel)) return false;
    const videoReferences = isRunningHubVideoTask
      ? activeReferenceImages.length > 0
        ? activeReferenceImages
        : activeReferenceImage
          ? [{ id: "legacy-reference", url: activeReferenceImage }]
          : []
      : selectVideoReferencesForMode(
        activeReferenceImages,
        activeReferenceImage,
        requestVideoReferenceMode,
        requestVideoCapabilities?.maxReferenceImages ?? 0,
      );
    const unsupportedReference = requestVideoCapabilities
      ? videoReferences.find(reference => !requestVideoCapabilities.referenceMediaTypes.includes(getMediaReferenceType(reference)))
      : undefined;
    if (unsupportedReference) {
      pushWorkspaceNotice("error", t("common.notices.videoGenNotSupportMediaInput", { type: mediaReferenceLabel(getMediaReferenceType(unsupportedReference)) }));
      return false;
    }
    const videoReferenceUrls = videoReferences.map(reference => reference.url);
    let videoReferencePayloads: string[];
    try {
      videoReferencePayloads = await Promise.all(videoReferenceUrls.map(prepareReferenceMediaUrlForRequest));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.referenceMediaReadFailed")));
      return false;
    }
    const videoPayloadError = getReferenceMediaPayloadError(videoReferencePayloads);
    if (videoPayloadError) {
      pushWorkspaceNotice("error", videoPayloadError);
      return false;
    }
    setVideoSubmitCount(prev => prev + 1);
    const cinematicPrompt = applyCinematicProfileToPrompt(activePrompt, requestCinematicProfile, "video");
    const generationPrompt = buildPromptWithReferenceMap(cinematicPrompt, activeReferenceImages, videoReferenceUrls);
    const generationRequest: GenerationRequestSnapshot = {
      prompt: generationPrompt,
      model: requestModel,
      aspectRatio: requestSize,
      videoDurationSeconds: requestVideoDuration,
      videoPreset: requestVideoPreset,
      videoReferenceMode: requestVideoReferenceMode === "none" ? undefined : requestVideoReferenceMode,
      videoResolution: requestVideoResolution,
      ...(hasActiveCinematicProfile(requestCinematicProfile, "video") ? { cinematicProfile: requestCinematicProfile } : {}),
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
    if (!await saveTaskOrWarn(task, generationTaskStorage.save, pushWorkspaceNotice, t)) {
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
          referenceMedia: videoReferences.map((reference, index) => ({
            dataUri: videoReferencePayloads[index] ?? "",
            type: getMediaReferenceType(reference),
            ...(reference.role ? { role: reference.role } : {}),
          })),
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
          throw new Error(t("common.notices.videoInterfaceMissingOperation"));
        }

        const processingTask = await updateTaskOrWarn(taskId, {
          operationName: activeOperationName,
          status: "processing",
          progress: 15,
          canCancelRemote: activeOperationName.startsWith("12ai:video:"),
        }, generationTaskStorage.update, pushWorkspaceNotice, t);
        if (processingTask) recordGenerationTask(processingTask);
      } else {
        throw new Error(await readFetchError(res, t("common.notices.videoGenRequestFailed")));
      }
    } catch (error) {
      if (locallyCanceledItemIdsRef.current.has(taskId) || isAbortError(error)) {
        locallyCanceledItemIdsRef.current.delete(taskId);
        const canceledTask = await cancelTaskOrWarn(taskId, generationTaskStorage.cancel, pushWorkspaceNotice, t);
        if (canceledTask) recordGenerationTask(canceledTask);
        return true;
      }
      console.error(error);
      const message = toErrorMessage(error, t("common.notices.videoGenFailed"));
      const failedTask = await updateTaskOrWarn(taskId, {
        status: "failed",
        progress: 100,
        errorMessage: message,
      }, generationTaskStorage.update, pushWorkspaceNotice, t);
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
    const requestModel = overrides.model?.trim();

    if (!requestModel) {
      pushWorkspaceNotice("error", t("common.notices.audioGenNeedModel"));
      return false;
    }
    const isRunningHubWorkflowAudio = isRunningHubWorkflowAudioTarget(requestModel, overrides.runningHubNodeInfoList);
    const audioCapabilities = isRunningHubWorkflowAudio ? null : getAudioModelCapabilities(requestModel);
    const audioMode = overrides.audioMode ?? audioCapabilities?.defaultMode;
    if (!activePrompt.trim() && audioMode !== undefined && audioOperationRequiresTextInput(audioMode) && overrides.allowEmptyPrompt !== true) return false;

    const audioSubmissionKey = JSON.stringify({
      allowEmptyPrompt: overrides.allowEmptyPrompt === true,
      asrLanguage: overrides.asrLanguage,
      audioFormat: overrides.audioFormat,
      audioMode,
      audioStylePrompt: overrides.audioStylePrompt,
      boardId: resolveScopeBoardId(overrides),
      boardNodeId: overrides.boardNodeId,
      boardResultStackKey: overrides.boardResultStackKey,
      model: requestModel,
      optimizeTextPreview: overrides.optimizeTextPreview,
      prompt: activePrompt,
      referenceImage: selectedReferenceImage,
      referenceImages: selectedReferenceImages.map(({ id, role, url }) => ({ id, role, url })),
      runningHubAccessPassword: overrides.runningHubAccessPassword,
      runningHubNodeInfoList: overrides.runningHubNodeInfoList,
      voiceCloneConsentAccepted: overrides.voiceCloneConsentAccepted === true,
      voiceProfileId: overrides.voiceProfileId,
    });
    const audioSubmissionKeysInFlight = audioSubmissionKeysInFlightRef.current;
    if (audioSubmissionKeysInFlight.has(audioSubmissionKey)) return true;
    audioSubmissionKeysInFlight.add(audioSubmissionKey);

    try {
      let activeReferenceImages: ReferenceImageRef[];
      try {
        activeReferenceImages = await resolveOriginalReferences(selectedReferenceImages, t);
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.referenceMediaReadFailed")));
        return false;
      }
      const activeReferenceImage = activeReferenceImages[0]?.url ?? selectedReferenceImage;
      let profileStylePrompt: string | undefined;
      let profileVoice: string | undefined;
      let profileReferences: ReferenceImageRef[] = [];
      let profileCloneConsentAccepted = false;
      if (overrides.voiceProfileId) {
        try {
          const profile = await getVoiceProfile(overrides.voiceProfileId);
          if (!profile) throw new Error(t("common.notices.voiceProfileNotFound"));
          if (!audioMode || !isVoiceProfileUsableForAudioModel(profile, requestModel, audioMode)) {
            throw new Error(t("common.notices.voiceProfileNotUsableForModel"));
          }
          profileStylePrompt = profile.designPrompt;
          profileVoice = profile.providerVoiceId;
          profileCloneConsentAccepted = profile.source === "cloned" && Boolean(profile.consentAcceptedAt);
          profileReferences = await readVoiceProfileReferences(profile.referenceAudioAssetIds, t);
        } catch (error) {
          pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.voiceProfileReadFailed")));
          return false;
        }
      }
      if (audioMode === "voice_clone" && overrides.voiceCloneConsentAccepted !== true && !profileCloneConsentAccepted) {
        pushWorkspaceNotice("error", t("common.notices.voiceCloneNeedsConsent"));
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
        pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.referenceMediaReadFailed")));
        return false;
      }
      const audioPayloadError = getReferenceMediaPayloadError(audioReferencePayloads);
      if (audioPayloadError) {
        pushWorkspaceNotice("error", audioPayloadError);
        return false;
      }
      const audioReferenceTypes = audioReferences.map(reference => getMediaReferenceType(reference) ?? "image");
      if (audioCapabilities && audioReferenceTypes.some(type => !audioCapabilities.referenceMediaTypes.includes(type))) {
        pushWorkspaceNotice("error", t("common.notices.allReferenceMediaParseFailed"));
        return false;
      }
      if (audioCapabilities && audioReferences.length < audioCapabilities.minReferenceMedia) {
        pushWorkspaceNotice("error", audioOperationMissingReferenceMessage(audioCapabilities, t));
        return false;
      }
      if (audioCapabilities && audioCapabilities.maxReferenceMedia >= 0 && audioReferences.length > audioCapabilities.maxReferenceMedia) {
        pushWorkspaceNotice("error", t("common.notices.audioModelMaxMedia", { max: audioCapabilities.maxReferenceMedia }));
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
        voiceCloneConsentAccepted: overrides.voiceCloneConsentAccepted,
        voiceProfileId: overrides.voiceProfileId,
      };

      const taskId = makeClientId(resultMediaType === "transcript" ? "task_txt" : "task_aud");
      const task = createGenerationTask({
        id: taskId,
        mediaType: resultMediaType,
        prompt: activePrompt.trim() || (resultMediaType === "transcript" ? t("common.notices.audioTranscribeDefault") : activePrompt),
        model: requestModel,
        status: "pending",
        progress: 12,
        createdAt: new Date().toISOString(),
        source: resolveTaskSource(overrides),
        request: generationRequest,
      });
      if (!await saveTaskOrWarn(task, generationTaskStorage.save, pushWorkspaceNotice, t)) {
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
            referenceMedia: audioReferences.map((reference, index) => ({
              dataUri: audioReferencePayloads[index] ?? "",
              type: getMediaReferenceType(reference),
              ...(reference.role ? { role: reference.role } : {}),
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
              throw new Error(t("common.notices.audioTranscriptFormatIncorrect"));
            }
            const completedAssetId = makeClientId("txt");
            const completedItem = buildStorageItem(
              {
                id: completedAssetId,
                type: "transcript",
                url: transcriptToDataUrl(transcript),
                prompt: activePrompt.trim() || transcriptPreview(transcript, 80) || t("common.notices.audioTranscribeDefault"),
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
            const savedCompletedItem = await saveDirectItemOrWarn(completedItem, saveAssetDirect, pushWorkspaceNotice, t);
            if (!savedCompletedItem) {
              const failedTask = await updateTaskOrWarn(taskId, {
                status: "failed",
                progress: 100,
                errorMessage: t("common.notices.imageResultAssetSaveFailed"),
              }, generationTaskStorage.update, pushWorkspaceNotice, t);
              if (failedTask) recordGenerationTask(failedTask);
              return true;
            }
            const completeTask = await updateTaskOrWarn(taskId, {
              activeResultAssetId: completedAssetId,
              resultAssetIds: [completedAssetId],
              status: "complete",
              progress: 100,
            }, generationTaskStorage.update, pushWorkspaceNotice, t);
            if (completeTask) recordGenerationTask(completeTask);
            setItems(prev => [savedCompletedItem, ...prev]);
            pushWorkspaceNotice("success", t("common.notices.audioTranscribeComplete"));
            return true;
          }
          const audioBase64 = getStringField(data, "audioBase64");
          const mimeType = getStringField(data, "mimeType");
          if (!audioBase64 || !mimeType) {
            throw new Error(t("common.notices.audioFormatIncorrect"));
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
          const savedCompletedItem = await saveDirectItemOrWarn(completedItem, saveAssetDirect, pushWorkspaceNotice, t);
          if (!savedCompletedItem) {
            const failedTask = await updateTaskOrWarn(taskId, {
              status: "failed",
              progress: 100,
              errorMessage: t("common.notices.imageResultAssetSaveFailed"),
            }, generationTaskStorage.update, pushWorkspaceNotice, t);
            if (failedTask) recordGenerationTask(failedTask);
            return true;
          }
          const completeTask = await updateTaskOrWarn(taskId, {
            activeResultAssetId: completedAssetId,
            resultAssetIds: [completedAssetId],
            status: "complete",
            progress: 100,
          }, generationTaskStorage.update, pushWorkspaceNotice, t);
          if (completeTask) recordGenerationTask(completeTask);
          setItems(prev => [savedCompletedItem, ...prev]);
          pushWorkspaceNotice("success", t("common.notices.audioGenComplete"));
          return true;
        }
        const activeOperationName = getStringField(data, "operationName");
        if (!activeOperationName) {
          throw new Error(t("common.notices.audioInterfaceMissingOperation"));
        }

        const processingTask = await updateTaskOrWarn(taskId, {
          operationName: activeOperationName,
          status: "processing",
          progress: 15,
          canCancelRemote: activeOperationName.startsWith("12ai:video:"),
        }, generationTaskStorage.update, pushWorkspaceNotice, t);
        if (processingTask) recordGenerationTask(processingTask);
      } else {
        const parsedModel = parseProviderModel(requestModel, "12ai");
        const providerLabel = getProviderMeta(parsedModel.provider).label;
        const message = await readFetchError(res, t("common.notices.audioGenRequestFailed"));
        throw new Error(t("common.notices.audioModelRequestFailed", { providerLabel, model: requestModel, error: message }));
      }
      } catch (error) {
        if (locallyCanceledItemIdsRef.current.has(taskId) || isAbortError(error)) {
          locallyCanceledItemIdsRef.current.delete(taskId);
          const canceledTask = await cancelTaskOrWarn(taskId, generationTaskStorage.cancel, pushWorkspaceNotice, t);
          if (canceledTask) recordGenerationTask(canceledTask);
          return true;
        }
        console.error(error);
        const message = toErrorMessage(error, t("common.notices.audioGenFailed"));
        const failedTask = await updateTaskOrWarn(taskId, {
          status: "failed",
          progress: 100,
          errorMessage: message,
        }, generationTaskStorage.update, pushWorkspaceNotice, t);
        if (failedTask) recordGenerationTask(failedTask);
        pushWorkspaceNotice("error", message);
        return true;
      } finally {
        delete generationAbortControllersRef.current[taskId];
        setAudioSubmitCount(prev => Math.max(0, prev - 1));
      }
      return true;
    } finally {
      audioSubmissionKeysInFlight.delete(audioSubmissionKey);
    }
  };

  const retryGenerationTask = async (task: GenerationTask) => {
    if (task.status !== "failed") {
      pushWorkspaceNotice("error", t("common.notices.onlyRetryFailedTask"));
      return false;
    }
    if (!task.request) {
      pushWorkspaceNotice("error", t("common.notices.retryTaskMissingRequest"));
      return false;
    }

    const request = task.request;
    const retryReferences = taskRequestReferences(request);
    const allowEmptyPrompt = request.prompt.trim().length === 0;

    if (task.mediaType === "image") {
      return generateManualImage({
        allowEmptyPrompt,
        cinematicProfile: request.cinematicProfile,
        imageQuality: request.imageQuality,
        imageResolution: request.imageResolution,
        isCustomImageResolution: request.imageResolution ? /^\d+x\d+$/.test(request.imageResolution) : false,
        model: request.model,
        prompt: task.prompt,
        referenceImages: retryReferences,
        runningHubNodeInfoList: request.runningHubNodeInfoList,
        runningHubYouchuan: request.runningHubYouchuan,
        size: request.aspectRatio,
        thinkingLevel: request.thinkingLevel,
      });
    }

    if (task.mediaType === "video") {
      return generateManualVideo({
        allowEmptyPrompt,
        cinematicProfile: request.cinematicProfile,
        model: request.model,
        prompt: task.prompt,
        referenceImages: retryReferences,
        runningHubNodeInfoList: request.runningHubNodeInfoList,
        size: request.aspectRatio,
        videoDuration: request.videoDurationSeconds,
        videoPreset: request.videoPreset,
        videoReferenceMode: request.videoReferenceMode,
        videoResolution: request.videoResolution,
      });
    }

    return generateManualAudio({
      allowEmptyPrompt,
      asrLanguage: request.asrLanguage,
      audioFormat: request.audioFormat,
      audioMode: request.audioMode,
      audioStylePrompt: request.audioStylePrompt,
      model: request.model,
      optimizeTextPreview: request.optimizeTextPreview,
      prompt: task.mediaType === "transcript" ? request.prompt : task.prompt,
      referenceImages: retryReferences,
      runningHubNodeInfoList: request.runningHubNodeInfoList,
      voiceCloneConsentAccepted: request.voiceCloneConsentAccepted,
      voiceProfileId: request.voiceProfileId,
    });
  };

  return {
    generateManualAudio,
    generateManualImage,
    generateManualVideo,
    retryGenerationTask,
  };
}
