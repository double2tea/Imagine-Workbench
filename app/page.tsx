'use client';

import React, { useCallback, useState, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, SlidersHorizontal, Sparkles, Video } from "lucide-react";
import AgentDock from "@/components/agent/AgentDock";
import { VISUAL_PRESETS, type VisualPreset } from "@/components/PresetStyles";
import CanvasMaskEditor from "@/components/CanvasMaskEditor";
import FloatingCompareButton from "@/components/assets/FloatingCompareButton";
import FullscreenPreview from "@/components/assets/FullscreenPreview";
import CreationModeTabs, { type CreationMode } from "@/components/creation/CreationModeTabs";
import ImageGenerationPanel from "@/components/creation/ImageGenerationPanel";
import VideoGenerationPanel from "@/components/creation/VideoGenerationPanel";
import AtReferenceDropdown from "@/components/reference/AtReferenceDropdown";
import PromptReferenceDropdown from "@/components/reference/PromptReferenceDropdown";
import ReferenceImagePicker, { type ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import SettingsModal from "@/components/settings/SettingsModal";
import AssetGalleryWorkspace from "@/components/workbench/AssetGalleryWorkspace";
import WorkspaceHeader, { type ThemeMode } from "@/components/workbench/WorkspaceHeader";
import WorkspaceNotices, { type WorkspaceNotice } from "@/components/workbench/WorkspaceNotices";
import { getAllFromDB, clearAllDB, StorageItem } from "@/lib/db";
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
  getImageModelCapabilities,
  getVideoModelCapabilities,
  parseProviderModel,
  supportsAsyncImageGeneration,
  type AiProvider,
  type ModelOption,
} from "@/lib/providers/model-catalog";
import { PROVIDER_KEYS, getProviderMeta } from "@/lib/providers/registry";
import { compressReferenceImageDataUrl, compressReferenceImageFile } from "@/lib/reference-images";

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
  const [imageSize, setImageSize] = useState("1K");
  const [imageThinkingLevel, setImageThinkingLevel] = useState("minimal");
  const [videoDuration, setVideoDuration] = useState("10");
  const [videoPreset, setVideoPreset] = useState("normal");
  const [videoResolution, setVideoResolution] = useState("720p");
  const [customGptImageSize, setCustomGptImageSize] = useState("2560x1440");
  const [traditionalSubTab, setTraditionalSubTab] = useState<CreationMode>("image");
  const [isAgentDockOpen, setIsAgentDockOpen] = useState(false);
  const [isAgentPortalReady, setIsAgentPortalReady] = useState(false);
  const [isAgentDockOverContent, setIsAgentDockOverContent] = useState(false);

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
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
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
  const videoCapabilities = getVideoModelCapabilities(selectedVideoModel);
  const isSubmittingImage = imageSubmitCount > 0;
  const isSubmittingVideo = videoSubmitCount > 0;
  const isGptImageModel = parseProviderModel(selectedModel, selectedProvider).model === "gpt-image-2";
  const canUseAsyncImageGeneration = supportsAsyncImageGeneration(selectedModel);
  const activeImageSize = isGptImageModel && aspectRatio === "custom" ? customGptImageSize.trim() : aspectRatio;
  const activeImageModel = isSubmittingImage && canUseAsyncImageGeneration
    ? `12ai-async:${parseProviderModel(selectedModel, selectedProvider).model}`
    : selectedModel;
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
  const videoReferenceMode = videoCapabilities.referenceMode;
  const videoReferenceLimit = videoCapabilities.maxReferenceImages;
  const isFirstLastVideoMode = videoReferenceMode === "firstLast";
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
    prompt,
    videoReferenceLimit,
    videoReferenceMode,
    pushWorkspaceNotice,
    setAgentInput,
    setPrompt,
  });
  useClipboardImageImport({
    agentReferenceCount: agentReferences.length,
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
    activeImageModel,
    activeImageSize,
    activeVideoDuration,
    activeVideoPreset,
    activeVideoResolution,
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
  });
  const {
    cancelProcessingItem,
    deleteItemsByStatus,
    exportMetadataJson,
    handleBatchDelete,
    handleBatchDownloadZip,
    handleClearSelection,
    handleDeleteItem,
    handleDownloadItem,
    handleResetLocalData,
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
    setSelectedModel(model);
    if (!capabilities.aspectRatios.some(option => option.value === aspectRatio)) {
      setAspectRatio(capabilities.aspectRatios[0]?.value ?? "1:1");
    }
    if (capabilities.imageSizes.length > 0 && !capabilities.imageSizes.some(option => option.value === imageSize)) {
      setImageSize(capabilities.imageSizes[0].value);
    }
    if (
      capabilities.thinkingLevels.length > 0 &&
      !capabilities.thinkingLevels.some(option => option.value === imageThinkingLevel)
    ) {
      setImageThinkingLevel(capabilities.thinkingLevels[0].value);
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
  };

  const reuseTaskInComposer = (item: StorageItem) => {
    const request = item.generationRequest;
    const model = request?.model ?? item.model;
    const references: ReferenceImageRef[] = (request?.referenceImages ?? []).map((url, index) => {
      const videoMode = item.type === "video" ? getVideoModelCapabilities(model).referenceMode : "reference";
      const role: ReferenceImageRef["role"] = videoMode === "firstLast"
        ? index === 0
          ? "start"
          : index === 1
            ? "end"
            : "general"
        : "general";
      return { id: `${item.id}_reference_${index + 1}`, url, role };
    });

    setPrompt(item.prompt);
    setReferenceImages(references);
    setReferenceImage(references[0]?.url ?? null);

    if (item.type === "image") {
      const imageModel = getSelectableStoredImageModel(model, selectedProvider);
      const nextAspectRatio = request?.aspectRatio ?? item.aspectRatio;
      const capabilities = getImageModelCapabilities(imageModel);

      handleSelectImageModel(imageModel);
      if (capabilities.aspectRatios.some(option => option.value === nextAspectRatio)) {
        setAspectRatio(nextAspectRatio);
      } else {
        setAspectRatio("custom");
        setCustomGptImageSize(nextAspectRatio);
      }
      if (request?.imageSize) setImageSize(request.imageSize);
      if (request?.thinkingLevel) setImageThinkingLevel(request.thinkingLevel);
      setTraditionalSubTab("image");
    } else {
      handleSelectVideoModel(model);
      setAspectRatio(request?.aspectRatio ?? item.aspectRatio);
      if (request?.videoDurationSeconds) setVideoDuration(request.videoDurationSeconds);
      if (request?.videoPreset) setVideoPreset(request.videoPreset);
      if (request?.videoResolution) setVideoResolution(request.videoResolution);
      setTraditionalSubTab("video");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    pushWorkspaceNotice("success", "已回填任务参数到左侧工作面板");
  };

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setIsAgentPortalReady(true), 0);
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
        const allItems = await getAllFromDB();
        setItems(allItems);
      } catch (error) {
        console.error("IndexedDB Read Failed:", error);
        pushWorkspaceNotice("error", `本地项目库读取失败：${toErrorMessage(error, "IndexedDB 读取失败")}`);
      }
    }
    loadWorkspace();

    const restoreSettings = setTimeout(() => {
      const storedThemeMode = localStorage.getItem("imagine_theme_mode");
      if (storedThemeMode === "light" || storedThemeMode === "dark") {
        setThemeMode(storedThemeMode);
      }
    }, 0);

    return () => clearTimeout(restoreSettings);
  }, [pushWorkspaceNotice]);

  // Preset quick injection
  const applyPreset = (preset: VisualPreset) => {
    let base = prompt.trim();
    const hasPreset = base.includes(preset.promptSuffix);

    // Remove any previously appended preset suffixes to allow seamless switching
    VISUAL_PRESETS.forEach(p => {
      if (base.includes(`, ${p.promptSuffix}`)) {
        base = base.replace(`, ${p.promptSuffix}`, "");
      } else if (base.includes(p.promptSuffix)) {
        base = base.replace(p.promptSuffix, "");
      }
    });

    // Clean up trailing/leading commas or whitespace
    base = base.trim().replace(/^,|,$/g, "").trim();

    if (hasPreset) {
      // Toggle off
      setPrompt(base);
      if (preset.negativePrompt && negativePrompt === preset.negativePrompt) {
        setNegativePrompt("");
      }
    } else {
      // Toggle on and apply new suffix
      if (base) {
        setPrompt(`${base}, ${preset.promptSuffix}`);
      } else {
        setPrompt(preset.promptSuffix);
      }
      if (preset.negativePrompt) {
        setNegativePrompt(preset.negativePrompt);
      }
    }
  };

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

  const saveMaskOutput = async (mergedImageBase64: string, maskBase64: string) => {
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
      type: "image",
      url: reference.url,
      prompt: `Agent 引用图 ${index + 1}`,
      model: "agent-reference",
      aspectRatio: "auto",
      createdAt: "",
      status: "complete",
      progress: 100,
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
        onSelect={(item) => handleSelectAtItem(item.url, item.id, type)}
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
  });

  const handleClearProject = async () => {
    if (confirm("🚨 注意：此操作将清空本地 IndexedDB 存储的所有创意图片与视频。已被下载的文件不会受影响。确认清空吗？")) {
      await clearAllDB();
      setItems([]);
      setSelectedItemIds([]);
      setCompareItemIds([]);
    }
  };

  const toggleThemeMode = () => {
    setThemeMode(prev => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      localStorage.setItem("imagine_theme_mode", next);
      return next;
    });
  };

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
      onSetAssetStatusFilter={setAssetStatusFilter}
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

  const renderMobileQuickComposer = () => {
    const isImageMode = traditionalSubTab === "image";
    const activeOptimizeLabel = isImageMode ? "优化" : "润色";
    const activeSubmitCount = isImageMode ? imageSubmitCount : videoSubmitCount;
    const isSubmitting = isImageMode ? isSubmittingImage : isSubmittingVideo;
    const promptType: AtDropdownTarget = isImageMode ? "image-prompt" : "video-prompt";

    return (
      <section className="imagine-mobile-composer rounded-xl dark-glass p-3">
        <CreationModeTabs value={traditionalSubTab} onChange={setTraditionalSubTab} />

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            {isImageMode ? <Sparkles className="h-3.5 w-3.5 text-blue-300" /> : <Video className="h-3.5 w-3.5 text-violet-300" />}
            描述
          </label>
          <button
            type="button"
            onClick={() => {
              optimizeActivePrompt();
            }}
            disabled={isOptimizing || !prompt.trim()}
            className={`flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${
              isOptimizing || !prompt.trim()
                ? "border-slate-800 bg-slate-900/70 text-slate-600"
                : "border-blue-400/25 bg-blue-500/12 text-blue-200"
            }`}
          >
            {isOptimizing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {activeOptimizeLabel}
          </button>
        </div>

        <div className="imagine-field-shell relative mt-2 rounded-lg border border-slate-800 bg-slate-950/55 p-3 transition focus-within:border-blue-400/35">
          {atDropdown.visible && atDropdown.type === promptType ? renderAtDropdown(promptType) : null}
          <textarea
            value={prompt}
            onChange={(event) => handleTextareaChange(event.target.value, promptType)}
            onDrop={(event) => handlePromptDropAsset(event, promptType)}
            placeholder={isImageMode ? "描述你想生成的画面，输入 @ 引用作品" : videoPromptPlaceholder}
            className="h-32 w-full resize-none border-0 bg-transparent text-base leading-6 text-slate-100 placeholder-slate-500 outline-0 ring-0 focus:ring-0"
          />
          <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500">
            <span>@ 引用作品</span>
            <span>{prompt.length} 字符</span>
          </div>
        </div>

        {isImageMode ? (
          <ReferenceImagePicker
            addLabel="多图垫"
            browseClassName="font-medium text-blue-300 underline-offset-4 hover:text-blue-200 hover:underline cursor-pointer"
            clearLabel="清空"
            emptyHelp="支持 JPG / PNG / WEBP"
            emptyLabel="添加图片"
            label={`参考图 ${referenceImages.length > 0 ? `(${referenceImages.length})` : ""}`}
            maxCount={4}
            references={referenceImages}
            uploadLabel="上传"
            onClear={() => {
              setReferenceImages([]);
              setReferenceImage(null);
              setPrompt(removePromptReferenceTokens);
            }}
            onDropAsset={(asset) => handleReferenceDropAsset(asset, "image-prompt")}
            onDropFiles={(files) => handleReferenceDropFiles(files, "image-prompt")}
            onRemove={removeReferenceImage}
            onUpload={handleImageUpload}
          />
        ) : (
          <ReferenceImagePicker
            addLabel="添加参考"
            browseClassName="font-medium text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline cursor-pointer"
            clearLabel={videoClearReferenceLabel}
            emptyHelp={videoReferenceHelp}
            emptyLabel={`添加${videoReferenceLabel}`}
            label={`${videoReferenceLabel} ${referenceImages.length > 0 ? `(${Math.min(referenceImages.length, videoReferenceLimit)}/${videoReferenceLimit})` : ""}`}
            maxCount={videoReferenceLimit}
            references={referenceImages}
            roleMode={isFirstLastVideoMode}
            uploadLabel="上传"
            onClear={() => {
              setReferenceImages([]);
              setReferenceImage(null);
              setPrompt(removePromptReferenceTokens);
            }}
            onDropAsset={(asset) => handleReferenceDropAsset(asset, "video-prompt")}
            onDropFiles={(files) => handleReferenceDropFiles(files, "video-prompt")}
            onRemove={removeReferenceImage}
            onRoleChange={(id, role) => toggleReferenceRole(id, role ?? "general")}
            onUpload={handleImageUpload}
          />
        )}

        <button
          type="button"
          onClick={() => {
            if (isImageMode) {
              generateManualImage();
            } else {
              generateManualVideo();
            }
          }}
          disabled={!prompt.trim()}
          className={`imagine-primary-action mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition ${
            !prompt.trim()
              ? "cursor-not-allowed border border-slate-800 bg-slate-900/70 text-slate-600"
              : isImageMode
              ? "bg-blue-600 text-white active:scale-95"
              : "bg-violet-600 text-white active:scale-95"
          }`}
        >
          {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : isImageMode ? <Sparkles className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          {isSubmitting ? `提交中 (${activeSubmitCount})` : isImageMode ? "生成图片" : "生成视频"}
        </button>
      </section>
    );
  };

  const renderMobileAdvancedSettings = () => {
    const isImageMode = traditionalSubTab === "image";

    return (
      <details className="imagine-mobile-advanced rounded-xl border border-slate-800 bg-slate-950/35 p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-slate-300">
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            高级参数
          </span>
          <span className="font-mono text-[10px] text-slate-500">{isImageMode ? "图像" : "视频"}</span>
        </summary>

        {isImageMode ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {VISUAL_PRESETS.map((preset) => {
                const isActive = prompt.includes(preset.promptSuffix);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`imagine-preset-chip flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs ${
                      isActive
                        ? "border-blue-400/35 bg-blue-500/14 text-blue-100"
                        : "border-slate-800 bg-slate-950/50 text-slate-300"
                    }`}
                  >
                    <span>{preset.emoji}</span>
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              placeholder="反向提示词"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-400/35 focus:outline-none"
            />

            <div className="grid grid-cols-1 gap-3">
              <select
                value={selectedModel}
                onChange={(event) => handleSelectImageModel(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 focus:border-blue-400/35 focus:outline-none"
              >
                {imageModelGroups.map(group => (
                  <optgroup key={group.provider} label={group.label}>
                    {group.options.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <select
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 focus:border-blue-400/35 focus:outline-none"
              >
                {imageCapabilities.aspectRatios.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {imageCapabilities.imageSizes.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-slate-800 bg-slate-950/45 p-1.5">
                {imageCapabilities.imageSizes.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setImageSize(option.value)}
                    className={`min-h-8 rounded-md px-2 font-mono text-[10px] ${imageSize === option.value ? "bg-blue-500/16 text-blue-100" : "text-slate-500"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <select
              value={selectedVideoModel}
              onChange={(event) => handleSelectVideoModel(event.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 focus:border-violet-400/35 focus:outline-none"
            >
              {videoModelGroups.map(group => (
                <optgroup key={group.provider} label={group.label}>
                  {group.options.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            <select
              value={aspectRatio}
              onChange={(event) => setAspectRatio(event.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 focus:border-violet-400/35 focus:outline-none"
            >
              {videoCapabilities.sizes.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            {videoCapabilities.resolutions.length > 0 && (
              <select
                value={videoResolution}
                onChange={(event) => setVideoResolution(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 focus:border-violet-400/35 focus:outline-none"
              >
                {videoCapabilities.resolutions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}

            {videoCapabilities.durations.length > 0 && (
              <select
                value={videoDuration}
                onChange={(event) => setVideoDuration(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 focus:border-violet-400/35 focus:outline-none"
              >
                {videoCapabilities.durations.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}

            {videoCapabilities.presets.length > 0 && (
              <select
                value={videoPreset}
                onChange={(event) => setVideoPreset(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 focus:border-violet-400/35 focus:outline-none"
              >
                {videoCapabilities.presets.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </details>
    );
  };

  return (
    <div className={`imagine-workbench-shell imagine-theme-${themeMode} min-h-screen flex flex-col bg-[#07080b] text-slate-100 font-sans selection:bg-blue-500/30 selection:text-slate-100 relative overflow-hidden`}>

      {/* Workbench depth layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.045)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,41,59,0.42),transparent_56%)]" />
      </div>

      <WorkspaceNotices notices={workspaceNotices} onDismiss={dismissWorkspaceNotice} />

      <WorkspaceHeader
        themeMode={themeMode}
        onClearProject={handleClearProject}
        onOpenSettings={() => setShowSettings(prev => !prev)}
        onToggleTheme={toggleThemeMode}
      />

      {/* Main Multi-panel Layout grid */}
      <main
        className={`imagine-main-grid ${
          isAgentDockOpen ? "imagine-main-grid-agent-open" : "imagine-main-grid-agent-closed"
        } flex-1 w-full max-w-[1880px] mx-auto px-4 pt-5 sm:px-6 sm:pt-6 grid grid-cols-1 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] xl:grid-cols-[minmax(390px,440px)_minmax(0,1fr)] gap-5 xl:gap-6 items-start z-10`}
      >

        {/* Creation Controls sidebar container (Col 4) */}
        <section className="imagine-creator-panel flex flex-col gap-4">
          {!isDesktopLayout && (
            <section className="imagine-mobile-workflow flex flex-col gap-3 lg:hidden">
              <section className="imagine-mobile-asset-stream">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold text-slate-300">任务与结果</h2>
                  <span className="font-mono text-[10px] text-slate-500">{items.length} 项</span>
                </div>
                {renderAssetGalleryWorkspace()}
              </section>

              {renderMobileQuickComposer()}

              {renderMobileAdvancedSettings()}
            </section>
          )}

          {/* Active Creative Panel switch */}
          <div className="imagine-control-surface hidden rounded-xl dark-glass p-4 lg:flex flex-col gap-4 min-h-[500px]">

            {/* Creative workflow controls */}
              <div className="flex flex-col gap-3.5 animate-fade-in">

                <CreationModeTabs value={traditionalSubTab} onChange={setTraditionalSubTab} />

                {traditionalSubTab === "image" ? (
                  <ImageGenerationPanel
                    atDropdownNode={atDropdown.visible && atDropdown.type === "image-prompt" ? renderAtDropdown("image-prompt") : null}
                    capabilities={imageCapabilities}
                    customGptImageSize={customGptImageSize}
                    imageSize={imageSize}
                    imageThinkingLevel={imageThinkingLevel}
                    isGptImageModel={isGptImageModel}
                    isOptimizing={isOptimizing}
                    isSubmitting={isSubmittingImage}
                    modelGroups={imageModelGroups}
                    negativePrompt={negativePrompt}
                    prompt={prompt}
                    referenceImages={referenceImages}
                    selectedAspectRatio={aspectRatio}
                    selectedModel={selectedModel}
                    submitCount={imageSubmitCount}
                    onApplyPreset={applyPreset}
                    onClearReferences={() => {
                      setReferenceImages([]);
                      setReferenceImage(null);
                      setPrompt(removePromptReferenceTokens);
                    }}
                    onCustomGptImageSizeChange={setCustomGptImageSize}
                    onGenerate={generateManualImage}
                    onImageSizeChange={setImageSize}
                    onNegativePromptChange={setNegativePrompt}
                    onOptimizePrompt={optimizeActivePrompt}
                    onPromptChange={(value) => handleTextareaChange(value, "image-prompt")}
                    onPromptDropAsset={(event) => handlePromptDropAsset(event, "image-prompt")}
                    onReferenceDropAsset={(asset) => handleReferenceDropAsset(asset, "image-prompt")}
                    onReferenceDropFiles={(files) => handleReferenceDropFiles(files, "image-prompt")}
                    onReferenceRemove={removeReferenceImage}
                    onReferenceUpload={handleImageUpload}
                    onSelectAspectRatio={setAspectRatio}
                    onSelectModel={handleSelectImageModel}
                    onThinkingLevelChange={setImageThinkingLevel}
                  />
                ) : (
                  <VideoGenerationPanel
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
                    referenceMode={videoReferenceMode}
                    resolutionOptions={videoCapabilities.resolutions}
                    selectedDuration={videoDuration}
                    selectedModel={selectedVideoModel}
                    selectedPreset={videoPreset}
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
                    onPromptChange={(value) => handleTextareaChange(value, "video-prompt")}
                    onPromptDropAsset={(event) => handlePromptDropAsset(event, "video-prompt")}
                    onReferenceDropAsset={(asset) => handleReferenceDropAsset(asset, "video-prompt")}
                    onReferenceDropFiles={(files) => handleReferenceDropFiles(files, "video-prompt")}
                    onReferenceRemove={removeReferenceImage}
                    onReferenceRoleChange={(id, role) => toggleReferenceRole(id, role ?? "general")}
                    onReferenceUpload={handleImageUpload}
                    onSelectDuration={setVideoDuration}
                    onSelectResolution={setVideoResolution}
                    onSelectModel={handleSelectVideoModel}
                    onSelectPreset={setVideoPreset}
                    onSelectSize={setAspectRatio}
                  />
                )}

              </div>


            {isAgentPortalReady && !isAgentDockSuppressed && createPortal(
              <AgentDock
                ref={agentDockRef}
                activeCountdownId={activeCountdownId}
                agentReferenceId={agentReferenceId}
                agentReferenceUrl={agentReferenceUrl}
                atDropdownNode={atDropdown.visible && atDropdown.type === "agent-prompt" ? renderAtDropdown("agent-prompt") : null}
                autoExecute={autoExecute}
                chatBottomRef={chatBottomRef}
                countdownSeconds={countdownSeconds}
                input={agentInput}
                isLoading={isAgentLoading}
                isOpen={isAgentDockOpen}
                isOverContent={isAgentDockOverContent}
                messages={agentMessages}
                themeMode={themeMode}
                onCancelCountdown={clearActiveCountdown}
                onChangeInput={(value) => handleTextareaChange(value, "agent-prompt")}
                onClearChat={handleClearChat}
                onClearReference={() => {
                  setAgentReferenceId(null);
                  setAgentReferenceUrl(null);
                  setAgentReferences([]);
                }}
                onDeclineAction={declineAgentToolAction}
                onExecuteAction={executeAgentToolAction}
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
              document.body,
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
        assetFailedCount={assetStats.statusCounts.failed}
        assetStatusCounts={assetStats.typeCounts}
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
        onClearCredentials={clearProviderCredentials}
        onClose={() => setShowSettings(false)}
        onResetData={handleResetLocalData}
        onAddFetchedModels={addFetchedModels}
        onAddManualModels={addManualModels}
        onSaveCredential={handleSaveCredential}
        onSelectChatModel={handleSelectChatModel}
        onSelectProvider={handleSelectProvider}
        refreshProviderModels={refreshProviderModels}
        testProviderConnection={testProviderConnection}
      />

      <FullscreenPreview item={fullscreenItem} onClose={() => setFullscreenItem(null)} />

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
