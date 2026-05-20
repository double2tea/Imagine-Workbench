'use client';

import React, { useCallback, useDeferredValue, useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  Settings,
  Moon,
  Sun,
  Trash2,
  Download,
  Paintbrush,
  Check,
  X,
  RefreshCw,
  Play,
  Pause,
  Search,
  Send,
  Layers,
  CloudUpload,
  Sliders,
  Image as ImageIcon,
  Video as VideoIcon,
  ChevronRight,
  FileArchive,
  Maximize2,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
import { VISUAL_PRESETS, VisualPreset } from "@/components/PresetStyles";
import CanvasMaskEditor from "@/components/CanvasMaskEditor";
import PreviewImage from "@/components/PreviewImage";
import { saveToDB, getAllFromDB, deleteFromDB, clearAllDB, StorageItem } from "@/lib/db";
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

// Reference image object structure for multiple selection support
export interface ReferenceImageRef {
  id: string;
  url: string;
  role?: "start" | "end" | "general";
}

// Chat definition for Agent Mode
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thought?: string;
  recommendedAction?: {
    type: "none" | "optimize_prompt" | "generate_image" | "edit_image" | "generate_video";
    params?: {
      prompt?: string;
      model?: string;
      aspectRatio?: string;
      referenceImageId?: string;
    };
  };
  suggestedFollowUps?: string[];
  interactiveState?: "idle" | "executing" | "completed" | "declined";
  activeSkills?: string[];
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

type AgentToolAction = NonNullable<ChatMessage["recommendedAction"]>;
type NoticeType = "error" | "info" | "success";
type MaskDestination = "creative" | "agent";
type AssetStatusFilter = "all" | StorageItem["status"];
type ProviderConnection = AiProvider;
type ModelCategory = "chat" | "image" | "video";
type ThemeMode = "light" | "dark";

interface AssetStats {
  modelOptions: string[];
  typeCounts: Record<StorageItem["type"], number>;
  statusCounts: Record<StorageItem["status"], number>;
}

interface WorkspaceNotice {
  id: string;
  type: NoticeType;
  message: string;
}

interface ProviderTestState {
  provider: ProviderConnection;
  status: "idle" | "testing" | "success" | "error";
  message: string;
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

const TOOL_LABELS: Record<string, string> = {
  query_models: "查询模型",
  get_skill_info: "查询技能",
  get_gallery_assets: "搜索资产",
  get_prompt_blueprint: "获取模板",
};

const SKILL_LABELS: Record<string, { label: string; className: string }> = {
  PromptEngineer: { label: "提示词工程", className: "bg-teal-500/12 text-teal-300 border-teal-500/20" },
  ImageGenerator: { label: "智能生图", className: "bg-rose-500/12 text-rose-300 border-rose-500/20" },
  VideoGenerator: { label: "视频合成", className: "bg-purple-500/12 text-purple-300 border-purple-500/20" },
  ImageEditor: { label: "局部重绘", className: "bg-amber-500/12 text-amber-300 border-amber-500/20" },
  CreativePlanner: { label: "创意规划", className: "bg-indigo-500/12 text-indigo-300 border-indigo-500/20" },
  SessionHistoryRetriever: { label: "历史回退", className: "bg-sky-500/12 text-sky-300 border-sky-500/20" },
  VariationSuggester: { label: "变体推荐", className: "bg-emerald-500/12 text-emerald-300 border-emerald-500/20" },
  AsyncTaskManager: { label: "后台跟踪", className: "bg-cyan-500/12 text-cyan-300 border-cyan-500/20" },
  ProjectSummarizer: { label: "资产汇总", className: "bg-violet-500/12 text-violet-300 border-violet-500/20" },
  ExportManager: { label: "批量导出", className: "bg-red-500/12 text-red-300 border-red-500/20" },
};

const ACTION_LABELS: Record<AgentToolAction["type"], string> = {
  none: "无操作",
  optimize_prompt: "优化提示词",
  generate_image: "生成图片",
  edit_image: "编辑图片",
  generate_video: "生成视频",
};

interface AgentContentLine {
  kind: "paragraph" | "ordered" | "bullet";
  marker?: string;
  text: string;
}

function parseAgentContent(content: string): AgentContentLine[] {
  const normalized = content
    .replace(/\s+(\d+\.\s+)/g, "\n$1")
    .replace(/\s+([-•]\s+)/g, "\n$1");

  return normalized
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const ordered = line.match(/^(\d+)\.\s+(.*)$/);
      if (ordered) return { kind: "ordered", marker: ordered[1], text: ordered[2].trim() };

      const bullet = line.match(/^[-•]\s+(.*)$/);
      if (bullet) return { kind: "bullet", text: bullet[1].trim() };

      return { kind: "paragraph", text: line };
    });
}

function renderInlineEmphasis(text: string): React.ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
}

function renderAgentContent(content: string): React.ReactNode {
  const lines = parseAgentContent(content);

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        if (line.kind === "paragraph") {
          return (
            <p key={`${line.kind}-${index}`} className="leading-relaxed">
              {renderInlineEmphasis(line.text)}
            </p>
          );
        }

        return (
          <div key={`${line.kind}-${index}`} className="grid grid-cols-[auto_1fr] gap-2 leading-relaxed">
            <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md border border-blue-400/18 bg-blue-500/10 px-1.5 text-[10px] font-semibold text-blue-300">
              {line.marker ?? "•"}
            </span>
            <span>{renderInlineEmphasis(line.text)}</span>
          </div>
        );
      })}
    </div>
  );
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
  const [traditionalSubTab, setTraditionalSubTab] = useState<"image" | "video">("image");
  const [isAgentDockOpen, setIsAgentDockOpen] = useState(false);
  const [isAgentPortalReady, setIsAgentPortalReady] = useState(false);
  const [isAgentDockOverContent, setIsAgentDockOverContent] = useState(false);

  const applyAsVideoReference = (imageUrl: string) => {
    setReferenceImage(imageUrl);
    setTraditionalSubTab("video");
  };

  // Filter & UI Select States
  const [filterType, setFilterType] = useState<"all" | "images" | "videos">("all");
  const [assetStatusFilter, setAssetStatusFilter] = useState<AssetStatusFilter>("all");
  const [assetModelFilter, setAssetModelFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareItemIds, setCompareItemIds] = useState<string[]>([]);
  const [compareViewType, setCompareViewType] = useState<"side-by-side" | "wipe-slider">("side-by-side");
  const [compareSliderPos, setCompareSliderPos] = useState(50);

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
  const [twelveAiApiKey, setTwelveAiApiKey] = useState("");
  const [grokApiKey, setGrokApiKey] = useState("");
  const [grokBaseUrl, setGrokBaseUrl] = useState("");
  const [xstxApiKey, setXstxApiKey] = useState("");
  const [xstxBaseUrl, setXstxBaseUrl] = useState("");
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
  const [cancelingItemIds, setCancelingItemIds] = useState<string[]>([]);
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
  }, []);

  const pushWorkspaceNotice = useCallback((type: NoticeType, message: string) => {
    const id = makeClientId("notice");
    setWorkspaceNotices(prev => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => dismissWorkspaceNotice(id), 8000);
  }, [dismissWorkspaceNotice]);

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
    const apiKey = provider === "12ai" ? twelveAiApiKey : provider === "grok2api" ? grokApiKey : xstxApiKey;
    if (apiKey) headers["x-ai-api-key"] = apiKey;
    if (provider === "grok2api" && grokBaseUrl) headers["x-ai-base-url"] = grokBaseUrl;
    if (provider === "xstx" && xstxBaseUrl) headers["x-ai-base-url"] = xstxBaseUrl;
    return headers;
  }, [grokApiKey, grokBaseUrl, selectedChatModel, selectedProvider, twelveAiApiKey, xstxApiKey, xstxBaseUrl]);

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
    ? "描述首帧到尾帧之间的运动、转场与镜头变化... 输入 @ 可引用关键帧"
    : "描述场景的运动与镜头动作... 输入 @ 可引用图像作为视频参考";
  const videoReferenceHelp = isFirstLastVideoMode
    ? "第 1 张为首帧，第 2 张为尾帧"
    : "参考图用于主体、风格或场景引导，不作为首尾帧";
  const videoClearReferenceLabel = isFirstLastVideoMode ? "清空关键帧" : "清空参考图";
  const imageModelGroups = getProviderModelGroups(imageModelOptions);
  const videoModelGroups = getProviderModelGroups(videoModelOptions);
  const chatModelGroups = getProviderModelGroups(chatModelOptions);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const compareItemIdSet = useMemo(() => new Set(compareItemIds), [compareItemIds]);
  const cancelingItemIdSet = useMemo(() => new Set(cancelingItemIds), [cancelingItemIds]);
  const assetStats = useMemo<AssetStats>(() => {
    const models = new Set<string>();
    const typeCounts: Record<StorageItem["type"], number> = { image: 0, video: 0 };
    const statusCounts: Record<StorageItem["status"], number> = {
      complete: 0,
      failed: 0,
      pending: 0,
      processing: 0,
    };

    for (const item of items) {
      models.add(item.model);
      typeCounts[item.type] += 1;
      statusCounts[item.status] += 1;
    }

    return {
      modelOptions: Array.from(models).sort(),
      typeCounts,
      statusCounts,
    };
  }, [items]);
  const filteredItems = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();

    return items.filter(item => {
      if (filterType === "images" && item.type !== "image") return false;
      if (filterType === "videos" && item.type !== "video") return false;
      if (assetStatusFilter !== "all" && item.status !== assetStatusFilter) return false;
      if (assetModelFilter !== "all" && item.model !== assetModelFilter) return false;
      if (!query) return true;

      return item.prompt.toLowerCase().includes(query) || item.model.toLowerCase().includes(query);
    });
  }, [assetModelFilter, assetStatusFilter, deferredSearchQuery, filterType, items]);
  const searchableReferenceImages = useMemo(
    () => items.filter(item => item.type === "image" && item.status === "complete"),
    [items],
  );
  const compareItems = useMemo(() => {
    const itemById = new Map(items.map(item => [item.id, item]));
    return {
      first: compareItemIds[0] ? itemById.get(compareItemIds[0]) : undefined,
      second: compareItemIds[1] ? itemById.get(compareItemIds[1]) : undefined,
    };
  }, [compareItemIds, items]);

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
      const stored12AiKey =
        localStorage.getItem("imagine_12ai_api_key") ?? localStorage.getItem("imagine_custom_api_key");
      if (stored12AiKey) setTwelveAiApiKey(stored12AiKey);

      const storedGrokKey = localStorage.getItem("imagine_grok2api_api_key");
      if (storedGrokKey) setGrokApiKey(storedGrokKey);

      const storedGrokBaseUrl =
        localStorage.getItem("imagine_grok2api_base_url") ?? localStorage.getItem("imagine_custom_api_base_url");
      if (storedGrokBaseUrl) setGrokBaseUrl(storedGrokBaseUrl);

      const storedXstxKey = localStorage.getItem("imagine_xstx_api_key");
      if (storedXstxKey) setXstxApiKey(storedXstxKey);

      const storedXstxBaseUrl = localStorage.getItem("imagine_xstx_base_url");
      if (storedXstxBaseUrl) setXstxBaseUrl(storedXstxBaseUrl);

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

  // Handle setting API keys securely inside local tab variables
  const handleSave12AiApiKey = (key: string) => {
    setTwelveAiApiKey(key);
    localStorage.setItem("imagine_12ai_api_key", key);
  };

  const handleSaveGrokApiKey = (key: string) => {
    setGrokApiKey(key);
    localStorage.setItem("imagine_grok2api_api_key", key);
  };

  const handleSaveGrokBaseUrl = (url: string) => {
    setGrokBaseUrl(url);
    localStorage.setItem("imagine_grok2api_base_url", url);
  };

  const handleSaveXstxApiKey = (key: string) => {
    setXstxApiKey(key);
    localStorage.setItem("imagine_xstx_api_key", key);
  };

  const handleSaveXstxBaseUrl = (url: string) => {
    setXstxBaseUrl(url);
    localStorage.setItem("imagine_xstx_base_url", url);
  };

  const clearProviderCredentials = (provider: ProviderConnection) => {
    if (provider === "12ai") {
      setTwelveAiApiKey("");
      localStorage.removeItem("imagine_12ai_api_key");
      localStorage.removeItem("imagine_custom_api_key");
    } else if (provider === "grok2api") {
      setGrokApiKey("");
      setGrokBaseUrl("");
      localStorage.removeItem("imagine_grok2api_api_key");
      localStorage.removeItem("imagine_grok2api_base_url");
      localStorage.removeItem("imagine_custom_api_base_url");
    } else if (provider === "xstx") {
      setXstxApiKey("");
      setXstxBaseUrl("");
      localStorage.removeItem("imagine_xstx_api_key");
      localStorage.removeItem("imagine_xstx_base_url");
    }
  };

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
          prompt,
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

      const res = await fetch("/api/gemini/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
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
    const query = atDropdown.search.toLowerCase();
    const filtered = searchableReferenceImages.filter(x =>
      x.id.toLowerCase().includes(query) ||
      x.prompt.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      return (
        <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#0e0e12] border border-white/5 rounded-xl p-3 text-center text-[11px] text-slate-550 select-none shadow-xl z-50">
          🔍 未找到可引用的完成图像
        </div>
      );
    }

    return (
      <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#0e0e15]/95 backdrop-blur-md border border-blue-500/30 rounded-xl shadow-2xl p-2.5 z-50 max-h-52 overflow-y-auto w-full select-none flex flex-col gap-1.5">
        <p className="text-[9px] font-bold text-blue-400 px-2 uppercase tracking-wider mb-1 flex items-center justify-between">
          <span>📎 快捷@引用参考图 (Select reference image)</span>
          <span className="text-[8px] text-slate-400 font-mono">共 {filtered.length} 张可用</span>
        </p>
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelectAtItem(item.url, item.id, type)}
            className="w-full flex items-center gap-2.5 p-1.5 hover:bg-white/5 hover:border-white/10 rounded-lg text-left transition select-none cursor-pointer border border-transparent"
          >
            <div className="h-8 w-8 rounded overflow-hidden bg-slate-950 shrink-0 border border-white/5">
              <PreviewImage src={item.url} alt="at option" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono font-bold text-blue-400 truncate">
                ID: {item.id.substring(0, 12)}
              </p>
              <p className="text-[9px] text-slate-400 truncate">
                {item.prompt}
              </p>
            </div>
          </button>
        ))}
      </div>
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

      <div className="fixed top-[72px] right-4 z-[70] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
        <AnimatePresence>
          {workspaceNotices.map(notice => (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 shadow-2xl backdrop-blur-xl ${
                notice.type === "error"
                  ? "border-red-500/30 bg-red-950/80 text-red-100"
                  : notice.type === "success"
                    ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-100"
                    : "border-blue-500/30 bg-blue-950/80 text-blue-100"
              }`}
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
              <p className="min-w-0 flex-1 text-xs leading-5">{notice.message}</p>
              <button
                type="button"
                onClick={() => dismissWorkspaceNotice(notice.id)}
                className="rounded-md p-1 text-current/60 transition hover:bg-white/10 hover:text-current"
                title="关闭提示"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Dynamic Header */}
      <header className="imagine-app-header sticky top-0 z-40 bg-[#07080b]/86 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3 sm:px-6 flex items-center justify-between gap-3 select-none">
        <div className="flex min-w-0 items-center gap-3 z-10">
          <div className="imagine-brand-mark relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-500/12 shadow-sm">
            <Sparkles className="h-4.5 w-4.5 text-blue-200" />
          </div>
          <div className="min-w-0">
            <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-white">
              <span className="truncate">Imagine Workbench</span>
              <span className="shrink-0 rounded border border-blue-400/20 bg-blue-400/10 px-1.5 py-0.5 text-[9px] font-mono font-normal tracking-widest text-blue-300">v1.2 PRO</span>
            </h1>
            <p className="truncate text-[11px] font-medium text-slate-400">智能图像与视频生成工作台</p>
          </div>
        </div>

        {/* Global actions bar */}
        <div className="flex shrink-0 items-center gap-2 z-10">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="imagine-header-button flex h-9 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">设置</span>
          </button>

          <button
            type="button"
            onClick={toggleThemeMode}
            aria-pressed={themeMode === "dark"}
            className="imagine-header-button imagine-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-slate-400 transition hover:border-blue-500/40 hover:bg-blue-950/30 hover:text-blue-300 cursor-pointer"
            title={themeMode === "light" ? "切换深色模式" : "切换浅色模式"}
          >
            {themeMode === "light" ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Sun className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            onClick={handleClearProject}
            className="imagine-header-button imagine-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-slate-400 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-300 cursor-pointer"
            title="清空当前项目"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

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

                {/* Traditional Sub-tabs Switcher */}
                <div className="imagine-tabbar flex rounded-lg border border-slate-800 bg-slate-950/60 p-1">
                  <button
                    type="button"
                    onClick={() => setTraditionalSubTab("image")}
                    data-active={traditionalSubTab === "image"}
                    className={`imagine-tab-button flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold select-none cursor-pointer transition-all duration-200 ${
                      traditionalSubTab === "image"
                        ? "bg-blue-500/14 text-blue-200"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    }`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    智能绘图 <span className="hidden sm:inline text-slate-500">Image Studio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTraditionalSubTab("video")}
                    data-active={traditionalSubTab === "video"}
                    className={`imagine-tab-button flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold select-none cursor-pointer transition-all duration-200 ${
                      traditionalSubTab === "video"
                        ? "bg-violet-500/14 text-violet-200"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    }`}
                  >
                    <VideoIcon className="h-3.5 w-3.5" />
                    视频合成 <span className="hidden sm:inline text-slate-500">Video Studio</span>
                  </button>
                </div>

                {traditionalSubTab === "image" ? (
                  /* IMAGE TAB CONFIG */
                  <div className="flex flex-col gap-3.5 animate-fade-in">
                    {/* Visual Preset Tag Picker */}
                    <div>
                      <label className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                        <Paintbrush className="h-3.5 w-3.5 text-blue-300" />
                        艺术预设
                      </label>
                      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                        {VISUAL_PRESETS.map((preset) => {
                          const isActive = prompt.includes(preset.promptSuffix);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyPreset(preset)}
                              className={`imagine-preset-chip flex h-8 items-center gap-1.5 shrink-0 rounded-lg border px-3 text-xs transition duration-200 cursor-pointer ${
                                isActive
                                  ? "bg-blue-500/14 border-blue-400/35 text-blue-100"
                                  : "bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                              }`}
                            >
                              <span>{preset.emoji}</span>
                              <span>{preset.name}</span>
                              {isActive && (
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Prompt Box */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                          <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                          提示词 <span className="text-slate-500">(Prompt)</span>
                        </label>
                        <button
                          onClick={optimizeActivePrompt}
                          disabled={isOptimizing || !prompt.trim()}
                          className={`flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                            isOptimizing || !prompt.trim()
                              ? "bg-slate-900/70 text-slate-600 border-slate-800 cursor-not-allowed"
                              : "bg-blue-500/12 text-blue-200 border-blue-400/25 hover:bg-blue-500/18 cursor-pointer"
                          }`}
                        >
                          {isOptimizing ? (
                            <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                          ) : (
                            <Sparkles className="h-3 w-3 text-blue-300" />
                          )}
                          一键智能优化
                        </button>
                      </div>

                      <div className="imagine-field-shell relative rounded-lg border border-slate-800 bg-slate-950/55 p-3 transition focus-within:border-blue-400/35 focus-within:bg-slate-950/75">
                        {atDropdown.visible && atDropdown.type === "image-prompt" && renderAtDropdown("image-prompt")}
                        <textarea
                          value={prompt}
                          onChange={(e) => handleTextareaChange(e.target.value, "image-prompt")}
                          placeholder="写下你想创造的图片奇思妙想... 输入 @ 可引用历史生成图像作为参考"
                          className="w-full h-24 resize-none border-0 bg-transparent text-sm leading-6 text-slate-100 placeholder-slate-500 outline-0 ring-0 focus:ring-0"
                        />
                        <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500">
                          <span>输入 @ 呼出参考图 | 支持中英文</span>
                          <span>{prompt.length} 字符</span>
                        </div>
                      </div>
                    </div>

                    {/* Negative prompt entry box */}
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
                        反向提示词 <span className="text-slate-500">(Negative Prompt)</span>
                      </label>
                      <input
                        type="text"
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
                        placeholder="不希望出现在作品里的元素，例如：blurred, ugly, deformed, text"
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 transition focus:border-blue-400/35 focus:outline-none"
                      />
                    </div>

                    {/* Model & Aspect Ratio */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
                          图片生成模型
                        </label>
                        <select
                          value={selectedModel}
                          onChange={(e) => handleSelectImageModel(e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-blue-400/35 focus:outline-none cursor-pointer"
                        >
                          {imageModelGroups.map(group => (
                            <optgroup key={group.provider} label={group.label}>
                              {group.options.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
                          {isGptImageModel ? "输出分辨率" : "画面宽高比"} <span className="text-slate-500">(Size)</span>
                        </label>
                        <select
                          value={activeVideoSize}
                          onChange={(e) => setAspectRatio(e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-blue-400/35 focus:outline-none cursor-pointer"
                        >
                          {imageCapabilities.aspectRatios.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {isGptImageModel && aspectRatio === "custom" && (
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
                          自定义 GPT Image 2 分辨率
                        </label>
                        <input
                          type="text"
                          value={customGptImageSize}
                          onChange={(e) => setCustomGptImageSize(e.target.value)}
                          placeholder="例如 2560x1440，宽高需为 16 的倍数"
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 placeholder-slate-600 transition focus:border-blue-400/35 focus:outline-none"
                        />
                        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-slate-500">
                          约束：最大边 ≤ 3840px，宽高为 16 的倍数，比例 ≤ 3:1，总像素 655,360-8,294,400。
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {imageCapabilities.imageSizes.length > 0 && (
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
                            {selectedModel.includes("gpt-image") ? "画质档位" : "高清合成分辨率"}
                          </label>
                          <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-slate-800 bg-slate-950/45 p-1.5">
                            {imageCapabilities.imageSizes.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setImageSize(option.value)}
                                className={`min-h-8 rounded-md px-2 font-mono text-[10px] transition cursor-pointer ${
                                  imageSize === option.value
                                    ? "bg-blue-500/16 text-blue-100"
                                    : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {imageCapabilities.thinkingLevels.length > 0 && (
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
                            图片思考等级
                          </label>
                          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-800 bg-slate-950/45 p-1.5">
                            {imageCapabilities.thinkingLevels.map(option => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setImageThinkingLevel(option.value)}
                                className={`min-h-8 rounded-md px-2 font-mono text-[10px] transition cursor-pointer ${
                                  imageThinkingLevel === option.value
                                    ? "bg-amber-500/16 text-amber-100"
                                    : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Image-to-image reference (Upload / Masking) */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                          创意参考图 / 多图垫图 {referenceImages.length > 0 && `(${referenceImages.length})`}
                        </label>
                        {referenceImages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceImages([]);
                              setReferenceImage(null);
                            }}
                            className="text-[10px] text-red-300 transition hover:text-red-200 cursor-pointer"
                          >
                            清空所有垫图
                          </button>
                        )}
                      </div>

                      {referenceImages.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2 rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                          {referenceImages.map((refImg) => (
                            <div
                              key={refImg.id}
                              className="relative aspect-square rounded-lg border border-white/10 overflow-hidden bg-cover bg-center group"
                              style={{ backgroundImage: `url(${refImg.url})` }}
                            >
                              {/* Hover close overlay */}
                              <button
                                type="button"
                                onClick={() => removeReferenceImage(refImg.id)}
                                className="absolute top-1 right-1 bg-red-600/95 text-white rounded-md p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer hover:scale-105"
                                title="移除该图"
                              >
                                <X className="h-3 w-3" />
                              </button>

                              {/* Tiny ID indicator */}
                              <div className="absolute bottom-0 inset-x-0 bg-black/65 text-[8px] font-mono text-slate-300 truncate px-1 py-0.5 text-center">
                                {refImg.id.includes("upload") ? "Uploaded" : refImg.id.substring(0, 10)}
                              </div>
                            </div>
                          ))}

                          {/* Add button inside grid */}
                          {referenceImages.length < 4 && (
                            <label className="relative aspect-square rounded-lg border border-dashed border-slate-700 bg-slate-900/40 transition hover:border-slate-500 hover:bg-slate-900 flex flex-col items-center justify-center cursor-pointer select-none">
                              <span className="text-slate-400 font-bold text-lg leading-none">+</span>
                              <span className="text-[8px] text-slate-500 font-semibold mt-0.5">多图垫</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <div className="imagine-upload-zone relative flex min-h-[76px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/35 p-3 text-center transition hover:border-slate-600 hover:bg-slate-950/60">
                          <CloudUpload className="mb-1.5 h-5 w-5 text-slate-500" />
                          <span className="text-xs text-slate-300">
                            拖拽图片，或{" "}
                            <label className="font-medium text-blue-300 underline-offset-4 hover:text-blue-200 hover:underline cursor-pointer">
                              浏览上传
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          </span>
                          <span className="mt-1 text-[9px] text-slate-500">支持 JPG / PNG / WEBP | 粘贴剪贴板快捷垫图</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom main trigger button */}
                    <button
                      onClick={generateManualImage}
                      disabled={!prompt.trim()}
                      className={`imagine-primary-action mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold transition duration-200 ${
                        !prompt.trim()
                          ? "bg-slate-900/70 text-slate-600 border border-slate-800 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-lg shadow-blue-950/30 cursor-pointer"
                      }`}
                    >
                      {isSubmittingImage ? (
                        <RefreshCw className="h-4 w-4 animate-spin text-white" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-white" />
                      )}
                      {isSubmittingImage ? `提交中 (${imageSubmitCount})，可继续排队` : "一键渲染合成全新图片 (Render Image)"}
                    </button>
                  </div>
                ) : (
                  /* VIDEO TAB CONFIG */
                  <div className="flex flex-col gap-3.5 animate-fade-in">
                    {/* Prompt Box */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                          <VideoIcon className="h-3.5 w-3.5 text-violet-300" />
                          视频场景运动描述 <span className="text-slate-500">(Video Motion Prompt)</span>
                        </label>
                        <button
                          onClick={optimizeActivePrompt}
                          disabled={isOptimizing || !prompt.trim()}
                          className={`flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                            isOptimizing || !prompt.trim()
                              ? "bg-slate-900/70 text-slate-600 border-slate-800 cursor-not-allowed"
                              : "bg-violet-500/12 text-violet-200 border-violet-400/25 hover:bg-violet-500/18 cursor-pointer"
                          }`}
                        >
                          {isOptimizing ? (
                            <RefreshCw className="h-3 w-3 animate-spin text-purple-400" />
                          ) : (
                            <Sparkles className="h-3 w-3 text-violet-300" />
                          )}
                          提示词动态润色
                        </button>
                      </div>

                      <div className="imagine-field-shell relative rounded-lg border border-slate-800 bg-slate-950/55 p-3 transition focus-within:border-violet-400/35 focus-within:bg-slate-950/75">
                        {atDropdown.visible && atDropdown.type === "video-prompt" && renderAtDropdown("video-prompt")}
                        <textarea
                          value={prompt}
                          onChange={(e) => handleTextareaChange(e.target.value, "video-prompt")}
                          placeholder={videoPromptPlaceholder}
                          className="w-full h-24 resize-none border-0 bg-transparent text-sm leading-6 text-slate-100 placeholder-slate-500 outline-0 ring-0 focus:ring-0"
                        />
                        <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500">
                          <span>输入 @ 呼出图像资产 | 支持运动镜头与画面控制</span>
                          <span>{prompt.length} 字符</span>
                        </div>
                      </div>
                    </div>

                    {/* Model & Aspect Ratio */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
                          视频生成模型
                        </label>
                        <select
                          value={selectedVideoModel}
                          onChange={(e) => handleSelectVideoModel(e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-violet-400/35 focus:outline-none cursor-pointer"
                        >
                          {videoModelGroups.map(group => (
                            <optgroup key={group.provider} label={group.label}>
                              {group.options.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
                          视频尺寸
                        </label>
                        <select
                          value={aspectRatio}
                          onChange={(e) => setAspectRatio(e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-violet-400/35 focus:outline-none cursor-pointer"
                        >
                          {videoCapabilities.sizes.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Video reference inputs */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                          {videoReferenceLabel} {referenceImages.length > 0 && `(${Math.min(referenceImages.length, videoReferenceLimit)}/${videoReferenceLimit})`}
                        </label>
                        {referenceImages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceImages([]);
                              setReferenceImage(null);
                            }}
                            className="text-[10px] text-red-300 transition hover:text-red-200 cursor-pointer"
                          >
                            {videoClearReferenceLabel}
                          </button>
                        )}
                      </div>

                      {referenceImages.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2 rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                          {referenceImages.slice(0, videoReferenceLimit).map((refImg) => {
                            const isFirstLastMode = videoReferenceMode === "firstLast";
                            const isStart = isFirstLastMode && refImg.role === "start";
                            const isEnd = isFirstLastMode && refImg.role === "end";
                            return (
                              <div
                                key={refImg.id}
                                className={`relative aspect-square rounded-lg border overflow-hidden bg-cover bg-center group transition-all duration-300 ${
                                  isStart
                                    ? "border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                                    : isEnd
                                    ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                                    : "border-white/10"
                                }`}
                                style={{ backgroundImage: `url(${refImg.url})` }}
                              >
                                {/* Hover close overlay */}
                                <button
                                  type="button"
                                  onClick={() => removeReferenceImage(refImg.id)}
                                  className="absolute top-1 right-1 bg-red-600/95 text-white rounded-md p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer hover:scale-105 z-10"
                                  title="移除该图"
                                >
                                  <X className="h-3 w-3" />
                                </button>

                                {isFirstLastMode ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextRole = isStart ? "end" : isEnd ? "general" : "start";
                                      toggleReferenceRole(refImg.id, nextRole as "start" | "end" | "general");
                                    }}
                                    className={`absolute inset-x-0 bottom-0 py-1 text-[8px] font-sans font-bold text-center text-white backdrop-blur-subtle cursor-pointer transition-colors ${
                                      isStart
                                        ? "bg-emerald-600/80"
                                        : isEnd
                                        ? "bg-amber-600/80"
                                        : "bg-black/60 hover:bg-black/80"
                                    }`}
                                    title="点击切换：首帧 / 尾帧 / 普通参考"
                                  >
                                    {isStart ? "🎬 首帧" : isEnd ? "🏁 尾帧" : "📎 普通参考"}
                                  </button>
                                ) : (
                                  <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[8px] font-bold text-white backdrop-blur-subtle">
                                    📎 参考图
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Add button inside grid */}
                          {referenceImages.length < videoReferenceLimit && (
                            <label className="relative aspect-square rounded-lg border border-dashed border-slate-700 bg-slate-900/40 transition hover:border-slate-500 hover:bg-slate-900 flex flex-col items-center justify-center cursor-pointer select-none">
                              <span className="text-slate-400 font-bold text-lg leading-none">+</span>
                              <span className="text-[8px] text-slate-500 font-semibold mt-0.5">添加参考</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <div className="imagine-upload-zone relative flex min-h-[76px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/35 p-3 text-center transition hover:border-slate-600 hover:bg-slate-950/60">
                          <CloudUpload className="mb-1.5 h-5 w-5 text-slate-500" />
                          <span className="text-xs text-slate-300">
                            拖拽{videoReferenceLabel}，或{" "}
                            <label className="font-medium text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline cursor-pointer">
                              浏览上传
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          </span>
                          <span className="mt-1 text-[9px] text-slate-500">
                            支持 JPG / PNG / WEBP | 最多 {videoReferenceLimit} 张 | {videoReferenceHelp}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom main video trigger button */}
                    <button
                      onClick={generateManualVideo}
                      disabled={!prompt.trim()}
                      className={`imagine-primary-action mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold transition duration-200 ${
                        !prompt.trim()
                          ? "bg-slate-900/70 text-slate-600 border border-slate-800 cursor-not-allowed"
                          : "bg-violet-600 hover:bg-violet-500 text-white active:scale-95 shadow-lg shadow-violet-950/30 cursor-pointer"
                      }`}
                    >
                      {isSubmittingVideo ? (
                        <RefreshCw className="h-4 w-4 animate-spin text-white" />
                      ) : (
                        <VideoIcon className="h-4 w-4 text-white hover:scale-110 transition" />
                      )}
                      {isSubmittingVideo ? `提交中 (${videoSubmitCount})，可继续排队` : "一键渲染合成动态视频 (Render Video)"}
                    </button>
                  </div>
                )}

              </div>


            {/* Persistent Agent Dock */}
            {isAgentPortalReady && !isAgentDockSuppressed && createPortal(
              <section
                ref={agentDockRef}
                className={`imagine-agent-dock imagine-theme-${themeMode} fixed inset-x-4 bottom-12 z-40 mx-auto w-[calc(100vw-32px)] max-w-5xl rounded-lg border border-slate-700/70 bg-[#0b0d13]/96 p-3 text-slate-200 shadow-[0_18px_54px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100 sm:bottom-16 sm:w-[min(1040px,calc(100vw-40px))] ${
                  isAgentDockOverContent ? "opacity-[0.84]" : "opacity-100"
                }`}
              >
              <div className={`${isAgentDockOpen ? "mb-2.5" : "mb-1.5"} grid grid-cols-[auto_1fr_auto] items-center gap-2`}>
                <button
                  type="button"
                  onClick={() => setIsAgentDockOpen(prev => !prev)}
                  className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-slate-200 transition hover:text-white"
                  title={isAgentDockOpen ? "收起 Agent 对话" : "展开 Agent 对话"}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-blue-400/20 bg-blue-500/12">
                    <Sparkles className="h-3.5 w-3.5 text-blue-200" />
                  </span>
                  <span className="min-w-0 truncate">Agent</span>
                  <ChevronRight className={`h-3 w-3 text-slate-500 transition ${isAgentDockOpen ? "rotate-90" : "-rotate-90"}`} />
                </button>

                <span className="h-px bg-gradient-to-r from-slate-700/60 via-slate-800/40 to-transparent" />

                <span className="flex shrink-0 items-center gap-2">
                  <span className="hidden items-center gap-1.5 font-mono text-[10px] text-slate-500 sm:flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
                    {agentReferenceId || agentReferenceUrl ? "引用中" : "画廊"}
                  </span>
                  {agentMessages.length > 1 && (
                    <button
                      type="button"
                      onClick={handleClearChat}
                      className="flex h-5 w-5 items-center justify-center rounded border border-slate-700/60 text-slate-500 transition hover:border-red-500/30 hover:text-red-400"
                      title="清空对话"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </span>
              </div>

                {/* Scrollable chat thread feed */}
              <AnimatePresence initial={false}>
                {isAgentDockOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="max-h-[min(46vh,440px)] overflow-y-auto pr-1 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
                  >
                  {agentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col gap-1.5 ${
                        msg.role === "user" ? "self-end ml-10" : "self-start mr-10"
                      }`}
                    >
                      {/* Sender visual node */}
                      <span className={`text-[10px] font-mono tracking-widest ${
                        msg.role === "user" ? "text-right text-slate-500" : "text-left text-blue-400 font-bold"
                      }`}>
                        {msg.role === "user" ? "YOU" : "CREATIVE AGENT"}
                      </span>

                      {/* Active Dynamic Skills Loading Indicators */}
                      {msg.role === "assistant" && msg.activeSkills && msg.activeSkills.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mb-0.5 shadow-sm">
                          {msg.activeSkills.map((skillName) => {
                            const info =
                              SKILL_LABELS[skillName] ?? {
                                label: skillName,
                                className: "bg-blue-500/10 text-blue-400 border-blue-500/15",
                              };

                            return (
                              <span
                                key={skillName}
                                className={`text-[10px] px-2 py-0.5 rounded-md border font-sans font-medium flex items-center gap-1 transition-transform duration-200 select-none ${info.className}`}
                                title={`Activated Domain Skill: ${skillName}`}
                              >
                                {info.label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Tool calls made by agent */}
                      {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 opacity-70">
                          {msg.toolCalls.map((tc, idx) => {
                            const label = TOOL_LABELS[tc.name] || tc.name;
                            return (
                              <span
                                key={`${tc.name}-${idx}`}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900/80 text-slate-400 font-mono"
                                title={JSON.stringify(tc.args)}
                              >
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Msg text element wrapper */}
                      <div className={`overflow-y-auto rounded-lg px-3 py-2 text-xs inline-block leading-relaxed ${
                        msg.role === "user"
                          ? "max-w-[min(620px,86vw)] bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-medium rounded-tr-none shadow-[0_4px_15px_rgba(37,99,235,0.25)]"
                          : "max-h-64 w-[min(760px,calc(100vw-72px))] bg-slate-900/82 border border-slate-700/60 text-slate-200 rounded-tl-none"
                      }`}>
                        {msg.role === "assistant" ? renderAgentContent(msg.content) : msg.content}
                      </div>

                      {/* Expandable Inner Thought Process (If Assistant) */}
                      {msg.role === "assistant" && msg.thought && (
                        <details className="group self-start outline-none">
                          <summary className="text-[10px] text-slate-500 select-none cursor-pointer outline-none hover:text-slate-350 group-open:text-blue-400 flex items-center gap-1">
                            <span className="font-mono">思考过程</span>
                            <ChevronRight className="h-3 w-3 transform transition group-open:rotate-90 text-slate-500" />
                          </summary>
                          <div className="mt-1.5 max-w-[min(760px,calc(100vw-72px))] p-2.5 bg-black/40 rounded-lg border border-white/5 text-[10px] font-mono text-slate-400 whitespace-pre-line leading-normal">
                            {msg.thought}
                          </div>
                        </details>
                      )}

                      {/* Tool Call proposal indicator block (IF active and matching tool) */}
                      {msg.role === "assistant" && msg.recommendedAction && msg.recommendedAction.type !== "none" && (
                        <div className="mt-2.5 w-[min(760px,calc(100vw-72px))] rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 shadow-inner">
                          <span className="text-[10px] text-blue-400 font-mono tracking-widest font-bold block mb-2">
                            建议动作
                          </span>

                          <div className="text-xs text-slate-200 flex flex-col gap-1.5">
                            <p>
                              <strong className="text-blue-400">操作:</strong>{" "}
                              <code className="bg-black/30 px-1 py-0.5 rounded text-[10px] font-mono text-blue-300">
                                {ACTION_LABELS[msg.recommendedAction.type]}
                              </code>
                            </p>

                            {msg.recommendedAction.params?.prompt && (
                              <p className="leading-normal">
                                <strong className="text-blue-400">规划提示词:</strong>{" "}
                                <span className="italic text-slate-300">
                                  &ldquo;{msg.recommendedAction.params.prompt}&rdquo;
                                </span>
                              </p>
                            )}

                            {msg.recommendedAction.params?.aspectRatio && (
                              <p>
                                <strong className="text-blue-400">画素尺寸:</strong>{" "}
                                <span className="text-[10px] bg-black/30 px-1 py-0.5 rounded font-mono text-blue-300">
                                  {msg.recommendedAction.params.aspectRatio}
                                </span>
                              </p>
                            )}
                          </div>

                          {/* Control action buttons */}
                          <div className="flex gap-2.5 mt-3 pt-2.5 border-t border-white/5">
                            {msg.interactiveState === "idle" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (msg.recommendedAction) executeAgentToolAction(msg.id, msg.recommendedAction);
                                  }}
                                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] flex items-center justify-center gap-1 shadow-md hover:shadow-[0_0_15px_rgba(37,99,235,0.3)] cursor-pointer transition"
                                >
                                  <Check className="h-3 w-3" />
                                  执行
                                </button>
                                <button
                                  type="button"
                                  onClick={() => declineAgentToolAction(msg.id)}
                                  className="border border-white/5 hover:border-white/10 bg-white/5 text-slate-400 hover:text-slate-200 py-1.5 px-3 rounded-lg text-[10px] cursor-pointer transition"
                                >
                                  拒绝
                                </button>
                              </>
                            )}

                            {msg.interactiveState === "completed" && (
                              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1.5 px-2 py-1 bg-emerald-950/20 border border-emerald-900/40 rounded-lg">
                                <Check className="h-3 w-3" />
                                创意流程已触发并加载完毕
                              </span>
                            )}

                            {msg.interactiveState === "declined" && (
                              <span className="text-[10px] text-slate-600 italic">
                                方案已被拒绝/驳回
                              </span>
                            )}
                          </div>

                          {/* Countdown slider visual indicator if auto-execute and active */}
                          {activeCountdownId === msg.id && msg.interactiveState === "idle" && (
                            <div className="mt-2 text-center">
                              <div className="h-1 bg-white/5 rounded overflow-hidden">
                                <motion.div
                                  initial={{ width: "100%" }}
                                  animate={{ width: "0%" }}
                                  transition={{ duration: countdownSeconds, ease: "linear" }}
                                  className="h-full bg-blue-500"
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] mt-1.5 font-mono">
                                <span className="text-blue-400">⏱️ 自动模式: 将在 {countdownSeconds} 秒后自主运行</span>
                                <button
                                  onClick={clearActiveCountdown}
                                  className="text-red-400 hover:text-red-300 underline cursor-pointer"
                                >
                                  取消自动
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Suggestions list from companion */}
                      {msg.role === "assistant" && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 self-start">
                          {msg.suggestedFollowUps.map((t, idx) => (
                            <button
                              key={idx}
                              onClick={() => submitAgentPrompt(t)}
                              className="text-[10px] rounded-full border border-white/5 hover:border-blue-500/25 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 px-3 py-1 transition text-left cursor-pointer"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing loader spinner */}
                  {isAgentLoading && (
                    <div className="flex flex-col max-w-[90%] gap-1.5 self-start">
                      <span className="text-[10px] font-mono tracking-widest text-blue-400 animate-pulse">
                        AGENT COMPILING THOUGHTS
                      </span>
                      <div className="rounded-xl px-4 py-3 bg-slate-900/80 border border-slate-700/60 text-slate-300 text-xs flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                        <span>智囊团正在研判画廊状态，筹备提示词设计框架...</span>
                      </div>
                    </div>
                  )}

                  {/* Bottom anchor point */}
                  <div ref={chatBottomRef} />
                  </motion.div>
                )}
              </AnimatePresence>

                {/* Combined input form */}
              <div className={`${isAgentDockOpen ? "border-t border-white/5 pt-3 mt-2" : ""} flex flex-col gap-3`}>

                  {/* Current reference banner inside Agent Workspace */}
                  {(agentReferenceId || agentReferenceUrl) && (
                    <div className="flex items-center justify-between gap-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-fade-in mb-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden border border-blue-500/30 bg-slate-950">
                          <PreviewImage
                            src={agentReferenceUrl || ""}
                            alt="agent ref"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-bold text-blue-400">📎 局部编辑参考图 (Referenced Image)</span>
                          <span className="text-[9px] font-mono text-slate-400 truncate max-w-[150px]">
                            ID: {agentReferenceId ? agentReferenceId.substring(0, 16) : "Pasted Custom File"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (agentReferenceUrl) {
                              launchMaskEditor(agentReferenceUrl, agentReferenceId || "custom_ref", "agent");
                            }
                          }}
                          className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600 border border-blue-500/30 text-blue-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                          title="使用画笔抹除或标记局部涂层"
                        >
                          <Paintbrush className="h-3 w-3" />
                          画笔涂抹
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAgentReferenceId(null);
                            setAgentReferenceUrl(null);
                          }}
                          className="p-1 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition border border-white/5 cursor-pointer"
                          title="取消引用"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="relative min-w-0">
                    {atDropdown.visible && atDropdown.type === "agent-prompt" && renderAtDropdown("agent-prompt")}
                    <form
                      onSubmit={(e) => { e.preventDefault(); submitAgentPrompt(); }}
                      className="relative flex items-center w-full"
                    >
                      <input
                        type="text"
                        value={agentInput}
                        onChange={(e) => handleTextareaChange(e.target.value, "agent-prompt")}
                        placeholder="问 Agent... 输入 @ 引用完成图"
                        className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 py-2.5 pl-3.5 pr-11 text-xs text-slate-100 placeholder-slate-500 transition focus:border-blue-400/45 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isAgentLoading || !agentInput.trim()}
                        className={`absolute right-2 px-3 py-1.5 rounded-lg text-white font-bold transition flex items-center justify-center ${
                          isAgentLoading || !agentInput.trim()
                            ? "bg-white/5 text-slate-600"
                            : "bg-blue-600 hover:bg-blue-500 active:scale-95 cursor-pointer shadow-md shadow-blue-500/10"
                        }`}
                      >
                        <Send className="h-3 w-3" />
                      </button>
                    </form>
                  </div>

                  <label
                    htmlFor="auto_trigger"
                    className={`flex h-9 shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-medium transition ${
                      autoExecute
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                        : "border-slate-700/70 bg-slate-950/45 text-slate-400 hover:text-slate-200"
                    }`}
                    title="自动执行 Agent action"
                  >
                    <span className={`h-2 w-2 rounded-full ${autoExecute ? "bg-emerald-300" : "bg-slate-600"}`} />
                    <span>自动</span>
                    <input
                      type="checkbox"
                      id="auto_trigger"
                      checked={autoExecute}
                      onChange={(e) => handleToggleAutoExecute(e.target.checked)}
                      className="sr-only"
                    />
                  </label>
                </div>
                </div>

              </section>,
              document.body,
            )}

          </div>
        </section>

        {/* Right Studio Workspace (Gallery, Masonry & Comparative Canvas) (Col 8) */}
        <section className="imagine-gallery-panel flex min-w-0 flex-col gap-4">

          {/* Controls Header toolbar */}
          <div className="imagine-toolbar-surface rounded-xl dark-glass p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
              <div className="flex min-w-0 flex-col gap-2.5">
                <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                  <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">类型</span>
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {([
                      { value: "all", label: "全部", count: items.length },
                      { value: "images", label: "图片", count: assetStats.typeCounts.image },
                      { value: "videos", label: "视频", count: assetStats.typeCounts.video },
                    ] as const).map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFilterType(option.value)}
                        data-active={filterType === option.value}
                        className={`imagine-filter-chip h-7 rounded-md border px-2.5 text-xs transition focus:outline-none cursor-pointer ${
                          filterType === option.value
                            ? "border-slate-700 bg-slate-800/80 text-slate-100"
                            : "border-transparent text-slate-450 hover:border-slate-800 hover:bg-slate-900/70 hover:text-slate-200"
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className="ml-1 font-mono text-[10px] text-slate-500">{option.count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                  <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">状态</span>
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {([
                      { value: "all", label: "全部", count: items.length },
                      { value: "pending", label: "pending", count: assetStats.statusCounts.pending },
                      { value: "processing", label: "processing", count: assetStats.statusCounts.processing },
                      { value: "failed", label: "failed", count: assetStats.statusCounts.failed },
                      { value: "complete", label: "complete", count: assetStats.statusCounts.complete },
                    ] as const).map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAssetStatusFilter(option.value)}
                        data-active={assetStatusFilter === option.value}
                        className={`imagine-filter-chip h-7 rounded-md border px-2.5 font-mono text-[10px] transition focus:outline-none cursor-pointer ${
                          assetStatusFilter === option.value
                            ? "border-slate-700 bg-slate-800/80 text-slate-100"
                            : "border-transparent text-slate-500 hover:border-slate-800 hover:bg-slate-900/70 hover:text-slate-200"
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className="ml-1 text-slate-500">{option.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <select
                    value={assetModelFilter}
                    onChange={(e) => setAssetModelFilter(e.target.value)}
                    className="imagine-toolbar-select h-9 min-w-0 rounded-lg border border-slate-800 bg-slate-950/55 px-3 font-mono text-[10px] text-slate-300 transition focus:border-blue-400/35 focus:outline-none"
                  >
                    <option value="all">全部模型</option>
                    {assetStats.modelOptions.map(model => (
                      <option key={model} value={model}>{formatStoredModelLabel(model, selectedProvider)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={exportMetadataJson}
                    className="imagine-secondary-action h-9 rounded-lg border border-slate-800 bg-slate-950/55 px-3 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-900"
                  >
                    导出
                  </button>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <div className="relative min-w-0">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索提示词、模型..."
                      className="imagine-toolbar-search h-9 w-full rounded-lg border border-slate-800 bg-slate-950/55 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-600 transition focus:border-blue-400/35 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteItemsByStatus(["failed", "pending"])}
                    className="imagine-danger-action h-9 rounded-lg border border-red-500/20 bg-red-950/20 px-3 text-[10px] font-semibold text-red-300 transition hover:bg-red-950/35"
                  >
                    清失败
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {selectedItemIds.length > 0 && (
              <motion.div
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                className="rounded-xl border border-blue-500/20 bg-slate-950/55 p-3 shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-md"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold text-slate-100">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                      已选中 {selectedItemIds.length} 项创意作品
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">可批量打包为 ZIP，或移除所选资产。</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={handleBatchDownloadZip}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500"
                    >
                      <FileArchive className="h-3.5 w-3.5" />
                      打包 ZIP
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      className="rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-950/35"
                    >
                      批量删除
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
                      title="清空勾选"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Active project Compare Slider workspace (Show if CompareMode on with exactly 2 items) */}
          {isCompareMode && (
            <div className="rounded-2xl border border-blue-500/20 bg-[#0e0e12]/90 backdrop-blur-md p-5 flex flex-col gap-4 animate-fade-in shadow-[0_0_25px_rgba(37,99,235,0.07)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                    🔄 极智画论对比器 (Visual Layout Contrast)
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    选中两张创意项，即可进行高精度像素级滑动擦拭或双面分屏对判。
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Selector only if both items are images */}
                  {compareItems.first?.type === "image" && compareItems.second?.type === "image" && (
                    <div className="flex bg-white/5 border border-white/5 rounded-lg p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setCompareViewType("wipe-slider")}
                        className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all duration-200 cursor-pointer ${
                          compareViewType === "wipe-slider"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        🖱️ 滑过擦拭
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompareViewType("side-by-side")}
                        className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all duration-200 cursor-pointer ${
                          compareViewType === "side-by-side"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        🔲 双幅分屏
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => { setIsCompareMode(false); setCompareItemIds([]); }}
                    className="text-xs text-slate-400 hover:text-red-400 font-medium px-2 py-1 bg-white/5 border border-white/5 rounded-lg hover:border-red-500/20 transition cursor-pointer"
                  >
                    重置
                  </button>
                </div>
              </div>

              {compareItemIds.length !== 2 ? (
                <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-1.5">
                  <span>ℹ️ 请先到下方画廊中勾选 2 个项目的「对比」按钮来开启对比！</span>
                  <span>（当前已选中: {compareItemIds.length}/2 个）</span>
                </div>
              ) : (
                (() => {
                  const matchedA = compareItems.first;
                  const matchedB = compareItems.second;

                  if (!matchedA || !matchedB) {
                    return (
                      <div className="p-4 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
                        匹配素材载入失败。请重新勾选有效果的原片。
                      </div>
                    );
                  }

                  const isBothImages = matchedA.type === "image" && matchedB.type === "image";

                  if (compareViewType === "wipe-slider" && isBothImages) {
                    return (
                      <div className="flex flex-col gap-3">
                        <div className="relative w-full aspect-[4/3] rounded-2xl border border-white/5 overflow-hidden bg-slate-950 select-none shadow-2xl">
                          {/* Left Image (matchedA) as ambient base background */}
                          <PreviewImage
                            src={matchedA.url}
                            alt="Compare item A"
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                          />
                          <div className="absolute bottom-3 left-3 z-20 bg-black/70 backdrop-blur-md border border-white/5 px-2.5 py-1 rounded-xl text-[10px] text-slate-300 pointer-events-none flex flex-col gap-0.5">
                            <span className="font-bold text-blue-400 text-[11px]">A: 原始起稿</span>
                            <span className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]" title={matchedA.prompt}>
                              {matchedA.id.substring(0, 8)}
                            </span>
                          </div>

                          {/* Right Image (matchedB) clipped overlay */}
                          <PreviewImage
                            src={matchedB.url}
                            alt="Compare item B"
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                            style={{ clipPath: `polygon(0 0, ${compareSliderPos}% 0, ${compareSliderPos}% 100%, 0 100%)` }}
                          />
                          <div className="absolute bottom-3 right-3 z-20 bg-black/70 backdrop-blur-md border border-white/5 px-2.5 py-1 rounded-xl text-[10px] text-slate-300 pointer-events-none text-right flex flex-col gap-0.5">
                            <span className="font-bold text-amber-500 text-[11px]">B: 演进渲染</span>
                            <span className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]" title={matchedB.prompt}>
                              {matchedB.id.substring(0, 8)}
                            </span>
                          </div>

                          {/* Sliding handle bar line and icon */}
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-blue-500/80 z-20 pointer-events-none"
                            style={{ left: `${compareSliderPos}%` }}
                          >
                            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-600 border border-blue-400 shadow-md flex items-center justify-center pointer-events-none animate-pulse">
                              <Sliders className="h-4 w-4 text-white rotate-90" />
                            </div>
                          </div>

                          {/* Range slider input overlaid */}
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={compareSliderPos}
                            onChange={(e) => setCompareSliderPos(Number(e.target.value))}
                            className="absolute inset-0 w-full h-full opacity-0 z-30 cursor-ew-resize"
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] px-1 font-mono text-slate-400">
                          <span className="truncate max-w-[45%] italic" title={matchedA.prompt}>👈 A: {matchedA.prompt}</span>
                          <span className="text-blue-400 font-bold">拉拽滑锁进行滑动对比 (Drag Slider)</span>
                          <span className="truncate max-w-[45%] text-right italic" title={matchedB.prompt}>👉 B: {matchedB.prompt}</span>
                        </div>
                      </div>
                    );
                  }

                  // Default / Side-by-Side grid contrast
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Frame A */}
                      <div className="border border-white/5 rounded-2xl overflow-hidden bg-slate-950 p-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 font-mono">
                              FRAME A: {matchedA.id.substring(0, 8)}
                            </span>
                            <span className="text-[9px] font-mono text-slate-500">
                              🤖 {matchedA.model.replace("-preview", "").replace("lite-", "").replace("imagen-", "Imagen")}
                            </span>
                          </div>

                          <div className="aspect-[4/3] relative w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
                            {matchedA.type === "image" ? (
                              <PreviewImage src={matchedA.url} alt="A" className="w-full h-full object-cover" />
                            ) : (
                              <video src={matchedA.url} controls loop preload="metadata" className="w-full h-full object-cover" />
                            )}
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-300 mt-2.5 line-clamp-2 leading-relaxed italic" title={matchedA.prompt}>
                          &ldquo;{matchedA.prompt}&rdquo;
                        </p>
                      </div>

                      {/* Frame B */}
                      <div className="border border-white/5 rounded-2xl overflow-hidden bg-slate-950 p-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25 font-mono">
                              FRAME B: {matchedB.id.substring(0, 8)}
                            </span>
                            <span className="text-[9px] font-mono text-slate-500">
                              🤖 {matchedB.model.replace("-preview", "").replace("lite-", "").replace("imagen-", "Imagen")}
                            </span>
                          </div>

                          <div className="aspect-[4/3] relative w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
                            {matchedB.type === "image" ? (
                              <PreviewImage src={matchedB.url} alt="B" className="w-full h-full object-cover" />
                            ) : (
                              <video src={matchedB.url} controls loop preload="metadata" className="w-full h-full object-cover" />
                            )}
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-300 mt-2.5 line-clamp-2 leading-relaxed italic" title={matchedB.prompt}>
                          &ldquo;{matchedB.prompt}&rdquo;
                        </p>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* Main Gallery List */}
          <div className="imagine-gallery-scroll min-h-[calc(100vh-360px)]">
            {filteredItems.length === 0 ? (
              <div className="imagine-gallery-empty flex min-h-[calc(100vh-390px)] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/28 p-6 text-center text-slate-500">
                <ImageIcon className="mb-3 h-9 w-9 text-slate-700" />
                <p className="text-sm font-semibold text-slate-400">暂无生成的创意文件</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-600">在左侧写下创意设想并生成，文件将实时存档至本地 IndexedDB。</p>
              </div>
            ) : (
              <div className="imagine-gallery-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    data-status={item.status}
                    data-type={item.type}
                    className={`imagine-asset-card relative overflow-hidden rounded-2xl group border bg-slate-900 shadow-xl transition-all duration-300 flex flex-col justify-between ${
                      selectedItemIdSet.has(item.id)
                        ? "border-blue-500 ring-2 ring-blue-500/20"
                        : "border-slate-850 hover:border-slate-750"
                    }`}
                  >

                    {/* Visual creation node */}
                    <div className="imagine-asset-media relative aspect-[4/3] w-full bg-slate-950 overflow-hidden flex items-center justify-center border-b border-white/5">

                      {item.status === "processing" || item.status === "pending" ? (
                        <div className="absolute inset-0 bg-[#07070a] flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden">
                          {/* Pulsing glow background elements */}
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl animate-pulse" />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-indigo-500/5 rounded-full blur-xl animate-ping" />

                          <div className="relative z-10 flex flex-col items-center">
                            <div className="h-9 w-9 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.2)] mb-3 animate-spin duration-3000">
                              <RefreshCw className="h-4.5 w-4.5 text-blue-400 animate-spin" />
                            </div>
                            <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                              {item.status === "pending"
                                ? "任务已排队..."
                                : item.type === "video"
                                  ? "智影合成中..."
                                  : "极精算色中..."}
                            </p>
                            <span className="text-[9px] font-mono text-slate-500 mt-1">
                              模型: {item.model.replace("-preview", "").replace("lite-", "").replace("-generate", "").replace("imagen-", "Imagen")}
                            </span>

                            <div className="w-36 bg-white/5 h-1 rounded-full overflow-hidden mt-4 border border-white/5 shadow-inner">
                              <div
                                className="bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 h-full transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-blue-400 mt-2 font-mono font-bold tracking-widest">
                              {item.progress}% {item.status.toUpperCase()}
                            </span>
                            <button
                              type="button"
                              onClick={() => cancelProcessingItem(item)}
                              disabled={cancelingItemIdSet.has(item.id)}
                              className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold text-red-200 transition hover:border-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-55"
                              title={item.operationName?.startsWith("12ai:video:") ? "取消 12AI 视频生成任务" : "从本地取消并停止等待"}
                            >
                              <X className="h-3 w-3" />
                              {cancelingItemIdSet.has(item.id) ? "取消中" : "取消"}
                            </button>
                          </div>
                        </div>
                      ) : item.status === "failed" ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 px-4 py-3 text-center text-red-400 select-none">
                          <X className="mb-1.5 h-6 w-6 shrink-0 text-red-500/55" />
                          <p className="text-xs font-semibold leading-5">生成失败 / 链接中断</p>
                          <p className="mt-0.5 line-clamp-2 max-w-full break-words text-[10px] leading-4 text-slate-550">
                            {item.errorMessage ?? "请核查 API Key 或重构参数。"}
                          </p>
                          <button
                            type="button"
                            onClick={() => retryFailedItem(item)}
                            className="mt-2 flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/60 bg-red-600 px-3 py-1.5 text-[10px] font-bold text-white shadow-sm shadow-red-950/20 transition hover:bg-red-500"
                          >
                            <RefreshCw className="h-3 w-3" />
                            重试
                          </button>
                        </div>
                      ) : (
                        // Standard complete state display
                        <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
                          {item.type === "image" ? (
                            <PreviewImage
                              src={item.url}
                              alt={item.prompt}
                              className="h-full w-full cursor-pointer object-contain transition duration-500"
                              onClick={() => setFullscreenItem(item)}
                            />
                          ) : (
                            <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
                              <video
                                src={item.url}
                                controls
                                loop
                                preload="metadata"
                                className="h-full w-full object-contain"
                              />
                            </div>
                          )}

                          {/* Dynamic Top-Right Badge: Image vs Video */}
                          <div className="absolute top-3 right-3 z-10 flex gap-1.5">
                            {item.type === "image" ? (
                              <span className="imagine-asset-type-badge flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-blue-500/80 backdrop-blur-md text-white border border-blue-400/25">
                                <ImageIcon className="h-3 w-3" />
                                IMAGE
                              </span>
                            ) : (
                              <span className="imagine-asset-type-badge flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-purple-500/80 backdrop-blur-md text-white border border-purple-400/25">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
                                VEO VIDEO
                              </span>
                            )}
                          </div>

                          {/* Top-Left selection checkbox */}
                          <div className="absolute top-3 left-3 z-10">
                            <input
                              type="checkbox"
                              checked={selectedItemIdSet.has(item.id)}
                              onChange={() => toggleSelectItem(item.id)}
                              className="h-4.5 w-4.5 bg-slate-950/85 border-white/10 text-blue-500 focus:ring-0 rounded-md cursor-pointer checked:bg-blue-600 flex items-center justify-center transition"
                            />
                          </div>

                          <div className="imagine-asset-hover-scrim absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none" />
                          <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none group-hover:pointer-events-auto">
                            <div className="imagine-card-actions flex flex-wrap items-center justify-center gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1 backdrop-blur-md shadow-xl">

                             {item.type === "image" && (
                              <button
                                onClick={() => applyAsVideoReference(item.url)}
                                className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-purple-600 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                                title="以此图首帧生图动态 Veo 航拍影片"
                              >
                                <VideoIcon className="h-3 w-3 text-purple-450 group-hover:text-white" />
                                <span className="text-[9px] font-bold">生视频</span>
                              </button>
                            )}

                             {item.type === "image" && (
                              <button
                                onClick={() => {
                                  setAgentReferenceId(item.id);
                                  setAgentReferenceUrl(item.url);
                                  setIsAgentDockOpen(true);
                                }}
                                className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-blue-600 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                                title="引用该图片至 Agent 智能代理进行对话与局部修改"
                              >
                                <Sparkles className="h-3 w-3 text-blue-455 text-blue-400 group-hover:text-white animate-pulse" />
                                <span className="text-[9px] font-bold">Agent</span>
                              </button>
                            )}

                            {item.type === "image" && (
                              <button
                                onClick={() => launchMaskEditor(item.url, item.id)}
                                className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-amber-600 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                                title="对该图片局部进行笔刷遮罩修改 & 创意局部重绘"
                              >
                                <Paintbrush className="h-3 w-3 text-amber-500 group-hover:text-white" />
                                <span className="text-[9px] font-bold">修改</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleDownloadItem(item)}
                              className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-emerald-600 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                              title="下载该文件到本地"
                            >
                              <Download className="h-3 w-3 text-emerald-400 group-hover:text-white" />
                              <span className="text-[9px] font-bold">下载</span>
                            </button>

                            <button
                              onClick={() => toggleCompare(item.id)}
                              className={`imagine-card-action min-w-0 px-1.5 py-1 rounded-md border transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer ${
                                compareItemIdSet.has(item.id)
                                  ? "bg-blue-600 border-blue-500 text-white"
                                  : "bg-slate-900/90 border-white/5 text-slate-300 hover:text-white hover:bg-slate-800"
                              }`}
                              title="加入左右侧滑块对比面板"
                            >
                              <RefreshCw className="h-3 w-3 text-blue-400" />
                              <span className="text-[9px] font-bold">对比</span>
                            </button>

                            <button
                              onClick={() => setFullscreenItem(item)}
                              className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-slate-800 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center cursor-pointer"
                              title="全屏大画幅细节放大"
                            >
                              <Maximize2 className="h-3 w-3 text-slate-300" />
                            </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Meta parameter details */}
                    <div className="imagine-asset-meta p-3.5 bg-[#0e0e12] flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed font-sans" title={item.prompt}>
                          {item.prompt}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-850 flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-mono text-slate-500">
                          <span className="imagine-meta-chip bg-white/5 px-2 py-0.5 rounded text-[9px]">
                            {getProviderLabel(parseProviderModel(item.model, selectedProvider).provider)}
                          </span>
                          <span className="imagine-meta-chip bg-white/5 px-2 py-0.5 rounded text-[9px]" title={item.model}>
                            🤖 {item.model.replace("-preview", "").replace("lite-", "").replace("-generate", "").replace("imagen-", "Imagen")}
                          </span>
                          <span className="imagine-meta-chip bg-white/5 px-2 py-0.5 rounded">📐 {item.aspectRatio}</span>
                          <span className="imagine-meta-chip imagine-status-chip bg-white/5 px-2 py-0.5 rounded">{item.status}</span>
                          {item.errorMessage && (
                            <span className="max-w-[160px] truncate rounded bg-red-500/10 px-2 py-0.5 text-red-300" title={item.errorMessage}>
                              last error: {item.errorMessage}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-slate-650">
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>

                          <button
                            onClick={async () => {
                              if (confirm("确定要删除此创意项吗？")) {
                                await deleteFromDB(item.id);
                                setItems(prev => prev.filter(x => x.id !== item.id));
                                setSelectedItemIds(prev => prev.filter(x => x !== item.id));
                                setCompareItemIds(prev => prev.filter(x => x !== item.id));
                              }
                            }}
                            className="text-slate-600 hover:text-red-400 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                            title="单独移除此项"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </section>

      </main>

      {/* Settings Panel Overlay Drawer */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-850 px-6 py-4">
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-amber-500" />
                  API 服务商设置
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 flex flex-col gap-4 font-sans text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-slate-200">12AI</h4>
                      {twelveAiApiKey && <span className="text-[10px] text-emerald-400">Key 已保存</span>}
                    </div>
                    <label className="font-semibold text-slate-400 block mb-1.5">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={twelveAiApiKey}
                      onChange={(e) => handleSave12AiApiKey(e.target.value)}
                      placeholder="sk_your_12ai_key"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-slate-700 font-mono transition"
                    />
                    <div className="mt-3 rounded-lg bg-slate-900/70 border border-slate-800 px-3 py-2 font-mono text-[10px] text-slate-400 leading-relaxed">
                      <div>Chat/Image: https://cdn.12ai.org</div>
                      <div>Veo: https://new.12ai.org</div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => testProviderConnection("12ai")}
                        disabled={providerTest.status === "testing" && providerTest.provider === "12ai"}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:text-slate-600"
                      >
                        <RefreshCw className={`h-3 w-3 ${providerTest.status === "testing" && providerTest.provider === "12ai" ? "animate-spin" : ""}`} />
                        测试
                      </button>
                      <button
                        type="button"
                        onClick={() => clearProviderCredentials("12ai")}
                        className="h-8 rounded-lg border border-red-500/20 bg-red-950/20 px-3 text-[10px] font-semibold text-red-300 transition hover:bg-red-950/35"
                      >
                        清除 Key
                      </button>
                    </div>
                    {providerTest.provider === "12ai" && providerTest.message && (
                      <p className={`mt-2 font-mono text-[10px] ${providerTest.status === "error" ? "text-red-300" : "text-emerald-300"}`}>
                        {providerTest.message}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-slate-200">grok2api</h4>
                      {grokApiKey && <span className="text-[10px] text-emerald-400">Key 已保存</span>}
                    </div>
                    <label className="font-semibold text-slate-400 block mb-1.5">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={grokApiKey}
                      onChange={(e) => handleSaveGrokApiKey(e.target.value)}
                      placeholder="your_grok2api_key"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-slate-700 font-mono transition"
                    />
                    <label className="font-semibold text-slate-400 block mt-3 mb-1.5">
                      Base URL
                    </label>
                    <input
                      type="url"
                      value={grokBaseUrl}
                      onChange={(e) => handleSaveGrokBaseUrl(e.target.value)}
                      placeholder="http://localhost:8000"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-slate-700 font-mono transition"
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => testProviderConnection("grok2api")}
                        disabled={providerTest.status === "testing" && providerTest.provider === "grok2api"}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:text-slate-600"
                      >
                        <RefreshCw className={`h-3 w-3 ${providerTest.status === "testing" && providerTest.provider === "grok2api" ? "animate-spin" : ""}`} />
                        测试
                      </button>
                      <button
                        type="button"
                        onClick={() => clearProviderCredentials("grok2api")}
                        className="h-8 rounded-lg border border-red-500/20 bg-red-950/20 px-3 text-[10px] font-semibold text-red-300 transition hover:bg-red-950/35"
                      >
                        清除 Key/Base URL
                      </button>
                    </div>
                    {providerTest.provider === "grok2api" && providerTest.message && (
                      <p className={`mt-2 font-mono text-[10px] ${providerTest.status === "error" ? "text-red-300" : "text-emerald-300"}`}>
                        {providerTest.message}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-slate-200">星途 (xstx)</h4>
                      {xstxApiKey && <span className="text-[10px] text-emerald-400">Key 已保存</span>}
                    </div>
                    <label className="font-semibold text-slate-400 block mb-1.5">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={xstxApiKey}
                      onChange={(e) => handleSaveXstxApiKey(e.target.value)}
                      placeholder="sk_your_xstx_key"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-slate-700 font-mono transition"
                    />
                    <label className="font-semibold text-slate-400 block mt-3 mb-1.5">
                      Base URL
                    </label>
                    <input
                      type="url"
                      value={xstxBaseUrl}
                      onChange={(e) => handleSaveXstxBaseUrl(e.target.value)}
                      placeholder="https://api.xstx.info"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-slate-700 font-mono transition"
                    />
                    <div className="mt-3 rounded-lg bg-slate-900/70 border border-slate-800 px-3 py-2 font-mono text-[10px] text-slate-400 leading-relaxed">
                      <div>Chat: https://api.xstx.info/v1</div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => testProviderConnection("xstx")}
                        disabled={providerTest.status === "testing" && providerTest.provider === "xstx"}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:text-slate-600"
                      >
                        <RefreshCw className={`h-3 w-3 ${providerTest.status === "testing" && providerTest.provider === "xstx" ? "animate-spin" : ""}`} />
                        测试
                      </button>
                      <button
                        type="button"
                        onClick={() => clearProviderCredentials("xstx")}
                        className="h-8 rounded-lg border border-red-500/20 bg-red-950/20 px-3 text-[10px] font-semibold text-red-300 transition hover:bg-red-950/35"
                      >
                        清除 Key/Base URL
                      </button>
                    </div>
                    {providerTest.provider === "xstx" && providerTest.message && (
                      <p className={`mt-2 font-mono text-[10px] ${providerTest.status === "error" ? "text-red-300" : "text-emerald-300"}`}>
                        {providerTest.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1.5">
                      模型列表服务商
                    </label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => handleSelectProvider(e.target.value as AiProvider)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-300 focus:outline-none focus:border-slate-700 font-mono transition"
                    >
                      <option value="12ai">12AI</option>
                      <option value="grok2api">grok2api</option>
                      <option value="xstx">星途 (xstx)</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-semibold text-slate-300">
                        Agent / 优化模型
                      </label>
                      <button
                        type="button"
                        onClick={refreshProviderModels}
                        disabled={isLoadingModels}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition ${
                          isLoadingModels
                            ? "border-slate-800 bg-slate-950 text-slate-600 cursor-not-allowed"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 cursor-pointer"
                        }`}
                      >
                        <RefreshCw className={`h-3 w-3 ${isLoadingModels ? "animate-spin" : ""}`} />
                        获取模型
                      </button>
                    </div>
                    <select
                      value={selectedChatModel}
                      onChange={(e) => handleSelectChatModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-300 focus:outline-none focus:border-slate-700 font-mono transition"
                    >
                      {chatModelGroups.map(group => (
                        <optgroup key={group.provider} label={group.label}>
                          {group.options.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {modelListMessage && (
                      <p className="mt-1.5 text-[10px] text-slate-500 font-mono">{modelListMessage}</p>
                    )}
                  </div>
                </div>

                {/* Polling description */}
                <div>
                  <label className="font-semibold text-slate-400 block mb-1">
                    📡 Web 异步任务轮询间隔
                  </label>
                  <p className="font-mono text-[10px] text-slate-300">自动侦测间隔: 4秒 (指数退避保护算法)</p>
                </div>

                {/* DB local status */}
                <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-850/50">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-450 font-semibold flex items-center gap-1 text-[11px]">
                      <Info className="h-3.5 w-3.5 text-slate-500" />
                      当前本地项目库概要:
                    </span>
                    <button
                      onClick={async () => {
                        if (confirm("这会清空所有生成的历史卡片，无法恢复！")) {
                          await clearAllDB();
                          setItems([]);
                          setCompareItemIds([]);
                          setSelectedItemIds([]);
                        }
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 underline"
                    >
                      安全复位数据
                    </button>
                  </div>
                  <ul className="mt-2 text-[10px] text-slate-500 font-mono flex flex-col gap-1 list-disc pl-3">
                    <li>类型: Browser IndexedDB 离线隔离数据库</li>
                    <li>合成图片数量: {assetStats.typeCounts.image} 张</li>
                    <li>合成 Veo 视频: {assetStats.typeCounts.video} 个</li>
                  </ul>
                </div>

                {/* Info block */}
                <div className="text-[10px] text-slate-500 mt-2 flex items-start gap-1.5 leading-normal">
                  <span>ℹ️</span>
                  <span>
                    Imagine Workbench 现在通过统一 provider adapter 接入 12AI、grok2api 与 星途。图片、异步图片、视频与 Agent 对话都走同一组密钥和 Base URL 规则。
                  </span>
                </div>

              </div>

              {/* Close footer */}
              <div className="border-t border-slate-850 bg-slate-900/50 px-6 py-4 text-right">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-350 font-semibold px-4 py-2 rounded-lg text-xs cursor-pointer transition"
                >
                  保存并关闭
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Preview overlay modal */}
      <AnimatePresence>
        {fullscreenItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4">
            <button
              onClick={() => setFullscreenItem(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white rounded-lg p-2 bg-slate-900 border border-slate-800 transition"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="max-w-4xl max-h-[85vh] flex flex-col items-center justify-center gap-4">
              {fullscreenItem.type === "image" ? (
                <PreviewImage
                  src={fullscreenItem.url}
                  alt={fullscreenItem.prompt}
                  className="rounded-lg max-h-[75vh] object-contain border border-slate-800"
                />
              ) : (
                <video
                  src={fullscreenItem.url}
                  controls
                  loop
                  autoPlay
                  className="rounded-lg max-h-[75vh] border border-slate-800"
                />
              )}
              <div className="text-center w-full max-w-xl">
                <p className="text-xs text-slate-300 italic">&ldquo;{fullscreenItem.prompt}&rdquo;</p>
                <span className="text-[9px] font-mono text-slate-600 block mt-1.5">
                  ID: {fullscreenItem.id} | 模型: {fullscreenItem.model} | Aspect Ratio: {fullscreenItem.aspectRatio}
                </span>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Inpainting Mask Drawer overlay loader */}
      {isMaskOpen && (
        <CanvasMaskEditor
          imageUrl={maskTargetUrl}
          isOpen={isMaskOpen}
          onClose={() => { setIsMaskOpen(false); setMaskTargetUrl(""); setMaskTargetId(""); }}
          onSaveMask={saveMaskOutput}
        />
      )}

      {/* Global comparison toggles in page backgrounds */}
      {compareItemIds.length > 0 && !isCompareMode && (
        <div className="fixed top-20 right-6 z-30">
          <button
            onClick={() => setIsCompareMode(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 rounded-full text-slate-950 text-xs font-bold border border-amber-600 shadow-xl shadow-amber-500/10 cursor-pointer hover:bg-amber-450 motion-safe:animate-bounce"
          >
            <span>🔄 调谐对比器 ({compareItemIds.length}/2)</span>
          </button>
        </div>
      )}

    </div>
  );
}
