'use client';

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Play,
  Pause,
  Maximize2,
} from "lucide-react";
import JSZip from "jszip";
import AgentDock, { type AgentToolAction, type ChatMessage } from "@/components/agent/AgentDock";
import { VISUAL_PRESETS, type VisualPreset } from "@/components/PresetStyles";
import CanvasMaskEditor from "@/components/CanvasMaskEditor";
import FloatingCompareButton from "@/components/assets/FloatingCompareButton";
import FullscreenPreview from "@/components/assets/FullscreenPreview";
import CreationModeTabs, { type CreationMode } from "@/components/creation/CreationModeTabs";
import ImageGenerationPanel from "@/components/creation/ImageGenerationPanel";
import VideoGenerationPanel from "@/components/creation/VideoGenerationPanel";
import AtReferenceDropdown from "@/components/reference/AtReferenceDropdown";
import PromptReferenceDropdown from "@/components/reference/PromptReferenceDropdown";
import {
  type DraggedReferenceAsset,
  makeReferenceDropToken,
  readDraggedReferenceAsset,
} from "@/components/reference/referenceDrag";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import SettingsModal, { type ProviderTestState } from "@/components/settings/SettingsModal";
import type { ProviderCredentials } from "@/lib/providers/types";
import AssetGalleryWorkspace from "@/components/workbench/AssetGalleryWorkspace";
import WorkspaceHeader, { type ThemeMode } from "@/components/workbench/WorkspaceHeader";
import WorkspaceNotices, { type WorkspaceNotice } from "@/components/workbench/WorkspaceNotices";
import { saveToDB, getAllFromDB, deleteFromDB, clearAllDB, StorageItem } from "@/lib/db";
import { useAssetWorkspaceState } from "@/hooks/useAssetWorkspaceState";
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_VISION_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODEL_OPTIONS,
  getImageModelCapabilities,
  getVideoModelCapabilities,
  parseProviderModel,
  supportsAsyncImageGeneration,
  VIDEO_MODEL_OPTIONS,
  type AiProvider,
  type ModelOption,
  type VideoReferenceMode,
} from "@/lib/providers/model-catalog";
import { PROVIDER_KEYS, getProviderMeta, isKnownProvider } from "@/lib/providers/registry";

type NoticeType = "error" | "info" | "success";
type MaskDestination = "creative" | "agent";
type ProviderConnection = AiProvider;
type ModelCategory = "chat" | "image" | "video";
type PromptReferenceTarget = "image-prompt" | "video-prompt";

const IMAGE_REFERENCE_LIMIT = 4;

function defaultProviderCredentials(): Record<AiProvider, ProviderCredentials> {
  const record = {} as Record<AiProvider, ProviderCredentials>;
  for (const provider of PROVIDER_KEYS) record[provider] = { apiKey: "", baseUrl: "" };
  return record;
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

async function readFetchError(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    return getStringField(data, "error") ?? getStringField(data, "message") ?? `${fallback} (HTTP ${response.status})`;
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

function isModelOption(value: unknown): value is ModelOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "label" in value &&
    typeof value.value === "string" &&
    typeof value.label === "string"
  );
}

function mergeModelOptions(base: ModelOption[], incoming: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return [...incoming, ...base].filter(option => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function mergeProviderModelOptions(
  base: Record<AiProvider, ModelOption[]>,
  incoming: ModelOption[],
): Record<AiProvider, ModelOption[]> {
  const result = { ...base };
  for (const p of PROVIDER_KEYS) {
    result[p] = mergeModelOptions(
      base[p],
      incoming.filter(option => parseProviderModel(option.value, "12ai").provider === p),
    );
  }
  return result;
}

function mergeRecordModelOptions(
  base: Record<AiProvider, ModelOption[]>,
  incoming: unknown,
  filterFn?: (option: ModelOption) => boolean,
): Record<AiProvider, ModelOption[]> {
  if (typeof incoming !== "object" || incoming === null) return base;
  const record = incoming as Record<string, unknown>;
  const result = { ...base };
  for (const p of PROVIDER_KEYS) {
    if (Array.isArray(record[p])) {
      const options = filterFn
        ? (record[p] as unknown[]).filter(isModelOption).filter(filterFn)
        : (record[p] as unknown[]).filter(isModelOption);
      if (options.length > 0) result[p] = mergeModelOptions(base[p], options);
    }
  }
  return result;
}

function classifyModelOption(option: ModelOption): ModelCategory {
  const parsed = parseProviderModel(option.value, "12ai");
  const model = parsed.model.toLowerCase();
  if (model.includes("video") || model.includes("veo")) return "video";
  if (model.includes("image") || model.includes("imagen") || model.includes("imagine")) return "image";
  return "chat";
}

function isSelectableImageModel(option: ModelOption): boolean {
  return !parseProviderModel(option.value, "12ai").async;
}

function isSelectableChatModel(option: ModelOption): boolean {
  return option.value !== "12ai:gemini-3.1-flash" && !option.value.toLowerCase().includes("deepseek");
}

function hasBuiltInChatModel(value: string): boolean {
  return Object.values(CHAT_MODEL_OPTIONS).some(options => options.some(option => option.value === value));
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

function getReferencePromptToken(index: number): string {
  return `@图片${index + 1}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPromptWithReferenceMap(
  prompt: string,
  references: ReferenceImageRef[],
  sentReferenceUrls = references.map(reference => reference.url),
): string {
  const lines = references
    .map((reference, index) => ({
      sentIndex: sentReferenceUrls.findIndex(url => url === reference.url),
      token: getReferencePromptToken(index),
    }))
    .filter(reference => reference.sentIndex !== -1)
    .filter(reference => new RegExp(`${escapeRegExp(reference.token)}(?!\\d)`).test(prompt))
    .map(reference => `- ${reference.token} = reference image ${reference.sentIndex + 1}`);

  if (lines.length === 0) return prompt;
  return `Reference mapping:\n${lines.join("\n")}\n\nUser prompt:\n${prompt}`;
}

function insertTextAtRange(value: string, start: number, end: number, text: string): string {
  return `${value.slice(0, start)}${text}${value.slice(end)}`;
}

function remapPromptAfterReferenceRemoval(prompt: string, removedIndex: number): string {
  return prompt.replace(/@图片(\d+)/g, (match, value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return match;

    const index = parsed - 1;
    if (index === removedIndex) return "";
    if (index > removedIndex) return getReferencePromptToken(index - 1);
    return match;
  });
}

function removePromptReferenceTokens(prompt: string): string {
  return prompt.replace(/@图片\d+/g, "");
}

function formatStoredModelLabel(value: string, fallbackProvider: AiProvider): string {
  const parsed = parseProviderModel(value, fallbackProvider);
  return `${getProviderLabel(parsed.provider)} ${parsed.model}`;
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
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
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

  const WELCOME_MESSAGE: ChatMessage = {
    id: "welcome",
    role: "assistant",
    content: "您好！我是您的智能创意助手。您可以一边调整左侧创作参数，一边随时交办高阶创意任务。例如：「帮我做一套3张赛博朋克风战士的相册」或「帮我把上一部图片转成16:9的微短视频」。我会给出建议，并在确认后填入参数或执行生成。",
    thought: "初始化底部 Agent Dock，准备读取画廊资产上下文...",
    suggestedFollowUps: [
      "优化并生成一张赛博朋克飞艇",
      "我想做一段太空科幻题材视频",
      "根据当前画廊给我三个延展方向"
    ]
  };

  // Agent State
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [agentInput, setAgentInput] = useState("");
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [countdownId, setCountdownId] = useState<NodeJS.Timeout | null>(null);
  const [activeCountdownId, setActiveCountdownId] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(3);

  // Settings State
  const [providerCredentials, setProviderCredentials] = useState<Record<AiProvider, ProviderCredentials>>(defaultProviderCredentials);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>("12ai");
  const [selectedChatModel, setSelectedChatModel] = useState(DEFAULT_CHAT_MODEL);
  const [chatModelOptions, setChatModelOptions] = useState<Record<AiProvider, ModelOption[]>>(CHAT_MODEL_OPTIONS);
  const [imageModelOptions, setImageModelOptions] = useState<Record<AiProvider, ModelOption[]>>(IMAGE_MODEL_OPTIONS);
  const [videoModelOptions, setVideoModelOptions] = useState<Record<AiProvider, ModelOption[]>>(VIDEO_MODEL_OPTIONS);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelListMessage, setModelListMessage] = useState("");
  const [providerTest, setProviderTest] = useState<ProviderTestState>({
    provider: "12ai",
    status: "idle",
    message: "",
  });
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

  // Agent Reference States (Support Multiple)
  const [referenceImages, setReferenceImages] = useState<ReferenceImageRef[]>([]);
  const [agentReferences, setAgentReferences] = useState<ReferenceImageRef[]>([]);

  // Agent Reference States
  const [agentReferenceId, setAgentReferenceId] = useState<string | null>(null);
  const [agentReferenceUrl, setAgentReferenceUrl] = useState<string | null>(null);

  // At dropdown state
  const [atDropdown, setAtDropdown] = useState<{
    visible: boolean;
    type: "image-prompt" | "video-prompt" | "agent-prompt";
    search: string;
  }>({ visible: false, type: "image-prompt", search: "" });

  // References
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const agentDockRef = useRef<HTMLElement | null>(null);
  const autoCountdownInterval = useRef<NodeJS.Timeout | null>(null);
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

  const buildProviderHeaders = useCallback((target?: string) => {
    const provider =
      target && isKnownProvider(target)
        ? target
        : target
          ? parseProviderModel(target, selectedProvider).provider
          : selectedProvider;
    const chatModelHeader = target && !isKnownProvider(target) ? target : selectedChatModel;
    const headers: Record<string, string> = {
      "x-ai-provider": provider,
      "x-ai-chat-model": chatModelHeader,
    };
    const creds = providerCredentials[provider];
    if (creds?.apiKey) headers["x-ai-api-key"] = creds.apiKey;
    if (creds?.baseUrl) headers["x-ai-base-url"] = creds.baseUrl;
    return headers;
  }, [providerCredentials, selectedChatModel, selectedProvider]);

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
  const imageModelGroups = getProviderModelGroups(imageModelOptions);
  const videoModelGroups = getProviderModelGroups(videoModelOptions);
  const chatModelGroups = getProviderModelGroups(chatModelOptions);
  const getReferenceLimitForTarget = (target: PromptReferenceTarget): number =>
    target === "video-prompt" ? videoReferenceLimit : IMAGE_REFERENCE_LIMIT;
  const getDroppedReferenceRole = (target: PromptReferenceTarget, index: number): ReferenceImageRef["role"] => {
    if (target !== "video-prompt" || videoReferenceMode !== "firstLast") return "general";
    if (index === 0) return "start";
    if (index === 1) return "end";
    return "general";
  };
  const addDroppedReferenceAsset = (asset: DraggedReferenceAsset, target: PromptReferenceTarget): number | null => {
    const existingIndex = referenceImages.findIndex(reference => reference.id === asset.id);
    if (existingIndex !== -1) return existingIndex;

    const limit = getReferenceLimitForTarget(target);
    if (referenceImages.length >= limit) {
      pushWorkspaceNotice("error", `参考图已达上限：最多 ${limit} 张`);
      return null;
    }

    const nextIndex = referenceImages.length;
    const nextReference: ReferenceImageRef = {
      id: asset.id,
      url: asset.url,
      role: getDroppedReferenceRole(target, nextIndex),
    };

    setReferenceImage(referenceImages[0]?.url ?? asset.url);
    setReferenceImages(prev => {
      if (prev.some(reference => reference.id === asset.id)) return prev;
      if (prev.length >= limit) return prev;
      return [...prev, nextReference];
    });
    return nextIndex;
  };
  const handleReferenceDropAsset = (asset: DraggedReferenceAsset, target: PromptReferenceTarget) => {
    addDroppedReferenceAsset(asset, target);
  };
  const handlePromptDropAsset = (
    event: React.DragEvent<HTMLTextAreaElement>,
    target: PromptReferenceTarget,
  ) => {
    const asset = readDraggedReferenceAsset(event.dataTransfer);
    if (!asset) return;

    const textarea = event.currentTarget;
    const dropToken = makeReferenceDropToken(asset.id);
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const referenceIndex = addDroppedReferenceAsset(asset, target);

    window.setTimeout(() => {
      const currentValue = textarea.value;
      if (referenceIndex === null) {
        setPrompt(currentValue.replace(dropToken, ""));
        return;
      }

      const referenceToken = getReferencePromptToken(referenceIndex);
      const nextPrompt = currentValue.includes(dropToken)
        ? currentValue.replace(dropToken, referenceToken)
        : insertTextAtRange(currentValue, selectionStart, selectionEnd, referenceToken);

      setPrompt(nextPrompt);
      setAtDropdown({ visible: false, type: target, search: "" });
    }, 0);
  };
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
      const storedChat = localStorage.getItem("imagine_agent_chat");
      if (storedChat) {
        try {
          const parsed = JSON.parse(storedChat);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAgentMessages(parsed as ChatMessage[]);
            return;
          }
        } catch { /* ignore corrupt data */ }
      }
    }
    loadWorkspace();

    const restoreSettings = setTimeout(() => {
      // Restore from unified storage first, then migrate legacy keys
      const storedCreds = localStorage.getItem("imagine_provider_credentials");
      if (storedCreds) {
        try {
          const parsed = JSON.parse(storedCreds);
          const merged = defaultProviderCredentials();
          for (const p of PROVIDER_KEYS) {
            if (parsed[p]?.apiKey) merged[p].apiKey = parsed[p].apiKey;
            if (parsed[p]?.baseUrl) merged[p].baseUrl = parsed[p].baseUrl;
          }
          setProviderCredentials(merged);
        } catch { /* ignore corrupt data */ }
      } else {
        // Migrate legacy per-provider keys
        const legacy12AiKey = localStorage.getItem("imagine_12ai_api_key") ?? localStorage.getItem("imagine_custom_api_key");
        const legacyGrokKey = localStorage.getItem("imagine_grok2api_api_key");
        const legacyGrokBaseUrl = localStorage.getItem("imagine_grok2api_base_url") ?? localStorage.getItem("imagine_custom_api_base_url");
        if (legacy12AiKey || legacyGrokKey || legacyGrokBaseUrl) {
          const migrated = defaultProviderCredentials();
          if (legacy12AiKey) migrated["12ai"] = { ...migrated["12ai"], apiKey: legacy12AiKey };
          if (legacyGrokKey) migrated["grok2api"] = { ...migrated["grok2api"], apiKey: legacyGrokKey };
          if (legacyGrokBaseUrl) migrated["grok2api"] = { ...migrated["grok2api"], baseUrl: legacyGrokBaseUrl };
          setProviderCredentials(migrated);
          localStorage.removeItem("imagine_12ai_api_key");
          localStorage.removeItem("imagine_custom_api_key");
          localStorage.removeItem("imagine_grok2api_api_key");
          localStorage.removeItem("imagine_grok2api_base_url");
          localStorage.removeItem("imagine_custom_api_base_url");
          localStorage.setItem("imagine_provider_credentials", JSON.stringify(migrated));
        }
      }

      const storedProvider = localStorage.getItem("imagine_ai_provider");
      if (storedProvider && isKnownProvider(storedProvider)) setSelectedProvider(storedProvider);

      const storedChatModel = localStorage.getItem("imagine_chat_model");
      if (storedChatModel === "12ai:gemini-3.1-flash" || (storedChatModel && !hasBuiltInChatModel(storedChatModel))) {
        localStorage.setItem("imagine_chat_model", DEFAULT_CHAT_MODEL);
      } else if (storedChatModel) {
        setSelectedChatModel(storedChatModel);
      }

      const restoreModelOptions = (
        key: string,
        setter: React.Dispatch<React.SetStateAction<Record<AiProvider, ModelOption[]>>>,
        defaults: Record<AiProvider, ModelOption[]>,
        filterFn?: (option: ModelOption) => boolean,
      ) => {
        const stored = localStorage.getItem(key);
        if (!stored) return;
        try {
          const parsed = JSON.parse(stored) as unknown;
          if (Array.isArray(parsed)) {
            const flat = filterFn
              ? parsed.filter(isModelOption).filter(filterFn)
              : parsed.filter(isModelOption);
            if (flat.length > 0) setter(mergeProviderModelOptions(defaults, flat));
          } else {
            setter(prev => mergeRecordModelOptions(prev, parsed, filterFn));
          }
        } catch (err) {
          console.warn(`Failed to restore model list (${key}):`, err);
        }
      };

      restoreModelOptions("imagine_chat_model_options", setChatModelOptions, CHAT_MODEL_OPTIONS, isSelectableChatModel);
      restoreModelOptions("imagine_image_model_options", setImageModelOptions, IMAGE_MODEL_OPTIONS, isSelectableImageModel);
      restoreModelOptions("imagine_video_model_options", setVideoModelOptions, VIDEO_MODEL_OPTIONS);

      const storedAutoExec = localStorage.getItem("imagine_auto_execute");
      if (storedAutoExec) setAutoExecute(storedAutoExec === "true");

      const storedThemeMode = localStorage.getItem("imagine_theme_mode");
      if (storedThemeMode === "light" || storedThemeMode === "dark") {
        setThemeMode(storedThemeMode);
      }
    }, 0);

    return () => clearTimeout(restoreSettings);
  }, []);

  // Listen to clipboard paste events globally to import reference images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;
      for (const item of clipboardItems) {
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              const newReferenceId = makeClientId("import");

              // Set reference image context
              setReferenceImage(base64);
              setAgentReferenceId(newReferenceId);
              setAgentReferenceUrl(base64);
              setReferenceImages(prev => {
                if (prev.some(r => r.id === newReferenceId)) return prev;
                return [...prev, { id: newReferenceId, url: base64, role: "general" }];
              });
              setAgentReferences(prev => {
                if (prev.some(r => r.id === newReferenceId)) return prev;
                return [...prev, { id: newReferenceId, url: base64 }];
              });
              alert("📋 识别到剪贴板图像！已作为参考图导入。");
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Scroll to bottom of agent chat as new messages arrived
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentMessages, isAgentLoading]);

  // Persist agent chat to localStorage
  useEffect(() => {
    if (agentMessages.length > 1) {
      localStorage.setItem("imagine_agent_chat", JSON.stringify(agentMessages));
    }
  }, [agentMessages]);

  // Media Polling engine - checks processing image/video operations every 4 seconds
  useEffect(() => {
    const processingItems = items.filter(x => x.status === "processing" && x.operationName);
    if (processingItems.length === 0) return;

    const interval = setInterval(async () => {
      let changed = false;
      const updatedList = [...items];

      for (let i = 0; i < updatedList.length; i++) {
        const item = updatedList[i];
        if (item.status === "processing" && item.operationName) {
          if (locallyCanceledItemIdsRef.current.has(item.id)) continue;
          try {
            console.log(`Polling status for operation: ${item.operationName}`);
            const headers = buildProviderHeaders(item.operationName);

            const res = await fetch("/api/gemini/video-status", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ operationName: item.operationName }),
            });

            if (!res.ok) {
              throw new Error(await readFetchError(res, "任务状态查询失败"));
            }

            const statusData: unknown = await res.json();
            if (typeof statusData !== "object" || statusData === null) {
              throw new Error("任务状态接口返回格式不正确");
            }
            const statusRecord = statusData as Record<string, unknown>;
            pollingFailuresRef.current[item.id] = 0;

            if (statusRecord.done === true) {
                const mediaType = statusRecord.mediaType === "image" ? "image" : "video";
                const downloadEndpoint =
                  mediaType === "image"
                    ? "/api/gemini/image-download"
                    : "/api/gemini/video-download";

                console.log(`Operation done! Fetching final ${mediaType} download: ${item.operationName}`);
                const dlRes = await fetch(downloadEndpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...headers },
                  body: JSON.stringify({ operationName: item.operationName }),
                });

                if (dlRes.ok) {
                  const blob = await dlRes.blob();
                  const reader = new FileReader();
                  reader.onloadend = async () => {
                    const base64data = reader.result as string;
                    updatedList[i] = {
                      ...item,
                      url: base64data,
                      status: "complete",
                      progress: 100,
                    };
                    await saveToDB(updatedList[i]);
                    setItems([...updatedList]);
                  };
                  reader.readAsDataURL(blob);
                  changed = true;
                } else {
                  throw new Error(await readFetchError(dlRes, "结果下载失败"));
                }
              } else {
                const nextProgress = typeof statusRecord.progress === "number" ? statusRecord.progress : item.progress;
                // Update progress percentages
                if (item.progress !== nextProgress) {
                  updatedList[i] = {
                    ...item,
                    progress: nextProgress,
                  };
                  await saveToDB(updatedList[i]);
                  changed = true;
                }
            }
          } catch (e) {
            const previousFailures = pollingFailuresRef.current[item.id] ?? 0;
            const nextFailures = previousFailures + 1;
            pollingFailuresRef.current[item.id] = nextFailures;
            console.error(`Polling failed for ${item.id}:`, e);

            if (nextFailures >= 3) {
              const failedItem: StorageItem = {
                ...item,
                status: "failed",
                progress: 100,
                errorMessage: toErrorMessage(e, "任务轮询失败"),
              };
              updatedList[i] = failedItem;
              delete pollingFailuresRef.current[item.id];
              await saveToDB(failedItem);
              pushWorkspaceNotice("error", `异步任务失败：${failedItem.errorMessage}`);
              changed = true;
            }
          }
        }
      }

      if (changed) {
        setItems(updatedList);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [buildProviderHeaders, items, pushWorkspaceNotice]);

  const handleSaveCredential = useCallback((provider: AiProvider, field: keyof ProviderCredentials, value: string) => {
    setProviderCredentials(prev => {
      const next = { ...prev, [provider]: { ...prev[provider], [field]: value } };
      localStorage.setItem("imagine_provider_credentials", JSON.stringify(next));
      return next;
    });
  }, [setProviderCredentials]);

  const clearProviderCredentials = useCallback((provider: AiProvider) => {
    setProviderCredentials(prev => {
      const next = { ...prev, [provider]: { apiKey: "", baseUrl: "" } };
      localStorage.setItem("imagine_provider_credentials", JSON.stringify(next));
      return next;
    });
  }, [setProviderCredentials]);

  const handleSelectProvider = (provider: AiProvider) => {
    setSelectedProvider(provider);
    localStorage.setItem("imagine_ai_provider", provider);
  };

  const handleSelectChatModel = (model: string) => {
    setSelectedChatModel(model);
    localStorage.setItem("imagine_chat_model", model);
  };

  const refreshProviderModels = async () => {
    setIsLoadingModels(true);
    setModelListMessage("");
    try {
      const headers = buildProviderHeaders(selectedProvider);
      const res = await fetch(`/api/models?provider=${selectedProvider}&kind=all`, {
        headers,
      });
      if (!res.ok) {
        throw new Error(await readFetchError(res, "模型列表获取失败"));
      }
      const data: unknown = await res.json();
      const models = typeof data === "object" && data !== null && "models" in data
        ? (data as Record<string, unknown>).models
        : [];
      const fetched: ModelOption[] = Array.isArray(models) ? models.filter(isModelOption) : [];
      if (fetched.length === 0) {
        throw new Error("服务商没有返回可用模型");
      }

      const fetchedChat = fetched.filter(option => classifyModelOption(option) === "chat").filter(isSelectableChatModel);
      const fetchedImage = fetched.filter(option => classifyModelOption(option) === "image").filter(isSelectableImageModel);
      const fetchedVideo = fetched.filter(option => classifyModelOption(option) === "video");

      if (fetchedChat.length > 0) {
        const nextChatOptions = mergeModelOptions(chatModelOptions[selectedProvider], fetchedChat);
        const nextChatOptionsByProvider = { ...chatModelOptions, [selectedProvider]: nextChatOptions };
        setChatModelOptions(nextChatOptionsByProvider);
        localStorage.setItem("imagine_chat_model_options", JSON.stringify(nextChatOptionsByProvider));
        if (!fetchedChat.some(option => option.value === selectedChatModel)) {
          handleSelectChatModel(fetchedChat[0].value);
        }
      }
      if (fetchedImage.length > 0) {
        const nextImageOptions = mergeModelOptions(imageModelOptions[selectedProvider], fetchedImage);
        const nextImageOptionsByProvider = { ...imageModelOptions, [selectedProvider]: nextImageOptions };
        setImageModelOptions(nextImageOptionsByProvider);
        localStorage.setItem("imagine_image_model_options", JSON.stringify(nextImageOptionsByProvider));
      }
      if (fetchedVideo.length > 0) {
        const nextVideoOptions = mergeModelOptions(videoModelOptions[selectedProvider], fetchedVideo);
        const nextVideoOptionsByProvider = { ...videoModelOptions, [selectedProvider]: nextVideoOptions };
        setVideoModelOptions(nextVideoOptionsByProvider);
        localStorage.setItem("imagine_video_model_options", JSON.stringify(nextVideoOptionsByProvider));
      }

      setModelListMessage(`已获取 ${fetched.length} 个模型：Chat ${fetchedChat.length} / Image ${fetchedImage.length} / Video ${fetchedVideo.length}`);
    } catch (err) {
      const message = toErrorMessage(err, "模型列表获取失败");
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const testProviderConnection = async (provider: ProviderConnection) => {
    setProviderTest({ provider, status: "testing", message: "测试中..." });
    try {
      const res = await fetch(`/api/models?provider=${provider}`, {
        headers: buildProviderHeaders(provider),
      });
      if (!res.ok) {
        throw new Error(await readFetchError(res, `${getProviderLabel(provider)} 连接测试失败`));
      }
      setProviderTest({ provider, status: "success", message: `${getProviderLabel(provider)} 连接正常` });
    } catch (err) {
      setProviderTest({
        provider,
        status: "error",
        message: toErrorMessage(err, `${getProviderLabel(provider)} 连接测试失败`),
      });
    }
  };

  const handleToggleAutoExecute = (val: boolean) => {
    setAutoExecute(val);
    localStorage.setItem("imagine_auto_execute", String(val));
    if (!val) {
      clearActiveCountdown();
    }
  };

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

  // Launch Traditional Image generator call
  const generateManualImage = async () => {
    if (!prompt.trim()) return;
    if (isGptImageModel) {
      const sizeError = validateGptImageSize(activeImageSize);
      if (sizeError) {
        pushWorkspaceNotice("error", `GPT Image 2 尺寸无效：${sizeError}`);
        return;
      }
    }
    setImageSubmitCount(prev => prev + 1);
    const generationPrompt = buildPromptWithReferenceMap(prompt, referenceImages);

    // Create pre-queued item in memory immediately
    const tempId = makeClientId("temp_img");
    const newItem: StorageItem = {
      id: tempId,
      type: "image",
      url: "https://picsum.photos/800/800", // temp fallback placeholder display
      prompt: prompt,
      model: activeImageModel,
      aspectRatio: activeImageSize,
      createdAt: new Date().toISOString(),
      status: "pending",
      progress: 30,
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
          prompt: generationPrompt,
          model: activeImageModel,
          aspectRatio: activeImageSize,
          imageSize,
          thinkingLevel: imageThinkingLevel,
          referenceImage: referenceImages[0]?.url || referenceImage || undefined,
          referenceImages: referenceImages.map(r => r.url),
        }),
      });

      if (res.ok) {
        const data: unknown = await res.json();
        const operationName = getStringField(data, "operationName");
        const imageUrl = getStringField(data, "imageUrl");
        if (operationName) {
          const compilingItem: StorageItem = {
            ...newItem,
            id: makeClientId("img"),
            operationName,
            status: "processing",
            progress: 15,
          };
          await saveToDB(compilingItem);
          setItems(prev => [compilingItem, ...prev.filter(x => x.id !== tempId)]);
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

        // Remove temp and insert completed item
        await saveToDB(completedItem);
        setItems(prev => [completedItem, ...prev.filter(x => x.id !== tempId)]);
      } else {
        throw new Error(await readFetchError(res, "图片生成请求失败"));
      }
    } catch (e) {
      if (locallyCanceledItemIdsRef.current.has(tempId) || isAbortError(e)) {
        locallyCanceledItemIdsRef.current.delete(tempId);
        return;
      }
      console.error(e);
      const message = toErrorMessage(e, "图片生成失败");
      const failedItem: StorageItem = {
        ...newItem,
        status: "failed",
        progress: 100,
        errorMessage: message,
      };
      await saveToDB(failedItem);
      setItems(prev => [failedItem, ...prev.filter(x => x.id !== tempId)]);
      pushWorkspaceNotice("error", message);
    } finally {
      delete generationAbortControllersRef.current[tempId];
      setImageSubmitCount(prev => Math.max(0, prev - 1));
    }
  };

  // Launch Traditional Veo Video generator call
  const generateManualVideo = async () => {
    if (!prompt.trim()) return;
    setVideoSubmitCount(prev => prev + 1);

    const tempId = makeClientId("temp_vid");
    const newItem: StorageItem = {
      id: tempId,
      type: "video",
      url: "",
      prompt: prompt,
      model: selectedVideoModel,
      aspectRatio: activeVideoSize,
      createdAt: new Date().toISOString(),
      status: "processing",
      progress: 12,
    };

    setItems(prev => [newItem, ...prev]);

    const controller = new AbortController();
    generationAbortControllersRef.current[tempId] = controller;

    try {
      const headers = buildProviderHeaders(selectedVideoModel);
      const videoReferenceUrls = buildVideoReferenceUrls(
        referenceImages,
        referenceImage,
        videoReferenceMode,
        videoReferenceLimit,
      );
      const generationPrompt = buildPromptWithReferenceMap(prompt, referenceImages, videoReferenceUrls);

      const res = await fetch("/api/gemini/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: generationPrompt,
          images: videoReferenceUrls,
          aspectRatio: activeVideoSize,
          model: selectedVideoModel,
        }),
      });

      if (res.ok) {
        const data: unknown = await res.json();
        const activeOperationName = getStringField(data, "operationName");
        if (!activeOperationName) {
          throw new Error("视频接口返回缺少 operationName");
        }

        // Save polling handle
        const compilingItem: StorageItem = {
          ...newItem,
          id: makeClientId("vid"),
          operationName: activeOperationName,
          status: "processing",
        };

        await saveToDB(compilingItem);
        setItems(prev => [compilingItem, ...prev.filter(x => x.id !== tempId)]);
      } else {
        throw new Error(await readFetchError(res, "视频生成请求失败"));
      }
    } catch (e) {
      if (locallyCanceledItemIdsRef.current.has(tempId) || isAbortError(e)) {
        locallyCanceledItemIdsRef.current.delete(tempId);
        return;
      }
      console.error(e);
      const message = toErrorMessage(e, "视频生成失败");
      const failedItem: StorageItem = {
        ...newItem,
        status: "failed",
        progress: 100,
        errorMessage: message,
      };
      await saveToDB(failedItem);
      setItems(prev => [failedItem, ...prev.filter(x => x.id !== tempId)]);
      pushWorkspaceNotice("error", message);
    } finally {
      delete generationAbortControllersRef.current[tempId];
      setVideoSubmitCount(prev => Math.max(0, prev - 1));
    }
  };

  // Launch file reader for reference seed upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const newReferenceId = makeClientId("upload");

      setReferenceImage(base64);
      setReferenceImages(prev => {
        if (prev.some(r => r.id === newReferenceId)) return prev;
        return [...prev, { id: newReferenceId, url: base64, role: "general" }];
      });
    };
    reader.readAsDataURL(file);
  };

  const removeReferenceImage = (id: string) => {
    const removedIndex = referenceImages.findIndex(reference => reference.id === id);
    if (removedIndex !== -1) {
      setPrompt(current => remapPromptAfterReferenceRemoval(current, removedIndex));
    }

    setReferenceImages(prev => {
      const filtered = prev.filter(r => r.id !== id);
      if (filtered.length === 0) {
        setReferenceImage(null);
      } else {
        setReferenceImage(filtered[0].url);
      }
      return filtered;
    });
  };

  const toggleReferenceRole = (id: string, role: "start" | "end" | "general") => {
    setReferenceImages(prev => prev.map(r => {
      if (r.id === id) {
        return { ...r, role };
      }
      if ((role === "start" || role === "end") && r.role === role) {
        return { ...r, role: "general" };
      }
      return r;
    }));
  };

  // Floating selection tools management
  const toggleSelectItem = (id: string, e?: React.MouseEvent) => {
    if (e && e.shiftKey && selectedItemIds.length > 0) {
      // Handle Shift+Click range selection
      const allDisplayItems = filteredItems;
      const lastSelectedIdx = allDisplayItems.findIndex(x => x.id === selectedItemIds[selectedItemIds.length - 1]);
      const currentSelectedIdx = allDisplayItems.findIndex(x => x.id === id);

      if (lastSelectedIdx !== -1 && currentSelectedIdx !== -1) {
        const start = Math.min(lastSelectedIdx, currentSelectedIdx);
        const end = Math.max(lastSelectedIdx, currentSelectedIdx);
        const slicedIds = allDisplayItems.slice(start, end + 1).map(x => x.id);

        setSelectedItemIds(prev => Array.from(new Set([...prev, ...slicedIds])));
        return;
      }
    }

    if (selectedItemIds.includes(id)) {
      setSelectedItemIds(prev => prev.filter(x => x !== id));
    } else {
      setSelectedItemIds(prev => [...prev, id]);
    }
  };

  const handleClearSelection = () => {
    setSelectedItemIds([]);
  };

  // Batch delete items
  const handleBatchDelete = async () => {
    if (selectedItemIds.length === 0) return;
    if (confirm(`确定要彻底删除已选中的 ${selectedItemIds.length} 项创意资产吗？`)) {
      for (const id of selectedItemIds) {
        await deleteFromDB(id);
      }
      setItems(prev => prev.filter(x => !selectedItemIds.includes(x.id)));
      setSelectedItemIds([]);
      setCompareItemIds([]);
    }
  };

  const deleteItemsByStatus = async (statuses: StorageItem["status"][]) => {
    const ids = items.filter(item => statuses.includes(item.status)).map(item => item.id);
    if (ids.length === 0) return;
    if (confirm(`确定要删除 ${ids.length} 个 ${statuses.join("/")} 任务吗？`)) {
      for (const id of ids) {
        await deleteFromDB(id);
      }
      setItems(prev => prev.filter(item => !ids.includes(item.id)));
      setSelectedItemIds(prev => prev.filter(id => !ids.includes(id)));
      setCompareItemIds(prev => prev.filter(id => !ids.includes(id)));
    }
  };

  const cancelProcessingItem = async (item: StorageItem) => {
    const operationName = item.operationName;
    const canCancelRemote = operationName?.startsWith("12ai:video:") === true;
    const confirmText = canCancelRemote
      ? "确定要取消这个视频生成任务吗？"
      : "确定要本地取消这个任务吗？远端生成可能仍会继续。";
    if (!confirm(confirmText)) return;

    setCancelingItemIds(prev => [...prev, item.id]);
    try {
      const controller = generationAbortControllersRef.current[item.id];
      if (controller) {
        locallyCanceledItemIdsRef.current.add(item.id);
        controller.abort();
      }
      if (!canCancelRemote) {
        locallyCanceledItemIdsRef.current.add(item.id);
      }

      if (canCancelRemote) {
        const res = await fetch("/api/gemini/cancel-media", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildProviderHeaders(operationName) },
          body: JSON.stringify({ operationName }),
        });

        if (!res.ok) {
          throw new Error(await readFetchError(res, "任务取消失败"));
        }
      }

      await deleteFromDB(item.id);
      delete pollingFailuresRef.current[item.id];
      setItems(prev => prev.filter(current => current.id !== item.id));
      setSelectedItemIds(prev => prev.filter(id => id !== item.id));
      setCompareItemIds(prev => prev.filter(id => id !== item.id));
      pushWorkspaceNotice("success", canCancelRemote ? "视频生成任务已取消" : "任务已从本地取消");
    } catch (err) {
      pushWorkspaceNotice("error", toErrorMessage(err, "任务取消失败"));
    } finally {
      setCancelingItemIds(prev => prev.filter(id => id !== item.id));
    }
  };

  const handleDeleteItem = async (item: StorageItem) => {
    if (confirm("确定要删除此创意项吗？")) {
      await deleteFromDB(item.id);
      setItems(prev => prev.filter(current => current.id !== item.id));
      setSelectedItemIds(prev => prev.filter(id => id !== item.id));
      setCompareItemIds(prev => prev.filter(id => id !== item.id));
    }
  };

  const handleResetLocalData = async () => {
    if (confirm("这会清空所有生成的历史卡片，无法恢复！")) {
      await clearAllDB();
      setItems([]);
      setCompareItemIds([]);
      setSelectedItemIds([]);
    }
  };

  const exportMetadataJson = () => {
    const sourceItems = selectedItemIds.length > 0
      ? items.filter(item => selectedItemIdSet.has(item.id))
      : filteredItems;
    if (sourceItems.length === 0) return;
    const metadata = sourceItems.map(item => ({
      id: item.id,
      type: item.type,
      prompt: item.prompt,
      model: item.model,
      provider: parseProviderModel(item.model, selectedProvider).provider,
      aspectRatio: item.aspectRatio,
      status: item.status,
      progress: item.progress,
      operationName: item.operationName,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
    }));
    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${makeClientId("imagine_metadata")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const retryFailedItem = async (item: StorageItem) => {
    if (item.status !== "failed") return;
    const retryingItem: StorageItem = {
      ...item,
      status: item.type === "image" ? "pending" : "processing",
      progress: item.type === "image" ? 30 : 12,
      errorMessage: undefined,
      operationName: undefined,
    };
    await saveToDB(retryingItem);
    setItems(prev => prev.map(current => current.id === item.id ? retryingItem : current));

    try {
      const headers = buildProviderHeaders(item.model);
      const endpoint = item.type === "image" ? "/api/gemini/generate-image" : "/api/gemini/generate-video";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          prompt: item.prompt,
          model: item.model,
          aspectRatio: item.aspectRatio,
        }),
      });

      if (!res.ok) {
        throw new Error(await readFetchError(res, "任务重试失败"));
      }

      const data: unknown = await res.json();
      const operationName = getStringField(data, "operationName");
      const imageUrl = getStringField(data, "imageUrl");

      if (operationName) {
        const processingItem: StorageItem = {
          ...retryingItem,
          status: "processing",
          progress: 15,
          operationName,
        };
        await saveToDB(processingItem);
        setItems(prev => prev.map(current => current.id === item.id ? processingItem : current));
        return;
      }

      if (item.type === "image" && imageUrl) {
        const completedItem: StorageItem = {
          ...retryingItem,
          url: imageUrl,
          status: "complete",
          progress: 100,
        };
        await saveToDB(completedItem);
        setItems(prev => prev.map(current => current.id === item.id ? completedItem : current));
        return;
      }

      throw new Error(item.type === "image" ? "图片接口返回缺少 imageUrl 或 operationName" : "视频接口返回缺少 operationName");
    } catch (err) {
      const message = toErrorMessage(err, "任务重试失败");
      const failedItem: StorageItem = {
        ...item,
        status: "failed",
        progress: 100,
        errorMessage: message,
      };
      await saveToDB(failedItem);
      setItems(prev => prev.map(current => current.id === item.id ? failedItem : current));
      pushWorkspaceNotice("error", message);
    }
  };

  // Download single item as a file
  const handleDownloadItem = async (item: StorageItem) => {
    const extension = item.type === "image" ? "png" : "mp4";
    const fileName = `imagine_${item.id}.${extension}`;

    try {
      let blob: Blob;
      if (item.url && item.url.startsWith("data:")) {
        const parts = item.url.split(";base64,");
        if (parts.length === 2) {
          const byteChars = atob(parts[1]);
          const bytes = new Uint8Array(byteChars.length);
          for (let idx = 0; idx < byteChars.length; idx += 1) {
            bytes[idx] = byteChars.charCodeAt(idx);
          }
          blob = new Blob([bytes], { type: item.type === "image" ? "image/png" : "video/mp4" });
        } else {
          throw new Error("Invalid data URI");
        }
      } else {
        const fileRes = await fetch(item.url);
        if (!fileRes.ok) throw new Error(`Fetch failed: HTTP ${fileRes.status}`);
        blob = await fileRes.blob();
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download item failed:", err);
      alert("下载失败，请检查网络或文件是否可访问。");
    }
  };

  // Compiles and exports selected assets inside a single ZIP with mapping layout JSON
  const handleBatchDownloadZip = async () => {
    if (selectedItemIds.length === 0) return;
    const itemsToExport = items.filter(x => selectedItemIds.includes(x.id));

    const zip = new JSZip();
    const metadataList: Array<{
      id: string;
      fileName: string;
      type: StorageItem["type"];
      prompt: string;
      model: string;
      aspectRatio: string;
      createdAt: string;
    }> = [];

    await Promise.all(itemsToExport.map(async (item) => {
      const extension = item.type === "image" ? "png" : "mp4";
      const fileName = `creation_${item.id}.${extension}`;

      // Metadata mapping output
      metadataList.push({
        id: item.id,
        fileName: fileName,
        type: item.type,
        prompt: item.prompt,
        model: item.model,
        aspectRatio: item.aspectRatio,
        createdAt: item.createdAt,
      });

      try {
        if (item.url && item.url.startsWith("data:")) {
          const parts = item.url.split(";base64,");
          if (parts.length === 2) {
            zip.file(fileName, parts[1], { base64: true });
          }
        } else if (item.url) {
          // Fetch remote files and package them as blobs directly
          const fileRes = await fetch(item.url);
          if (fileRes.ok) {
            const blob = await fileRes.blob();
            zip.file(fileName, blob);
          } else {
            // Fallback to text link if fetching fails
            zip.file(`link_fallback_${item.id}.txt`, item.url);
          }
        }
      } catch (err) {
        console.error(`Error adding file ${item.id} to zip:`, err);
        zip.file(`error_log_${item.id}.txt`, `Failed to fetch from: ${item.url}\nError: ${err}`);
      }
    }));

    // Save metadata JSON
    zip.file("workspace_metadata.json", JSON.stringify(metadataList, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${makeClientId("Imagine_Workbench_Export")}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Compare mode selections
  const toggleCompare = (id: string) => {
    if (compareItemIds.includes(id)) {
      setCompareItemIds(prev => prev.filter(x => x !== id));
    } else {
      let nextBatch: string[] = [];
      if (compareItemIds.length >= 2) {
        nextBatch = [compareItemIds[1], id];
      } else {
        nextBatch = [...compareItemIds, id];
      }
      setCompareItemIds(nextBatch);
      if (nextBatch.length === 2) {
        // Auto show comparison workspace
        setIsCompareMode(true);
        // Reset slider position
        setCompareSliderPos(50);

        // Find if they are both images
        const matchA = items.find(x => x.id === nextBatch[0]);
        const matchB = items.find(x => x.id === nextBatch[1]);
        if (matchA?.type === "image" && matchB?.type === "image") {
          setCompareViewType("wipe-slider"); // default to interactive awesome slider for images!
        } else {
          setCompareViewType("side-by-side");
        }
      }
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

  // Live @ reference typing handler
  const handleTextareaChange = (val: string, type: "image-prompt" | "video-prompt" | "agent-prompt") => {
    if (type === "agent-prompt") {
      setAgentInput(val);
    } else {
      setPrompt(val);
    }

    const lastAtIdx = val.lastIndexOf("@");
    if (lastAtIdx !== -1 && lastAtIdx >= val.length - 15) {
      const searchPart = val.substring(lastAtIdx + 1);
      if (!searchPart.includes(" ") && !searchPart.includes("\n")) {
        setAtDropdown({ visible: true, type, search: searchPart });
        return;
      }
    }
    setAtDropdown({ visible: false, type, search: "" });
  };

  const handleSelectPromptReference = (index: number, type: "image-prompt" | "video-prompt") => {
    const lastAtIdx = prompt.lastIndexOf("@");
    const base = lastAtIdx !== -1 ? prompt.substring(0, lastAtIdx) : prompt;
    const searchLength = atDropdown.visible && atDropdown.type === type ? atDropdown.search.length : 0;
    const suffixStart = lastAtIdx === -1 ? prompt.length : lastAtIdx + 1 + searchLength;
    const suffix = prompt.substring(suffixStart);
    setPrompt(`${base}${getReferencePromptToken(index)} ${suffix}`);
    setAtDropdown({ visible: false, type, search: "" });
  };

  const handleSelectAtItem = (itemUrl: string, itemId: string, type: "image-prompt" | "video-prompt" | "agent-prompt") => {
    if (type === "agent-prompt") {
      const lastAtIdx = agentInput.lastIndexOf("@");
      const base = lastAtIdx !== -1 ? agentInput.substring(0, lastAtIdx) : agentInput;
      setAgentInput(`${base}[Ref: ${itemId}] `);
      setAgentReferenceId(itemId);
      setAgentReferenceUrl(itemUrl);
      setAgentReferences(prev => {
        if (prev.some(r => r.id === itemId)) return prev;
        return [...prev, { id: itemId, url: itemUrl }];
      });
    } else {
      const lastAtIdx = prompt.lastIndexOf("@");
      const base = lastAtIdx !== -1 ? prompt.substring(0, lastAtIdx) : prompt;
      setPrompt(`${base}[Ref: ${itemId}] `);
      setReferenceImage(itemUrl);
      setReferenceImages(prev => {
        if (prev.some(r => r.id === itemId)) return prev;
        const role =
          type === "video-prompt" && videoReferenceMode === "firstLast"
            ? prev.length === 1
              ? "end"
              : prev.length === 0
                ? "start"
                : "general"
            : "general";
        return [...prev, { id: itemId, url: itemUrl, role }];
      });
    }
    setAtDropdown({ visible: false, type, search: "" });
  };

  const renderAtDropdown = (type: "image-prompt" | "video-prompt" | "agent-prompt") => {
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

  // Clears active timeouts
  const clearActiveCountdown = () => {
    if (countdownId) clearTimeout(countdownId);
    if (autoCountdownInterval.current) clearInterval(autoCountdownInterval.current);
    setCountdownId(null);
    setActiveCountdownId(null);
    setCountdownSeconds(3);
  };

  // Run the Agent chat-completion query
  const submitAgentPrompt = async (forcedPrompt?: string) => {
    const activeText = (forcedPrompt || agentInput).trim();
    if (!activeText) return;

    clearActiveCountdown();
    setIsAgentDockOpen(true);

    const userMsg: ChatMessage = {
      id: makeClientId("usr"),
      role: "user",
      content: activeText,
    };

    setAgentMessages(prev => [...prev, userMsg]);
    setAgentInput("");
    setIsAgentLoading(true);

    try {
      const gallerySummary = items.map(x => ({
        id: x.id,
        type: x.type,
        prompt: x.prompt,
        aspectRatio: x.aspectRatio,
        url: x.url,
      }));

      const activeAgentReferences =
        agentReferences.length > 0
          ? agentReferences
          : agentReferenceId && agentReferenceUrl
            ? [{ id: agentReferenceId, url: agentReferenceUrl }]
            : [];
      const hasAgentImageReference = activeAgentReferences.some(reference => reference.url.trim().length > 0);
      const agentModel = hasAgentImageReference ? DEFAULT_VISION_CHAT_MODEL : selectedChatModel;
      const headers = buildProviderHeaders(agentModel);

      // Construct sliding window history for request
      const requestHistory = agentMessages
        .concat(userMsg)
        .slice(-10) // last 10 dialogs
        .map(x => ({
          role: x.role,
          content: x.content,
        }));

      const res = await fetch("/api/gemini/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          messages: requestHistory,
          gallerySummary,
          agentReferences: activeAgentReferences.map(r => ({ id: r.id, url: r.url })),
          agentReferenceId: activeAgentReferences[0]?.id || agentReferenceId || undefined,
          model: agentModel,
        }),
      });

      if (res.ok) {
        const agentResponse = await res.json();
        const assistantMsgId = makeClientId("asst");

        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: "assistant",
          content: agentResponse.text || "我已收到指令，该项目可以怎么推进？",
          thought: agentResponse.thought || "分析场景，规划后续设计合成步骤...",
          recommendedAction: agentResponse.recommendedAction || { type: "none" },
          suggestedFollowUps: agentResponse.suggestedFollowUps || [],
          interactiveState: "idle",
          activeSkills: agentResponse.activeSkills || [],
          toolCalls: agentResponse.toolCalls || [],
        };

        setAgentMessages(prev => [...prev, assistantMsg]);

        // Auto execute proposed structural action if enabled and action is valid
        if (autoExecute && agentResponse.recommendedAction && agentResponse.recommendedAction.type !== "none") {
          startAutoCountdown(assistantMsgId, agentResponse.recommendedAction);
        }
      }
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "请求过载";
      setAgentMessages(prev => [...prev, {
        id: makeClientId("asst_err"),
        role: "assistant",
        content: `抱歉，Agent 在网络调谐时出现异常 (${message}). 请检查网络、API Key 或重试。`,
        suggestedFollowUps: ["重试我先前的请求", "根据当前参数重新规划"]
      }]);
    } finally {
      setIsAgentLoading(false);
    }
  };

  // Interactive countdown loader representation for Auto-execute modes
  const startAutoCountdown = (msgId: string, action: AgentToolAction) => {
    clearActiveCountdown();
    setActiveCountdownId(msgId);
    let secLeft = 3;
    setCountdownSeconds(secLeft);

    autoCountdownInterval.current = setInterval(() => {
      secLeft--;
      setCountdownSeconds(secLeft);
      if (secLeft <= 0) {
        if (autoCountdownInterval.current) clearInterval(autoCountdownInterval.current);
        executeAgentToolAction(msgId, action);
      }
    }, 1000);
  };

  // Run the Tool recommendations parsed from the Agent's response payload
  const executeAgentToolAction = async (msgId: string, action: AgentToolAction) => {
    clearActiveCountdown();

    // Mark interactive state as executing
    setAgentMessages(prev => prev.map(m => m.id === msgId ? { ...m, interactiveState: "completed" } : m));

    const { type, params = {} } = action;

    if (type === "optimize_prompt") {
      setPrompt(params.prompt || "");
      optimizeActivePrompt();
    } else if (type === "generate_image") {
      // Feed values to manual inputs and trigger
      setPrompt(params.prompt || "");
      if (params.aspectRatio) setAspectRatio(params.aspectRatio);
      if (params.model) handleSelectImageModel(params.model);
      setTraditionalSubTab("image");

      // We trigger traditional image generation using immediate inline params
      setTimeout(() => {
        generateManualImage();
      }, 500);
    } else if (type === "generate_video") {
      setPrompt(params.prompt || "");
      if (params.aspectRatio) setAspectRatio(params.aspectRatio);
      if (params.model) handleSelectVideoModel(params.model);

      // Check if this refers to an existing asset
      if (params.referenceImageId) {
        const matchedAsset = items.find(x => x.id === params.referenceImageId);
        if (matchedAsset) {
          setReferenceImage(matchedAsset.url);
          setReferenceImages([{ id: matchedAsset.id, url: matchedAsset.url, role: "general" }]);
        }
      }

      setTraditionalSubTab("video");
      setTimeout(() => {
        generateManualVideo();
      }, 500);
    } else if (type === "edit_image") {
      setPrompt(params.prompt || "");
      setTraditionalSubTab("image");
      if (params.referenceImageId) {
        const matchedAsset = items.find(x => x.id === params.referenceImageId);
        if (matchedAsset) {
          setReferenceImage(matchedAsset.url);
          setReferenceImages([{ id: matchedAsset.id, url: matchedAsset.url, role: "general" }]);
          launchMaskEditor(matchedAsset.url, matchedAsset.id);
        }
      }
    }
  };

  const declineAgentToolAction = (msgId: string) => {
    clearActiveCountdown();
    setAgentMessages(prev => prev.map(m => m.id === msgId ? { ...m, interactiveState: "declined" } : m));
  };

  const handleClearChat = () => {
    setAgentMessages([WELCOME_MESSAGE]);
    localStorage.removeItem("imagine_agent_chat");
  };

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
        isLoadingModels={isLoadingModels}
        modelListMessage={modelListMessage}
        open={showSettings}
        providerCredentials={providerCredentials}
        providerTest={providerTest}
        selectedChatModel={selectedChatModel}
        selectedProvider={selectedProvider}
        onClearCredentials={clearProviderCredentials}
        onClose={() => setShowSettings(false)}
        onResetData={handleResetLocalData}
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
