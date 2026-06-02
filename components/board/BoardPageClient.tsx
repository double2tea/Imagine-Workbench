"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Paintbrush, Send, Settings, Video } from "lucide-react";
import AgentDock, { type AgentToolAction } from "@/components/agent/AgentDock";
import AtReferenceDropdown from "@/components/reference/AtReferenceDropdown";
import CanvasMaskEditor from "@/components/CanvasMaskEditor";
import FullscreenPreview from "@/components/assets/FullscreenPreview";
import BoardInspector from "@/components/board/BoardInspector";
import BoardSidePanel from "@/components/board/BoardSidePanel";
import BoardWorkspace from "@/components/board/BoardWorkspace";
import PreviewImage from "@/components/PreviewImage";
import SettingsModal from "@/components/settings/SettingsModal";
import WorkspaceNotices, { type WorkspaceNotice } from "@/components/workbench/WorkspaceNotices";
import type { AgentBoardContext, AgentBoardNodeSummary } from "@/lib/agent-context";
import { IMAGINE_BOARD_ASSET_DRAG_TYPE } from "@/lib/board/interaction";
import { persistThemeMode, readStoredThemeMode, type ThemeMode } from "@/lib/theme-mode";
import { useAgentController } from "@/hooks/useAgentController";
import { useAssetWorkspaceState } from "@/hooks/useAssetWorkspaceState";
import { useBoardState } from "@/hooks/useBoardState";
import { useClipboardImageImport } from "@/hooks/useClipboardImageImport";
import { useGenerationActions } from "@/hooks/useGenerationActions";
import { useMediaPolling } from "@/hooks/useMediaPolling";
import {
  IMAGE_REFERENCE_LIMIT,
  useReferenceState,
} from "@/hooks/useReferenceState";
import { useProviderSettings } from "@/hooks/useProviderSettings";
import { clearAllDB, deleteFromDB, getAllFromDB, saveToDB, type StorageItem } from "@/lib/db";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  getImageAspectRatioFromResolution,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getModelCapability,
  getVideoModelCapabilities,
  parseProviderModel,
  supportsAsyncImageGeneration,
  type AiProvider,
  type ModelOption,
} from "@/lib/providers/model-catalog";
import { getProviderMeta, PROVIDER_KEYS } from "@/lib/providers/registry";
import { compressReferenceImageDataUrl, compressReferenceImageFile } from "@/lib/reference-images";
import {
  DEFAULT_BOARD_ID,
  createEmptyBoard,
  deleteBoardFromDB,
  listBoardSummariesFromDB,
  saveBoardToDB,
  type BoardDocument,
  type BoardGenerationStatus,
  type BoardImageGenerateNode,
  type BoardPoint,
  type BoardSummary,
  type BoardVideoGenerateNode,
} from "@/lib/board";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { flushBoardTextForGenerateNode, getBoardTextDraft } from "@/lib/board/text-flush-registry";
import { createVideoFrameStorageItem, getVideoFrameCaptureLabel, type CapturedVideoFrame } from "@/lib/video-frame";

type NoticeType = "error" | "info" | "success";
type MaskDestination = "creative" | "agent";
type BoardMode = "image" | "video";
type GenerateBoardNode = BoardImageGenerateNode | BoardVideoGenerateNode;
type AgentGenerateAction = AgentToolAction & { type: "generate_image" | "generate_video" };
type AgentBoardFlowAction = AgentToolAction & { type: "create_board_image_flow" | "create_board_video_flow" };
type AgentBoardNoteAction = AgentToolAction & { type: "create_board_note" };

interface BoardPageProps {
  boardId?: string;
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

async function saveItemOrWarn(
  item: StorageItem,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<boolean> {
  try {
    await saveToDB(item);
    return true;
  } catch (error) {
    pushWorkspaceNotice("error", `本地存储失败，刷新后可能丢失：${toErrorMessage(error, "IndexedDB 写入失败")}`);
    return false;
  }
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

async function createBoardUploadItem(file: File, id: string): Promise<StorageItem> {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    throw new Error("画板只支持导入图片或视频文件");
  }
  const url = isImage ? await compressReferenceImageFile(file) : await readFileAsDataUrl(file);
  const createdAt = new Date().toISOString();
  return {
    id,
    type: isImage ? "image" : "video",
    url,
    prompt: file.name || "Board upload",
    model: "local-upload",
    aspectRatio: "auto",
    createdAt,
    status: "complete",
    progress: 100,
    operationName: "board-upload",
  };
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

function activeBoardReference(nodes: ReturnType<typeof useBoardState>["board"]["nodes"], selectedNodeId: string | null): ReferenceImageRef[] {
  const node = nodes.find(item => item.id === selectedNodeId);
  if (!node || node.kind !== "asset" || node.asset.type !== "image") return [];
  return [{ id: node.asset.assetId, url: node.asset.url, role: "general" }];
}

function boardNodeReferences(node: BoardDocument["nodes"][number] | undefined): ReferenceImageRef[] {
  if (node?.kind === "asset" && node.asset.type === "image") {
    return [{ id: node.asset.assetId, url: node.asset.url, role: "general" }];
  }
  if (node?.kind === "reference-group") {
    return node.references.map(reference => ({
      id: reference.assetId,
      role: reference.role,
      url: reference.url,
    }));
  }
  return [];
}

function isGenerateBoardNode(node: BoardDocument["nodes"][number] | undefined): node is GenerateBoardNode {
  return node?.kind === "image-generate" || node?.kind === "video-generate";
}

function firstOptionValue(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
}

function imageActionDefaults(model: string, aspectRatio: string | undefined): {
  aspectRatio: string;
  customImageResolution: string;
  imageQuality?: string;
  imageResolution: string;
  thinkingLevel?: string;
} {
  const capabilities = getImageModelCapabilities(model);
  const resolvedAspectRatio = aspectRatio && capabilities.aspectRatios.some(option => option.value === aspectRatio)
    ? aspectRatio
    : firstOptionValue(capabilities.aspectRatios, "1:1");
  const resolutionOptions = getImageResolutionOptions(model, resolvedAspectRatio);
  const resolutionSource = resolutionOptions.length > 0 ? resolutionOptions : capabilities.resolutions;
  return {
    aspectRatio: resolvedAspectRatio,
    customImageResolution: "2560x1440",
    imageQuality: capabilities.qualities[0]?.value,
    imageResolution: firstOptionValue(resolutionSource, "1K"),
    thinkingLevel: capabilities.thinkingLevels[0]?.value,
  };
}

function videoActionDefaults(model: string, aspectRatio: string | undefined): {
  aspectRatio: string;
  videoDuration?: string;
  videoPreset?: string;
  videoResolution?: string;
} {
  const capabilities = getVideoModelCapabilities(model);
  return {
    aspectRatio: aspectRatio && capabilities.sizes.some(option => option.value === aspectRatio)
      ? aspectRatio
      : firstOptionValue(capabilities.sizes, "auto"),
    videoDuration: capabilities.durations[0]?.value,
    videoPreset: capabilities.presets[0]?.value,
    videoResolution: capabilities.resolutions[0]?.value,
  };
}

function isAgentGenerateAction(action: AgentToolAction): action is AgentGenerateAction {
  return action.type === "generate_image" || action.type === "generate_video";
}

function isAgentBoardFlowAction(action: AgentToolAction): action is AgentBoardFlowAction {
  return action.type === "create_board_image_flow" || action.type === "create_board_video_flow";
}

function isAgentBoardNoteAction(action: AgentToolAction): action is AgentBoardNoteAction {
  return action.type === "create_board_note";
}

function shouldRunAgentBoardFlow(action: AgentGenerateAction | AgentBoardFlowAction): boolean {
  if (isAgentBoardFlowAction(action)) return action.params?.run !== false;
  return true;
}

function isPlaceholderRunningHubModel(model: string): boolean {
  return model.includes("<webappId>") || model.includes("<workflowId>");
}

function sliceAgentText(value: string): string {
  return value.trim().slice(0, 240);
}

function summarizeBoardNodeForAgent(node: BoardDocument["nodes"][number]): AgentBoardNodeSummary {
  switch (node.kind) {
    case "asset":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        assetId: node.asset.assetId,
        assetType: node.asset.type,
        model: node.asset.model,
        prompt: sliceAgentText(node.asset.prompt),
      };
    case "prompt":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        prompt: sliceAgentText(node.prompt),
      };
    case "reference-group":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        body: `${node.references.length} references`,
      };
    case "image-generate":
    case "video-generate":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        prompt: sliceAgentText(node.prompt),
        model: node.model,
        aspectRatio: node.aspectRatio,
        status: node.status,
        resultAssetId: node.resultAssetId,
      };
    case "agent":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        instruction: sliceAgentText(node.instruction),
      };
    case "note":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        body: sliceAgentText(node.body),
      };
  }
}

function findBoardAssetNodeByAssetId(nodes: BoardDocument["nodes"], assetId: string) {
  return nodes.find(node => node.kind === "asset" && node.asset.assetId === assetId);
}

function findGenerateNodeById(nodes: BoardDocument["nodes"], nodeId: string): GenerateBoardNode | undefined {
  const node = nodes.find(item => item.id === nodeId);
  return isGenerateBoardNode(node) ? node : undefined;
}

function completedSourceItemIndex(items: StorageItem[], sourceBoardNodeId: string, itemId: string): number {
  const sourceItems = items
    .filter(item => item.sourceBoardNodeId === sourceBoardNodeId && item.status === "complete")
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const index = sourceItems.findIndex(item => item.id === itemId);
  return index < 0 ? 0 : index;
}

function resultAssetPosition(sourceNode: GenerateBoardNode, resultIndex: number): BoardPoint {
  return {
    x: sourceNode.position.x + sourceNode.size.width + 140,
    y: sourceNode.position.y + resultIndex * 320,
  };
}

function hasActiveSourceItems(items: StorageItem[], sourceBoardNodeId: string): boolean {
  return items.some(item => item.sourceBoardNodeId === sourceBoardNodeId && (item.status === "pending" || item.status === "processing"));
}

function nextSourceNodeStatus(items: StorageItem[], sourceBoardNodeId: string, itemStatus: StorageItem["status"]): BoardGenerationStatus {
  if (hasActiveSourceItems(items, sourceBoardNodeId)) return "processing";
  if (items.some(item => item.sourceBoardNodeId === sourceBoardNodeId && item.status === "complete")) return "complete";
  return itemStatus === "failed" ? "failed" : "complete";
}

function activeSourceItemForNode(items: StorageItem[], sourceBoardNodeId: string): StorageItem | undefined {
  return items
    .filter(item => item.sourceBoardNodeId === sourceBoardNodeId && (item.status === "pending" || item.status === "processing"))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
}

function boardRoute(id: string): string {
  return id === DEFAULT_BOARD_ID ? "/board" : `/board/${encodeURIComponent(id)}`;
}

function boardSummaryFromDocument(board: BoardDocument): BoardSummary {
  return {
    id: board.id,
    title: board.title,
    nodeCount: board.nodes.length,
    updatedAt: board.updatedAt,
    createdAt: board.createdAt,
  };
}

export default function BoardPage({ boardId = DEFAULT_BOARD_ID }: BoardPageProps) {
  const router = useRouter();
  const boardController = useBoardState(boardId);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [boardSummaries, setBoardSummaries] = useState<BoardSummary[]>([]);
  const [, setMode] = useState<BoardMode>("image");
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_IMAGE_MODEL);
  const [selectedVideoModel, setSelectedVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageResolution, setImageResolution] = useState("1K");
  const [imageQuality, setImageQuality] = useState("auto");
  const [imageThinkingLevel, setImageThinkingLevel] = useState("minimal");
  const [videoDuration, setVideoDuration] = useState("10");
  const [videoPreset, setVideoPreset] = useState("normal");
  const [videoResolution, setVideoResolution] = useState("720p");
  const [customImageSize, setCustomImageSize] = useState("2560x1440");
  const [agentInput, setAgentInput] = useState("");
  const [isAgentDockOpen, setIsAgentDockOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [, setIsOptimizing] = useState(false);
  const [imageSubmitCount, setImageSubmitCount] = useState(0);
  const [, setVideoSubmitCount] = useState(0);
  const [workspaceNotices, setWorkspaceNotices] = useState<WorkspaceNotice[]>([]);
  const [isMaskOpen, setIsMaskOpen] = useState(false);
  const [maskTargetUrl, setMaskTargetUrl] = useState("");
  const [maskTargetId, setMaskTargetId] = useState("");
  const [maskDestination, setMaskDestination] = useState<MaskDestination>("creative");
  const [fullscreenItem, setFullscreenItem] = useState<StorageItem | null>(null);
  const [cancelingBoardItemIds, setCancelingBoardItemIds] = useState<string[]>([]);
  const knownItemIdsRef = useRef<Set<string>>(new Set());
  const handledBoardItemIdsRef = useRef<Set<string>>(new Set());
  const loadedItemsRef = useRef(false);
  const pollingFailuresRef = useRef<Record<string, number>>({});
  const generationAbortControllersRef = useRef<Record<string, AbortController>>({});
  const locallyCanceledItemIdsRef = useRef<Set<string>>(new Set());

  const dismissWorkspaceNotice = useCallback((id: string) => {
    setWorkspaceNotices(prev => prev.filter(notice => notice.id !== id));
  }, []);

  const pushWorkspaceNotice = useCallback((type: NoticeType, message: string) => {
    const id = makeClientId("notice");
    setWorkspaceNotices(prev => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => dismissWorkspaceNotice(id), 8000);
  }, [dismissWorkspaceNotice]);

  useEffect(() => {
    let isActive = true;
    void listBoardSummariesFromDB()
      .then(summaries => {
        if (isActive) setBoardSummaries(summaries);
      })
      .catch(error => {
        if (isActive) pushWorkspaceNotice("error", `画板列表读取失败：${toErrorMessage(error, "IndexedDB 读取失败")}`);
      });
    return () => {
      isActive = false;
    };
  }, [pushWorkspaceNotice]);

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
  const selectedImageProviderModel = parseProviderModel(selectedModel, selectedProvider);
  const canUseAsyncImageGeneration = supportsAsyncImageGeneration(selectedModel);
  const activeImageResolution = imageResolution === "custom" ? customImageSize.trim() : imageResolution;
  const customImageAspectRatio = imageResolution === "custom"
    ? getImageAspectRatioFromResolution(customImageSize.trim())
    : null;
  const activeImageAspectRatio = customImageAspectRatio ?? aspectRatio;
  const activeImageQuality = imageCapabilities.qualities.some(option => option.value === imageQuality) ? imageQuality : undefined;
  const activeVideoSize = videoCapabilities.sizes.some(option => option.value === aspectRatio) ? aspectRatio : "auto";
  const activeVideoResolution = videoCapabilities.resolutions.some(option => option.value === videoResolution) ? videoResolution : undefined;
  const activeVideoDuration = videoCapabilities.durations.some(option => option.value === videoDuration) ? videoDuration : undefined;
  const activeVideoPreset = videoCapabilities.presets.some(option => option.value === videoPreset) ? videoPreset : undefined;

  const {
    agentReferenceId,
    agentReferences,
    agentReferenceUrl,
    atDropdown,
    handleImageUpload,
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
    videoReferenceLimit: videoCapabilities.maxReferenceImages,
    videoReferenceMode: videoCapabilities.referenceMode,
    pushWorkspaceNotice,
    setAgentInput,
    setPrompt,
  });

  const canUseBackgroundImageGeneration =
    canUseAsyncImageGeneration &&
    selectedImageProviderModel.provider === "12ai" &&
    (selectedImageProviderModel.model !== "gpt-image-2" || referenceImages.length === 0);
  const activeImageModel = imageSubmitCount > 0 && canUseBackgroundImageGeneration
    ? `12ai-async:${selectedImageProviderModel.model}`
    : selectedModel;

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

  const { assetStats, searchableReferenceImages } = useAssetWorkspaceState(items);
  void handleImageUpload;
  void handleReferenceDropAsset;
  void handleReferenceDropFiles;
  void handleSelectPromptReference;
  void removeReferenceImage;
  void toggleReferenceRole;

  const renderAgentAtDropdown = useCallback(() => {
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
        onSelect={(item) => handleSelectAtItem(item.url, item.id, "agent-prompt")}
      />
    );
  }, [agentReferences, atDropdown.search, handleSelectAtItem, searchableReferenceImages]);

  useMediaPolling({
    buildProviderHeaders,
    items,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    setItems,
  });

  const { generateManualImage, generateManualVideo } = useGenerationActions({
    activeImageAspectRatio,
    activeImageModel,
    activeImageQuality,
    activeImageResolution,
    activeVideoDuration,
    activeVideoPreset,
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
    videoReferenceLimit: videoCapabilities.maxReferenceImages,
    videoReferenceMode: videoCapabilities.referenceMode,
  });

  const handleSelectImageModel = useCallback((model: string) => {
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
    if (capabilities.thinkingLevels.length > 0 && !capabilities.thinkingLevels.some(option => option.value === imageThinkingLevel)) {
      setImageThinkingLevel(capabilities.thinkingLevels[0].value);
    }
  }, [aspectRatio, imageQuality, imageResolution, imageThinkingLevel]);

  const handleSelectVideoModel = useCallback((model: string) => {
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
  }, [aspectRatio, videoDuration, videoPreset, videoResolution]);

  const optimizeActivePrompt = async (promptOverride?: string) => {
    const promptToOptimize = promptOverride ?? prompt;
    if (!promptToOptimize.trim()) return;
    setIsOptimizing(true);
    try {
      const res = await fetch("/api/gemini/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildProviderHeaders(selectedChatModel) },
        body: JSON.stringify({ prompt: promptToOptimize, model: selectedChatModel }),
      });
      if (!res.ok) throw new Error(await readFetchError(res, "提示词优化失败"));
      const data: unknown = await res.json();
      const optimized = getStringField(data, "optimized");
      if (!optimized) throw new Error("提示词优化接口返回格式不正确");
      setPrompt(optimized);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "提示词优化失败"));
    } finally {
      setIsOptimizing(false);
    }
  };

  const launchMaskEditor = useCallback((imageUrl: string, id: string, destination: MaskDestination = "creative") => {
    setMaskTargetUrl(imageUrl);
    setMaskTargetId(id);
    setMaskDestination(destination);
    setIsMaskOpen(true);
  }, []);

  const saveMaskOutput = async (mergedImageBase64: string) => {
    let compressedMergedImage: string;
    try {
      compressedMergedImage = await compressReferenceImageDataUrl(mergedImageBase64);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "蒙版参考图压缩失败"));
      return;
    }

    const nextReferenceId = maskTargetId || "custom_ref";
    if (maskDestination === "agent") {
      setAgentReferenceUrl(compressedMergedImage);
      setAgentReferenceId(nextReferenceId);
      setAgentReferences([{ id: nextReferenceId, url: compressedMergedImage }]);
      setAgentInput("In the marked region, change: ");
      setIsAgentDockOpen(true);
    } else {
      setReferenceImage(compressedMergedImage);
      setReferenceImages([{ id: nextReferenceId, url: compressedMergedImage, role: "general" }]);
      setPrompt(prev => `In the marked region of the image, change: ${prev || "[输入你的新修改构想...]"}`);
      handleSelectImageModel("12ai:gpt-image-2");
      setMode("image");
    }
    setIsMaskOpen(false);
  };

  const buildAgentBoardContext = useCallback((): AgentBoardContext => ({
    boardId: boardController.board.id,
    title: boardController.board.title,
    selectedNodeId: boardController.selectedNodeId,
    selectedEdgeId: boardController.selectedEdgeId,
    nodes: boardController.board.nodes.slice(0, 60).map(summarizeBoardNodeForAgent),
    edges: boardController.board.edges.slice(0, 100).map(edge => ({
      id: edge.id,
      kind: edge.kind,
      from: edge.from,
      to: edge.to,
    })),
  }), [
    boardController.board.edges,
    boardController.board.id,
    boardController.board.nodes,
    boardController.board.title,
    boardController.selectedEdgeId,
    boardController.selectedNodeId,
  ]);

  const executeBoardAgentToolAction = useCallback(async ({
    action,
    references,
  }: {
    action: AgentToolAction;
    references: ReferenceImageRef[];
  }): Promise<boolean> => {
    if (isAgentBoardNoteAction(action)) {
      const body = action.params?.body?.trim() || action.params?.prompt?.trim();
      if (!body) {
        pushWorkspaceNotice("error", "Agent 画板笔记缺少内容");
        return true;
      }
      boardController.addNoteNode({
        body,
        title: action.params?.title || "Agent Note",
        position: {
          x: 160 + boardController.board.nodes.length * 28,
          y: 180 + boardController.board.nodes.length * 24,
        },
      });
      pushWorkspaceNotice("success", "已创建 Agent 画板笔记");
      return true;
    }

    if (!isAgentGenerateAction(action) && !isAgentBoardFlowAction(action)) return false;

    const promptFromAgent = action.params?.prompt?.trim() ?? "";
    if (!promptFromAgent) {
      pushWorkspaceNotice("error", "Agent 生成动作缺少提示词");
      return true;
    }

    const kind = action.type === "generate_image" || action.type === "create_board_image_flow" ? "image-generate" : "video-generate";
    const model = action.params?.model || (kind === "image-generate" ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL);
    if (isPlaceholderRunningHubModel(model)) {
      pushWorkspaceNotice("error", "请先填写真实的 RunningHub webappId 或 workflowId");
      return true;
    }
    const shouldRun = shouldRunAgentBoardFlow(action);
    const baseIndex = boardController.board.nodes.length;
    const promptNodeId = boardController.addPromptNode({
      prompt: promptFromAgent,
      position: { x: 120 + baseIndex * 32, y: 120 + baseIndex * 24 },
      title: "Agent Prompt",
    });
    const generatePosition = { x: 520 + baseIndex * 32, y: 120 + baseIndex * 24 };

    if (kind === "image-generate") {
      const defaults = imageActionDefaults(model, action.params?.aspectRatio);
      const generateNodeId = boardController.addGenerateNode({
        kind,
        model,
        position: generatePosition,
        prompt: promptFromAgent,
        ...defaults,
      });
      boardController.connectPorts(
        { nodeId: promptNodeId, portId: "prompt-out", portKind: "prompt" },
        { nodeId: generateNodeId, portId: "prompt-in", portKind: "prompt" },
      );

      const capability = getModelCapability(model, "image");
      if (references.length > 0 && !capability.supportsReferences) {
        const message = "Agent 选中的图片模型不支持参考图输入";
        boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
        pushWorkspaceNotice("error", message);
        return true;
      }

      references.forEach((reference, index) => {
        const matchedItem = items.find(item => item.id === reference.id);
        const assetNodeId = boardController.addAssetNode({
          asset: {
            assetId: reference.id,
            model: matchedItem?.model ?? "agent-reference",
            prompt: matchedItem?.prompt ?? "Agent reference",
            type: "image",
            url: reference.url,
          },
          position: { x: 120 + index * 140, y: generatePosition.y + 280 },
          title: matchedItem?.prompt || "Agent reference",
        });
        boardController.connectPorts(
          { nodeId: assetNodeId, portId: "asset-out", portKind: "asset" },
          { nodeId: generateNodeId, portId: "reference-in", portKind: "asset" },
        );
      });

      if (!shouldRun) {
        pushWorkspaceNotice("success", "已创建 Agent 图片生成节点流程");
        return true;
      }

      boardController.updateGenerateNode(generateNodeId, { errorMessage: undefined, status: "processing" });
      const didStart = await generateManualImage({
        boardNodeId: generateNodeId,
        imageQuality: defaults.imageQuality,
        imageResolution: defaults.imageResolution,
        isCustomImageResolution: defaults.imageResolution === "custom",
        model,
        prompt: promptFromAgent,
        referenceImage: references[0]?.url ?? null,
        referenceImages: references,
        size: defaults.aspectRatio,
        thinkingLevel: defaults.thinkingLevel,
      });
      if (!didStart) {
        boardController.updateGenerateNode(generateNodeId, {
          errorMessage: "图片生成请求未启动，请检查节点参数",
          status: "failed",
        });
      }
      return true;
    }

    const defaults = videoActionDefaults(model, action.params?.aspectRatio);
    const generateNodeId = boardController.addGenerateNode({
      kind,
      model,
      position: generatePosition,
      prompt: promptFromAgent,
      ...defaults,
    });
    boardController.connectPorts(
      { nodeId: promptNodeId, portId: "prompt-out", portKind: "prompt" },
      { nodeId: generateNodeId, portId: "prompt-in", portKind: "prompt" },
    );

    const capability = getModelCapability(model, "video");
    if (references.length > 0 && !capability.supportsReferences) {
      const message = "Agent 选中的视频模型不支持参考图输入";
      boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
      pushWorkspaceNotice("error", message);
      return true;
    }
    const videoCapability = getVideoModelCapabilities(model);
    if (references.length < videoCapability.minReferenceImages || references.length > videoCapability.maxReferenceImages) {
      const message = `当前视频模型需要 ${videoCapability.minReferenceImages}-${videoCapability.maxReferenceImages} 张参考图`;
      boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
      pushWorkspaceNotice("error", message);
      return true;
    }

    references.forEach((reference, index) => {
      const matchedItem = items.find(item => item.id === reference.id);
      const assetNodeId = boardController.addAssetNode({
        asset: {
          assetId: reference.id,
          model: matchedItem?.model ?? "agent-reference",
          prompt: matchedItem?.prompt ?? "Agent reference",
          type: "image",
          url: reference.url,
        },
        position: { x: 120 + index * 140, y: generatePosition.y + 280 },
        title: matchedItem?.prompt || "Agent reference",
      });
      boardController.connectPorts(
        { nodeId: assetNodeId, portId: "asset-out", portKind: "asset" },
        { nodeId: generateNodeId, portId: "reference-in", portKind: "asset" },
      );
    });

    if (!shouldRun) {
      pushWorkspaceNotice("success", "已创建 Agent 视频生成节点流程");
      return true;
    }

    boardController.updateGenerateNode(generateNodeId, { errorMessage: undefined, status: "processing" });
    const didStart = await generateManualVideo({
      boardNodeId: generateNodeId,
      model,
      prompt: promptFromAgent,
      referenceImage: references[0]?.url ?? null,
      referenceImages: references,
      size: defaults.aspectRatio,
      videoDuration: defaults.videoDuration,
      videoPreset: defaults.videoPreset,
      videoResolution: defaults.videoResolution,
    });
    if (!didStart) {
      boardController.updateGenerateNode(generateNodeId, {
        errorMessage: "视频生成请求未启动，请检查节点参数",
        status: "failed",
      });
    }
    return true;
  }, [
    boardController,
    generateManualImage,
    generateManualVideo,
    items,
    pushWorkspaceNotice,
  ]);

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
    chatStorageKey: `imagine_agent_chat:${boardController.board.id}`,
    executeToolActionOverride: executeBoardAgentToolAction,
    getBoardContext: buildAgentBoardContext,
    generateManualImage,
    generateManualVideo,
    handleSelectImageModel,
    handleSelectVideoModel,
    items,
    launchMaskEditor,
    optimizeActivePrompt,
    selectedChatModel,
    surface: "board",
    setAgentInput,
    setAspectRatio,
    setIsAgentDockOpen,
    setPrompt,
    setReferenceImage,
    setReferenceImages,
    setTraditionalSubTab: value => setMode(value),
  });

  const cancelBoardGenerationNode = useCallback(async (nodeId: string): Promise<void> => {
    const item = activeSourceItemForNode(items, nodeId);
    if (!item) {
      boardController.updateGenerateNode(nodeId, {
        errorMessage: "未找到可取消的关联任务",
        status: "failed",
      });
      return;
    }

    const operationName = item.operationName;
    if (cancelingBoardItemIds.includes(item.id)) return;
    const canCancelRemote = operationName?.startsWith("12ai:video:") === true;
    const confirmText = canCancelRemote
      ? "确定要取消这个视频生成任务吗？"
      : "确定要本地取消这个任务吗？远端生成可能仍会继续。";
    if (!window.confirm(confirmText)) return;

    setCancelingBoardItemIds(prev => [...prev, item.id]);
    try {
      const controller = generationAbortControllersRef.current[item.id];
      if (controller) {
        locallyCanceledItemIdsRef.current.add(item.id);
        controller.abort();
      }
      if (!canCancelRemote) {
        locallyCanceledItemIdsRef.current.add(item.id);
      }

      if (canCancelRemote && operationName) {
        const response = await fetch("/api/gemini/cancel-media", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildProviderHeaders(operationName) },
          body: JSON.stringify({ operationName }),
        });
        if (!response.ok) {
          throw new Error(await readFetchError(response, "任务取消失败"));
        }
      }

      await deleteFromDB(item.id);
      delete pollingFailuresRef.current[item.id];
      setItems(prev => prev.filter(current => current.id !== item.id));
      boardController.updateGenerateNode(nodeId, {
        errorMessage: canCancelRemote ? "远端生成任务已取消" : "任务已从本地取消",
        status: "failed",
      });
      pushWorkspaceNotice("success", canCancelRemote ? "视频生成任务已取消" : "任务已从本地取消");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "任务取消失败"));
    } finally {
      setCancelingBoardItemIds(prev => prev.filter(id => id !== item.id));
    }
  }, [
    boardController,
    buildProviderHeaders,
    cancelingBoardItemIds,
    generationAbortControllersRef,
    items,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
  ]);

  const addAssetToBoard = useCallback((asset: StorageItem, position?: BoardPoint): string => {
    return boardController.addAssetNode({
      asset: {
        assetId: asset.id,
        type: asset.type,
        url: asset.url,
        prompt: asset.prompt,
        model: asset.model,
      },
      position,
      title: asset.prompt || asset.model,
    });
  }, [boardController]);

  const handleCaptureVideoFrame = useCallback(async (
    sourceNodeId: string,
    item: StorageItem,
    frame: CapturedVideoFrame,
  ): Promise<void> => {
    if (item.type !== "video") {
      throw new Error("只有视频资产可以截帧");
    }

    const frameItem = createVideoFrameStorageItem(item, frame, makeClientId("frame"));
    if (!await saveItemOrWarn(frameItem, pushWorkspaceNotice)) return;
    setItems(prev => [frameItem, ...prev]);

    const sourceNode = boardController.board.nodes.find(node => node.id === sourceNodeId);
    const position = sourceNode
      ? { x: sourceNode.position.x + sourceNode.size.width + 40, y: sourceNode.position.y }
      : undefined;
    addAssetToBoard(frameItem, position);
    pushWorkspaceNotice("success", `已保存${getVideoFrameCaptureLabel(frame.mode)}并插入画板`);
  }, [addAssetToBoard, boardController.board.nodes, pushWorkspaceNotice]);

  const handleImportBoardFiles = useCallback(async (files: File[], position: BoardPoint): Promise<void> => {
    const boardFiles = files.filter(file => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (boardFiles.length === 0) {
      pushWorkspaceNotice("info", "画板只支持导入图片或视频文件");
      return;
    }

    const importedItems: StorageItem[] = [];
    for (let index = 0; index < boardFiles.length; index += 1) {
      const file = boardFiles[index];
      try {
        const item = await createBoardUploadItem(
          file,
          makeClientId(file.type.startsWith("video/") ? `board_video_${index}` : `board_image_${index}`),
        );
        if (!await saveItemOrWarn(item, pushWorkspaceNotice)) continue;
        importedItems.push(item);
        addAssetToBoard(item, { x: position.x + index * 36, y: position.y + index * 36 });
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, `${file.name || "文件"} 导入失败`));
      }
    }

    if (importedItems.length === 0) return;
    setItems(prev => [
      ...importedItems,
      ...prev.filter(item => !importedItems.some(importedItem => importedItem.id === item.id)),
    ]);
    pushWorkspaceNotice("success", `已导入 ${importedItems.length} 个文件到画板`);
  }, [addAssetToBoard, pushWorkspaceNotice]);

  const useSelectedBoardAssetAsReference = () => {
    const references = activeBoardReference(boardController.board.nodes, boardController.selectedNodeId);
    if (references.length === 0) {
      pushWorkspaceNotice("info", "请选择一个图片资产节点");
      return;
    }
    setReferenceImage(references[0].url);
    setReferenceImages(references);
    pushWorkspaceNotice("success", "已将选中节点作为生成参考图");
  };

  const useBoardAssetAsReference = useCallback((nodeId: string) => {
    const references = activeBoardReference(boardController.board.nodes, nodeId);
    if (references.length === 0) {
      pushWorkspaceNotice("info", "请选择一个图片资产节点");
      return;
    }
    setReferenceImage(references[0].url);
    setReferenceImages(references);
    pushWorkspaceNotice("success", "已将节点作为生成参考图");
  }, [boardController.board.nodes, pushWorkspaceNotice, setReferenceImage, setReferenceImages]);

  const useSelectedBoardAssetForAgent = () => {
    const references = activeBoardReference(boardController.board.nodes, boardController.selectedNodeId);
    if (references.length === 0) {
      pushWorkspaceNotice("info", "请选择一个图片资产节点");
      return;
    }
    setAgentReferenceId(references[0].id);
    setAgentReferenceUrl(references[0].url);
    setAgentReferences(references);
    setIsAgentDockOpen(true);
  };

  const useBoardAssetForAgent = useCallback((nodeId: string) => {
    const references = activeBoardReference(boardController.board.nodes, nodeId);
    if (references.length === 0) {
      pushWorkspaceNotice("info", "请选择一个图片资产节点");
      return;
    }
    setAgentReferenceId(references[0].id);
    setAgentReferenceUrl(references[0].url);
    setAgentReferences(references);
    setIsAgentDockOpen(true);
  }, [
    boardController.board.nodes,
    pushWorkspaceNotice,
    setAgentReferenceId,
    setAgentReferenceUrl,
    setAgentReferences,
  ]);

  const editBoardAssetImage = useCallback((nodeId: string) => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (node?.kind !== "asset" || node.asset.type !== "image") {
      pushWorkspaceNotice("info", "请选择一个图片资产节点");
      return;
    }
    launchMaskEditor(node.asset.url, node.asset.assetId);
  }, [boardController.board.nodes, launchMaskEditor, pushWorkspaceNotice]);

  const resolveGenerateNodeInputs = useCallback((nodeId: string) => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (!isGenerateBoardNode(node)) {
      throw new Error("请选择图片或视频生成节点");
    }

    const promptEdge = boardController.board.edges.find(edge => edge.to.nodeId === nodeId && edge.to.portId === "prompt-in");
    const promptNode = promptEdge
      ? boardController.board.nodes.find(item => item.id === promptEdge.from.nodeId)
      : undefined;
    const resolvedPrompt = promptNode?.kind === "prompt"
      ? (getBoardTextDraft(promptNode.id) ?? promptNode.prompt)
      : (getBoardTextDraft(node.id) ?? node.prompt);
    const references: ReferenceImageRef[] = boardController.board.edges
      .filter(edge => edge.to.nodeId === nodeId && edge.to.portId === "reference-in")
      .map(edge => boardController.board.nodes.find(item => item.id === edge.from.nodeId))
      .flatMap(item => boardNodeReferences(item));

    return { node, prompt: resolvedPrompt, references };
  }, [boardController.board.edges, boardController.board.nodes]);

  const handleExecuteGenerateNode = useCallback(async (nodeId: string) => {
    try {
      const { node, prompt: nodePrompt, references } = resolveGenerateNodeInputs(nodeId);
      flushBoardTextForGenerateNode(boardController.board.nodes, boardController.board.edges, nodeId);
      const nextPrompt = nodePrompt.trim();
      if (!nextPrompt) {
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: "生成节点需要提示词输入" });
        pushWorkspaceNotice("error", "生成节点需要提示词输入");
        return;
      }
      if (isPlaceholderRunningHubModel(node.model)) {
        const message = "请先填写真实的 RunningHub webappId 或 workflowId";
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      const capability = getModelCapability(node.model, node.kind === "image-generate" ? "image" : "video");
      if (references.length > 0 && !capability.supportsReferences) {
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: "当前模型不支持参考图输入" });
        pushWorkspaceNotice("error", "当前模型不支持参考图输入");
        return;
      }
      if (node.kind === "video-generate") {
        const videoCapability = getVideoModelCapabilities(node.model);
        if (references.length < videoCapability.minReferenceImages || references.length > videoCapability.maxReferenceImages) {
          const message = `当前视频模型需要 ${videoCapability.minReferenceImages}-${videoCapability.maxReferenceImages} 张参考图`;
          boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
          pushWorkspaceNotice("error", message);
          return;
        }
      }

      boardController.updateGenerateNode(nodeId, { status: "processing", errorMessage: undefined, prompt: nextPrompt });

      if (node.kind === "image-generate") {
        const nodeImageResolution = node.imageResolution === "custom" ? node.customImageResolution.trim() : node.imageResolution;
        let didStartAny = false;
        for (let remaining = node.variantCount; remaining > 0; remaining -= 1) {
          const didStart = await generateManualImage({
            boardNodeId: nodeId,
            imageQuality: node.imageQuality,
            imageResolution: nodeImageResolution,
            isCustomImageResolution: node.imageResolution === "custom",
            model: node.model,
            prompt: nextPrompt,
            referenceImage: references[0]?.url ?? null,
            referenceImages: references,
            size: node.aspectRatio,
            thinkingLevel: node.thinkingLevel,
          });
          if (!didStart) break;
          didStartAny = true;
        }
        if (!didStartAny) {
          boardController.updateGenerateNode(nodeId, {
            errorMessage: "图片生成请求未启动，请检查节点参数",
            status: "failed",
          });
        }
      } else {
        let didStartAny = false;
        for (let remaining = node.variantCount; remaining > 0; remaining -= 1) {
          const didStart = await generateManualVideo({
            boardNodeId: nodeId,
            model: node.model,
            prompt: nextPrompt,
            referenceImage: references[0]?.url ?? null,
            referenceImages: references,
            size: node.aspectRatio,
            videoDuration: node.videoDuration,
            videoPreset: node.videoPreset,
            videoResolution: node.videoResolution,
          });
          if (!didStart) break;
          didStartAny = true;
        }
        if (!didStartAny) {
          boardController.updateGenerateNode(nodeId, {
            errorMessage: "视频生成请求未启动，请检查节点参数",
            status: "failed",
          });
        }
      }
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "节点生成失败"));
    }
  }, [
    boardController,
    generateManualImage,
    generateManualVideo,
    pushWorkspaceNotice,
    resolveGenerateNodeInputs,
  ]);

  const handleSendAgentNode = useCallback((nodeId: string) => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (node?.kind !== "agent") {
      pushWorkspaceNotice("error", "请选择 Agent 节点");
      return;
    }

    const references = boardController.board.edges
      .filter(edge => edge.to.nodeId === nodeId && edge.to.portId === "agent-context-in")
      .map(edge => boardController.board.nodes.find(item => item.id === edge.from.nodeId))
      .flatMap(item => boardNodeReferences(item))
      .slice(0, IMAGE_REFERENCE_LIMIT);

    setAgentReferences(references);
    setAgentReferenceId(references[0]?.id ?? null);
    setAgentReferenceUrl(references[0]?.url ?? null);
    setAgentInput(node.instruction);
    setIsAgentDockOpen(true);
    if (node.instruction.trim()) void submitAgentPrompt(node.instruction, references);
  }, [
    boardController.board.edges,
    boardController.board.nodes,
    pushWorkspaceNotice,
    setAgentReferenceId,
    setAgentReferenceUrl,
    setAgentReferences,
    submitAgentPrompt,
  ]);

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
      setAgentReferences(prev => [...prev, { id: newReferenceId, url: compressedDataUrl }].slice(0, IMAGE_REFERENCE_LIMIT));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "Agent 参考图压缩失败，请换一张图片"));
    }
  };

  useEffect(() => {
    async function loadItems(): Promise<void> {
      const allItems = await getAllFromDB();
      knownItemIdsRef.current = new Set(allItems.map(item => item.id));
      loadedItemsRef.current = true;
      setItems(allItems);
    }
    loadItems().catch(error => pushWorkspaceNotice("error", `本地项目库读取失败：${toErrorMessage(error, "IndexedDB 读取失败")}`));
  }, [pushWorkspaceNotice]);

  useEffect(() => {
    const restoreTheme = setTimeout(() => {
      const stored = readStoredThemeMode();
      if (stored) {
        setThemeMode(stored);
        document.documentElement.setAttribute("data-imagine-theme", stored);
      }
    }, 0);
    return () => clearTimeout(restoreTheme);
  }, []);

  useEffect(() => {
    if (!loadedItemsRef.current) return;
    if (boardController.saveStatus === "loading") return;
    const known = knownItemIdsRef.current;
    const handledBoardItems = handledBoardItemIdsRef.current;
    for (const item of items) {
      const sourceBoardNodeId = item.sourceBoardNodeId;
      if (sourceBoardNodeId) {
        if (item.status === "pending" || item.status === "processing") {
          known.add(item.id);
          const sourceNode = findGenerateNodeById(boardController.board.nodes, sourceBoardNodeId);
          if (sourceNode && (sourceNode.status !== "processing" || sourceNode.errorMessage)) {
            boardController.updateGenerateNode(sourceBoardNodeId, {
              errorMessage: undefined,
              status: "processing",
            });
          }
          continue;
        }
        if (handledBoardItems.has(item.id)) continue;
        if (item.status !== "complete" && item.status !== "failed") continue;
      }

      if (sourceBoardNodeId && item.status === "complete") {
        known.add(item.id);
        handledBoardItems.add(item.id);
        const sourceNode = findGenerateNodeById(boardController.board.nodes, sourceBoardNodeId);
        const nextStatus = nextSourceNodeStatus(items, sourceBoardNodeId, item.status);
        const existingAssetNode = findBoardAssetNodeByAssetId(boardController.board.nodes, item.id);
        if (existingAssetNode) {
          boardController.connectPorts(
            { nodeId: sourceBoardNodeId, portId: "result-out", portKind: "result" },
            { nodeId: existingAssetNode.id, portId: "asset-in", portKind: "asset" },
          );
          boardController.updateGenerateNode(sourceBoardNodeId, {
            resultAssetId: item.id,
            status: nextStatus,
          });
          continue;
        }
        if (sourceNode?.resultAssetId === item.id) continue;
        const resultIndex = completedSourceItemIndex(items, sourceBoardNodeId, item.id);
        const assetNodeId = addAssetToBoard(
          item,
          sourceNode ? resultAssetPosition(sourceNode, resultIndex) : undefined,
        );
        boardController.connectPorts(
          { nodeId: sourceBoardNodeId, portId: "result-out", portKind: "result" },
          { nodeId: assetNodeId, portId: "asset-in", portKind: "asset" },
        );
        boardController.updateGenerateNode(sourceBoardNodeId, {
          resultAssetId: item.id,
          status: nextStatus,
        });
        continue;
      }

      if (sourceBoardNodeId && item.status === "failed") {
        known.add(item.id);
        handledBoardItems.add(item.id);
        const nextStatus = nextSourceNodeStatus(items, sourceBoardNodeId, item.status);
        boardController.updateGenerateNode(sourceBoardNodeId, {
          errorMessage: nextStatus === "failed" ? item.errorMessage ?? "生成失败" : undefined,
          status: nextStatus,
        });
        continue;
      }

      if (known.has(item.id)) continue;
      known.add(item.id);
      if (item.status === "complete" && !findBoardAssetNodeByAssetId(boardController.board.nodes, item.id)) {
        addAssetToBoard(item);
      }
    }
  }, [addAssetToBoard, boardController, items]);

  const handleClearProject = async () => {
    if (!confirm("确认清空本地项目库资产吗？画板节点不会自动清空。")) return;
    await clearAllDB();
    knownItemIdsRef.current = new Set();
    handledBoardItemIdsRef.current = new Set();
    setItems([]);
  };

  const createBoardPage = useCallback(async () => {
    const nextIndex = boardSummaries.length + 1;
    const nextId = makeClientId("board");
    const nextBoard = createEmptyBoard(nextId, `画板 ${nextIndex}`);
    await saveBoardToDB(nextBoard);
    setBoardSummaries(prev => [boardSummaryFromDocument(nextBoard), ...prev]);
    router.push(boardRoute(nextId));
  }, [boardSummaries.length, router]);

  const selectBoardPage = useCallback((nextBoardId: string) => {
    router.push(boardRoute(nextBoardId));
  }, [router]);

  const renameBoardPage = useCallback(() => {
    const nextTitle = window.prompt("重命名画板", boardController.board.title);
    if (nextTitle === null) return;
    try {
      boardController.updateBoardTitle(nextTitle);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "画板重命名失败"));
    }
  }, [boardController, pushWorkspaceNotice]);

  const deleteBoardPage = useCallback(async () => {
    if (boardSummaries.length <= 1) {
      pushWorkspaceNotice("info", "至少保留一个画板");
      return;
    }
    if (!window.confirm(`确认删除「${boardController.board.title}」吗？`)) return;
    await deleteBoardFromDB(boardController.board.id);
    const nextBoard = boardSummaries.find(item => item.id !== boardController.board.id);
    setBoardSummaries(prev => prev.filter(item => item.id !== boardController.board.id));
    router.push(boardRoute(nextBoard?.id ?? DEFAULT_BOARD_ID));
  }, [boardController.board.id, boardController.board.title, boardSummaries, pushWorkspaceNotice, router]);

  const toggleThemeMode = () => {
    setThemeMode(prev => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      persistThemeMode(next);
      return next;
    });
  };

  const selectedBoardNode = boardController.board.nodes.find(node => node.id === boardController.selectedNodeId);
  const selectedIncomingEdges = selectedBoardNode
    ? boardController.board.edges.filter(edge => edge.to.nodeId === selectedBoardNode.id)
    : [];
  const selectedOutgoingEdges = selectedBoardNode
    ? boardController.board.edges.filter(edge => edge.from.nodeId === selectedBoardNode.id)
    : [];
  const imageModelGroups = getProviderModelGroups(imageModelOptions);
  const videoModelGroups = getProviderModelGroups(videoModelOptions);
  const chatModelGroups = getProviderModelGroups(chatModelOptions);
  const boardSummariesForToolbar = useMemo(() => {
    if (boardController.saveStatus === "loading") return boardSummaries;
    const summary = boardSummaryFromDocument(boardController.board);
    const withoutCurrent = boardSummaries.filter(item => item.id !== summary.id);
    return [summary, ...withoutCurrent].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [boardController.board, boardController.saveStatus, boardSummaries]);

  return (
    <div className={`imagine-workbench-shell imagine-theme-${themeMode}`}>
      <WorkspaceNotices notices={workspaceNotices} onDismiss={dismissWorkspaceNotice} />
      <BoardWorkspace
        boardSummaries={boardSummariesForToolbar}
        controller={boardController}
        galleryItems={items}
        themeMode={themeMode}
        onBack={() => router.push("/")}
        onCancelGenerateNode={(nodeId) => void cancelBoardGenerationNode(nodeId)}
        onCaptureVideoFrame={handleCaptureVideoFrame}
        onConnectionError={(message) => pushWorkspaceNotice("error", message)}
        onCreateBoard={() => {
          void createBoardPage().catch(error => pushWorkspaceNotice("error", toErrorMessage(error, "新建画板失败")));
        }}
        onDeleteBoard={() => {
          void deleteBoardPage().catch(error => pushWorkspaceNotice("error", toErrorMessage(error, "删除画板失败")));
        }}
        onEditAssetImage={editBoardAssetImage}
        onExecuteGenerateNode={handleExecuteGenerateNode}
        onImportBoardFiles={handleImportBoardFiles}
        onOpenSettings={() => setShowSettings(true)}
        onRenameBoard={renameBoardPage}
        onSelectBoard={selectBoardPage}
        onSendAssetToAgent={useBoardAssetForAgent}
        onSendAgentNode={handleSendAgentNode}
        onSetAssetAsReference={useBoardAssetAsReference}
        onToggleTheme={toggleThemeMode}
      >
        <BoardSidePanel
          assetCount={items.length}
          inspectorPanel={(
            <BoardInspector
              imageModelGroups={imageModelGroups}
              incomingCount={selectedIncomingEdges.length}
              items={items}
              node={selectedBoardNode}
              outgoingCount={selectedOutgoingEdges.length}
              videoModelGroups={videoModelGroups}
              onExecuteGenerate={(nodeId) => void handleExecuteGenerateNode(nodeId)}
              onOpenFullscreen={setFullscreenItem}
              onOpenMask={(imageUrl, assetId) => launchMaskEditor(imageUrl, assetId)}
              onOpenSettings={() => setShowSettings(true)}
              onSendAssetToAgent={useSelectedBoardAssetForAgent}
              onSyncAssetReference={useSelectedBoardAssetAsReference}
              onUpdateGenerate={boardController.updateGenerateNode}
            />
          )}
          assetsPanel={(
              <div className="flex flex-col gap-2 px-3 pb-3">
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
                    暂无本地资产，请先在首页生成作品
                  </p>
                ) : (
                  items.slice(0, 36).map(item => (
                    <button
                      key={item.id}
                      type="button"
                      draggable={item.type === "image" && item.status === "complete"}
                      onDragStart={(event) => {
                        if (item.type !== "image" || item.status !== "complete") return;
                        event.dataTransfer.setData(IMAGINE_BOARD_ASSET_DRAG_TYPE, item.id);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => addAssetToBoard(item)}
                      className="imagine-asset-card grid grid-cols-[54px_1fr] gap-2 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-left transition hover:border-[var(--iw-board-accent-amber)] hover:bg-[var(--iw-panel)]"
                    >
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-[var(--iw-panel)]">
                        {item.type === "image" && item.status === "complete" ? (
                          <PreviewImage src={item.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Video className="h-4 w-4 text-[var(--iw-faint)]" />
                        )}
                      </div>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-[var(--iw-text)]">{item.prompt || item.model}</span>
                        <span className="imagine-status-chip block truncate font-mono text-[10px]" data-status={item.status}>
                          {item.status}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
          )}
        />
      </BoardWorkspace>

      {!showSettings && !isMaskOpen && !fullscreenItem && (
        <AgentDock
          activeCountdownId={activeCountdownId}
          agentReferenceId={agentReferenceId}
          agentReferenceUrl={agentReferenceUrl}
          atDropdownNode={atDropdown.visible && atDropdown.type === "agent-prompt" ? renderAgentAtDropdown() : null}
          autoExecute={autoExecute}
          chatBottomRef={chatBottomRef}
          countdownSeconds={countdownSeconds}
          input={agentInput}
          isLoading={isAgentLoading}
          isOpen={isAgentDockOpen}
          isOverContent={false}
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
            if (agentReferenceUrl) launchMaskEditor(agentReferenceUrl, agentReferenceId || "custom_ref", "agent");
          }}
          onSubmit={() => submitAgentPrompt()}
          onSuggestedPrompt={(suggestedPrompt) => submitAgentPrompt(suggestedPrompt)}
          onToggleAutoExecute={handleToggleAutoExecute}
          onToggleOpen={() => setIsAgentDockOpen(prev => !prev)}
          onUploadReference={handleAgentReferenceUpload}
        />
      )}

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
        onAddFetchedModels={addFetchedModels}
        onAddManualModels={addManualModels}
        onClearCredentials={clearProviderCredentials}
        onClose={() => setShowSettings(false)}
        onResetData={handleClearProject}
        onSaveCredential={handleSaveCredential}
        onSelectChatModel={handleSelectChatModel}
        onSelectProvider={handleSelectProvider}
        refreshProviderModels={refreshProviderModels}
        testProviderConnection={testProviderConnection}
      />

      <FullscreenPreview
        item={fullscreenItem}
        onCaptureVideoFrame={(item, frame) =>
          handleCaptureVideoFrame(boardController.selectedNodeId ?? "", item, frame)
        }
        onClose={() => setFullscreenItem(null)}
      />
      {isMaskOpen && (
        <CanvasMaskEditor
          imageUrl={maskTargetUrl}
          isOpen={isMaskOpen}
          onClose={() => setIsMaskOpen(false)}
          onSaveMask={saveMaskOutput}
        />
      )}
    </div>
  );
}
