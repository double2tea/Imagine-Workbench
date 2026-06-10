'use client';

import React, { useCallback, useMemo, useState, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import AgentDock from "@/components/agent/AgentDock";
import CanvasMaskEditor, { type CanvasMaskEditorOutput } from "@/components/CanvasMaskEditor";
import SaveVoiceProfileDialog, { type SaveVoiceProfileDialogInput } from "@/components/audio/SaveVoiceProfileDialog";
import FloatingCompareButton from "@/components/assets/FloatingCompareButton";
import FullscreenPreview from "@/components/assets/FullscreenPreview";
import PanoramaOverlay from "@/components/panorama/PanoramaOverlay";
import CreationModeTabs, { type CreationMode } from "@/components/creation/CreationModeTabs";
import AudioGenerationPanel from "@/components/creation/AudioGenerationPanel";
import CreatorGenerateButton from "@/components/creation/CreatorGenerateButton";
import ImageGenerationPanel from "@/components/creation/ImageGenerationPanel";
import VideoGenerationPanel from "@/components/creation/VideoGenerationPanel";
import AtReferenceDropdown from "@/components/reference/AtReferenceDropdown";
import PromptReferenceDropdown from "@/components/reference/PromptReferenceDropdown";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import SettingsModal from "@/components/settings/SettingsModal";
import AssetGalleryWorkspace from "@/components/workbench/AssetGalleryWorkspace";
import MobileWorkbenchTabs, { type MobileWorkbenchPanel } from "@/components/workbench/MobileWorkbenchTabs";

import WorkspaceHeader from "@/components/workbench/WorkspaceHeader";

import WorkspaceNotices, { type WorkspaceNotice } from "@/components/workbench/WorkspaceNotices";
import {
  buildStorageItem,
  clearAllDB,
  deleteFromDB,
  getGenerationReferenceMedia,
  hydrateAssets,
  listAllAssetMetas,
  mergeStorageItems,
  metaToPlaceholderItem,
  saveToDB,
  type StorageItem,
} from "@/lib/db";
import { useAgentController } from "@/hooks/useAgentController";
import { useAssetActions } from "@/hooks/useAssetActions";
import { useAssetWorkspaceState } from "@/hooks/useAssetWorkspaceState";
import { useClipboardImageImport } from "@/hooks/useClipboardImageImport";
import { useGenerationActions } from "@/hooks/useGenerationActions";
import { useGenerationTaskStore } from "@/hooks/useGenerationTaskStore";
import { useMediaPolling } from "@/hooks/useMediaPolling";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { audioOperationFormatOptions, audioOperationRequiresStylePrompt, audioOperationRequiresTextInput } from "@/lib/audio-operation-rules";
import {
  cancelGenerationTask,
  deleteGenerationTask,
  generationTaskToGalleryItem,
} from "@/lib/generation-tasks";
import {
  IMAGE_REFERENCE_LIMIT,
  removePromptReferenceTokens,
  useReferenceState,
  type AtDropdownTarget,
} from "@/hooks/useReferenceState";
import { useProviderSettings } from "@/hooks/useProviderSettings";
import { useImageEditFeatureModels } from "@/hooks/useImageEditFeatureModels";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  formatProviderModel,
  getAudioModelCapabilities,
  getImageAspectRatioFromResolution,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getVideoModelCapabilities,
  supportsAsyncImageGeneration,
  tryParseProviderModel,
  type AiProvider,
  type AudioOperationMode,
  type ModelOption,
  type VideoReferenceMode,
} from "@/lib/providers/model-catalog";
import { getProviderMeta, type CustomProviderDefinition } from "@/lib/providers/registry";
import { saveClonedVoiceProfileFromAsset } from "@/lib/voice-profiles";
import { getMediaReferenceType, mediaReferenceLabel, mediaReferenceTypeFromMime } from "@/lib/media-references";
import { API_ROUTES } from "@/lib/api/routes";
import {
  REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES,
  compressReferenceImageDataUrl,
  compressReferenceImageFile,
  prepareReferenceImageUrlForRequest,
} from "@/lib/reference-images";
import { selectVideoReferenceTypesForMode } from "@/lib/video-reference-selection";
import {
  cleanupWorkspaceAssets,
  clearLocalStorageGroup,
  createLocalUploadAsset,
  createWorkspaceSafetySnapshot,
  downloadLatestWorkspaceSafetySnapshot,
  exportCompleteWorkspaceBackup,
  importWorkspaceBackup,
  previewWorkspaceBackup,
  repairStaleAssetSourceLinks,
  resetBoardsToDefault,
  type LocalStorageCleanupKind,
  type WorkspaceCleanupKind,
} from "@/lib/data-management";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { readImageGenerationPayload } from "@/lib/client-image-response";
import { CLEAR_WORKSPACE_ASSETS_MESSAGE } from "@/lib/workspace-messages";

type NoticeType = "error" | "info" | "success";
type MaskDestination = "creative" | "agent";
const IMAGE_EDIT_LABELS: Record<ImageEditFeature, string> = {
  redraw: "重绘",
  erase: "擦除",
  outpaint: "扩图",
  cutout: "抠图",
};
const DESKTOP_LAYOUT_QUERY = "(min-width: 1024px)";

function subscribeDesktopLayout(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(DESKTOP_LAYOUT_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getDesktopLayoutSnapshot(): boolean {
  return window.matchMedia(DESKTOP_LAYOUT_QUERY).matches;
}

function getServerDesktopLayoutSnapshot(): boolean {
  return false;
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("文件读取结果不是 Data URL"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function getProviderLabel(provider: AiProvider, customProviders: readonly CustomProviderDefinition[] = []): string {
  return customProviders.find(item => item.key === provider)?.label ?? getProviderMeta(provider).label;
}

function getProviderModelGroups(
  optionsByProvider: Record<AiProvider, ModelOption[]>,
  providerKeys: readonly AiProvider[],
  customProviders: readonly CustomProviderDefinition[],
): Array<{
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}> {
  return [...providerKeys]
    .map(provider => ({
      provider,
      label: getProviderLabel(provider, customProviders),
      options: optionsByProvider[provider] ?? [],
    }))
    .filter(group => group.options.length > 0);
}

function formatStoredModelLabel(value: string, fallbackProvider: AiProvider): string {
  const parsed = tryParseProviderModel(value, fallbackProvider);
  if (!parsed) return value;
  return `${getProviderLabel(parsed.provider)} ${parsed.model}`;
}

function getSelectableStoredImageModel(value: string, fallbackProvider: AiProvider): string {
  const parsed = tryParseProviderModel(value, fallbackProvider);
  if (!parsed) return value;
  return parsed.async ? formatProviderModel(parsed.provider, parsed.model) : value;
}

function modelProviderIsAvailable(
  value: string,
  fallbackProvider: AiProvider,
  providerKeys: readonly AiProvider[],
): boolean {
  const parsed = tryParseProviderModel(value, fallbackProvider);
  const provider = parsed?.provider ?? fallbackProvider;
  return providerKeys.includes(provider);
}

export default function Home() {
  const isDesktopLayout = useSyncExternalStore(
    subscribeDesktopLayout,
    getDesktopLayoutSnapshot,
    getServerDesktopLayoutSnapshot,
  );

  // Database State
  const [items, setItems] = useState<StorageItem[]>([]);
  const { generationTasks, setGenerationTasks } = useGenerationTaskStore();

  // Traditional Form States
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_IMAGE_MODEL);
  const [selectedVideoModel, setSelectedVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [selectedAudioModel, setSelectedAudioModel] = useState(DEFAULT_AUDIO_MODEL);
  const [selectedAudioMode, setSelectedAudioMode] = useState<AudioOperationMode>("tts");
  const [audioFormat, setAudioFormat] = useState("wav");
  const [audioStylePrompt, setAudioStylePrompt] = useState("");
  const [asrLanguage, setAsrLanguage] = useState<"auto" | "zh" | "en">("auto");
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState("");
  const [voiceCloneConsentAccepted, setVoiceCloneConsentAccepted] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageResolution, setImageResolution] = useState("1K");
  const [imageQuality, setImageQuality] = useState("auto");
  const [imageThinkingLevel, setImageThinkingLevel] = useState("minimal");
  const [imageBackgroundGeneration, setImageBackgroundGeneration] = useState(false);
  const [videoDuration, setVideoDuration] = useState("10");
  const [videoPreset, setVideoPreset] = useState("normal");
  const [selectedVideoReferenceMode, setSelectedVideoReferenceMode] = useState<VideoReferenceMode>("reference");
  const [videoResolution, setVideoResolution] = useState("720p");
  const [customImageSize, setCustomImageSize] = useState("2560x1440");
  const [traditionalSubTab, setTraditionalSubTab] = useState<CreationMode>("image");
  const [isAgentDockOpen, setIsAgentDockOpen] = useState(false);
  const [isAgentPortalReady, setIsAgentPortalReady] = useState(false);
  const [isAgentDockOverContent, setIsAgentDockOverContent] = useState(false);
  const [mobileWorkbenchPanel, setMobileWorkbenchPanel] = useState<MobileWorkbenchPanel>("create");
  const workbenchShellRef = useRef<HTMLDivElement>(null);
  const [agentPortalHost, setAgentPortalHost] = useState<HTMLElement | null>(null);
  const confirmAction = useConfirm();

  const workspaceGalleryItems = useMemo(() => {
    const taskItems = generationTasks
      .filter(task => !task.source.boardId)
      .map(generationTaskToGalleryItem)
      .filter((item): item is StorageItem => item !== null);
    if (taskItems.length === 0) return items;
    const taskItemIds = new Set(taskItems.map(item => item.id));
    return mergeStorageItems(
      items.filter(item => !taskItemIds.has(item.id)),
      taskItems,
    );
  }, [generationTasks, items]);

  const {
    assetDateEnd,
    assetDatePreset,
    assetDateStart,
    assetModelFilter,
    assetStats,
    assetStatusFilter,
    cancelingItemIdSet,
    compareItemIdSet,
    compareItemIds,
    compareItems,
    compareSliderPos,
    compareViewType,
    filterType,
    filteredItems,
    isCompareMode,
    searchQuery,
    searchableReferenceImages,
    selectedItemIdSet,
    selectedItemIds,
    setAssetDateEnd,
    setAssetDatePreset,
    setAssetDateStart,
    setAssetModelFilter,
    setAssetStatusFilter,
    setCancelingItemIds,
    setCompareItemIds,
    setCompareSliderPos,
    setCompareViewType,
    setFilterType,
    setIsCompareMode,
    setSearchQuery,
    setSelectedItemIds,
  } = useAssetWorkspaceState(workspaceGalleryItems);

  // Agent State
  const [agentInput, setAgentInput] = useState("");

  const [showSettings, setShowSettings] = useState(false);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [imageSubmitCount, setImageSubmitCount] = useState(0);
  const [videoSubmitCount, setVideoSubmitCount] = useState(0);
  const [audioSubmitCount, setAudioSubmitCount] = useState(0);
  const [workspaceNotices, setWorkspaceNotices] = useState<WorkspaceNotice[]>([]);

  // Interactive Mask Editor State
  const [isMaskOpen, setIsMaskOpen] = useState(false);
  const [maskTargetUrl, setMaskTargetUrl] = useState("");
  const [maskTargetId, setMaskTargetId] = useState("");
  const [maskDestination, setMaskDestination] = useState<MaskDestination>("creative");
  const [maskEditOperation, setMaskEditOperation] = useState<ImageEditFeature | undefined>();
  const [maskEditSourceItem, setMaskEditSourceItem] = useState<StorageItem | null>(null);

  // Fullscreen Preview Overlay State
  const [fullscreenItem, setFullscreenItem] = useState<StorageItem | null>(null);
  const [panoramaItem, setPanoramaItem] = useState<StorageItem | null>(null);
  const [voiceProfileSourceItem, setVoiceProfileSourceItem] = useState<StorageItem | null>(null);

  // References
  const agentDockRef = useRef<HTMLElement | null>(null);
  const dockOverlapFrameRef = useRef<number | null>(null);
  const pollingFailuresRef = useRef<Record<string, number>>({});
  const generationAbortControllersRef = useRef<Record<string, AbortController>>({});
  const locallyCanceledItemIdsRef = useRef<Set<string>>(new Set());
  const originalAssetPromoteIdsRef = useRef<Set<string>>(new Set());
  const workspaceNoticeSequenceRef = useRef(0);
  const isAgentDockSuppressed = showSettings || isMaskOpen || fullscreenItem !== null || panoramaItem !== null || voiceProfileSourceItem !== null;

  const dismissWorkspaceNotice = useCallback((id: string) => {
    setWorkspaceNotices(prev => prev.filter(notice => notice.id !== id));
  }, [setWorkspaceNotices]);

  const pushWorkspaceNotice = useCallback((type: NoticeType, message: string) => {
    workspaceNoticeSequenceRef.current += 1;
    const id = `${makeClientId("notice")}_${workspaceNoticeSequenceRef.current}`;
    setWorkspaceNotices(prev => [{ id, type, message }, ...prev].slice(0, 4));
  }, [setWorkspaceNotices]);

  const resolveOriginalStorageItem = useCallback(async (item: StorageItem): Promise<StorageItem> => {
    const storedItem = items.find(entry => entry.id === item.id) ?? item;
    const originalUrl = await resolveAssetOriginalUrl(storedItem);
    if (!originalUrl.trim()) {
      throw new Error("找不到原始媒体");
    }
    return { ...storedItem, url: originalUrl };
  }, [items]);

  const openOriginalItem = useCallback((
    item: StorageItem,
    action: (originalItem: StorageItem) => void,
    errorMessage: string,
  ): void => {
    void resolveOriginalStorageItem(item).then(
      action,
      error => pushWorkspaceNotice("error", toErrorMessage(error, errorMessage)),
    );
  }, [pushWorkspaceNotice, resolveOriginalStorageItem]);

  const handleOpenFullscreen = useCallback((item: StorageItem | null): void => {
    if (!item) {
      setFullscreenItem(null);
      return;
    }
    openOriginalItem(item, setFullscreenItem, "原始媒体读取失败");
  }, [openOriginalItem]);

  const handleOpenPanorama = useCallback((item: StorageItem): void => {
    openOriginalItem(item, setPanoramaItem, "原始图片读取失败");
  }, [openOriginalItem]);

  const handleSaveVoiceProfileSource = useCallback((item: StorageItem): void => {
    openOriginalItem(item, setVoiceProfileSourceItem, "原始音频读取失败");
  }, [openOriginalItem]);

  const promoteItemToOriginal = useCallback((item: StorageItem): void => {
    if (item.status !== "complete") return;
    if (originalAssetPromoteIdsRef.current.has(item.id)) return;
    originalAssetPromoteIdsRef.current.add(item.id);
    void resolveOriginalStorageItem(item).then(
      originalItem => {
        originalAssetPromoteIdsRef.current.delete(item.id);
        setItems(prev => prev.map(current =>
          current.id === originalItem.id && current.url !== originalItem.url
            ? { ...current, url: originalItem.url }
            : current,
        ));
      },
      error => {
        originalAssetPromoteIdsRef.current.delete(item.id);
        console.error("Original asset promotion failed:", error);
      },
    );
  }, [resolveOriginalStorageItem, setItems]);

  const {
    addCustomProvider,
    addFetchedModels,
    addManualModels,
    audioModelOptions,
    buildProviderHeaders,
    chatModelOptions,
    clearProviderCredentials,
    customProviders,
    deleteCustomProvider,
    handleSaveCredential,
    handleSelectChatModel,
    handleSelectProvider,
    fetchedModelOptions,
    imageModelOptions,
    isLoadingModels,
    modelListMessage,
    providerCredentials,
    providerKeys,
    providerTest,
    refreshProviderModels,
    selectedChatModel,
    selectedProvider,
    testProviderConnection,
    videoModelOptions,
  } = useProviderSettings({ pushWorkspaceNotice });

  useEffect(() => {
    if (!modelProviderIsAvailable(selectedModel, selectedProvider, providerKeys)) {
      setSelectedModel(DEFAULT_IMAGE_MODEL);
    }
    if (!modelProviderIsAvailable(selectedVideoModel, selectedProvider, providerKeys)) {
      setSelectedVideoModel(DEFAULT_VIDEO_MODEL);
    }
    if (!modelProviderIsAvailable(selectedAudioModel, selectedProvider, providerKeys)) {
      setSelectedAudioModel(DEFAULT_AUDIO_MODEL);
    }
  }, [providerKeys, selectedAudioModel, selectedModel, selectedProvider, selectedVideoModel]);

  const handleSaveVoiceProfileFromAsset = useCallback(async (input: SaveVoiceProfileDialogInput): Promise<void> => {
    if (!voiceProfileSourceItem) return;
    await saveClonedVoiceProfileFromAsset(voiceProfileSourceItem, {
      ...input,
      fallbackProvider: selectedProvider,
    });
    pushWorkspaceNotice("success", "已保存克隆音色");
  }, [pushWorkspaceNotice, selectedProvider, voiceProfileSourceItem]);

  const imageCapabilities = getImageModelCapabilities(selectedModel);
  const audioCapabilities = getAudioModelCapabilities(selectedAudioModel);
  const customImageAspectRatio = imageResolution === "custom"
    ? getImageAspectRatioFromResolution(customImageSize.trim())
    : null;
  const activeImageAspectRatio = customImageAspectRatio ?? aspectRatio;
  const imageResolutionOptions = getImageResolutionOptions(selectedModel, activeImageAspectRatio);
  const videoCapabilities = getVideoModelCapabilities(selectedVideoModel);
  const isSubmittingImage = imageSubmitCount > 0;
  const isSubmittingVideo = videoSubmitCount > 0;
  const isSubmittingAudio = audioSubmitCount > 0;
  const activeAudioMode = audioCapabilities.modes.includes(selectedAudioMode)
    ? selectedAudioMode
    : audioCapabilities.defaultMode;
  const audioFormatOptions = audioOperationFormatOptions(audioCapabilities);
  const activeAudioFormat = audioFormatOptions.some(option => option.value === audioFormat)
    ? audioFormat
    : audioFormatOptions[0]?.value ?? "";
  const canUseAsyncImageGeneration = supportsAsyncImageGeneration(selectedModel);
  const activeImageResolution = imageResolution === "custom" ? customImageSize.trim() : imageResolution;
  const activeImageQuality = imageCapabilities.qualities.some(option => option.value === imageQuality) ? imageQuality : undefined;
  const selectedImageProviderModel = tryParseProviderModel(selectedModel, selectedProvider) ?? {
    provider: selectedProvider,
    model: selectedModel,
    async: false,
  };
  const activeVideoSize = videoCapabilities.sizes.some(option => option.value === aspectRatio) ? aspectRatio : "auto";
  const activeVideoResolution = videoCapabilities.resolutions.some(option => option.value === videoResolution)
    ? videoResolution
    : undefined;
  const activeVideoDuration = videoCapabilities.durations.some(option => option.value === videoDuration)
    ? videoDuration
    : undefined;
  const activeVideoPreset = videoCapabilities.presets.some(option => option.value === videoPreset)
    ? videoPreset
    : undefined;
  const activeVideoReferenceMode = videoCapabilities.referenceModes.includes(selectedVideoReferenceMode)
    ? selectedVideoReferenceMode
    : videoCapabilities.referenceMode;
  const videoReferenceLimit = videoCapabilities.maxReferenceImages;
  const isFirstLastVideoMode = activeVideoReferenceMode === "firstLast";
  const videoReferenceLabel = isFirstLastVideoMode ? "首帧 / 尾帧" : "视频参考图";
  const videoPromptPlaceholder = isFirstLastVideoMode
    ? "描述首帧到尾帧之间的运动、转场与镜头变化... 输入 @ 可引用作品"
    : "描述场景的运动与镜头动作... 输入 @ 可引用作品";
  const videoReferenceHelp = isFirstLastVideoMode
    ? "第 1 张为首帧，第 2 张为尾帧"
    : "参考图用于主体、风格或场景引导，不作为首尾帧";
  const videoClearReferenceLabel = isFirstLastVideoMode ? "清空关键帧" : "清空参考图";
  const {
    agentReferenceId,
    agentReferences,
    agentReferenceUrl,
    atDropdown,
    handleImageUpload,
    handlePromptDropAsset,
    handleReferenceUpload,
    handleReferenceDropAsset,
    handleReferenceDropFiles,
    handleSelectAtItem,
    handleSelectPromptReference,
    handleTextareaChange,
    referenceImage,
    referenceImages,
    removeReferenceImage,
    setAgentReferenceId,
    setAgentReferences,
    setAgentReferenceUrl,
    setReferenceImage,
    setReferenceImages,
    toggleReferenceRole,
  } = useReferenceState({
    agentInput,
    audioReferenceLimit: audioCapabilities.maxReferenceMedia,
    audioReferenceMediaTypes: audioCapabilities.referenceMediaTypes,
    imageReferenceLimit: imageCapabilities.maxReferenceImages,
    imageReferenceMediaTypes: imageCapabilities.referenceMediaTypes,
    prompt,
    videoReferenceLimit,
    videoReferenceMediaTypes: videoCapabilities.referenceMediaTypes,
    videoReferenceMode: activeVideoReferenceMode,
    pushWorkspaceNotice,
    setAgentInput,
    setPrompt,
  });

  const applyAsVideoReference = useCallback((asset: StorageItem): void => {
    openOriginalItem(asset, originalAsset => {
      setReferenceImage(originalAsset.url);
      setReferenceImages([{ id: originalAsset.id, url: originalAsset.url, role: "start" }]);
      setTraditionalSubTab("video");
    }, "原始媒体读取失败");
  }, [openOriginalItem, setReferenceImage, setReferenceImages]);

  const handleUseAgentReference = useCallback((asset: StorageItem): void => {
    openOriginalItem(asset, originalAsset => {
      setAgentReferenceId(originalAsset.id);
      setAgentReferenceUrl(originalAsset.url);
      setAgentReferences([{ id: originalAsset.id, url: originalAsset.url }]);
      setIsAgentDockOpen(true);
    }, "原始媒体读取失败");
  }, [openOriginalItem, setAgentReferenceId, setAgentReferenceUrl, setAgentReferences]);
  const audioReferenceImages = referenceImages.filter(reference =>
    audioCapabilities.referenceMediaTypes.includes(getMediaReferenceType(reference)),
  );
  const audioTextInputRequired = audioOperationRequiresTextInput(activeAudioMode);
  const audioStylePromptRequired = audioOperationRequiresStylePrompt(activeAudioMode);
  const activeAudioReferenceCount = audioReferenceImages.length;
  const selectedVoiceProfileProvidesCloneReference = activeAudioMode === "voice_clone" && selectedVoiceProfileId.trim().length > 0;
  const hasRequiredAudioReferences = activeAudioReferenceCount >= audioCapabilities.minReferenceMedia || selectedVoiceProfileProvidesCloneReference;
  const needsManualVoiceCloneConsent = activeAudioMode === "voice_clone" && !selectedVoiceProfileProvidesCloneReference;
  const isCreatorGenerateDisabled =
    traditionalSubTab === "audio"
      ? (audioTextInputRequired && !prompt.trim()) || (audioStylePromptRequired && !audioStylePrompt.trim()) || !hasRequiredAudioReferences || (needsManualVoiceCloneConsent && !voiceCloneConsentAccepted)
      : !prompt.trim();

  const canUseBackgroundImageGeneration =
    canUseAsyncImageGeneration &&
    selectedImageProviderModel.provider === "12ai" &&
    (selectedImageProviderModel.model !== "gpt-image-2" || referenceImages.length === 0);
  const shouldUseAsyncImageGeneration = (imageBackgroundGeneration || isSubmittingImage) && canUseBackgroundImageGeneration;
  const activeImageModel = shouldUseAsyncImageGeneration && selectedImageProviderModel.provider === "12ai"
    ? `12ai-async:${selectedImageProviderModel.model}`
    : selectedModel;
  const videoPriceReferenceTypes = selectVideoReferenceTypesForMode(
    referenceImages,
    referenceImage,
    activeVideoReferenceMode,
    videoCapabilities.maxReferenceImages,
  );

  useClipboardImageImport({
    agentReferenceCount: agentReferences.length,
    imageReferenceLimit: imageCapabilities.maxReferenceImages,
    pushWorkspaceNotice,
    referenceImageCount: referenceImages.length,
    setAgentReferenceId,
    setAgentReferenceUrl,
    setAgentReferences,
    setReferenceImage,
    setReferenceImages,
  });

  const handleAgentReferenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (agentReferences.length >= IMAGE_REFERENCE_LIMIT) {
      pushWorkspaceNotice("error", `Agent 引用已达上限：最多 ${IMAGE_REFERENCE_LIMIT} 个`);
      return;
    }

    const mediaType = mediaReferenceTypeFromMime(file.type);
    if (!mediaType) {
      pushWorkspaceNotice("error", "Agent 只支持上传图片、视频或音频引用");
      return;
    }
    if (mediaType !== "image" && file.size > Math.floor(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES * 0.75)) {
      pushWorkspaceNotice("error", `${mediaReferenceLabel(mediaType)}引用文件过大，请压缩后重试`);
      return;
    }

    try {
      const dataUrl = mediaType === "image" ? await compressReferenceImageFile(file) : await readFileAsDataUrl(file);
      const newReferenceId = makeClientId("agent_upload");
      setAgentReferenceId(newReferenceId);
      setAgentReferenceUrl(dataUrl);
      setAgentReferences(prev => {
        if (prev.length >= IMAGE_REFERENCE_LIMIT) return prev;
        return [...prev, { id: newReferenceId, type: mediaType, url: dataUrl }];
      });
      pushWorkspaceNotice("success", `已上传 Agent ${mediaReferenceLabel(mediaType)}引用（${agentReferences.length + 1}/${IMAGE_REFERENCE_LIMIT}）`);
    } catch (error) {
      console.error(error);
      pushWorkspaceNotice("error", toErrorMessage(error, "Agent 引用读取失败，请换一个文件"));
    }
  };

  useMediaPolling({
    buildProviderHeaders,
    generationTasks,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    setGenerationTasks,
    setItems,
  });
  const {
    generateManualAudio,
    generateManualImage,
    generateManualVideo,
  } = useGenerationActions({
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
    isCustomImageResolution: imageResolution === "custom",
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
    videoReferenceLimit,
    videoReferenceMode: activeVideoReferenceMode,
  });

  const generateActiveAudio = () => {
    if (needsManualVoiceCloneConsent && !voiceCloneConsentAccepted) {
      pushWorkspaceNotice("error", "音色克隆需要先确认参考音频授权");
      return;
    }
    if (audioStylePromptRequired && !audioStylePrompt.trim()) {
      pushWorkspaceNotice("error", "音色设计需要填写音色描述");
      return;
    }
    void generateManualAudio({
      audioFormat: activeAudioFormat || undefined,
      audioMode: activeAudioMode,
      audioStylePrompt: audioStylePrompt.trim() || undefined,
      asrLanguage,
      allowEmptyPrompt: !audioTextInputRequired,
      model: selectedAudioModel,
      referenceImage: audioReferenceImages[0]?.url ?? null,
      referenceImages: audioReferenceImages,
      voiceCloneConsentAccepted: selectedVoiceProfileProvidesCloneReference ? true : voiceCloneConsentAccepted,
      voiceProfileId: selectedVoiceProfileId || undefined,
    });
  };
  const {
    cancelProcessingItem,
    exportMetadataJson,
    handleBatchDownloadZip,
    handleCaptureVideoFrame,
    handleClearSelection,
    handleDownloadItem,
    handleSavePanoramaScreenshots,
    retryFailedItem,
    toggleCompare,
    toggleSelectItem,
  } = useAssetActions({
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
  });

  const cancelGalleryItem = useCallback(async (item: StorageItem) => {
    const task = generationTasks.find(entry => entry.id === item.id);
    if (!task) {
      await cancelProcessingItem(item);
      return;
    }
    const confirmText = task.canCancelRemote
      ? "确定要取消这个生成任务吗？"
      : "确定要本地取消这个任务吗？远端生成可能仍会继续。";
    if (!(await confirmAction({ message: confirmText, tone: "danger", confirmLabel: "取消任务" }))) return;

    setCancelingItemIds(prev => [...prev, task.id]);
    try {
      const controller = generationAbortControllersRef.current[task.id];
      if (controller) {
        locallyCanceledItemIdsRef.current.add(task.id);
        controller.abort();
      }
      if (!task.canCancelRemote) {
        locallyCanceledItemIdsRef.current.add(task.id);
      }
      if (task.canCancelRemote && task.operationName) {
        const res = await fetch(API_ROUTES.media.cancel, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildProviderHeaders(task.operationName) },
          body: JSON.stringify({ operationName: task.operationName }),
        });

        if (!res.ok) {
          throw new Error(await readFetchError(res, "任务取消失败"));
        }
      }

      const canceledTask = await cancelGenerationTask(task.id);
      setGenerationTasks(prev => prev.map(entry => entry.id === canceledTask.id ? canceledTask : entry));
      delete pollingFailuresRef.current[task.id];
      pushWorkspaceNotice("success", task.canCancelRemote ? "生成任务已取消" : "任务已从本地取消");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "任务取消失败"));
    } finally {
      setCancelingItemIds(prev => prev.filter(id => id !== task.id));
    }
  }, [
    buildProviderHeaders,
    cancelProcessingItem,
    confirmAction,
    generationTasks,
    pushWorkspaceNotice,
    setCancelingItemIds,
    setGenerationTasks,
  ]);

  const deleteGalleryRecords = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    const taskIds = new Set(generationTasks.filter(task => idSet.has(task.id)).map(task => task.id));
    const assetIds = ids.filter(id => !taskIds.has(id));

    for (const task of generationTasks) {
      if (!idSet.has(task.id)) continue;
      if (task.status === "pending" || task.status === "processing") {
        const controller = generationAbortControllersRef.current[task.id];
        if (controller) {
          locallyCanceledItemIdsRef.current.add(task.id);
          controller.abort();
        }
        await cancelGenerationTask(task.id);
      } else {
        await deleteGenerationTask(task.id);
      }
      delete pollingFailuresRef.current[task.id];
    }
    for (const id of assetIds) {
      await deleteFromDB(id);
    }

    setGenerationTasks(prev => prev.filter(task => !taskIds.has(task.id)));
    setItems(prev => prev.filter(item => !assetIds.includes(item.id)));
    setSelectedItemIds(prev => prev.filter(id => !idSet.has(id)));
    setCompareItemIds(prev => prev.filter(id => !idSet.has(id)));
  }, [generationTasks, setCompareItemIds, setGenerationTasks, setItems, setSelectedItemIds]);

  const handleGalleryBatchDelete = async () => {
    if (selectedItemIds.length === 0) return;
    if (!(await confirmAction({
      message: `确定要彻底删除已选中的 ${selectedItemIds.length} 项创意资产或任务吗？`,
      tone: "danger",
      confirmLabel: "删除",
    }))) {
      return;
    }
    await deleteGalleryRecords(selectedItemIds);
  };

  const handleGalleryDeleteItem = async (item: StorageItem) => {
    if (!(await confirmAction({ message: "确定要删除此创意项或任务吗？", tone: "danger", confirmLabel: "删除" }))) {
      return;
    }
    await deleteGalleryRecords([item.id]);
  };

  const deleteGalleryItemsByStatus = async (statuses: StorageItem["status"][]) => {
    const ids = workspaceGalleryItems.filter(item => statuses.includes(item.status)).map(item => item.id);
    if (ids.length === 0) return;
    if (!(await confirmAction({
      message: `确定要删除 ${ids.length} 个 ${statuses.join("/")} 任务吗？`,
      tone: "danger",
      confirmLabel: "删除",
    }))) {
      return;
    }
    await deleteGalleryRecords(ids);
  };

  const imageModelGroups = getProviderModelGroups(imageModelOptions, providerKeys, customProviders);
  const videoModelGroups = getProviderModelGroups(videoModelOptions, providerKeys, customProviders);
  const audioModelGroups = getProviderModelGroups(audioModelOptions, providerKeys, customProviders);
  const chatModelGroups = getProviderModelGroups(chatModelOptions, providerKeys, customProviders);
  const providerLabelsByKey = useMemo<Partial<Record<AiProvider, string>>>(() => {
    const labels: Partial<Record<AiProvider, string>> = {};
    customProviders.forEach(provider => {
      labels[provider.key] = provider.label;
    });
    return labels;
  }, [customProviders]);
  const {
    featureModels: imageEditFeatureModels,
    selectFeatureModel: selectImageEditFeatureModel,
  } = useImageEditFeatureModels();
  const handleSelectImageModel = (model: string) => {
    const capabilities = getImageModelCapabilities(model);
    const nextAspectRatio = capabilities.aspectRatios[0]?.value ?? "1:1";
    const resolvedAspectRatio = capabilities.aspectRatios.some(option => option.value === aspectRatio)
      ? aspectRatio
      : nextAspectRatio;
    const nextResolutionOptions = getImageResolutionOptions(model, resolvedAspectRatio);
    setSelectedModel(model);
    if (!capabilities.aspectRatios.some(option => option.value === aspectRatio)) {
      setAspectRatio(resolvedAspectRatio);
    }
    if (nextResolutionOptions.length > 0 && !nextResolutionOptions.some(option => option.value === imageResolution)) {
      setImageResolution(nextResolutionOptions[0].value);
    }
    if (capabilities.qualities.length > 0 && !capabilities.qualities.some(option => option.value === imageQuality)) {
      setImageQuality(capabilities.qualities[0].value);
    }
    if (
      capabilities.thinkingLevels.length > 0 &&
      !capabilities.thinkingLevels.some(option => option.value === imageThinkingLevel)
    ) {
      setImageThinkingLevel(capabilities.thinkingLevels[0].value);
    }
  };

  const handleSelectImageAspectRatio = (value: string) => {
    setAspectRatio(value);
    const nextResolutionOptions = getImageResolutionOptions(selectedModel, value);
    if (nextResolutionOptions.length > 0 && !nextResolutionOptions.some(option => option.value === imageResolution)) {
      setImageResolution(nextResolutionOptions[0].value);
    }
  };

  const handleSelectVideoModel = (model: string) => {
    const capabilities = getVideoModelCapabilities(model);
    setSelectedVideoModel(model);
    if (!capabilities.sizes.some(option => option.value === aspectRatio)) {
      setAspectRatio(capabilities.sizes[0]?.value ?? "auto");
    }
    if (capabilities.resolutions.length > 0 && !capabilities.resolutions.some(option => option.value === videoResolution)) {
      setVideoResolution(capabilities.resolutions[0].value);
    }
    if (capabilities.durations.length > 0 && !capabilities.durations.some(option => option.value === videoDuration)) {
      setVideoDuration(capabilities.durations[0].value);
    }
    if (capabilities.presets.length > 0 && !capabilities.presets.some(option => option.value === videoPreset)) {
      setVideoPreset(capabilities.presets[0].value);
    }
    if (!capabilities.referenceModes.includes(selectedVideoReferenceMode)) {
      setSelectedVideoReferenceMode(capabilities.referenceMode);
    }
  };

  const handleSelectAudioModel = (model: string) => {
    const capabilities = getAudioModelCapabilities(model);
    setSelectedAudioModel(model);
    setSelectedVoiceProfileId("");
    if (!capabilities.modes.includes(selectedAudioMode)) {
      setSelectedAudioMode(capabilities.defaultMode);
    }
    if (capabilities.formats.length > 0 && !capabilities.formats.some(option => option.value === audioFormat)) {
      setAudioFormat(capabilities.formats[0].value);
    }
  };

  const handleSelectAudioMode = (mode: AudioOperationMode) => {
    setSelectedAudioMode(mode);
    if (mode !== "voice_clone") setVoiceCloneConsentAccepted(false);
  };

  function reuseTaskInComposer(item: StorageItem): void {
    const request = item.generationRequest;
    const model = request?.model ?? item.model;
    const references: ReferenceImageRef[] = getGenerationReferenceMedia(request).map((reference, index) => {
      const videoMode = item.type === "video" ? request?.videoReferenceMode ?? getVideoModelCapabilities(model).referenceMode : "reference";
      const role: ReferenceImageRef["role"] = reference.role ?? (videoMode === "firstLast"
        ? index === 0
          ? "start"
          : index === 1
            ? "end"
            : "general"
        : "general");
      return { id: `${item.id}_reference_${index + 1}`, type: reference.type, url: reference.url, role };
    });

    setPrompt(item.type === "transcript" ? request?.prompt ?? "" : item.prompt);
    setReferenceImages(references);
    setReferenceImage(references[0]?.url ?? null);

    if (item.type === "audio" || item.type === "transcript") {
      handleSelectAudioModel(model);
      if (request?.audioMode) handleSelectAudioMode(request.audioMode);
      if (request?.audioFormat) setAudioFormat(request.audioFormat);
      setAudioStylePrompt(request?.audioStylePrompt ?? "");
      setAsrLanguage(request?.asrLanguage ?? "auto");
      setSelectedVoiceProfileId(request?.voiceProfileId ?? "");
      setTraditionalSubTab("audio");
    } else if (item.type === "image") {
      const imageModel = getSelectableStoredImageModel(model, selectedProvider);
      const nextAspectRatio = request?.aspectRatio ?? item.aspectRatio;
      const capabilities = getImageModelCapabilities(imageModel);
      const nextResolution = request?.imageResolution ?? nextAspectRatio;
      const resolvedAspectRatio = getImageAspectRatioFromResolution(nextResolution) ?? nextAspectRatio;

      handleSelectImageModel(imageModel);
      if (capabilities.aspectRatios.some(option => option.value === resolvedAspectRatio)) {
        setAspectRatio(resolvedAspectRatio);
      }
      const nextResolutionOptions = getImageResolutionOptions(imageModel, resolvedAspectRatio);
      if (nextResolutionOptions.some(option => option.value === nextResolution)) {
        setImageResolution(nextResolution);
      } else if (/^\d+x\d+$/.test(nextResolution) && nextResolutionOptions.some(option => option.value === "custom")) {
        setImageResolution("custom");
        setCustomImageSize(nextResolution);
      }
      if (request?.imageQuality) setImageQuality(request.imageQuality);
      if (request?.thinkingLevel) setImageThinkingLevel(request.thinkingLevel);
      setTraditionalSubTab("image");
    } else {
      handleSelectVideoModel(model);
      setAspectRatio(request?.aspectRatio ?? item.aspectRatio);
      if (request?.videoDurationSeconds) setVideoDuration(request.videoDurationSeconds);
      if (request?.videoPreset) setVideoPreset(request.videoPreset);
      if (request?.videoReferenceMode) setSelectedVideoReferenceMode(request.videoReferenceMode);
      if (request?.videoResolution) setVideoResolution(request.videoResolution);
      setTraditionalSubTab("video");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    pushWorkspaceNotice("success", "已回填任务参数到左侧工作面板");
  }

  const retryGalleryItem = useCallback((item: StorageItem) => {
    if (!generationTasks.some(task => task.id === item.id)) {
      void retryFailedItem(item);
      return;
    }
    reuseTaskInComposer(item);
    pushWorkspaceNotice("info", "已复用失败任务参数，可重新点击生成");
  }, [generationTasks, pushWorkspaceNotice, retryFailedItem, reuseTaskInComposer]);

  useEffect(() => {
    const readyTimer = window.setTimeout(() => {
      setIsAgentPortalReady(true);
      setAgentPortalHost(workbenchShellRef.current);
    }, 0);
    return () => window.clearTimeout(readyTimer);
  }, []);

  useEffect(() => {
    if (!isAgentPortalReady) return;

    const updateDockOverlap = () => {
      const dock = agentDockRef.current;
      if (!dock) return;

      const rect = dock.getBoundingClientRect();
      const sampleY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + 8));
      const sampleXs = [0.25, 0.5, 0.75].map(position =>
        Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width * position)),
      );
      const isOverContent = sampleXs.some(x =>
        document.elementsFromPoint(x, sampleY).some(element => {
          if (dock.contains(element)) return false;
          if (element === document.body || element === document.documentElement) return false;
          return element.closest("main") !== null;
        }),
      );

      setIsAgentDockOverContent(isOverContent);
    };

    const scheduleDockOverlapUpdate = () => {
      if (dockOverlapFrameRef.current !== null) return;
      dockOverlapFrameRef.current = window.requestAnimationFrame(() => {
        dockOverlapFrameRef.current = null;
        updateDockOverlap();
      });
    };

    const readyTimer = window.setTimeout(scheduleDockOverlapUpdate, 0);
    window.addEventListener("scroll", scheduleDockOverlapUpdate, { passive: true });
    window.addEventListener("resize", scheduleDockOverlapUpdate);

    return () => {
      window.clearTimeout(readyTimer);
      if (dockOverlapFrameRef.current !== null) {
        window.cancelAnimationFrame(dockOverlapFrameRef.current);
        dockOverlapFrameRef.current = null;
      }
      window.removeEventListener("scroll", scheduleDockOverlapUpdate);
      window.removeEventListener("resize", scheduleDockOverlapUpdate);
    };
  }, [isAgentPortalReady, isAgentDockOpen]);

  // Load items from database on mount
  useEffect(() => {
    async function loadWorkspace() {
      try {
        const metas = await listAllAssetMetas();
        setItems(metas.map(metaToPlaceholderItem));
        const firstBatch = metas.slice(0, 40);
        if (firstBatch.length > 0) {
          const hydrated = await hydrateAssets(firstBatch);
          setItems(current => mergeStorageItems(current, hydrated));
          const rest = metas.slice(40, 120);
          if (rest.length > 0) {
            window.setTimeout(() => {
              void hydrateAssets(rest).then(more =>
                setItems(current => mergeStorageItems(current, more)),
              );
            }, 0);
          }
        }
      } catch (error) {
        console.error("IndexedDB Read Failed:", error);
        pushWorkspaceNotice("error", `本地项目库读取失败：${toErrorMessage(error, "IndexedDB 读取失败")}`);
      }
    }
    loadWorkspace();

  }, [pushWorkspaceNotice]);

  // Optimize prompt inside text area using the selected chat model.
  const optimizeActivePrompt = async (promptOverride?: string) => {
    const promptToOptimize = promptOverride ?? prompt;
    if (!promptToOptimize.trim()) return;
    setIsOptimizing(true);
    try {
      const headers = buildProviderHeaders(selectedChatModel);

      const res = await fetch(API_ROUTES.prompts.optimize, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ prompt: promptToOptimize, model: selectedChatModel }),
      });

      if (!res.ok) {
        throw new Error(await readFetchError(res, "提示词优化失败"));
      }
      const data: unknown = await res.json();
      const optimized = getStringField(data, "optimized");
      if (!optimized) {
        throw new Error("提示词优化接口返回格式不正确");
      }
      setPrompt(optimized);
    } catch (e) {
      const message = toErrorMessage(e, "提示词优化失败");
      console.error(e);
      pushWorkspaceNotice("error", message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const saveEditedImageAsset = async (
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    imageUrl: string,
    model: string,
    editPrompt: string,
  ) => {
    const label = IMAGE_EDIT_LABELS[operation];
    const item = buildStorageItem({
      id: makeClientId("img_edit"),
      type: "image",
      url: imageUrl,
      prompt: editPrompt || `${label}：${sourceItem.prompt || sourceItem.id}`,
      model,
      aspectRatio: "auto",
      createdAt: new Date().toISOString(),
      status: "complete",
      progress: 100,
      maskOriginalId: sourceItem.id,
    });
    await saveToDB(item);
    setItems(prev => [item, ...prev]);
    pushWorkspaceNotice("success", `${label}完成，已保存为新图片资产`);
  };

  const runImageQuickEdit = async (
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    editImageUrl: string,
    maskUrl: string | undefined,
    guideUrl: string | undefined,
    editPrompt: string,
    editImageResolution: string,
  ) => {
    const model = imageEditFeatureModels[operation];
    try {
      const image = await prepareReferenceImageUrlForRequest(editImageUrl);
      const mask = maskUrl ? await prepareReferenceImageUrlForRequest(maskUrl) : undefined;
      const guide = guideUrl ? await prepareReferenceImageUrlForRequest(guideUrl) : undefined;
      const response = await fetch("/api/image/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildProviderHeaders(model) },
        body: JSON.stringify({
          operation,
          model,
          image,
          mask,
          guide,
          prompt: editPrompt,
          imageResolution: editImageResolution,
        }),
      });
      if (!response.ok) {
        throw new Error(await readFetchError(response, `${IMAGE_EDIT_LABELS[operation]}失败`));
      }
      const payload = await readImageGenerationPayload(response);
      if (!payload.imageUrl) {
        throw new Error("图片编辑接口没有返回图片");
      }
      await saveEditedImageAsset(sourceItem, operation, payload.imageUrl, model, editPrompt);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, `${IMAGE_EDIT_LABELS[operation]}失败`));
    }
  };

  const handleImageQuickEdit = (item: StorageItem, operation: ImageEditFeature) => {
    if (item.type !== "image") return;
    openOriginalItem(item, originalItem => {
      if (operation === "cutout") {
        void runImageQuickEdit(originalItem, operation, originalItem.url, undefined, undefined, "", "auto");
        return;
      }
      launchMaskEditor(originalItem.url, originalItem.id, "creative", operation, originalItem);
    }, `${IMAGE_EDIT_LABELS[operation]}原图读取失败`);
  };

  // Launch mask editor layout dialog
  const launchMaskEditor = (
    imageUrl: string,
    id: string,
    destination: MaskDestination = "creative",
    operation?: ImageEditFeature,
    sourceItem?: StorageItem,
  ) => {
    setMaskTargetUrl(imageUrl);
    setMaskTargetId(id);
    setMaskDestination(destination);
    setMaskEditOperation(operation);
    setMaskEditSourceItem(sourceItem ?? null);
    setIsMaskOpen(true);
  };

  const launchAssetMaskEditor = (_imageUrl: string, id: string): void => {
    const item = items.find(entry => entry.id === id);
    if (!item) {
      pushWorkspaceNotice("error", "找不到原始媒体");
      return;
    }
    openOriginalItem(item, originalItem => {
      launchMaskEditor(originalItem.url, originalItem.id);
    }, "原始图片读取失败");
  };

  const saveMaskOutput = async (output: CanvasMaskEditorOutput) => {
    if (output.operation && maskEditSourceItem) {
      await runImageQuickEdit(
        maskEditSourceItem,
        output.operation,
        output.imageBase64,
        output.maskBase64,
        output.mergedImageBase64,
        output.prompt,
        output.imageResolution,
      );
      setIsMaskOpen(false);
      setMaskEditOperation(undefined);
      setMaskEditSourceItem(null);
      return;
    }

    let compressedMergedImage: string;
    try {
      compressedMergedImage = await compressReferenceImageDataUrl(output.mergedImageBase64);
    } catch (error) {
      console.error(error);
      pushWorkspaceNotice("error", toErrorMessage(error, "蒙版参考图压缩失败"));
      return;
    }

    if (maskDestination === "agent") {
      const nextReferenceId = maskTargetId || "custom_ref";
      setAgentReferenceUrl(compressedMergedImage);
      setAgentReferenceId(nextReferenceId);
      setAgentReferences([{ id: nextReferenceId, url: compressedMergedImage }]);
      if (!agentInput.includes("modify the marked region")) {
        setAgentInput(`In the marked region, change: `);
      }
      setIsAgentDockOpen(true);
    } else {
      // Inject drew brush directly into reference seeds
      setReferenceImage(compressedMergedImage);
      // Auto populate helper suggestions into Prompt box
      if (!prompt.includes("modify the marked region")) {
        setPrompt(`In the marked region of the image, change: ${prompt || "[输入你的新修改构想...]"}`);
      }
      // Set active model to an image editing capable endpoint
      setSelectedModel("12ai:gpt-image-2");
      // Smooth scroll to top/traditional panel to alert user
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setIsMaskOpen(false);
    setMaskEditOperation(undefined);
    setMaskEditSourceItem(null);
    pushWorkspaceNotice(
      "success",
      maskDestination === "agent"
        ? "蒙版已应用到 Agent 参考图，可在对话中继续描述修改"
        : "蒙版已写入参考图，可继续编辑提示词并生成",
    );
  };

  const renderAtDropdown = (type: AtDropdownTarget) => {
    if (type !== "agent-prompt") {
      const acceptedMediaTypes =
        type === "image-prompt"
          ? imageCapabilities.referenceMediaTypes
          : type === "audio-prompt"
            ? audioCapabilities.referenceMediaTypes
            : videoCapabilities.referenceMediaTypes;
      return (
        <PromptReferenceDropdown
          acceptedMediaTypes={acceptedMediaTypes}
          references={referenceImages}
          search={atDropdown.search}
          onSelect={(index) => handleSelectPromptReference(index, type)}
        />
      );
    }

    const agentReferenceItems: StorageItem[] = agentReferences.map((reference, index) => ({
      id: reference.id,
      type: getMediaReferenceType(reference),
      url: reference.url,
      prompt: `Agent 引用图 ${index + 1}`,
      model: "agent-reference",
      aspectRatio: "auto",
      createdAt: "",
      status: "complete",
      progress: 100,
      scope: "workspace",
      boardId: "",
      hasBlob: reference.url.startsWith("data:"),
    }));
    const agentReferenceIdSet = new Set(agentReferences.map(reference => reference.id));
    const agentAtItems = [
      ...agentReferenceItems,
      ...searchableReferenceImages.filter(item => !agentReferenceIdSet.has(item.id)),
    ];

    return (
      <AtReferenceDropdown
        items={agentAtItems}
        search={atDropdown.search}
        onSelect={(item) => {
          if (item.type === "transcript") return;
          const itemType = item.type;
          openOriginalItem(item, originalItem => {
            handleSelectAtItem(originalItem.url, originalItem.id, type, itemType);
          }, "原始媒体读取失败");
        }}
      />
    );
  };

  const {
    activeCountdownId,
    agentMessages,
    autoExecute,
    chatBottomRef,
    clearActiveCountdown,
    countdownSeconds,
    declineAgentToolAction,
    executeAgentToolAction,
    handleClearChat,
    handleToggleAutoExecute,
    isAgentLoading,
    submitAgentPrompt,
    updateAgentActionDraft,
  } = useAgentController({
    agentInput,
    agentReferenceId,
    agentReferences,
    agentReferenceUrl,
    buildProviderHeaders,
    generateManualAudio,
    generateManualImage,
    generateManualVideo,
    handleSelectImageModel,
    handleSelectVideoModel,
    items,
    launchMaskEditor,
    optimizeActivePrompt,
    selectedChatModel,
    setAgentInput,
    setAspectRatio,
    setIsAgentDockOpen,
    setPrompt,
    setReferenceImage,
    setReferenceImages,
    setTraditionalSubTab,
    onActionValidationError: message => pushWorkspaceNotice("error", message),
  });

  const handleClearProject = async () => {
    if (!(await confirmAction({
      message: CLEAR_WORKSPACE_ASSETS_MESSAGE,
      tone: "danger",
      confirmLabel: "清空资产",
    }))) {
      return;
    }
    try {
      await createWorkspaceSafetySnapshot("clear-assets");
      await clearAllDB();
      setItems([]);
      setSelectedItemIds([]);
      setCompareItemIds([]);
      pushWorkspaceNotice("success", "本地资产库已清空");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "本地资产库清空失败"));
    }
  };

  const reloadAssetsFromDB = useCallback(async () => {
    const metas = await listAllAssetMetas();
    setItems(metas.map(metaToPlaceholderItem));
    void hydrateAssets(metas.slice(0, 80)).then(hydrated =>
      setItems(current => mergeStorageItems(current, hydrated)),
    );
  }, []);

  const handleDataExportWorkspace = useCallback(async (includeCredentials: boolean) => {
    try {
      const result = await exportCompleteWorkspaceBackup(includeCredentials);
      pushWorkspaceNotice("success", `已导出备份：${result.fileName}`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "完整备份导出失败"));
    }
  }, [pushWorkspaceNotice]);

  const handleDataDownloadSafetySnapshot = useCallback(async () => {
    try {
      const result = await downloadLatestWorkspaceSafetySnapshot();
      pushWorkspaceNotice("success", `已下载安全快照：${result.fileName}`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "安全快照下载失败"));
    }
  }, [pushWorkspaceNotice]);

  const handleDataImportWorkspace = useCallback(async (file: File, includeCredentials: boolean) => {
    try {
      const preview = await previewWorkspaceBackup(file);
      const credentialNote = preview.includesCredentials && !includeCredentials
        ? "\n备份包含 provider 密钥；当前未勾选，将不会导入密钥。"
        : "";
      if (!(await confirmAction({
        message: `确认覆盖恢复此工作区？\n资产 ${preview.assetCount} 项，画板 ${preview.boardCount} 个，设置 ${preview.settingsKeyCount} 项。${credentialNote}`,
        tone: "danger",
        confirmLabel: "恢复",
      }))) {
        return;
      }
      const result = await importWorkspaceBackup(file, includeCredentials);
      pushWorkspaceNotice("success", `已恢复 ${result.assetCount} 项资产与 ${result.boardCount} 个画板`);
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "工作区恢复失败"));
    }
  }, [confirmAction, pushWorkspaceNotice]);

  const handleDataImportLocalAssets = useCallback(async (files: File[]) => {
    const importedItems: StorageItem[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const item = await createLocalUploadAsset(
          file,
          makeClientId(file.type.startsWith("video/") ? `local_video_${index}` : `local_image_${index}`),
        );
        await saveToDB(item);
        importedItems.push(item);
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, `${file.name || "媒体"} 导入失败`));
      }
    }
    if (importedItems.length === 0) return;
    setItems(prev => [
      ...importedItems,
      ...prev.filter(item => !importedItems.some(importedItem => importedItem.id === item.id)),
    ]);
    pushWorkspaceNotice("success", `已导入 ${importedItems.length} 个本地媒体`);
  }, [pushWorkspaceNotice]);

  const handleDataCleanupAssets = useCallback(async (kind: WorkspaceCleanupKind) => {
    const labelByKind: Record<WorkspaceCleanupKind, string> = {
      failed: "失败任务",
      "stale-processing": "超过 2 小时的处理中/排队任务",
      "broken-complete": "无媒体 URL 的完成记录",
      orphaned: "未被任何画板引用的完成资产",
    };
    if (!(await confirmAction({ message: `确认清理${labelByKind[kind]}吗？`, tone: "danger", confirmLabel: "清理" }))) return;
    try {
      const result = await cleanupWorkspaceAssets(kind);
      await reloadAssetsFromDB();
      setSelectedItemIds(prev => prev.filter(id => !result.deletedIds.includes(id)));
      setCompareItemIds(prev => prev.filter(id => !result.deletedIds.includes(id)));
      pushWorkspaceNotice("success", `已清理 ${result.deletedIds.length} 项`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "资产清理失败"));
    }
  }, [confirmAction, pushWorkspaceNotice, reloadAssetsFromDB, setCompareItemIds, setSelectedItemIds]);

  const handleDataRepairAssetSources = useCallback(async () => {
    if (!(await confirmAction({
      message: "将扫描所有画板，并清除资产中指向已不存在画板节点的来源链接。资产文件、提示词和生成结果不会删除。确认继续？",
      confirmLabel: "修复",
    }))) return;
    try {
      const result = await repairStaleAssetSourceLinks();
      await reloadAssetsFromDB();
      pushWorkspaceNotice("success", `已修复 ${result.repairedIds.length} 项来源链接`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "来源链接修复失败"));
    }
  }, [confirmAction, pushWorkspaceNotice, reloadAssetsFromDB]);

  const handleDataClearLocalStorage = useCallback(async (kind: LocalStorageCleanupKind) => {
    const labelByKind: Record<LocalStorageCleanupKind, string> = {
      agent: "Agent 会话",
      "model-cache": "模型缓存",
      "provider-credentials": "provider 密钥",
      "ui-preferences": "UI 偏好",
    };
    if (!(await confirmAction({ message: `确认清理${labelByKind[kind]}吗？`, tone: "danger", confirmLabel: "清理" }))) return;
    const count = clearLocalStorageGroup(kind);
    pushWorkspaceNotice("success", `已清理 ${count} 个本地键，刷新后完全生效`);
  }, [confirmAction, pushWorkspaceNotice]);

  const handleDataResetBoards = useCallback(async () => {
    if (!(await confirmAction({
      message: "确认重置所有画板为一个空白默认画板吗？",
      tone: "danger",
      confirmLabel: "重置",
    }))) return;
    try {
      await resetBoardsToDefault();
      pushWorkspaceNotice("success", "画板已重置");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "画板重置失败"));
    }
  }, [confirmAction, pushWorkspaceNotice]);

  const renderAssetGalleryWorkspace = () => (
    <AssetGalleryWorkspace
      assetDateEnd={assetDateEnd}
      assetDatePreset={assetDatePreset}
      assetDateStart={assetDateStart}
      assetModelFilter={assetModelFilter}
      assetStatusFilter={assetStatusFilter}
      cancelingItemIdSet={cancelingItemIdSet}
      compareItemIdSet={compareItemIdSet}
      compareItemIds={compareItemIds}
      compareItems={compareItems}
      compareSliderPos={compareSliderPos}
      compareViewType={compareViewType}
      filterType={filterType}
      filteredItems={filteredItems}
      inFlightCount={assetStats.statusCounts.processing + assetStats.statusCounts.pending}
      itemsCount={workspaceGalleryItems.length}
      dateOptions={assetStats.dateOptions}
      modelOptions={assetStats.modelOptions}
      searchQuery={searchQuery}
      selectedCount={selectedItemIds.length}
      selectedItemIdSet={selectedItemIdSet}
      selectedProvider={selectedProvider}
      statusCounts={assetStats.statusCounts}
      typeCounts={assetStats.typeCounts}
      isCompareMode={isCompareMode}
      initialVisibleItems={isDesktopLayout ? 48 : 18}
      onApplyVideoReference={applyAsVideoReference}
      onBatchDelete={handleGalleryBatchDelete}
      onBatchDownloadZip={handleBatchDownloadZip}
      onCancelItem={cancelGalleryItem}
      onCaptureVideoFrame={handleCaptureVideoFrame}
      onClearSelection={handleClearSelection}
      onDeleteItem={handleGalleryDeleteItem}
      onDeleteItemsByStatus={deleteGalleryItemsByStatus}
      onDownloadItem={handleDownloadItem}
      onExportMetadata={exportMetadataJson}
      onImageQuickEdit={handleImageQuickEdit}
      onLaunchMaskEditor={launchAssetMaskEditor}
      onOpenFullscreen={handleOpenFullscreen}
      onOpenPanorama={handleOpenPanorama}
      onPromoteOriginal={promoteItemToOriginal}
      onResetCompare={() => {
        setIsCompareMode(false);
        setCompareItemIds([]);
      }}
      onRetryItem={retryGalleryItem}
      onReuseTask={reuseTaskInComposer}
      onSaveVoiceProfile={handleSaveVoiceProfileSource}
      onSetAssetDateEnd={setAssetDateEnd}
      onSetAssetDatePreset={setAssetDatePreset}
      onSetAssetDateStart={setAssetDateStart}
      onSetAssetModelFilter={setAssetModelFilter}
      onSetAssetStatusFilter={(value) => {
        setAssetStatusFilter(value);
        if (!isDesktopLayout && value !== "all") {
          setMobileWorkbenchPanel("gallery");
        }
      }}
      onSetCompareSliderPos={setCompareSliderPos}
      onSetCompareViewType={setCompareViewType}
      onSetFilterType={setFilterType}
      onSetSearchQuery={setSearchQuery}
      onToggleCompare={toggleCompare}
      onToggleSelect={toggleSelectItem}
      onUseAgentReference={handleUseAgentReference}
      visibleItemsStep={isDesktopLayout ? 48 : 18}
      formatModelLabel={formatStoredModelLabel}
      providerLabelsByKey={providerLabelsByKey}
    />
  );

  const renderCreationPanel = (showGenerateButton: boolean) => {
    if (traditionalSubTab === "audio") {
      return (
        <AudioGenerationPanel
          showGenerateButton={showGenerateButton}
          atDropdownNode={atDropdown.visible && atDropdown.type === "audio-prompt" ? renderAtDropdown("audio-prompt") : null}
          capabilities={audioCapabilities}
          formatOptions={audioFormatOptions}
          isOptimizing={isOptimizing}
          isSubmitting={isSubmittingAudio}
          mode={activeAudioMode}
          modelGroups={audioModelGroups}
          prompt={prompt}
          referenceImages={referenceImages}
          selectedFormat={activeAudioFormat}
          selectedModel={selectedAudioModel}
          selectedVoiceProfileId={selectedVoiceProfileId}
          submitCount={audioSubmitCount}
          voiceCloneConsentAccepted={voiceCloneConsentAccepted}
          audioStylePrompt={audioStylePrompt}
          asrLanguage={asrLanguage}
          onClearReferences={() => {
            setReferenceImages(prev => {
              const filtered = prev.filter(reference => !audioCapabilities.referenceMediaTypes.includes(getMediaReferenceType(reference)));
              setReferenceImage(filtered[0]?.url ?? null);
              return filtered;
            });
            setPrompt(removePromptReferenceTokens);
          }}
          onGenerate={generateActiveAudio}
          onOptimizePrompt={optimizeActivePrompt}
          onPromptChange={value => handleTextareaChange(value, "audio-prompt")}
          onPromptDropAsset={event => handlePromptDropAsset(event, "audio-prompt")}
          onReferenceDropAsset={asset => handleReferenceDropAsset(asset, "audio-prompt")}
          onReferenceDropFiles={files => handleReferenceDropFiles(files, "audio-prompt")}
          onReferenceRemove={removeReferenceImage}
          onReferenceUpload={event => handleReferenceUpload(event, "audio-prompt")}
          onSelectFormat={setAudioFormat}
          onSelectMode={handleSelectAudioMode}
          onSelectModel={handleSelectAudioModel}
          onSelectVoiceProfile={setSelectedVoiceProfileId}
          onVoiceCloneConsentChange={setVoiceCloneConsentAccepted}
          onAudioStylePromptChange={setAudioStylePrompt}
          onAsrLanguageChange={setAsrLanguage}
        />
      );
    }
    return traditionalSubTab === "image" ? (
      <ImageGenerationPanel
        showGenerateButton={showGenerateButton}
        atDropdownNode={atDropdown.visible && atDropdown.type === "image-prompt" ? renderAtDropdown("image-prompt") : null}
        capabilities={imageCapabilities}
        customImageSize={customImageSize}
        imageBackgroundGeneration={imageBackgroundGeneration}
        imageQuality={imageQuality}
        imageResolution={imageResolution}
        imageResolutionOptions={imageResolutionOptions}
        imageThinkingLevel={imageThinkingLevel}
        isOptimizing={isOptimizing}
        isSubmitting={isSubmittingImage}
        modelGroups={imageModelGroups}
        negativePrompt={negativePrompt}
        prompt={prompt}
        referenceImages={referenceImages}
        selectedAspectRatio={aspectRatio}
        selectedModel={selectedModel}
        submitCount={imageSubmitCount}
        supportsBackgroundGeneration={canUseBackgroundImageGeneration}
        onClearReferences={() => {
          setReferenceImages([]);
          setReferenceImage(null);
          setPrompt(removePromptReferenceTokens);
        }}
        onCustomImageSizeChange={setCustomImageSize}
        onGenerate={generateManualImage}
        onImageBackgroundGenerationChange={setImageBackgroundGeneration}
        onImageQualityChange={setImageQuality}
        onImageResolutionChange={setImageResolution}
        onNegativePromptChange={setNegativePrompt}
        onOptimizePrompt={optimizeActivePrompt}
        onPromptChange={value => handleTextareaChange(value, "image-prompt")}
        onPromptDropAsset={event => handlePromptDropAsset(event, "image-prompt")}
        onReferenceDropAsset={asset => handleReferenceDropAsset(asset, "image-prompt")}
        onReferenceDropFiles={files => handleReferenceDropFiles(files, "image-prompt")}
        onReferenceRemove={removeReferenceImage}
        onReferenceUpload={handleImageUpload}
        onSelectAspectRatio={handleSelectImageAspectRatio}
        onSelectModel={handleSelectImageModel}
        onThinkingLevelChange={setImageThinkingLevel}
      />
    ) : (
      <VideoGenerationPanel
        showGenerateButton={showGenerateButton}
        atDropdownNode={atDropdown.visible && atDropdown.type === "video-prompt" ? renderAtDropdown("video-prompt") : null}
        capabilities={videoCapabilities}
        clearReferenceLabel={videoClearReferenceLabel}
        durationOptions={videoCapabilities.durations}
        isOptimizing={isOptimizing}
        isSubmitting={isSubmittingVideo}
        modelGroups={videoModelGroups}
        presetOptions={videoCapabilities.presets}
        prompt={prompt}
        promptPlaceholder={videoPromptPlaceholder}
        referenceHelp={videoReferenceHelp}
        referenceImages={referenceImages}
        referenceLabel={videoReferenceLabel}
        referenceLimit={videoReferenceLimit}
        referenceMode={activeVideoReferenceMode}
        referenceModeOptions={videoCapabilities.referenceModes}
        resolutionOptions={videoCapabilities.resolutions}
        selectedDuration={videoDuration}
        selectedModel={selectedVideoModel}
        selectedPreset={videoPreset}
        selectedReferenceMode={activeVideoReferenceMode}
        selectedResolution={videoResolution}
        selectedSize={aspectRatio}
        submitCount={videoSubmitCount}
        onClearReferences={() => {
          setReferenceImages([]);
          setReferenceImage(null);
          setPrompt(removePromptReferenceTokens);
        }}
        onGenerate={generateManualVideo}
        onOptimizePrompt={optimizeActivePrompt}
        onPromptChange={value => handleTextareaChange(value, "video-prompt")}
        onPromptDropAsset={event => handlePromptDropAsset(event, "video-prompt")}
        onReferenceDropAsset={asset => handleReferenceDropAsset(asset, "video-prompt")}
        onReferenceDropFiles={files => handleReferenceDropFiles(files, "video-prompt")}
        onReferenceRemove={removeReferenceImage}
        onReferenceRoleChange={(id, role) => toggleReferenceRole(id, role ?? "general")}
        onReferenceUpload={event => handleReferenceUpload(event, "video-prompt")}
        onSelectDuration={setVideoDuration}
        onSelectReferenceMode={setSelectedVideoReferenceMode}
        onSelectResolution={setVideoResolution}
        onSelectModel={handleSelectVideoModel}
        onSelectPreset={setVideoPreset}
        onSelectSize={setAspectRatio}
      />
    );
  };

  return (
    <div
      ref={workbenchShellRef}
      className="imagine-workbench-shell imagine-theme-dark min-h-screen flex flex-col bg-[var(--iw-bg)] text-[var(--iw-text)] font-sans selection:bg-blue-500/30 selection:text-[var(--iw-text)] relative overflow-hidden"
    >

      {/* Workbench depth layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.045)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,41,59,0.42),transparent_56%)]" />
      </div>

      <WorkspaceNotices notices={workspaceNotices} onDismiss={dismissWorkspaceNotice} />

      <WorkspaceHeader
        onClearProject={handleClearProject}
        onOpenSettings={() => setShowSettings(prev => !prev)}
      />

      {/* Main Multi-panel Layout grid */}
      <main
        className={`imagine-main-grid ${
          isAgentDockOpen ? "imagine-main-grid-agent-open" : "imagine-main-grid-agent-closed"
        } flex-1 w-full max-w-[1880px] mx-auto px-4 pt-5 sm:px-6 sm:pt-6 grid grid-cols-1 lg:grid-cols-[minmax(400px,480px)_minmax(0,1fr)] xl:grid-cols-[minmax(430px,520px)_minmax(0,1fr)] gap-5 xl:gap-6 items-start z-10`}
      >

        <section className="imagine-creator-panel imagine-creation-sidebar flex flex-col gap-4 min-w-0">
          {!isDesktopLayout && (
            <section className="imagine-mobile-workflow flex flex-col gap-3 lg:hidden">
              <MobileWorkbenchTabs
                activePanel={mobileWorkbenchPanel}
                galleryCount={items.length}
                inFlightCount={assetStats.statusCounts.processing + assetStats.statusCounts.pending}
                onChange={setMobileWorkbenchPanel}
              />

              {mobileWorkbenchPanel === "create" ? (
                <section className="imagine-mobile-composer imagine-control-surface flex flex-col gap-3 rounded-xl p-3">
                  <CreationModeTabs value={traditionalSubTab} onChange={setTraditionalSubTab} />
                  {renderCreationPanel(true)}
                </section>
              ) : (
                <section className="imagine-mobile-asset-stream">
                  {renderAssetGalleryWorkspace()}
                </section>
              )}
            </section>
          )}

          {/* Active Creative Panel switch */}
          <div className="imagine-control-surface hidden rounded-xl dark-glass p-4 lg:flex flex-col gap-4 min-h-[500px] max-h-[calc(100vh-5.5rem)] overflow-hidden">
            <div className="imagine-creator-scroll flex min-h-0 flex-1 flex-col gap-3.5">
                <CreationModeTabs value={traditionalSubTab} onChange={setTraditionalSubTab} />

                {renderCreationPanel(false)}

              </div>

            <div className="imagine-creator-generate-footer hidden shrink-0 lg:block">
              <CreatorGenerateButton
                mode={traditionalSubTab}
                disabled={isCreatorGenerateDisabled}
                isSubmitting={traditionalSubTab === "image" ? isSubmittingImage : traditionalSubTab === "audio" ? isSubmittingAudio : isSubmittingVideo}
                submitCount={traditionalSubTab === "image" ? imageSubmitCount : traditionalSubTab === "audio" ? audioSubmitCount : videoSubmitCount}
                priceProvider={traditionalSubTab === "image" ? selectedModel.split(":")[0] : traditionalSubTab === "audio" ? selectedAudioModel.split(":")[0] : selectedVideoModel.split(":")[0]}
                priceModelId={traditionalSubTab === "image" ? selectedModel : traditionalSubTab === "audio" ? selectedAudioModel : selectedVideoModel}
                priceDuration={traditionalSubTab === "video" ? activeVideoDuration ?? videoDuration : undefined}
                priceResolution={traditionalSubTab === "image" ? activeImageResolution : undefined}
                priceImageQuality={traditionalSubTab === "image" ? imageQuality : undefined}
                priceReferenceTypes={traditionalSubTab === "video" ? videoPriceReferenceTypes : undefined}
                priceThinkingLevel={traditionalSubTab === "image" ? imageThinkingLevel : undefined}
                priceVideoReferenceMode={traditionalSubTab === "video" ? activeVideoReferenceMode : undefined}
                priceVideoResolution={traditionalSubTab === "video" ? videoResolution : undefined}
                onGenerate={() => {
                  if (traditionalSubTab === "image") {
                    generateManualImage();
                    return;
                  }
                  if (traditionalSubTab === "audio") {
                    generateActiveAudio();
                    return;
                  }
                  generateManualVideo();
                }}
              />
            </div>

            {isAgentPortalReady && !isAgentDockSuppressed && agentPortalHost && createPortal(
              <AgentDock
                ref={agentDockRef}
                activeCountdownId={activeCountdownId}
                agentReferenceId={agentReferenceId}
                agentReferences={agentReferences}
                agentReferenceUrl={agentReferenceUrl}
                atDropdownNode={atDropdown.visible && atDropdown.type === "agent-prompt" ? renderAtDropdown("agent-prompt") : null}
                audioModelGroups={audioModelGroups}
                autoExecute={autoExecute}
                chatBottomRef={chatBottomRef}
                chatModelGroups={chatModelGroups}
                countdownSeconds={countdownSeconds}
                input={agentInput}
                isLoading={isAgentLoading}
                isOpen={isAgentDockOpen}
                isOverContent={isAgentDockOverContent}
                messages={agentMessages}
                selectedChatModel={selectedChatModel}

                onSelectChatModel={handleSelectChatModel}
                onCancelCountdown={clearActiveCountdown}
                onChangeInput={(value) => handleTextareaChange(value, "agent-prompt")}
                onClearChat={handleClearChat}
                onClearReference={() => {
                  setAgentReferenceId(null);
                  setAgentReferenceUrl(null);
                  setAgentReferences([]);
                }}
                imageModelGroups={imageModelGroups}
                videoModelGroups={videoModelGroups}
                onDeclineAction={declineAgentToolAction}
                onExecuteAction={executeAgentToolAction}
                onUpdateActionDraft={updateAgentActionDraft}
                onMaskReference={() => {
                  if (agentReferenceUrl) {
                    launchMaskEditor(agentReferenceUrl, agentReferenceId || "custom_ref", "agent");
                  }
                }}
                onSubmit={() => submitAgentPrompt()}
                onSuggestedPrompt={submitAgentPrompt}
                onToggleAutoExecute={handleToggleAutoExecute}
                onToggleOpen={() => setIsAgentDockOpen(prev => !prev)}
                onUploadReference={handleAgentReferenceUpload}
              />,
              agentPortalHost,
            )}

          </div>
        </section>

        {isDesktopLayout && (
          <div className="hidden min-w-0 lg:block">
            {renderAssetGalleryWorkspace()}
          </div>
        )}

      </main>

      <SettingsModal
        audioModelGroups={audioModelGroups}
        chatModelGroups={chatModelGroups}
        fetchedModelOptions={fetchedModelOptions}
        imageModelGroups={imageModelGroups}
        isLoadingModels={isLoadingModels}
        modelListMessage={modelListMessage}
        open={showSettings}
        customProviders={customProviders}
        providerCredentials={providerCredentials}
        providerKeys={providerKeys}
        providerTest={providerTest}
        selectedChatModel={selectedChatModel}
        selectedProvider={selectedProvider}
        imageEditFeatureModels={imageEditFeatureModels}
        videoModelGroups={videoModelGroups}
        onAddCustomProvider={addCustomProvider}
        onCleanupAssets={handleDataCleanupAssets}
        onClearAssets={handleClearProject}
        onClearCredentials={clearProviderCredentials}
        onClearLocalStorage={handleDataClearLocalStorage}
        onClose={() => setShowSettings(false)}
        onDownloadSafetySnapshot={handleDataDownloadSafetySnapshot}
        onExportWorkspace={handleDataExportWorkspace}
        onImportLocalAssets={handleDataImportLocalAssets}
        onImportWorkspace={handleDataImportWorkspace}
        onRepairAssetSources={handleDataRepairAssetSources}
        onResetBoards={handleDataResetBoards}
        onAddFetchedModels={addFetchedModels}
        onAddManualModels={addManualModels}
        onSaveCredential={handleSaveCredential}
        onSelectChatModel={handleSelectChatModel}
        onSelectImageEditFeatureModel={selectImageEditFeatureModel}
        onSelectProvider={handleSelectProvider}
        onDeleteCustomProvider={deleteCustomProvider}
        refreshProviderModels={refreshProviderModels}
        testProviderConnection={testProviderConnection}
      />

      <FullscreenPreview
        item={fullscreenItem}
        items={filteredItems.filter(item => item.status === "complete")}
        onCaptureVideoFrame={handleCaptureVideoFrame}
        onSavePanoramaScreenshots={handleSavePanoramaScreenshots}
        onSaveVoiceProfile={handleSaveVoiceProfileSource}
        onClose={() => setFullscreenItem(null)}
        onSelectItem={handleOpenFullscreen}
      />

      {panoramaItem && (
        <PanoramaOverlay
          item={panoramaItem}
          onClose={() => setPanoramaItem(null)}
          onSaveScreenshots={handleSavePanoramaScreenshots}
        />
      )}

      <SaveVoiceProfileDialog
        item={voiceProfileSourceItem}
        onClose={() => setVoiceProfileSourceItem(null)}
        onSave={handleSaveVoiceProfileFromAsset}
      />

      {/* Inpainting Mask Drawer overlay loader */}
      {isMaskOpen && (
        <CanvasMaskEditor
          imageUrl={maskTargetUrl}
          editModel={maskEditOperation ? imageEditFeatureModels[maskEditOperation] : undefined}
          isOpen={isMaskOpen}
          operation={maskEditOperation}
          onClose={() => {
            setIsMaskOpen(false);
            setMaskTargetUrl("");
            setMaskTargetId("");
            setMaskEditOperation(undefined);
            setMaskEditSourceItem(null);
          }}
          onSaveMask={saveMaskOutput}
        />
      )}

      <FloatingCompareButton
        selectedCount={compareItemIds.length}
        show={compareItemIds.length > 0 && !isCompareMode}
        onOpen={() => setIsCompareMode(true)}
      />

    </div>
  );
}
