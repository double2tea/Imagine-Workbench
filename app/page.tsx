'use client';

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import AgentDock from "@/components/agent/AgentDock";
import CanvasMaskEditor, { type CanvasEditorMode, type CanvasMaskEditorOutput } from "@/components/CanvasMaskEditor";
import VisualPromptAdjustEditor from "@/components/VisualPromptAdjustEditor";
import SaveVoiceProfileDialog, { type SaveVoiceProfileDialogInput } from "@/components/audio/SaveVoiceProfileDialog";
import FloatingCompareButton from "@/components/assets/FloatingCompareButton";
import FullscreenPreview from "@/components/assets/FullscreenPreview";
import AssetLibraryModal from "@/components/library/AssetLibraryModal";
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
  listWorkspaceGalleryMetas,
  mergeStorageItems,
  metaToPlaceholderItem,
  saveToDB,
  type StorageItem,
} from "@/lib/db";
import { useAgentController } from "@/hooks/useAgentController";
import { useAssetActions } from "@/hooks/useAssetActions";
import { useAssetWorkspaceState } from "@/hooks/useAssetWorkspaceState";
import { useAssetLibrary } from "@/hooks/useAssetLibrary";
import { useClipboardImageImport } from "@/hooks/useClipboardImageImport";
import { useGenerationActions } from "@/hooks/useGenerationActions";
import { useGenerationTaskStore } from "@/hooks/useGenerationTaskStore";
import { useMediaPolling } from "@/hooks/useMediaPolling";
import { saveItemWithPreview } from "@/lib/assets/previews";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { audioOperationFormatOptions, audioOperationRequiresStylePrompt, audioOperationRequiresTextInput } from "@/lib/audio-operation-rules";
import {
  generationTaskToGalleryItem,
  indexedDbGenerationTaskStorage,
  legacyGenerationTaskId,
  type GenerationTaskStorage,
} from "@/lib/generation-tasks";
import {
  IMAGE_REFERENCE_LIMIT,
  removePromptReferenceTokens,
  useReferenceState,
  type AtDropdownTarget,
} from "@/hooks/useReferenceState";
import { useProviderSettings } from "@/hooks/useProviderSettings";
import {
  useResolveConnectionCheck,
  useResolveIntegrationSettings,
} from "@/hooks/useResolveIntegrationSettings";
import { useImageEditFeatureModels } from "@/hooks/useImageEditFeatureModels";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import {
  imageEditFeatureLabel,
  imageQuickEditFallbackPrompt,
  type ImageQuickEditTarget,
  resolveImageQuickEditTarget,
  submitImageQuickEdit,
} from "@/lib/image-quick-edit-targets";
import { persistDefaultGenerationModel, readDefaultGenerationModel } from "@/lib/default-generation-models";
import { isVisualAdjustmentFeature } from "@/lib/image-visual-adjustment-prompts";
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
  imageParameterValuesFromLegacy,
  imageParameterValuesToRunningHubYouchuan,
  resolveAsyncImageModelValue,
  tryParseProviderModel,
  type AiProvider,
  type AudioOperationMode,
  type ModelOption,
  type VideoReferenceMode,
} from "@/lib/providers/model-catalog";
import { getProviderMeta, type CustomProviderDefinition } from "@/lib/providers/registry";
import { RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS, runningHubAppPresetRequiresPrompt } from "@/lib/providers/runninghub";
import { buildGenerationModelPriceOptions } from "@/lib/providers/pricing";
import type { RunningHubYouchuanAdvancedSettings } from "@/lib/providers/types";
import { saveClonedVoiceProfileFromAsset } from "@/lib/voice-profiles";
import {
  closestValidCustomImageDimensions,
  formatMediaReferenceDimensions,
  getMediaReferenceType,
  mediaReferenceLabel,
  mediaReferenceTypeFromMime,
  parseMediaReferenceDimensions,
  type MediaReferenceDimensions,
} from "@/lib/media-references";
import { API_ROUTES } from "@/lib/api/routes";
import {
  REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES,
  compressReferenceImageDataUrl,
  compressReferenceImageFile,
  prepareReferenceImageUrlForRequest,
} from "@/lib/reference-images";
import { selectVideoReferenceTypesForMode } from "@/lib/video-reference-selection";
import { DEFAULT_CINEMATIC_PROFILE, type CinematicProfile } from "@/lib/cinematic-controls";
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
import {
  cancelTeamGenerationTask,
  deleteTeamAsset,
  deleteTeamGenerationTask,
  fetchTeamGenerationTasks,
  fetchTeamWorkspaceGalleryItems,
  fetchWorkspaceStorageRuntimeStatus,
  readTeamCsrfToken,
  saveTeamAsset,
  saveTeamGenerationTask,
  updateTeamGenerationTask,
} from "@/lib/storage/team-client";
import { useTranslations, t as translate } from "@/lib/i18n";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { getClearWorkspaceAssetsMessage } from "@/lib/workspace-messages";

type NoticeType = "error" | "info" | "success";
type MaskDestination = "creative" | "agent";
type WorkspaceAssetStorageTarget = "indexeddb" | "postgres";
type AssetLibraryMode = "manage" | "reference";
type ImageSizeMode = "preset" | "custom";

interface WorkspaceImageQuickEditJob {
  controller: AbortController;
  editAspectRatio: string;
  editImageResolution: string;
  editImageUrl: string;
  editPrompt: string;
  guideUrl: string | undefined;
  maskUrl: string | undefined;
  operation: ImageEditFeature;
  pending: StorageItem;
  pendingTaskIds: string[];
  target: ImageQuickEditTarget;
}
const DESKTOP_LAYOUT_QUERY = "(min-width: 1024px)";

function useDesktopLayout(): boolean | null {
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_LAYOUT_QUERY);
    const update = () => setIsDesktopLayout(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDesktopLayout;
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

function requireTeamCsrfToken(): string {
  const csrfToken = readTeamCsrfToken();
  if (!csrfToken) throw new Error("CSRF token is required");
  return csrfToken;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function relatedQuickEditTaskIds(assetId: string): string[] {
  return [assetId, legacyGenerationTaskId(assetId)];
}

function hasLocallyCanceledQuickEdit(ids: string[], canceledIds: Set<string>): boolean {
  return ids.some(id => canceledIds.has(id));
}

function clearLocallyCanceledQuickEdit(ids: string[], canceledIds: Set<string>): void {
  for (const id of ids) canceledIds.delete(id);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(translate("common.errors.fileReadNotDataUrl")));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error(translate("common.errors.fileReadFailed")));
    reader.readAsDataURL(file);
  });
}

function referenceImagePixelDimensions(reference: ReferenceImageRef): MediaReferenceDimensions | null {
  const { height, width } = reference;
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  return { width, height };
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
  const { t, locale } = useTranslations();
  const { t: creationT } = useTranslations("creation");
  const isDesktopLayout = useDesktopLayout();
  const isMobileLayout = isDesktopLayout === false;

  // Database State
  const [items, setItems] = useState<StorageItem[]>([]);
  const [workspaceStorageTarget, setWorkspaceStorageTarget] = useState<WorkspaceAssetStorageTarget>("indexeddb");
  const workspaceGenerationTaskStorage = useMemo<GenerationTaskStorage>(() => {
    if (workspaceStorageTarget !== "postgres") return indexedDbGenerationTaskStorage;
    return {
      cancel: taskId => cancelTeamGenerationTask(taskId, requireTeamCsrfToken()),
      delete: taskId => deleteTeamGenerationTask(taskId, requireTeamCsrfToken()),
      list: async options => (await fetchTeamGenerationTasks(options)).tasks,
      save: async task => {
        await saveTeamGenerationTask(task, requireTeamCsrfToken());
      },
      update: (taskId, update) => updateTeamGenerationTask(taskId, update, requireTeamCsrfToken()),
    };
  }, [workspaceStorageTarget]);
  const { generationTasks, setGenerationTasks } = useGenerationTaskStore({ storage: workspaceGenerationTaskStorage });

  // Traditional Form States
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(() => readDefaultGenerationModel("image"));
  const [selectedVideoModel, setSelectedVideoModel] = useState(() => readDefaultGenerationModel("video"));
  const [selectedAudioModel, setSelectedAudioModel] = useState(() => readDefaultGenerationModel("audio"));
  const [selectedAudioMode, setSelectedAudioMode] = useState<AudioOperationMode>("tts");
  const [audioFormat, setAudioFormat] = useState("wav");
  const [audioStylePrompt, setAudioStylePrompt] = useState("");
  const [asrLanguage, setAsrLanguage] = useState<"auto" | "zh" | "en">("auto");
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState("");
  const [voiceCloneConsentAccepted, setVoiceCloneConsentAccepted] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageResolution, setImageResolution] = useState("2K");
  const [imageSizeMode, setImageSizeMode] = useState<ImageSizeMode>("preset");
  const [imageQuality, setImageQuality] = useState("auto");
  const [imageThinkingLevel, setImageThinkingLevel] = useState("minimal");
  const [runningHubYouchuan, setRunningHubYouchuan] = useState<RunningHubYouchuanAdvancedSettings>(RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS);
  const [imageBackgroundGeneration, setImageBackgroundGeneration] = useState(false);
  const [videoDuration, setVideoDuration] = useState("10");
  const [videoPreset, setVideoPreset] = useState("normal");
  const [selectedVideoReferenceMode, setSelectedVideoReferenceMode] = useState<VideoReferenceMode>("reference");
  const [videoResolution, setVideoResolution] = useState("720p");
  const [cinematicProfile, setCinematicProfile] = useState<CinematicProfile>(DEFAULT_CINEMATIC_PROFILE);
  const [customImageSize, setCustomImageSize] = useState("2560x1440");
  const [traditionalSubTab, setTraditionalSubTab] = useState<CreationMode>("image");
  const [isAgentDockOpen, setIsAgentDockOpen] = useState(false);
  const [isAgentPortalReady, setIsAgentPortalReady] = useState(false);
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
  const assetLibrary = useAssetLibrary();

  // Agent State
  const [agentInput, setAgentInput] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [assetLibraryMode, setAssetLibraryMode] = useState<AssetLibraryMode>("manage");
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
  const [assetLibraryTarget, setAssetLibraryTarget] = useState<Exclude<AtDropdownTarget, "agent-prompt">>("image-prompt");

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
  const [maskInitialMode, setMaskInitialMode] = useState<CanvasEditorMode>("mask");
  const [maskEditSourceItem, setMaskEditSourceItem] = useState<StorageItem | null>(null);

  // Fullscreen Preview Overlay State
  const [fullscreenItem, setFullscreenItem] = useState<StorageItem | null>(null);
  const [panoramaItem, setPanoramaItem] = useState<StorageItem | null>(null);
  const [voiceProfileSourceItem, setVoiceProfileSourceItem] = useState<StorageItem | null>(null);

  // References
  const pollingFailuresRef = useRef<Record<string, number>>({});
  const generationAbortControllersRef = useRef<Record<string, AbortController>>({});
  const locallyCanceledItemIdsRef = useRef<Set<string>>(new Set());
  const originalAssetPromoteIdsRef = useRef<Set<string>>(new Set());
  const workspaceNoticeSequenceRef = useRef(0);
  const previousImageReferenceCountRef = useRef(0);
  const isAgentDockSuppressed = showSettings || isMaskOpen || fullscreenItem !== null || panoramaItem !== null || voiceProfileSourceItem !== null;

  const dismissWorkspaceNotice = useCallback((id: string) => {
    setWorkspaceNotices(prev => prev.filter(notice => notice.id !== id));
  }, [setWorkspaceNotices]);

  const pushWorkspaceNotice = useCallback((type: NoticeType, message: string) => {
    workspaceNoticeSequenceRef.current += 1;
    const id = `${makeClientId("notice")}_${workspaceNoticeSequenceRef.current}`;
    setWorkspaceNotices(prev => [{ id, type, message }, ...prev].slice(0, 4));
  }, [setWorkspaceNotices]);

  const {
    resolveIntegrationAvailable,
    resolveIntegrationEnabled,
    setResolveIntegrationEnabled,
  } = useResolveIntegrationSettings();
  const { resolveCheckStatus, runResolveCheck } = useResolveConnectionCheck({
    enabled: resolveIntegrationEnabled,
    pushWorkspaceNotice,
  });

  useEffect(() => {
    let isActive = true;
    void fetchWorkspaceStorageRuntimeStatus()
      .then(status => {
        if (isActive) setWorkspaceStorageTarget(status.targetKind);
      })
      .catch(error => {
        if (isActive) pushWorkspaceNotice("error", `Storage status read failed: ${toErrorMessage(error, "Storage status failed")}`);
      });
    return () => {
      isActive = false;
    };
  }, [pushWorkspaceNotice]);

  const resolveOriginalStorageItem = useCallback(async (item: StorageItem): Promise<StorageItem> => {
    const storedItem = items.find(entry => entry.id === item.id) ?? item;
    const originalUrl = await resolveAssetOriginalUrl(storedItem);
    if (!originalUrl.trim()) {
      throw new Error(t("common.errors.originalMediaNotFound"));
    }
    return { ...storedItem, url: originalUrl };
  }, [items]);

  const deleteWorkspaceAssetById = useCallback(async (id: string): Promise<void> => {
    if (workspaceStorageTarget === "postgres") {
      await deleteTeamAsset(id, requireTeamCsrfToken());
      return;
    }
    await deleteFromDB(id);
  }, [workspaceStorageTarget]);

  const saveWorkspaceAssetDirect = useCallback(async (item: StorageItem): Promise<StorageItem> => {
    if (workspaceStorageTarget === "postgres") {
      return saveTeamAsset(item, requireTeamCsrfToken());
    }
    await saveToDB(item);
    return item;
  }, [workspaceStorageTarget]);

  const saveWorkspaceAssetWithPreview = useCallback(async (item: StorageItem): Promise<StorageItem> => {
    if (workspaceStorageTarget === "postgres") {
      return saveTeamAsset(item, requireTeamCsrfToken());
    }
    return saveItemWithPreview(item);
  }, [workspaceStorageTarget]);

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
    openOriginalItem(item, setFullscreenItem, t("common.notices.originalMediaReadFailed"));
  }, [openOriginalItem]);

  const handleOpenPanorama = useCallback((item: StorageItem): void => {
    openOriginalItem(item, setPanoramaItem, t("common.notices.originalImageReadFailed"));
  }, [openOriginalItem]);

  const handleSaveVoiceProfileSource = useCallback((item: StorageItem): void => {
    openOriginalItem(item, setVoiceProfileSourceItem, t("common.notices.originalAudioReadFailed"));
  }, [openOriginalItem]);

  const promoteItemToOriginal = useCallback((item: StorageItem): void => {
    if (item.status !== "complete") return;
    if (originalAssetPromoteIdsRef.current.has(item.id)) return;
    originalAssetPromoteIdsRef.current.add(item.id);
    void resolveOriginalStorageItem(item).then(
      originalItem => {
        originalAssetPromoteIdsRef.current.delete(item.id);
        setItems(prev => {
          const target = prev.find(current => current.id === originalItem.id);
          if (!target || target.url === originalItem.url) return prev;
          return prev.map(current =>
            current.id === originalItem.id
              ? { ...current, url: originalItem.url }
              : current,
          );
        });
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
    hasRestoredSettings,
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
  } = useProviderSettings({
    isResolveIntegrationEnabled: resolveIntegrationEnabled,
    pushWorkspaceNotice,
  });

  useEffect(() => {
    if (!hasRestoredSettings) return;
    if (!modelProviderIsAvailable(selectedModel, selectedProvider, providerKeys)) {
      setSelectedModel(DEFAULT_IMAGE_MODEL);
    }
    if (!modelProviderIsAvailable(selectedVideoModel, selectedProvider, providerKeys)) {
      setSelectedVideoModel(DEFAULT_VIDEO_MODEL);
    }
    if (!modelProviderIsAvailable(selectedAudioModel, selectedProvider, providerKeys)) {
      setSelectedAudioModel(DEFAULT_AUDIO_MODEL);
    }
  }, [hasRestoredSettings, providerKeys, selectedAudioModel, selectedModel, selectedProvider, selectedVideoModel]);

  const handleSaveVoiceProfileFromAsset = useCallback(async (input: SaveVoiceProfileDialogInput): Promise<void> => {
    if (!voiceProfileSourceItem) return;
    await saveClonedVoiceProfileFromAsset(voiceProfileSourceItem, {
      ...input,
      fallbackProvider: selectedProvider,
    });
    pushWorkspaceNotice("success", t("common.notices.voiceProfileSaved"));
  }, [pushWorkspaceNotice, selectedProvider, voiceProfileSourceItem]);

  const imageCapabilities = getImageModelCapabilities(selectedModel);
  const audioCapabilities = getAudioModelCapabilities(selectedAudioModel);
  const isCustomImageSize = imageSizeMode === "custom";
  const customImageAspectRatio = isCustomImageSize
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
  const activeImageResolution = isCustomImageSize ? customImageSize.trim() : imageResolution;
  const activeImageQuality = imageCapabilities.qualities.some(option => option.value === imageQuality) ? imageQuality : undefined;
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
  const videoReferenceLabel = isFirstLastVideoMode ? t("common.videoReference.firstLastLabel") : t("common.videoReference.label");
  const videoPromptPlaceholder = isFirstLastVideoMode
    ? t("common.videoReference.promptPlaceholderFirstLast")
    : t("common.videoReference.promptPlaceholderReference");
  const videoReferenceHelp = isFirstLastVideoMode
    ? t("common.videoReference.firstLastHelp")
    : t("common.videoReference.referenceHelp");
  const videoClearReferenceLabel = isFirstLastVideoMode ? t("common.videoReference.clearFirstLast") : t("common.videoReference.clearReference");
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
    t,
    videoReferenceLimit,
    videoReferenceMediaTypes: videoCapabilities.referenceMediaTypes,
    videoReferenceMode: activeVideoReferenceMode,
    pushWorkspaceNotice,
    setAgentInput,
    setPrompt,
  });

  useEffect(() => {
    const imageReferences = referenceImages.filter(reference => getMediaReferenceType(reference) === "image");
    const previousImageReferenceCount = previousImageReferenceCountRef.current;
    previousImageReferenceCountRef.current = imageReferences.length;
    if (previousImageReferenceCount > 0 || imageReferences.length === 0) return;

    const referenceDimensions = referenceImagePixelDimensions(imageReferences[0]);
    const nextDimensions = referenceDimensions ? closestValidCustomImageDimensions(referenceDimensions) : null;
    if (!nextDimensions) return;

    const nextSize = formatMediaReferenceDimensions(nextDimensions);
    const nextAspectRatio = getImageAspectRatioFromResolution(nextSize);
    const supportedAspectRatio = nextAspectRatio && imageCapabilities.aspectRatios.some(option => option.value === nextAspectRatio)
      ? nextAspectRatio
      : aspectRatio;
    const nextResolutionOptions = getImageResolutionOptions(selectedModel, supportedAspectRatio);

    setCustomImageSize(nextSize);
    if (supportedAspectRatio !== aspectRatio) setAspectRatio(supportedAspectRatio);
    if (nextResolutionOptions.some(option => option.value === "custom")) {
      setImageSizeMode("custom");
      return;
    }
    if (nextResolutionOptions.some(option => option.value === nextSize)) {
      setImageSizeMode("preset");
      setImageResolution(nextSize);
      return;
    }
    if (nextResolutionOptions.length > 0 && !nextResolutionOptions.some(option => option.value === imageResolution)) {
      setImageResolution(nextResolutionOptions[0].value);
    }
  }, [aspectRatio, imageCapabilities.aspectRatios, imageResolution, referenceImages, selectedModel]);

  const applyAsVideoReference = useCallback((asset: StorageItem): void => {
    openOriginalItem(asset, originalAsset => {
      const dimensions = parseMediaReferenceDimensions(originalAsset.generationRequest?.imageResolution) ?? parseMediaReferenceDimensions(originalAsset.aspectRatio);
      const nextReference: ReferenceImageRef = dimensions
        ? { ...dimensions, id: originalAsset.id, url: originalAsset.url, role: "start" }
        : { id: originalAsset.id, url: originalAsset.url, role: "start" };
      setReferenceImage(originalAsset.url);
      setReferenceImages([nextReference]);
      setTraditionalSubTab("video");
    }, t("common.notices.originalMediaReadFailed"));
  }, [openOriginalItem, setReferenceImage, setReferenceImages]);

  const handleUseAgentReference = useCallback((asset: StorageItem): void => {
    openOriginalItem(asset, originalAsset => {
      setAgentReferenceId(originalAsset.id);
      setAgentReferenceUrl(originalAsset.url);
      setAgentReferences([{ id: originalAsset.id, url: originalAsset.url }]);
      setIsAgentDockOpen(true);
    }, t("common.notices.originalMediaReadFailed"));
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
  const imagePromptRequired = runningHubAppPresetRequiresPrompt(selectedModel);
  const videoPromptRequired = runningHubAppPresetRequiresPrompt(selectedVideoModel);
  const isCreatorSubmitting = traditionalSubTab === "image" ? isSubmittingImage : traditionalSubTab === "audio" ? isSubmittingAudio : isSubmittingVideo;
  const isCreatorInputDisabled =
    traditionalSubTab === "audio"
      ? (audioTextInputRequired && !prompt.trim()) || (audioStylePromptRequired && !audioStylePrompt.trim()) || !hasRequiredAudioReferences || (needsManualVoiceCloneConsent && !voiceCloneConsentAccepted)
      : (traditionalSubTab === "image" ? imagePromptRequired : videoPromptRequired) && !prompt.trim();
  const isCreatorGenerateDisabled = isCreatorSubmitting || isCreatorInputDisabled;

  const asyncImageModel = resolveAsyncImageModelValue(selectedModel, referenceImages.length);
  const canUseBackgroundImageGeneration = asyncImageModel !== null;
  const shouldUseAsyncImageGeneration = imageBackgroundGeneration && canUseBackgroundImageGeneration;
  const activeImageModel = shouldUseAsyncImageGeneration && asyncImageModel ? asyncImageModel : selectedModel;
  const videoPriceReferenceTypes = selectVideoReferenceTypesForMode(
    referenceImages,
    referenceImage,
    activeVideoReferenceMode,
    videoCapabilities.maxReferenceImages,
  );
  const creatorPriceOptions = buildGenerationModelPriceOptions(
    traditionalSubTab === "image"
      ? {
          kind: "image",
          imageQuality,
          resolution: activeImageResolution,
          thinkingLevel: imageThinkingLevel,
        }
      : traditionalSubTab === "video"
        ? {
            kind: "video",
            duration: activeVideoDuration ?? videoDuration,
            referenceTypes: videoPriceReferenceTypes,
            videoReferenceMode: activeVideoReferenceMode,
            videoResolution,
          }
        : { kind: "audio" },
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
      pushWorkspaceNotice("error", t("common.notices.agentRefLimitReached", { limit: IMAGE_REFERENCE_LIMIT }));
      return;
    }

    const mediaType = mediaReferenceTypeFromMime(file.type);
    if (!mediaType) {
      pushWorkspaceNotice("error", t("common.notices.agentOnlySupportImageVideoAudio"));
      return;
    }
    if (mediaType !== "image" && file.size > Math.floor(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES * 0.75)) {
      pushWorkspaceNotice("error", t("common.notices.agentMediaRefFileTooLarge", { type: mediaReferenceLabel(mediaType) }));
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
      pushWorkspaceNotice("success", t("common.notices.agentMediaRefUploaded", { type: mediaReferenceLabel(mediaType), current: agentReferences.length + 1, max: IMAGE_REFERENCE_LIMIT }));
    } catch (error) {
      console.error(error);
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.agentReferenceReadFailed")));
    }
  };

  useMediaPolling({
    buildProviderHeaders,
    deleteAssetById: deleteWorkspaceAssetById,
    generationTasks,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    saveAssetWithPreview: saveWorkspaceAssetWithPreview,
    updateGenerationTask: workspaceGenerationTaskStorage.update,
    setGenerationTasks,
    setItems,
  });
  const {
    generateManualAudio,
    generateManualImage,
    generateManualVideo,
    retryGenerationTask,
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
    cinematicProfile,
    generationAbortControllersRef,
    imageThinkingLevel,
    isCustomImageResolution: isCustomImageSize,
    locallyCanceledItemIdsRef,
    prompt,
    pushWorkspaceNotice,
    referenceImage,
    referenceImages,
    runningHubYouchuan,
    deleteAssetById: deleteWorkspaceAssetById,
    generationTaskStorage: workspaceGenerationTaskStorage,
    saveAssetDirect: saveWorkspaceAssetDirect,
    saveAssetWithPreview: saveWorkspaceAssetWithPreview,
    selectedModel,
    selectedVideoModel,
    setGenerationTasks,
    setAudioSubmitCount,
    setImageSubmitCount,
    setItems,
    setVideoSubmitCount,
    t,
    videoReferenceLimit,
    videoReferenceMode: activeVideoReferenceMode,
  });

  const generateActiveAudio = () => {
    if (needsManualVoiceCloneConsent && !voiceCloneConsentAccepted) {
      pushWorkspaceNotice("error", t("common.notices.voiceCloneNeedsConsent"));
      return;
    }
    if (audioStylePromptRequired && !audioStylePrompt.trim()) {
      pushWorkspaceNotice("error", t("common.notices.voiceDesignNeedsDescription"));
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
    deleteAssetById: deleteWorkspaceAssetById,
    filteredItems,
    generationAbortControllersRef,
    items,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    saveAsset: saveWorkspaceAssetDirect,
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
  });

  const cancelGalleryItem = useCallback(async (item: StorageItem) => {
    const task = generationTasks.find(entry => entry.id === item.id);
    if (!task) {
      await cancelProcessingItem(item);
      return;
    }
    const confirmText = task.canCancelRemote
      ? t("common.confirmDialogs.cancelVideoTask")
      : t("common.confirmDialogs.cancelLocalTask");
    if (!(await confirmAction({ message: confirmText, tone: "danger", confirmLabel: t("cancelTask") }))) return;

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
          throw new Error(await readFetchError(res, t("common.notices.taskCancelFailed")));
        }
      }

      const canceledTask = await workspaceGenerationTaskStorage.cancel(task.id);
      setGenerationTasks(prev => prev.map(entry => entry.id === canceledTask.id ? canceledTask : entry));
      delete pollingFailuresRef.current[task.id];
      pushWorkspaceNotice("success", task.canCancelRemote ? t("common.notices.generationTaskCancelled") : t("common.notices.taskCancelledLocally"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.taskCancelFailed")));
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
    workspaceGenerationTaskStorage,
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
        await workspaceGenerationTaskStorage.cancel(task.id);
      } else {
        await workspaceGenerationTaskStorage.delete(task.id);
      }
      delete pollingFailuresRef.current[task.id];
    }
    for (const id of assetIds) {
      await deleteWorkspaceAssetById(id);
    }

    setGenerationTasks(prev => prev.filter(task => !taskIds.has(task.id)));
    setItems(prev => prev.filter(item => !assetIds.includes(item.id)));
    setSelectedItemIds(prev => prev.filter(id => !idSet.has(id)));
    setCompareItemIds(prev => prev.filter(id => !idSet.has(id)));
  }, [deleteWorkspaceAssetById, generationTasks, setCompareItemIds, setGenerationTasks, setItems, setSelectedItemIds, workspaceGenerationTaskStorage]);

  const handleGalleryBatchDelete = async () => {
    if (selectedItemIds.length === 0) return;
    if (!(await confirmAction({
      message: t("common.confirmDialogs.deleteSelectedItems", { count: selectedItemIds.length }),
      tone: "danger",
      confirmLabel: t("delete"),
    }))) {
      return;
    }
    await deleteGalleryRecords(selectedItemIds);
  };

  const handleGalleryDeleteItem = async (item: StorageItem) => {
    if (!(await confirmAction({ message: t("common.confirmDialogs.deleteSingleItem"), tone: "danger", confirmLabel: t("delete") }))) {
      return;
    }
    await deleteGalleryRecords([item.id]);
  };

  const deleteGalleryItemsByStatus = async (statuses: StorageItem["status"][]) => {
    const ids = workspaceGalleryItems.filter(item => statuses.includes(item.status)).map(item => item.id);
    if (ids.length === 0) return;
    if (!(await confirmAction({
      message: t("common.confirmDialogs.deleteTasksByStatus", { count: ids.length, statuses: statuses.join("/") }),
      tone: "danger",
      confirmLabel: t("delete"),
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
    featureModels: imageEditFeatureTargets,
    selectFeatureModel: selectImageEditFeatureTarget,
  } = useImageEditFeatureModels();
  const imageParameterValues = useMemo(
    () => imageParameterValuesFromLegacy(selectedModel, { runningHubYouchuan }),
    [selectedModel, runningHubYouchuan],
  );
  const handleImageParameterValuesChange = (values: typeof imageParameterValues) => {
    const nextYouchuan = imageParameterValuesToRunningHubYouchuan(selectedModel, values);
    if (nextYouchuan) setRunningHubYouchuan(nextYouchuan);
  };
  const handleSelectImageModel = (model: string) => {
    const capabilities = getImageModelCapabilities(model);
    const nextAspectRatio = capabilities.aspectRatios[0]?.value ?? "1:1";
    const resolvedAspectRatio = capabilities.aspectRatios.some(option => option.value === aspectRatio)
      ? aspectRatio
      : nextAspectRatio;
    const nextResolutionOptions = getImageResolutionOptions(model, resolvedAspectRatio);
    const canKeepCustomImageSize = isCustomImageSize && nextResolutionOptions.some(option => option.value === "custom");
    setSelectedModel(model);
    if (!capabilities.aspectRatios.some(option => option.value === aspectRatio)) {
      setAspectRatio(resolvedAspectRatio);
    }
    if (!canKeepCustomImageSize) {
      setImageSizeMode("preset");
    }
    if (!canKeepCustomImageSize && nextResolutionOptions.length > 0 && !nextResolutionOptions.some(option => option.value === imageResolution)) {
      setImageResolution(nextResolutionOptions.find(option => option.value !== "custom")?.value ?? nextResolutionOptions[0].value);
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
    const nextYouchuan = imageParameterValuesToRunningHubYouchuan(
      model,
      imageParameterValuesFromLegacy(model, { runningHubYouchuan }),
    );
    if (nextYouchuan) setRunningHubYouchuan(nextYouchuan);
  };

  const handleSelectImageAspectRatio = (value: string) => {
    setImageSizeMode("preset");
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

  const handleImageResolutionChange = (value: string) => {
    setImageSizeMode("preset");
    setImageResolution(value);
  };

  const handleDefaultImageModelChange = (model: string) => {
    persistDefaultGenerationModel("image", model);
    handleSelectImageModel(model);
  };

  const handleDefaultVideoModelChange = (model: string) => {
    persistDefaultGenerationModel("video", model);
    handleSelectVideoModel(model);
  };

  const handleDefaultAudioModelChange = (model: string) => {
    persistDefaultGenerationModel("audio", model);
    handleSelectAudioModel(model);
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
      return {
        height: reference.height,
        id: `${item.id}_reference_${index + 1}`,
        type: reference.type,
        url: reference.url,
        role,
        width: reference.width,
      };
    });

    setPrompt(item.type === "transcript" ? request?.prompt ?? "" : item.prompt);
    setReferenceImages(references);
    setReferenceImage(references[0]?.url ?? null);
    setCinematicProfile(request?.cinematicProfile ?? DEFAULT_CINEMATIC_PROFILE);

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
        setImageSizeMode("preset");
        setImageResolution(nextResolution);
      } else if (/^\d+x\d+$/.test(nextResolution) && nextResolutionOptions.some(option => option.value === "custom")) {
        setImageSizeMode("custom");
        setCustomImageSize(nextResolution);
      }
      if (request?.imageQuality) setImageQuality(request.imageQuality);
      if (request?.thinkingLevel) setImageThinkingLevel(request.thinkingLevel);
      if (request?.runningHubYouchuan) setRunningHubYouchuan(request.runningHubYouchuan);
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
    pushWorkspaceNotice("success", t("common.notices.paramsRestoredToPanel"));
  }

  const retryGalleryItem = useCallback((item: StorageItem) => {
    const task = generationTasks.find(task => task.id === item.id);
    if (!task) {
      void retryFailedItem(item);
      return;
    }
    void retryGenerationTask(task);
  }, [generationTasks, retryFailedItem, retryGenerationTask]);

  useEffect(() => {
    const readyTimer = window.setTimeout(() => {
      setIsAgentPortalReady(true);
      setAgentPortalHost(workbenchShellRef.current);
    }, 0);
    return () => window.clearTimeout(readyTimer);
  }, []);

  // Load items from database on mount
  useEffect(() => {
    let isActive = true;
    async function loadWorkspace() {
      try {
        if (workspaceStorageTarget === "postgres") {
          const teamItems = await fetchTeamWorkspaceGalleryItems();
          if (isActive) setItems(teamItems);
          return;
        }
        const metas = await listWorkspaceGalleryMetas();
        if (!isActive) return;
        setItems(metas.map(metaToPlaceholderItem));
        const firstBatch = metas.slice(0, 40);
        if (firstBatch.length > 0) {
          const hydrated = await hydrateAssets(firstBatch);
          if (!isActive) return;
          setItems(current => mergeStorageItems(current, hydrated));
          const rest = metas.slice(40, 120);
          if (rest.length > 0) {
            window.setTimeout(() => {
              void hydrateAssets(rest).then(more => {
                if (isActive) setItems(current => mergeStorageItems(current, more));
              });
            }, 0);
          }
        }
      } catch (error) {
        console.error("Workspace asset read failed:", error);
        if (isActive) {
          pushWorkspaceNotice("error", t("common.notices.localProjectReadFailed", { error: toErrorMessage(error, t("common.notices.indexedDbReadFailed")) }));
        }
      }
    }
    loadWorkspace();
    return () => {
      isActive = false;
    };
  }, [pushWorkspaceNotice, t, workspaceStorageTarget]);

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
        throw new Error(await readFetchError(res, t("common.notices.promptOptimizationFailed")));
      }
      const data: unknown = await res.json();
      const optimized = getStringField(data, "optimized");
      if (!optimized) {
        throw new Error(t("common.notices.promptOptimizationBadFormat"));
      }
      setPrompt(optimized);
    } catch (e) {
      const message = toErrorMessage(e, t("common.notices.promptOptimizationFailed"));
      console.error(e);
      pushWorkspaceNotice("error", message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const createImageQuickEditProcessingAsset = async (
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    previewUrl: string,
    model: string,
    editPrompt: string,
  ): Promise<StorageItem | null> => {
    const label = imageEditFeatureLabel(operation, creationT);
    const item = buildStorageItem({
      id: makeClientId("img_edit"),
      type: "image",
      url: previewUrl,
      prompt: editPrompt || imageQuickEditFallbackPrompt(operation, sourceItem.prompt || sourceItem.id, creationT),
      model,
      aspectRatio: "auto",
      createdAt: new Date().toISOString(),
      status: "processing",
      progress: 15,
      scope: "workspace",
      boardId: "",
      maskOriginalId: sourceItem.id,
    });
    try {
      const savedItem = await saveWorkspaceAssetDirect(item);
      setItems(prev => [savedItem, ...prev]);
      pushWorkspaceNotice("info", t("common.notices.imageQuickEditStart", { label }));
      return savedItem;
    } catch (error) {
      pushWorkspaceNotice("error", t("common.notices.imageQuickEditSaveFailed", { label, error: toErrorMessage(error, t("common.notices.indexedDbWriteFailed")) }));
      return null;
    }
  };

  const completeImageQuickEditAsset = async (
    item: StorageItem,
    operation: ImageEditFeature,
    imageUrl: string,
  ) => {
    const label = imageEditFeatureLabel(operation, creationT);
    const nextItem = buildStorageItem({
      ...item,
      url: imageUrl,
      status: "complete",
      progress: 100,
      errorMessage: undefined,
    });
    const savedItem = await saveWorkspaceAssetDirect(nextItem);
    setItems(prev => prev.map(current => current.id === savedItem.id ? savedItem : current));
    pushWorkspaceNotice("success", t("common.notices.imageQuickEditComplete", { label }));
  };

  const failImageQuickEditAsset = async (
    item: StorageItem,
    message: string,
  ) => {
    const nextItem = buildStorageItem({
      ...item,
      status: "failed",
      progress: 100,
      errorMessage: message,
    });
    const savedItem = await saveWorkspaceAssetDirect(nextItem);
    setItems(prev => prev.map(current => current.id === savedItem.id ? savedItem : current));
  };

  const startImageQuickEdit = async (
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    editImageUrl: string,
    maskUrl: string | undefined,
    guideUrl: string | undefined,
    editPrompt: string,
    editImageResolution: string,
    editAspectRatio: string,
  ) => {
    const target = resolveImageQuickEditTarget(operation, imageEditFeatureTargets[operation]);
    const pending = await createImageQuickEditProcessingAsset(sourceItem, operation, editImageUrl, target.model, editPrompt);
    if (!pending) return null;
    const pendingTaskIds = relatedQuickEditTaskIds(pending.id);
    const controller = new AbortController();
    for (const id of pendingTaskIds) generationAbortControllersRef.current[id] = controller;
    return {
      controller,
      editAspectRatio,
      editImageResolution,
      editImageUrl,
      editPrompt,
      guideUrl,
      maskUrl,
      operation,
      pending,
      pendingTaskIds,
      target,
    };
  };

  const finishImageQuickEdit = async (job: WorkspaceImageQuickEditJob) => {
    const {
      controller,
      editAspectRatio,
      editImageResolution,
      editImageUrl,
      editPrompt,
      guideUrl,
      maskUrl,
      operation,
      pending,
      pendingTaskIds,
      target,
    } = job;
    try {
      const image = await prepareReferenceImageUrlForRequest(editImageUrl);
      const mask = maskUrl ? await prepareReferenceImageUrlForRequest(maskUrl) : undefined;
      const guide = guideUrl ? await prepareReferenceImageUrlForRequest(guideUrl) : undefined;
      if (hasLocallyCanceledQuickEdit(pendingTaskIds, locallyCanceledItemIdsRef.current)) {
        clearLocallyCanceledQuickEdit(pendingTaskIds, locallyCanceledItemIdsRef.current);
        return;
      }
      const imageUrl = await submitImageQuickEdit({
        target,
        operation,
        aspectRatio: editAspectRatio,
        image,
        mask,
        guide,
        prompt: editPrompt,
        imageResolution: editImageResolution,
        buildProviderHeaders,
        signal: controller.signal,
      });
      if (hasLocallyCanceledQuickEdit(pendingTaskIds, locallyCanceledItemIdsRef.current)) {
        clearLocallyCanceledQuickEdit(pendingTaskIds, locallyCanceledItemIdsRef.current);
        return;
      }
      await completeImageQuickEditAsset(pending, operation, imageUrl);
    } catch (error) {
      if (hasLocallyCanceledQuickEdit(pendingTaskIds, locallyCanceledItemIdsRef.current) || isAbortError(error)) {
        clearLocallyCanceledQuickEdit(pendingTaskIds, locallyCanceledItemIdsRef.current);
        return;
      }
      const message = toErrorMessage(error, t("common.notices.imageQuickEditFailed", { label: imageEditFeatureLabel(operation, creationT) }));
      try {
        await failImageQuickEditAsset(pending, message);
      } catch (storageError) {
        pushWorkspaceNotice("error", t("common.notices.localSaveFailed", { error: toErrorMessage(storageError, t("common.notices.indexedDbWriteFailed")) }));
      }
      pushWorkspaceNotice("error", message);
    } finally {
      for (const id of pendingTaskIds) delete generationAbortControllersRef.current[id];
    }
  };

  const runImageQuickEdit = async (
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    editImageUrl: string,
    maskUrl: string | undefined,
    guideUrl: string | undefined,
    editPrompt: string,
    editImageResolution: string,
    editAspectRatio: string,
  ) => {
    const job = await startImageQuickEdit(sourceItem, operation, editImageUrl, maskUrl, guideUrl, editPrompt, editImageResolution, editAspectRatio);
    if (!job) return;
    await finishImageQuickEdit(job);
  };

  const handleImageQuickEdit = (item: StorageItem, operation: ImageEditFeature) => {
    if (item.type !== "image") return;
    openOriginalItem(item, originalItem => {
      if (operation === "cutout") {
        void runImageQuickEdit(originalItem, operation, originalItem.url, undefined, undefined, "", "auto", originalItem.aspectRatio);
        return;
      }
      launchMaskEditor(originalItem.url, originalItem.id, "creative", operation, originalItem);
    }, t("common.notices.imageQuickEditOriginalReadFailed", { label: imageEditFeatureLabel(operation, creationT) }));
  };

  // Launch mask editor layout dialog
  const launchMaskEditor = (
    imageUrl: string,
    id: string,
    destination: MaskDestination = "creative",
    operation?: ImageEditFeature,
    sourceItem?: StorageItem,
    initialMode: CanvasEditorMode = "mask",
  ) => {
    setMaskTargetUrl(imageUrl);
    setMaskTargetId(id);
    setMaskDestination(destination);
    setMaskEditOperation(operation);
    setMaskInitialMode(initialMode);
    setMaskEditSourceItem(sourceItem ?? null);
    setIsMaskOpen(true);
  };

  const launchReferenceMaskEditor = (reference: ReferenceImageRef): void => {
    if (getMediaReferenceType(reference) !== "image") return;
    const sourceItem = items.find(item => item.id === reference.id);
    if (!sourceItem) {
      launchMaskEditor(reference.url, reference.id, "creative");
      return;
    }
    openOriginalItem(sourceItem, originalItem => {
      launchMaskEditor(originalItem.url, originalItem.id, "creative");
    }, t("common.notices.referenceImageOriginalReadFailed"));
  };

  const saveMaskOutput = async (output: CanvasMaskEditorOutput) => {
    if (output.operation && maskEditSourceItem) {
      const job = await startImageQuickEdit(
        maskEditSourceItem,
        output.operation,
        output.imageBase64,
        output.maskBase64,
        output.mergedImageBase64,
        output.prompt,
        output.imageResolution,
        output.aspectRatio,
      );
      if (!job) return;
      setIsMaskOpen(false);
      setMaskEditOperation(undefined);
      setMaskEditSourceItem(null);
      setMaskTargetUrl("");
      setMaskTargetId("");
      void finishImageQuickEdit(job);
      return;
    }

    let compressedMergedImage: string;
    try {
      compressedMergedImage = await compressReferenceImageDataUrl(output.mergedImageBase64);
    } catch (error) {
      console.error(error);
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.maskReferenceCompressionFailed")));
      return;
    }

    if (maskDestination === "agent") {
      const nextReferenceId = maskTargetId || "custom_ref";
      setAgentReferenceUrl(compressedMergedImage);
      setAgentReferenceId(nextReferenceId);
      setAgentReferences([{ id: nextReferenceId, url: compressedMergedImage }]);
      if (!agentInput.includes("modify the marked region")) {
        setAgentInput(t("common.maskEditor.promptPrefix"));
      }
      setIsAgentDockOpen(true);
    } else {
      // Inject drew brush directly into reference seeds
      setReferenceImage(compressedMergedImage);
      setReferenceImages(prev => prev.map(reference =>
        reference.id === maskTargetId
          ? { ...reference, type: "image", url: compressedMergedImage }
          : reference,
      ));
      // Auto populate helper suggestions into Prompt box
      if (!prompt.includes("modify the marked region")) {
        setPrompt(`${t("common.maskEditor.promptPrefix")} ${prompt || t("common.references.emptyPromptPlaceholder")}`);
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
        ? t("common.notices.maskAppliedToAgent")
        : t("common.notices.maskWrittenToReference"),
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
      prompt: t("common.references.agentRefLabel", { n: index + 1 }),
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
          }, t("common.notices.originalMediaReadFailed"));
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
    locale,
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

  const clearProjectAssets = useCallback(async () => {
    try {
      await createWorkspaceSafetySnapshot("clear-assets");
      await clearAllDB();
      setItems([]);
      setSelectedItemIds([]);
      setCompareItemIds([]);
      pushWorkspaceNotice("success", t("common.dataManagement.localAssetsCleaned"));
      void assetLibrary.reload().catch(() => undefined);
    } catch (error) {
      void assetLibrary.reload().catch(() => undefined);
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.localAssetsCleanFailed")));
    }
  }, [assetLibrary, pushWorkspaceNotice, setCompareItemIds, setSelectedItemIds]);

  const handleClearProject = async () => {
    if (!(await confirmAction({
      message: getClearWorkspaceAssetsMessage(t),
      tone: "danger",
      confirmLabel: t("common.confirmDialogs.clearAssetsLabel"),
    }))) {
      return;
    }
    await clearProjectAssets();
  };

  const reloadWorkspaceAssets = useCallback(async () => {
    if (workspaceStorageTarget === "postgres") {
      setItems(await fetchTeamWorkspaceGalleryItems());
      return;
    }
    const metas = await listWorkspaceGalleryMetas();
    setItems(metas.map(metaToPlaceholderItem));
    void hydrateAssets(metas.slice(0, 80)).then(hydrated =>
      setItems(current => mergeStorageItems(current, hydrated)),
    );
  }, [workspaceStorageTarget]);

  const activePromptReferenceTarget = useCallback((): Exclude<AtDropdownTarget, "agent-prompt"> => {
    if (traditionalSubTab === "audio") return "audio-prompt";
    if (traditionalSubTab === "video") return "video-prompt";
    return "image-prompt";
  }, [traditionalSubTab]);

  const openAssetLibrary = useCallback((mode: AssetLibraryMode) => {
    setAssetLibraryMode(mode);
    if (mode === "reference") setAssetLibraryTarget(activePromptReferenceTarget());
    setShowSettings(false);
    setIsAssetLibraryOpen(true);
  }, [activePromptReferenceTarget]);

  const handleAddItemToLibrary = useCallback(async (item: StorageItem) => {
    try {
      const result = await assetLibrary.addSource(item);
      pushWorkspaceNotice("success", result.created ? t("common.notices.addedToLibrary") : t("common.notices.alreadyInLibrary"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.addToLibraryFailed")));
    }
  }, [assetLibrary, pushWorkspaceNotice]);

  const handleImportFilesToLibrary = useCallback(async (files: File[]) => {
    try {
      const imported = await assetLibrary.importFiles(files);
      pushWorkspaceNotice(
        imported.length > 0 ? "success" : "info",
        imported.length > 0 ? t("common.notices.importedNAssets", { count: imported.length }) : t("common.notices.noAssetsImported"),
      );
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.libraryImportFailed")));
    }
  }, [assetLibrary, pushWorkspaceNotice]);

  const handleSelectLibraryEntry = useCallback((entry: { item: StorageItem | null }) => {
    const item = entry.item;
    if (!item) {
      pushWorkspaceNotice("error", t("common.notices.libraryEntryMissingMedia"));
      return;
    }
    if (item.type === "transcript") {
      pushWorkspaceNotice("error", t("common.notices.libraryTranscriptNotSupported"));
      return;
    }
    handleSelectAtItem(item.url, item.id, assetLibraryTarget, item.type);
    setIsAssetLibraryOpen(false);
  }, [assetLibraryTarget, handleSelectAtItem, pushWorkspaceNotice]);

  const handleDataExportWorkspace = useCallback(async (includeCredentials: boolean) => {
    try {
      const result = await exportCompleteWorkspaceBackup(includeCredentials);
      pushWorkspaceNotice("success", t("common.dataManagement.exportComplete", { fileName: result.fileName }));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.exportFailed")));
    }
  }, [pushWorkspaceNotice]);

  const handleDataDownloadSafetySnapshot = useCallback(async () => {
    try {
      const result = await downloadLatestWorkspaceSafetySnapshot();
      pushWorkspaceNotice("success", t("common.dataManagement.snapshotDownloaded", { fileName: result.fileName }));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.snapshotDownloadFailed")));
    }
  }, [pushWorkspaceNotice]);

  const handleDataImportWorkspace = useCallback(async (file: File, includeCredentials: boolean) => {
    try {
      const preview = await previewWorkspaceBackup(file);
      const credentialNote = preview.includesCredentials && !includeCredentials
        ? t("common.confirmDialogs.credentialNote")
        : "";
      if (!(await confirmAction({
        message: t("common.confirmDialogs.confirmImportWorkspace", { assetCount: preview.assetCount, boardCount: preview.boardCount, settingsCount: preview.settingsKeyCount, credentialNote }),
        tone: "danger",
        confirmLabel: t("restore"),
      }))) {
        return;
      }
      const result = await importWorkspaceBackup(file, includeCredentials);
      pushWorkspaceNotice("success", t("common.dataManagement.workspaceRestored", { assetCount: result.assetCount, boardCount: result.boardCount }));
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.workspaceRestoreFailed")));
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
        importedItems.push(await saveWorkspaceAssetDirect(item));
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.localMediaImportFailed", { name: file.name || "media" })));
      }
    }
    if (importedItems.length === 0) return;
    setItems(prev => [
      ...importedItems,
      ...prev.filter(item => !importedItems.some(importedItem => importedItem.id === item.id)),
    ]);
    pushWorkspaceNotice("success", t("common.notices.importedLocalMedia", { count: importedItems.length }));
  }, [pushWorkspaceNotice, saveWorkspaceAssetDirect]);

  const handleDataCleanupAssets = useCallback(async (kind: WorkspaceCleanupKind) => {
    try {
      const result = await cleanupWorkspaceAssets(kind);
      await reloadWorkspaceAssets();
      setSelectedItemIds(prev => prev.filter(id => !result.deletedIds.includes(id)));
      setCompareItemIds(prev => prev.filter(id => !result.deletedIds.includes(id)));
      pushWorkspaceNotice("success", t("common.dataManagement.assetsCleanupSuccess", { count: result.deletedIds.length }));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.assetsCleanupFailed")));
    }
  }, [pushWorkspaceNotice, reloadWorkspaceAssets, setCompareItemIds, setSelectedItemIds]);

  const handleDataRepairAssetSources = useCallback(async () => {
    try {
      const result = await repairStaleAssetSourceLinks();
      await reloadWorkspaceAssets();
      pushWorkspaceNotice("success", t("common.dataManagement.sourceLinkRepairSuccess", { count: result.repairedIds.length }));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.sourceLinkRepairFailed")));
    }
  }, [pushWorkspaceNotice, reloadWorkspaceAssets]);

  const handleDataClearLocalStorage = useCallback(async (kind: LocalStorageCleanupKind) => {
    const count = clearLocalStorageGroup(kind);
    pushWorkspaceNotice("success", t("common.dataManagement.localKeysCleaned", { count }));
  }, [pushWorkspaceNotice]);

  const handleDataResetBoards = useCallback(async () => {
    try {
      await resetBoardsToDefault();
      pushWorkspaceNotice("success", t("common.dataManagement.boardsReset"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.boardsResetFailed")));
    }
  }, [pushWorkspaceNotice]);

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
      initialVisibleItems={isMobileLayout ? 18 : 48}
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
      onAddToLibrary={handleAddItemToLibrary}
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
        if (isMobileLayout && value !== "all") {
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
      visibleItemsStep={isMobileLayout ? 18 : 48}
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
          onOpenAssetLibrary={() => openAssetLibrary("reference")}
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
        cinematicProfile={cinematicProfile}
        customImageSize={customImageSize}
        imageSizeMode={imageSizeMode}
        imageBackgroundGeneration={imageBackgroundGeneration}
        imageQuality={imageQuality}
        imageResolution={imageResolution}
        imageResolutionOptions={imageResolutionOptions}
        imageThinkingLevel={imageThinkingLevel}
        isOptimizing={isOptimizing}
        isSubmitting={isSubmittingImage}
        modelGroups={imageModelGroups}
        negativePrompt={negativePrompt}
        parameterValues={imageParameterValues}
        prompt={prompt}
        promptRequired={imagePromptRequired}
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
        onCinematicProfileChange={setCinematicProfile}
        onCustomImageSizeChange={setCustomImageSize}
        onGenerate={generateManualImage}
        onImageBackgroundGenerationChange={setImageBackgroundGeneration}
        onImageQualityChange={setImageQuality}
        onImageResolutionChange={handleImageResolutionChange}
        onImageSizeModeChange={setImageSizeMode}
        onNegativePromptChange={setNegativePrompt}
        onOptimizePrompt={optimizeActivePrompt}
        onParameterValuesChange={handleImageParameterValuesChange}
        onPromptChange={value => handleTextareaChange(value, "image-prompt")}
        onPromptDropAsset={event => handlePromptDropAsset(event, "image-prompt")}
        onReferenceDropAsset={asset => handleReferenceDropAsset(asset, "image-prompt")}
        onReferenceDropFiles={files => handleReferenceDropFiles(files, "image-prompt")}
        onReferenceEdit={launchReferenceMaskEditor}
        onReferenceRemove={removeReferenceImage}
        onReferenceUpload={handleImageUpload}
        onOpenAssetLibrary={() => openAssetLibrary("reference")}
        onSelectAspectRatio={handleSelectImageAspectRatio}
        onSelectModel={handleSelectImageModel}
        onThinkingLevelChange={setImageThinkingLevel}
      />
    ) : (
      <VideoGenerationPanel
        showGenerateButton={showGenerateButton}
        atDropdownNode={atDropdown.visible && atDropdown.type === "video-prompt" ? renderAtDropdown("video-prompt") : null}
        capabilities={videoCapabilities}
        cinematicProfile={cinematicProfile}
        clearReferenceLabel={videoClearReferenceLabel}
        durationOptions={videoCapabilities.durations}
        isOptimizing={isOptimizing}
        isSubmitting={isSubmittingVideo}
        modelGroups={videoModelGroups}
        presetOptions={videoCapabilities.presets}
        prompt={prompt}
        promptPlaceholder={videoPromptPlaceholder}
        promptRequired={videoPromptRequired}
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
        onCinematicProfileChange={setCinematicProfile}
        onGenerate={generateManualVideo}
        onOptimizePrompt={optimizeActivePrompt}
        onPromptChange={value => handleTextareaChange(value, "video-prompt")}
        onPromptDropAsset={event => handlePromptDropAsset(event, "video-prompt")}
        onReferenceDropAsset={asset => handleReferenceDropAsset(asset, "video-prompt")}
        onReferenceDropFiles={files => handleReferenceDropFiles(files, "video-prompt")}
        onReferenceRemove={removeReferenceImage}
        onReferenceRoleChange={(id, role) => toggleReferenceRole(id, role ?? "general")}
        onReferenceUpload={event => handleReferenceUpload(event, "video-prompt")}
        onOpenAssetLibrary={() => openAssetLibrary("reference")}
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
        onOpenAssetLibrary={() => openAssetLibrary("manage")}
        onOpenSettings={() => {
          setIsAssetLibraryOpen(false);
          setShowSettings(prev => !prev);
        }}
        onRunResolveCheck={() => void runResolveCheck()}
        resolveCheckStatus={resolveCheckStatus}
        showResolveCheck={resolveIntegrationEnabled}
      />

      {/* Main Multi-panel Layout grid */}
      <main
        className={`imagine-main-grid ${
          isAgentDockOpen ? "imagine-main-grid-agent-open" : "imagine-main-grid-agent-closed"
        } flex-1 w-full max-w-[1880px] mx-auto px-4 pt-5 sm:px-6 sm:pt-6 grid grid-cols-1 lg:grid-cols-[minmax(400px,480px)_minmax(0,1fr)] xl:grid-cols-[minmax(430px,520px)_minmax(0,1fr)] gap-5 xl:gap-6 items-start z-10`}
      >

        <section className="imagine-creator-panel imagine-creation-sidebar flex flex-col gap-4 min-w-0">
          {isMobileLayout && (
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
                isSubmitting={isCreatorSubmitting}
                submitCount={traditionalSubTab === "image" ? imageSubmitCount : traditionalSubTab === "audio" ? audioSubmitCount : videoSubmitCount}
                priceProvider={traditionalSubTab === "image" ? selectedModel.split(":")[0] : traditionalSubTab === "audio" ? selectedAudioModel.split(":")[0] : selectedVideoModel.split(":")[0]}
                priceModelId={traditionalSubTab === "image" ? selectedModel : traditionalSubTab === "audio" ? selectedAudioModel : selectedVideoModel}
                priceOptions={creatorPriceOptions}
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

        {isDesktopLayout !== false && (
          <div className="hidden min-w-0 lg:block">
            {renderAssetGalleryWorkspace()}
          </div>
        )}

      </main>

      <AssetLibraryModal
        entries={assetLibrary.entries}
        loading={assetLibrary.loading}
        mode={assetLibraryMode === "reference" ? "select" : "manage"}
        open={isAssetLibraryOpen}
        title={assetLibraryMode === "reference" ? t("common.library.selectTitle") : t("common.library.title")}
        onClose={() => setIsAssetLibraryOpen(false)}
        onImportFiles={handleImportFilesToLibrary}
        onRemove={assetLibrary.removeRecord}
        onSelect={handleSelectLibraryEntry}
        onUpdate={assetLibrary.updateRecord}
      />

      <SettingsModal
        key={`settings-${locale}`}
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
        resolveCheckStatus={resolveCheckStatus}
        resolveIntegrationAvailable={resolveIntegrationAvailable}
        resolveIntegrationEnabled={resolveIntegrationEnabled}
        selectedChatModel={selectedChatModel}
        selectedDefaultAudioModel={selectedAudioModel}
        selectedDefaultImageModel={selectedModel}
        selectedDefaultVideoModel={selectedVideoModel}
        selectedProvider={selectedProvider}
        imageEditFeatureModels={imageEditFeatureTargets}
        videoModelGroups={videoModelGroups}
        onAddCustomProvider={addCustomProvider}
        onCleanupAssets={handleDataCleanupAssets}
        onClearAssets={clearProjectAssets}
        onClearCredentials={clearProviderCredentials}
        onClearLocalStorage={handleDataClearLocalStorage}
        onClose={() => setShowSettings(false)}
        onDownloadSafetySnapshot={handleDataDownloadSafetySnapshot}
        onExportWorkspace={handleDataExportWorkspace}
        onImportLocalAssets={handleDataImportLocalAssets}
        onImportWorkspace={handleDataImportWorkspace}
        onRepairAssetSources={handleDataRepairAssetSources}
        onResetBoards={handleDataResetBoards}
        onRunResolveCheck={() => void runResolveCheck()}
        onAddFetchedModels={addFetchedModels}
        onAddManualModels={addManualModels}
        onSaveCredential={handleSaveCredential}
        onSelectChatModel={handleSelectChatModel}
        onSelectDefaultAudioModel={handleDefaultAudioModelChange}
        onSelectDefaultImageModel={handleDefaultImageModelChange}
        onSelectDefaultVideoModel={handleDefaultVideoModelChange}
        onSelectImageEditFeatureModel={selectImageEditFeatureTarget}
        onSelectProvider={handleSelectProvider}
        onToggleResolveIntegration={setResolveIntegrationEnabled}
        onDeleteCustomProvider={deleteCustomProvider}
        refreshProviderModels={refreshProviderModels}
        testProviderConnection={testProviderConnection}
      />

      <FullscreenPreview
        item={fullscreenItem}
        items={filteredItems.filter(item => item.status === "complete")}
        onCaptureVideoFrame={handleCaptureVideoFrame}
        onSavePanoramaScreenshots={handleSavePanoramaScreenshots}
        onDownload={handleDownloadItem}
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
      {isMaskOpen && maskEditOperation && isVisualAdjustmentFeature(maskEditOperation) && (
        <VisualPromptAdjustEditor
          imageUrl={maskTargetUrl}
          editModel={resolveImageQuickEditTarget(maskEditOperation, imageEditFeatureTargets[maskEditOperation])?.model}
          isOpen={isMaskOpen}
          operation={maskEditOperation}
          onClose={() => {
            setIsMaskOpen(false);
            setMaskTargetUrl("");
            setMaskTargetId("");
            setMaskEditOperation(undefined);
            setMaskInitialMode("mask");
            setMaskEditSourceItem(null);
          }}
          onApply={saveMaskOutput}
        />
      )}
      {isMaskOpen && (!maskEditOperation || !isVisualAdjustmentFeature(maskEditOperation)) && (
        <CanvasMaskEditor
          imageUrl={maskTargetUrl}
          editModel={maskEditOperation ? resolveImageQuickEditTarget(maskEditOperation, imageEditFeatureTargets[maskEditOperation])?.model : undefined}
          isOpen={isMaskOpen}
          operation={maskEditOperation}
          onClose={() => {
            setIsMaskOpen(false);
            setMaskTargetUrl("");
            setMaskTargetId("");
            setMaskEditOperation(undefined);
            setMaskInitialMode("mask");
            setMaskEditSourceItem(null);
          }}
          initialMode={maskInitialMode}
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
