'use client';

import React, { useCallback, useState, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import AgentDock from "@/components/agent/AgentDock";
import CanvasMaskEditor from "@/components/CanvasMaskEditor";
import FloatingCompareButton from "@/components/assets/FloatingCompareButton";
import FullscreenPreview from "@/components/assets/FullscreenPreview";
import CreationModeTabs, { type CreationMode } from "@/components/creation/CreationModeTabs";
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
  clearAllDB,
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
import { useMediaPolling } from "@/hooks/useMediaPolling";
import {
  IMAGE_REFERENCE_LIMIT,
  removePromptReferenceTokens,
  useReferenceState,
  type AtDropdownTarget,
} from "@/hooks/useReferenceState";
import { useProviderSettings } from "@/hooks/useProviderSettings";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  formatProviderModel,
  getImageAspectRatioFromResolution,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getVideoModelCapabilities,
  parseProviderModel,
  supportsAsyncImageGeneration,
  type AiProvider,
  type ModelOption,
  type VideoReferenceMode,
} from "@/lib/providers/model-catalog";
import { PROVIDER_KEYS, getProviderMeta } from "@/lib/providers/registry";
import { getMediaReferenceType } from "@/lib/media-references";
import { compressReferenceImageDataUrl, compressReferenceImageFile } from "@/lib/reference-images";
import {
  cleanupWorkspaceAssets,
  clearLocalStorageGroup,
  createLocalUploadAsset,
  exportCompleteWorkspaceBackup,
  importWorkspaceBackup,
  previewWorkspaceBackup,
  repairStaleAssetSourceLinks,
  resetBoardsToDefault,
  type LocalStorageCleanupKind,
  type WorkspaceCleanupKind,
} from "@/lib/data-management";
import { CLEAR_WORKSPACE_ASSETS_MESSAGE } from "@/lib/workspace-messages";

type NoticeType = "error" | "info" | "success";
type MaskDestination = "creative" | "agent";
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

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

async function readFetchError(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    return getStringField(data, "error") ?? getStringField(data, "message") ?? `${fallback} (HTTP ${response.status})`;
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

function getProviderLabel(provider: AiProvider): string {
  return getProviderMeta(provider).label;
}

function getProviderModelGroups(optionsByProvider: Record<AiProvider, ModelOption[]>): Array<{
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}> {
  return ([...PROVIDER_KEYS] as AiProvider[])
    .map(provider => ({
      provider,
      label: getProviderLabel(provider),
      options: optionsByProvider[provider],
    }))
    .filter(group => group.options.length > 0);
}

function formatStoredModelLabel(value: string, fallbackProvider: AiProvider): string {
  const parsed = parseProviderModel(value, fallbackProvider);
  return `${getProviderLabel(parsed.provider)} ${parsed.model}`;
}

function getSelectableStoredImageModel(value: string, fallbackProvider: AiProvider): string {
  const parsed = parseProviderModel(value, fallbackProvider);
  return parsed.async ? formatProviderModel(parsed.provider, parsed.model) : value;
}

export default function Home() {
  const isDesktopLayout = useSyncExternalStore(
    subscribeDesktopLayout,
    getDesktopLayoutSnapshot,
    getServerDesktopLayoutSnapshot,
  );

  // Database State
  const [items, setItems] = useState<StorageItem[]>([]);

  // Traditional Form States
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_IMAGE_MODEL);
  const [selectedVideoModel, setSelectedVideoModel] = useState(DEFAULT_VIDEO_MODEL);
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

  const applyAsVideoReference = (asset: StorageItem) => {
    setReferenceImage(asset.url);
    setReferenceImages([{ id: asset.id, url: asset.url, role: "start" }]);
    setTraditionalSubTab("video");
  };

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
  } = useAssetWorkspaceState(items);

  // Agent State
  const [agentInput, setAgentInput] = useState("");

  const [showSettings, setShowSettings] = useState(false);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [imageSubmitCount, setImageSubmitCount] = useState(0);
  const [videoSubmitCount, setVideoSubmitCount] = useState(0);
  const [workspaceNotices, setWorkspaceNotices] = useState<WorkspaceNotice[]>([]);

  // Interactive Mask Editor State
  const [isMaskOpen, setIsMaskOpen] = useState(false);
  const [maskTargetUrl, setMaskTargetUrl] = useState("");
  const [maskTargetId, setMaskTargetId] = useState("");
  const [maskDestination, setMaskDestination] = useState<MaskDestination>("creative");

  // Fullscreen Preview Overlay State
  const [fullscreenItem, setFullscreenItem] = useState<StorageItem | null>(null);

  // References
  const agentDockRef = useRef<HTMLElement | null>(null);
  const dockOverlapFrameRef = useRef<number | null>(null);
  const pollingFailuresRef = useRef<Record<string, number>>({});
  const generationAbortControllersRef = useRef<Record<string, AbortController>>({});
  const locallyCanceledItemIdsRef = useRef<Set<string>>(new Set());
  const isAgentDockSuppressed = showSettings || isMaskOpen || fullscreenItem !== null;

  const dismissWorkspaceNotice = useCallback((id: string) => {
    setWorkspaceNotices(prev => prev.filter(notice => notice.id !== id));
  }, [setWorkspaceNotices]);

  const pushWorkspaceNotice = useCallback((type: NoticeType, message: string) => {
    const id = makeClientId("notice");
    setWorkspaceNotices(prev => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => dismissWorkspaceNotice(id), 8000);
  }, [dismissWorkspaceNotice, setWorkspaceNotices]);

  const {
    addFetchedModels,
    addManualModels,
    buildProviderHeaders,
    chatModelOptions,
    clearProviderCredentials,
    handleSaveCredential,
    handleSelectChatModel,
    handleSelectProvider,
    fetchedModelOptions,
    imageModelOptions,
    isLoadingModels,
    modelListMessage,
    providerCredentials,
    providerTest,
    refreshProviderModels,
    selectedChatModel,
    selectedProvider,
    testProviderConnection,
    videoModelOptions,
  } = useProviderSettings({ pushWorkspaceNotice });

  const imageCapabilities = getImageModelCapabilities(selectedModel);
  const customImageAspectRatio = imageResolution === "custom"
    ? getImageAspectRatioFromResolution(customImageSize.trim())
    : null;
  const activeImageAspectRatio = customImageAspectRatio ?? aspectRatio;
  const imageResolutionOptions = getImageResolutionOptions(selectedModel, activeImageAspectRatio);
  const videoCapabilities = getVideoModelCapabilities(selectedVideoModel);
  const isSubmittingImage = imageSubmitCount > 0;
  const isSubmittingVideo = videoSubmitCount > 0;
  const canUseAsyncImageGeneration = supportsAsyncImageGeneration(selectedModel);
  const activeImageResolution = imageResolution === "custom" ? customImageSize.trim() : imageResolution;
  const activeImageQuality = imageCapabilities.qualities.some(option => option.value === imageQuality) ? imageQuality : undefined;
  const selectedImageProviderModel = parseProviderModel(selectedModel, selectedProvider);
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

  const canUseBackgroundImageGeneration =
    canUseAsyncImageGeneration &&
    selectedImageProviderModel.provider === "12ai" &&
    (selectedImageProviderModel.model !== "gpt-image-2" || referenceImages.length === 0);
  const shouldUseAsyncImageGeneration = (imageBackgroundGeneration || isSubmittingImage) && canUseBackgroundImageGeneration;
  const activeImageModel = shouldUseAsyncImageGeneration && selectedImageProviderModel.provider === "12ai"
    ? `12ai-async:${selectedImageProviderModel.model}`
    : selectedModel;

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
      pushWorkspaceNotice("error", `Agent 参考图已达上限：最多 ${IMAGE_REFERENCE_LIMIT} 张`);
      return;
    }

    try {
      const compressedDataUrl = await compressReferenceImageFile(file);
      const newReferenceId = makeClientId("agent_upload");
      setAgentReferenceId(newReferenceId);
      setAgentReferenceUrl(compressedDataUrl);
      setAgentReferences(prev => {
        if (prev.length >= IMAGE_REFERENCE_LIMIT) return prev;
        return [...prev, { id: newReferenceId, url: compressedDataUrl }];
      });
      pushWorkspaceNotice("success", `已上传 Agent 参考图（${agentReferences.length + 1}/${IMAGE_REFERENCE_LIMIT}）`);
    } catch (error) {
      console.error(error);
      pushWorkspaceNotice("error", toErrorMessage(error, "Agent 参考图压缩失败，请换一张图片"));
    }
  };

  useMediaPolling({
    buildProviderHeaders,
    items,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    setItems,
  });
  const {
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
    setImageSubmitCount,
    setItems,
    setVideoSubmitCount,
    videoReferenceLimit,
    videoReferenceMode: activeVideoReferenceMode,
  });
  const {
    cancelProcessingItem,
    deleteItemsByStatus,
    exportMetadataJson,
    handleBatchDelete,
    handleBatchDownloadZip,
    handleCaptureVideoFrame,
    handleClearSelection,
    handleDeleteItem,
    handleDownloadItem,
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
  const imageModelGroups = getProviderModelGroups(imageModelOptions);
  const videoModelGroups = getProviderModelGroups(videoModelOptions);
  const chatModelGroups = getProviderModelGroups(chatModelOptions);
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

  const reuseTaskInComposer = (item: StorageItem) => {
    if (item.type === "audio") {
      pushWorkspaceNotice("error", "音频资产没有可复用的生成参数");
      return;
    }
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

    setPrompt(item.prompt);
    setReferenceImages(references);
    setReferenceImage(references[0]?.url ?? null);

    if (item.type === "image") {
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
  };

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

  // Optimize prompt inside text area utilizing Gemini client model
  const optimizeActivePrompt = async (promptOverride?: string) => {
    const promptToOptimize = promptOverride ?? prompt;
    if (!promptToOptimize.trim()) return;
    setIsOptimizing(true);
    try {
      const headers = buildProviderHeaders(selectedChatModel);

      const res = await fetch("/api/gemini/optimize", {
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

  // Launch mask editor layout dialog
  const launchMaskEditor = (imageUrl: string, id: string, destination: MaskDestination = "creative") => {
    setMaskTargetUrl(imageUrl);
    setMaskTargetId(id);
    setMaskDestination(destination);
    setIsMaskOpen(true);
  };

  const saveMaskOutput = async (mergedImageBase64: string) => {
    let compressedMergedImage: string;
    try {
      compressedMergedImage = await compressReferenceImageDataUrl(mergedImageBase64);
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
    pushWorkspaceNotice(
      "success",
      maskDestination === "agent"
        ? "蒙版已应用到 Agent 参考图，可在对话中继续描述修改"
        : "蒙版已写入参考图，可继续编辑提示词并生成",
    );
  };

  const renderAtDropdown = (type: AtDropdownTarget) => {
    if (type !== "agent-prompt") {
      return (
        <PromptReferenceDropdown
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
        onSelect={(item) => handleSelectAtItem(item.url, item.id, type, item.type)}
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
      itemsCount={items.length}
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
      onBatchDelete={handleBatchDelete}
      onBatchDownloadZip={handleBatchDownloadZip}
      onCancelItem={cancelProcessingItem}
      onCaptureVideoFrame={handleCaptureVideoFrame}
      onClearSelection={handleClearSelection}
      onDeleteItem={handleDeleteItem}
      onDeleteItemsByStatus={deleteItemsByStatus}
      onDownloadItem={handleDownloadItem}
      onExportMetadata={exportMetadataJson}
      onLaunchMaskEditor={launchMaskEditor}
      onOpenFullscreen={setFullscreenItem}
      onResetCompare={() => {
        setIsCompareMode(false);
        setCompareItemIds([]);
      }}
      onRetryItem={retryFailedItem}
      onReuseTask={reuseTaskInComposer}
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
      onUseAgentReference={(asset) => {
        setAgentReferenceId(asset.id);
        setAgentReferenceUrl(asset.url);
        setAgentReferences([{ id: asset.id, url: asset.url }]);
        setIsAgentDockOpen(true);
      }}
      visibleItemsStep={isDesktopLayout ? 48 : 18}
      formatModelLabel={formatStoredModelLabel}
    />
  );

  const renderCreationPanel = (showGenerateButton: boolean) =>
    traditionalSubTab === "image" ? (
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
        } flex-1 w-full max-w-[1880px] mx-auto px-4 pt-5 sm:px-6 sm:pt-6 grid grid-cols-1 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] xl:grid-cols-[minmax(390px,440px)_minmax(0,1fr)] gap-5 xl:gap-6 items-start z-10`}
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
                  <div className="imagine-creator-meta flex justify-end">
                    <span className="imagine-meta-chip font-mono text-[10px]">
                      {assetStats.statusCounts.processing + assetStats.statusCounts.pending > 0
                        ? `${assetStats.statusCounts.processing + assetStats.statusCounts.pending} 进行中 · ${items.length} 项`
                        : `${items.length} 项本地资产`}
                    </span>
                  </div>
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
                <div className="imagine-creator-meta">
                  <span className="imagine-meta-chip font-mono text-[10px]">
                    {assetStats.statusCounts.processing + assetStats.statusCounts.pending > 0
                      ? `${assetStats.statusCounts.processing + assetStats.statusCounts.pending} 进行中 · ${items.length} 项`
                      : `${items.length} 项本地资产`}
                  </span>
                </div>

                {renderCreationPanel(false)}

              </div>

            <div className="imagine-creator-generate-footer hidden shrink-0 lg:block">
              <CreatorGenerateButton
                mode={traditionalSubTab}
                disabled={!prompt.trim()}
                isSubmitting={traditionalSubTab === "image" ? isSubmittingImage : isSubmittingVideo}
                submitCount={traditionalSubTab === "image" ? imageSubmitCount : videoSubmitCount}
                onGenerate={traditionalSubTab === "image" ? generateManualImage : generateManualVideo}
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
        chatModelGroups={chatModelGroups}
        fetchedModelOptions={fetchedModelOptions}
        imageModelGroups={imageModelGroups}
        isLoadingModels={isLoadingModels}
        modelListMessage={modelListMessage}
        open={showSettings}
        providerCredentials={providerCredentials}
        providerTest={providerTest}
        selectedChatModel={selectedChatModel}
        selectedProvider={selectedProvider}
        videoModelGroups={videoModelGroups}
        onCleanupAssets={handleDataCleanupAssets}
        onClearAssets={handleClearProject}
        onClearCredentials={clearProviderCredentials}
        onClearLocalStorage={handleDataClearLocalStorage}
        onClose={() => setShowSettings(false)}
        onExportWorkspace={handleDataExportWorkspace}
        onImportLocalAssets={handleDataImportLocalAssets}
        onImportWorkspace={handleDataImportWorkspace}
        onRepairAssetSources={handleDataRepairAssetSources}
        onResetBoards={handleDataResetBoards}
        onAddFetchedModels={addFetchedModels}
        onAddManualModels={addManualModels}
        onSaveCredential={handleSaveCredential}
        onSelectChatModel={handleSelectChatModel}
        onSelectProvider={handleSelectProvider}
        refreshProviderModels={refreshProviderModels}
        testProviderConnection={testProviderConnection}
      />

      <FullscreenPreview item={fullscreenItem} onCaptureVideoFrame={handleCaptureVideoFrame} onClose={() => setFullscreenItem(null)} />

      {/* Inpainting Mask Drawer overlay loader */}
      {isMaskOpen && (
        <CanvasMaskEditor
          imageUrl={maskTargetUrl}
          isOpen={isMaskOpen}
          onClose={() => { setIsMaskOpen(false); setMaskTargetUrl(""); setMaskTargetId(""); }}
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
