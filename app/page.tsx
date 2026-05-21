'use client';

import React, { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Play,
  Pause,
  Maximize2,
} from "lucide-react";
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
  removePromptReferenceTokens,
  useReferenceState,
  type AtDropdownTarget,
} from "@/hooks/useReferenceState";
import { useProviderSettings } from "@/hooks/useProviderSettings";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  getImageModelCapabilities,
  getVideoModelCapabilities,
  parseProviderModel,
  supportsAsyncImageGeneration,
  type AiProvider,
  type ModelOption,
} from "@/lib/providers/model-catalog";
import { PROVIDER_KEYS, getProviderMeta } from "@/lib/providers/registry";

type NoticeType = "error" | "info" | "success";
type MaskDestination = "creative" | "agent";

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

export default function Home() {
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
  const videoReferenceMode = videoCapabilities.referenceMode;
  const videoReferenceLimit = videoCapabilities.maxReferenceImages;
  const isFirstLastVideoMode = videoReferenceMode === "firstLast";
  const videoReferenceLabel = isFirstLastVideoMode ? "首帧 / 尾帧" : "视频参考图";
  const videoPromptPlaceholder = isFirstLastVideoMode
    ? "描述首帧到尾帧之间的运动、转场与镜头变化... 可拖入右侧资产生成 @图片 引用"
    : "描述场景的运动与镜头动作... 可拖入右侧资产作为视频参考";
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
    pushWorkspaceNotice,
    referenceImageCount: referenceImages.length,
    setAgentReferenceId,
    setAgentReferenceUrl,
    setAgentReferences,
    setReferenceImage,
    setReferenceImages,
  });
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
      const allItems = await getAllFromDB();
      setItems(allItems);
    }
    loadWorkspace();

    const restoreSettings = setTimeout(() => {
      const storedThemeMode = localStorage.getItem("imagine_theme_mode");
      if (storedThemeMode === "light" || storedThemeMode === "dark") {
        setThemeMode(storedThemeMode);
      }
    }, 0);

    return () => clearTimeout(restoreSettings);
  }, []);

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
  const optimizeActivePrompt = async () => {
    if (!prompt.trim()) return;
    setIsOptimizing(true);
    try {
      const headers = buildProviderHeaders(selectedChatModel);

      const res = await fetch("/api/gemini/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ prompt, model: selectedChatModel }),
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

  const saveMaskOutput = (mergedImageBase64: string, maskBase64: string) => {
    if (maskDestination === "agent") {
      setAgentReferenceUrl(mergedImageBase64);
      if (!agentInput.includes("modify the marked region")) {
        setAgentInput(`In the marked region, change: `);
      }
      setIsAgentDockOpen(true);
    } else {
      // Inject drew brush directly into reference seeds
      setReferenceImage(mergedImageBase64);
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

    return (
      <AtReferenceDropdown
        items={searchableReferenceImages}
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
        } flex-1 w-full max-w-[1880px] mx-auto px-4 pt-5 sm:px-6 sm:pt-6 grid grid-cols-1 lg:grid-cols-[minmax(420px,0.54fr)_minmax(0,1fr)] gap-5 xl:gap-6 items-start z-10`}
      >

        {/* Creation Controls sidebar container (Col 4) */}
        <section className="imagine-creator-panel flex flex-col gap-4">

          {/* Active Creative Panel switch */}
          <div className="imagine-control-surface rounded-xl dark-glass p-4 flex flex-col gap-4 min-h-[500px]">

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
                    isOptimizing={isOptimizing}
                    isSubmitting={isSubmittingVideo}
                    modelGroups={videoModelGroups}
                    prompt={prompt}
                    promptPlaceholder={videoPromptPlaceholder}
                    referenceHelp={videoReferenceHelp}
                    referenceImages={referenceImages}
                    referenceLabel={videoReferenceLabel}
                    referenceLimit={videoReferenceLimit}
                    referenceMode={videoReferenceMode}
                    selectedModel={selectedVideoModel}
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
                    onSelectModel={handleSelectVideoModel}
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
              />,
              document.body,
            )}

          </div>
        </section>

        <AssetGalleryWorkspace
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
          modelOptions={assetStats.modelOptions}
          searchQuery={searchQuery}
          selectedCount={selectedItemIds.length}
          selectedItemIdSet={selectedItemIdSet}
          selectedProvider={selectedProvider}
          statusCounts={assetStats.statusCounts}
          typeCounts={assetStats.typeCounts}
          isCompareMode={isCompareMode}
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
            setIsAgentDockOpen(true);
          }}
          formatModelLabel={formatStoredModelLabel}
        />

      </main>

      <SettingsModal
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
