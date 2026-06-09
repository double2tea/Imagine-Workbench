"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import AgentDock from "@/components/agent/AgentDock";
import SaveVoiceProfileDialog, { type SaveVoiceProfileDialogInput } from "@/components/audio/SaveVoiceProfileDialog";
import {
  AGENT_BOARD_PATCH_MAX_OPERATIONS,
  type AgentBoardPatch,
  type AgentBoardPatchCreateNodeOperation,
  type AgentBoardPatchOperation,
  type AgentBoardPatchPortRef,
  type AgentGenerationParams,
  type AgentToolAction,
} from "@/lib/agent-actions";
import { isCustomImageResolutionValue } from "@/lib/agent-tool-action";
import AtReferenceDropdown from "@/components/reference/AtReferenceDropdown";
import CanvasMaskEditor, { type CanvasMaskEditorOutput } from "@/components/CanvasMaskEditor";
import FullscreenPreview from "@/components/assets/FullscreenPreview";
import PanoramaOverlay from "@/components/panorama/PanoramaOverlay";
import BoardInspector from "@/components/board/BoardInspector";
import BoardSidePanel from "@/components/board/BoardSidePanel";
import BoardSideAssetList from "@/components/board/BoardSideAssetList";
import BoardWorkspace from "@/components/board/BoardWorkspace";
import SettingsModal from "@/components/settings/SettingsModal";
import WorkspaceNotices, { type WorkspaceNotice } from "@/components/workbench/WorkspaceNotices";
import type { AgentBoardContext, AgentBoardNodeSummary } from "@/lib/agent-context";

import { useAgentController } from "@/hooks/useAgentController";
import { useAssetWorkspaceState } from "@/hooks/useAssetWorkspaceState";
import { useBoardAssetStore } from "@/hooks/useBoardAssetStore";
import { collectPlacedBoardAssetIdsFromNodes } from "@/lib/assets/board-scope";
import { saveItemWithPreview } from "@/lib/assets/previews";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { estimateBoardNoteSize, estimateBoardPromptSize } from "@/lib/board/text-node-size";
import { findResultNodeForSource } from "@/lib/board/utils";
import { generateReferenceCandidates } from "@/lib/board/prompt-references";
import { useBoardState } from "@/hooks/useBoardState";
import { useClipboardImageImport } from "@/hooks/useClipboardImageImport";
import { useGenerationActions } from "@/hooks/useGenerationActions";
import { useGenerationTaskStore } from "@/hooks/useGenerationTaskStore";
import { useMediaPolling } from "@/hooks/useMediaPolling";
import {
  audioOperationMissingReferenceMessage,
  audioOperationRequiresStylePrompt,
  audioOperationRequiresTextInput,
  resolveAudioFunctionSelection,
} from "@/lib/audio-operation-rules";
import {
  IMAGE_REFERENCE_LIMIT,
  useReferenceState,
} from "@/hooks/useReferenceState";
import { useProviderSettings } from "@/hooks/useProviderSettings";
import { useImageEditFeatureModels } from "@/hooks/useImageEditFeatureModels";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import {
  buildStorageItem,
  clearAllDB,
  type StorageItem,
} from "@/lib/db";
import {
  cancelGenerationTask,
  type GenerationTask,
} from "@/lib/generation-tasks";
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  getAudioModelCapabilities,
  getImageAspectRatioFromResolution,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getModelCapability,
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
import type { RunningHubTaskNodeBinding } from "@/lib/providers/types";
import {
  REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES,
  compressReferenceImageDataUrl,
  compressReferenceImageFile,
  prepareReferenceImageUrlForRequest,
} from "@/lib/reference-images";
import { transcriptFromDataUrl } from "@/lib/transcripts";
import {
  DEFAULT_BOARD_ID,
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_GENERATE_NODE_SIZE,
  BOARD_PORT_IDS,
  composeBoardMultiGridImage,
  createEmptyBoard,
  deleteBoardFromDB,
  listBoardSummariesFromDB,
  resolveBoardConnectionKind,
  saveBoardToDB,
  type BoardDocument,
  type BoardGenerateNodeUpdate,
  type BoardGenerationStatus,
  type BoardAudioOperationNode,
  type BoardImageGenerateNode,
  type BoardNode,
  type BoardPoint,
  type BoardPortRef,
  type BoardAssetReference,
  type BoardRunningHubAppNode,
  type BoardRunningHubAppNodeUpdate,
  type BoardRunningHubAppSchemaResult,
  type BoardSummary,
  type BoardVideoGenerateNode,
  type BoardVideoReferenceMode,
  assetCompareReferenceUrl,
  analyzeRunningHubBindings,
  hasRunningHubBindingIdentity,
  parseRunningHubBindingsFromJsonText,
} from "@/lib/board";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import {
  getMediaReferenceType,
  mediaReferenceFileExtension,
  mediaReferenceLabel,
  mediaReferenceMimeFromDataUri,
  mediaReferenceTypeFromMime,
  type MediaReferenceType,
} from "@/lib/media-references";
import {
  flushAllBoardText,
  flushBoardText,
  flushBoardTextForAgentNode,
  flushBoardTextForGenerateNode,
  getBoardTextDraft,
} from "@/lib/board/text-flush-registry";
import { createPanoramaScreenshotStorageItem, type PanoramaScreenshot } from "@/lib/panorama/capture";
import { createVideoFrameStorageItem, getVideoFrameCaptureLabel, type CapturedVideoFrame } from "@/lib/video-frame";
import {
  cleanupWorkspaceAssets,
  clearLocalStorageGroup,
  createLocalUploadAsset,
  createWorkspaceSafetySnapshot,
  downloadLatestWorkspaceSafetySnapshot,
  exportBoardWorkspaceBackup,
  exportCompleteWorkspaceBackup,
  importWorkspaceBackup,
  previewWorkspaceBackup,
  repairStaleAssetSourceLinks,
  resetBoardsToDefault,
  type LocalStorageCleanupKind,
  type WorkspaceCleanupKind,
} from "@/lib/data-management";
import { CLEAR_WORKSPACE_ASSETS_MESSAGE } from "@/lib/workspace-messages";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import { readImageGenerationPayload } from "@/lib/client-image-response";

type NoticeType = "error" | "info" | "success";
type MaskDestination = "creative" | "agent" | "board-asset";
type BoardMode = "image" | "video" | "audio";
type GenerateBoardNode = BoardImageGenerateNode | BoardVideoGenerateNode | BoardAudioOperationNode;
type ExecutableBoardNode = GenerateBoardNode | BoardRunningHubAppNode;
type AgentGenerateAction = AgentToolAction & { type: "generate_image" | "generate_video" | "generate_audio" };
type AgentBoardFlowAction = AgentToolAction & { type: "create_board_image_flow" | "create_board_video_flow" | "create_board_audio_flow" };
type AgentBoardNoteAction = AgentToolAction & { type: "create_board_note" };
type AgentBoardUpdateAction = AgentToolAction & { type: "update_board_node" };
type AgentBoardPatchAction = AgentToolAction & { type: "apply_board_patch" };
type AgentImageToVideoAction = AgentToolAction & { type: "continue_image_to_video" };
type BoardAgentActionResult = boolean | { handled: true; success: boolean };

const LARGE_BOARD_DATA_URL_MIN_LENGTH = 120_000;
const IMAGE_EDIT_LABELS: Record<ImageEditFeature, string> = {
  redraw: "重绘",
  erase: "擦除",
  outpaint: "扩图",
  cutout: "抠图",
};

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

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRunningHubAppSchemaResult(value: unknown): { name?: string; nodeInfoList: unknown[]; webappId: string } {
  if (!isUnknownRecord(value) || !Array.isArray(value.nodeInfoList)) {
    throw new Error("RunningHub 字段响应缺少 nodeInfoList");
  }
  return {
    name: getStringField(value, "name") ?? undefined,
    nodeInfoList: value.nodeInfoList,
    webappId: getStringField(value, "webappId") ?? "",
  };
}

async function saveItemOrWarn(
  item: StorageItem,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): Promise<StorageItem | null> {
  try {
    return await saveItemWithPreview(item);
  } catch (error) {
    pushWorkspaceNotice("error", `本地存储失败，刷新后可能丢失：${toErrorMessage(error, "IndexedDB 写入失败")}`);
    return null;
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

async function createBoardUploadItem(
  file: File,
  id: string,
  boardId: string,
): Promise<StorageItem> {
  const mediaType = mediaReferenceTypeFromMime(file.type);
  if (!mediaType) {
    throw new Error("画板只支持导入图片、视频或音频文件");
  }
  const url = mediaType === "image" ? await compressReferenceImageFile(file) : await readFileAsDataUrl(file);
  return buildStorageItem(
    {
      id,
      type: mediaType,
      url,
      prompt: file.name || "Board upload",
      model: "local-upload",
      aspectRatio: "auto",
      createdAt: new Date().toISOString(),
      status: "complete",
      progress: 100,
      operationName: "board-upload",
    },
    { boardId },
  );
}

type BoardMediaReferenceLike = Pick<BoardAssetReference, "assetId" | "model" | "prompt" | "type" | "url">;

function isLargeBoardDataUrl(url: string): boolean {
  return url.startsWith("data:") && url.length >= LARGE_BOARD_DATA_URL_MIN_LENGTH;
}

function boardMediaReferenceToStorageItem(
  reference: BoardMediaReferenceLike,
  createdAt: string,
  boardId: string,
  sourceBoardNodeId?: string,
  sourceBoardResultStackKey?: string,
): StorageItem {
  return buildStorageItem(
    {
      id: reference.assetId,
      type: reference.type,
      url: reference.url,
      prompt: reference.prompt,
      model: reference.model,
      aspectRatio: "auto",
      createdAt,
      status: "complete",
      progress: 100,
      sourceBoardNodeId,
      sourceBoardResultStackKey,
    },
    { boardId },
  );
}

function boardUploadIdPrefix(type: MediaReferenceType, index: number): string {
  if (type === "video") return `board_video_${index}`;
  if (type === "audio") return `board_audio_${index}`;
  return `board_image_${index}`;
}

const BOARD_IMPORT_GRID_COLUMNS = 4;
const BOARD_IMPORT_NODE_GAP = 40;

function boardImportNodePosition(origin: BoardPoint, index: number): BoardPoint {
  return {
    x: origin.x + (index % BOARD_IMPORT_GRID_COLUMNS) * (DEFAULT_ASSET_NODE_SIZE.width + BOARD_IMPORT_NODE_GAP),
    y: origin.y + Math.floor(index / BOARD_IMPORT_GRID_COLUMNS) * (DEFAULT_ASSET_NODE_SIZE.height + BOARD_IMPORT_NODE_GAP),
  };
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

function modelProviderIsAvailable(
  value: string,
  fallbackProvider: AiProvider,
  providerKeys: readonly AiProvider[],
): boolean {
  const parsed = tryParseProviderModel(value, fallbackProvider);
  const provider = parsed?.provider ?? fallbackProvider;
  return providerKeys.includes(provider);
}

type BoardReferenceUrlResolver = (assetId: string, fallbackUrl: string) => string;

function activeExecutableResultItem(
  nodes: BoardDocument["nodes"],
  node: ExecutableBoardNode,
  items: StorageItem[],
): StorageItem | undefined {
  const resultNode = findResultNodeForSource(nodes, node.id);
  if (resultNode) {
    const resultItem = items.find(item => item.id === resultNode.activeAssetId && item.status === "complete");
    if (resultItem) return resultItem;
  }
  return node.resultAssetId
    ? items.find(item => item.id === node.resultAssetId && item.status === "complete")
    : undefined;
}

function isMediaStorageItem(item: StorageItem): item is StorageItem & { type: MediaReferenceType } {
  return item.type === "image" || item.type === "video" || item.type === "audio";
}

function boardAssetDownloadExtension(item: StorageItem): string {
  if (item.type === "transcript") return "txt";
  return mediaReferenceFileExtension(mediaReferenceMimeFromDataUri(item.url), item.type);
}

function boardAssetReferenceFromStorageItem(item: StorageItem): BoardAssetReference {
  if (!isMediaStorageItem(item)) {
    throw new Error("Transcript items cannot be placed as board media assets");
  }
  return {
    assetId: item.id,
    type: item.type,
    url: item.url,
    prompt: item.prompt,
    model: item.model,
  };
}

function activeBoardReference(
  nodes: ReturnType<typeof useBoardState>["board"]["nodes"],
  selectedNodeId: string | null,
  items: StorageItem[],
  resolveUrl: BoardReferenceUrlResolver,
): ReferenceImageRef[] {
  const node = nodes.find(item => item.id === selectedNodeId);
  if (!node) return [];
  if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") {
    const item = activeExecutableResultItem(nodes, node, items);
    return item && isMediaStorageItem(item) ? [{ id: item.id, type: item.type, url: resolveUrl(item.id, item.url), role: "general" }] : [];
  }
  if (node.kind !== "asset") return [];
  return [{ id: node.asset.assetId, type: node.asset.type, url: resolveUrl(node.asset.assetId, node.asset.url), role: "general" }];
}

function boardNodeReferences(
  node: BoardDocument["nodes"][number] | undefined,
  nodes: BoardDocument["nodes"],
  items: StorageItem[],
  resolveUrl: BoardReferenceUrlResolver,
): ReferenceImageRef[] {
  if (node?.kind === "asset") {
    return [{ id: node.asset.assetId, type: node.asset.type, url: resolveUrl(node.asset.assetId, node.asset.url), role: "general" }];
  }
  if (node?.kind === "reference-group") {
    return node.references.map(reference => ({
      id: reference.assetId,
      role: reference.role,
      type: reference.type,
      url: resolveUrl(reference.assetId, reference.url),
    }));
  }
  if (node?.kind === "image-generate" || node?.kind === "video-generate" || node?.kind === "audio-operation" || node?.kind === "runninghub-app") {
    const item = activeExecutableResultItem(nodes, node, items);
    return item && isMediaStorageItem(item) ? [{ id: item.id, type: item.type, url: resolveUrl(item.id, item.url), role: "general" }] : [];
  }
  if (node?.kind === "result") {
    const item = items.find(current => current.id === node.activeAssetId && current.status === "complete");
    return item && isMediaStorageItem(item) ? [{ id: item.id, type: item.type, url: resolveUrl(item.id, item.url), role: "general" }] : [];
  }
  return [];
}

function isGenerateBoardNode(node: BoardDocument["nodes"][number] | undefined): node is GenerateBoardNode {
  return node?.kind === "image-generate" || node?.kind === "video-generate" || node?.kind === "audio-operation";
}

function isExecutableBoardNode(node: BoardDocument["nodes"][number] | undefined): node is ExecutableBoardNode {
  return isGenerateBoardNode(node) || node?.kind === "runninghub-app";
}

function isRunningHubAppBoardNode(node: BoardDocument["nodes"][number] | undefined): node is BoardRunningHubAppNode {
  return node?.kind === "runninghub-app";
}

function runningHubAppModelValue(node: BoardRunningHubAppNode): string {
  const target = node.targetType === "workflow" ? "workflow" : "ai-app";
  return `runninghub:${target}-${node.outputType}:${node.targetId.trim()}`;
}

function runningHubNodeInfoBindings(node: BoardRunningHubAppNode): RunningHubTaskNodeBinding[] {
  return node.bindings
    .filter(binding => binding.enabled !== false && hasRunningHubBindingIdentity(binding))
    .map(binding => ({
      nodeId: binding.nodeId.trim(),
      fieldName: binding.fieldName.trim(),
      label: binding.label,
      source: binding.source,
      value: binding.value,
      valueType: binding.valueType,
      enabled: binding.enabled,
      required: binding.required,
      referenceIndex: binding.referenceIndex,
      referenceType: binding.referenceType,
      deliveryMode: binding.deliveryMode,
    }));
}

function runningHubAppNodeError(node: BoardRunningHubAppNode, prompt: string, referenceCount: number): string | null {
  if (!node.targetId.trim() || node.targetId.includes("<")) {
    return node.targetType === "workflow" ? "请填写真实的 workflowId" : "请填写真实的 webappId";
  }
  const readiness = analyzeRunningHubBindings(node.bindings, prompt, referenceCount);
  if (readiness.missingCount > 0) return `RunningHub 应用还有 ${readiness.missingCount} 个必填字段缺少输入`;
  return null;
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
  videoReferenceMode?: BoardVideoReferenceMode;
  videoResolution?: string;
} {
  const capabilities = getVideoModelCapabilities(model);
  return {
    aspectRatio: aspectRatio && capabilities.sizes.some(option => option.value === aspectRatio)
      ? aspectRatio
      : firstOptionValue(capabilities.sizes, "auto"),
    videoDuration: capabilities.durations[0]?.value,
    videoPreset: capabilities.presets[0]?.value,
    videoReferenceMode: capabilities.referenceMode === "reference" || capabilities.referenceMode === "firstLast"
      ? capabilities.referenceMode
      : undefined,
    videoResolution: capabilities.resolutions[0]?.value,
  };
}

function audioActionDefaults(model: string): {
  audioFormat: string;
  audioMode: AudioOperationMode;
} {
  const capabilities = getAudioModelCapabilities(model);
  return {
    audioFormat: firstOptionValue(capabilities.formats, ""),
    audioMode: capabilities.defaultMode,
  };
}

function isAgentGenerateAction(action: AgentToolAction): action is AgentGenerateAction {
  return action.type === "generate_image" || action.type === "generate_video" || action.type === "generate_audio";
}

function isAgentBoardFlowAction(action: AgentToolAction): action is AgentBoardFlowAction {
  return action.type === "create_board_image_flow" || action.type === "create_board_video_flow" || action.type === "create_board_audio_flow";
}

function isAgentBoardNoteAction(action: AgentToolAction): action is AgentBoardNoteAction {
  return action.type === "create_board_note";
}

function isAgentBoardUpdateAction(action: AgentToolAction): action is AgentBoardUpdateAction {
  return action.type === "update_board_node";
}

function isAgentBoardPatchAction(action: AgentToolAction): action is AgentBoardPatchAction {
  return action.type === "apply_board_patch";
}

function isAgentImageToVideoAction(action: AgentToolAction): action is AgentImageToVideoAction {
  return action.type === "continue_image_to_video";
}

function handledBoardAction(success: boolean): BoardAgentActionResult {
  return { handled: true, success };
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

function firstTextParam(params: AgentGenerationParams | undefined): string {
  return params?.prompt?.trim() || params?.body?.trim() || params?.instruction?.trim() || "";
}

function buildGenerateNodeUpdate(
  node: GenerateBoardNode,
  params: AgentGenerationParams | undefined,
): BoardGenerateNodeUpdate {
  const update: BoardGenerateNodeUpdate = {};
  const prompt = params?.prompt?.trim();
  if (prompt) update.prompt = prompt;
  if (params?.model?.trim()) {
    const kind = node.kind === "image-generate" ? "image" : node.kind === "video-generate" ? "video" : "audio";
    getModelCapability(params.model, kind);
    update.model = params.model;
  }
  if (params?.aspectRatio?.trim()) update.aspectRatio = params.aspectRatio;
  if (node.kind === "image-generate") {
    if (params?.imageResolution?.trim()) update.imageResolution = params.imageResolution;
    if (params?.imageQuality?.trim()) update.imageQuality = params.imageQuality;
    if (params?.thinkingLevel?.trim()) update.thinkingLevel = params.thinkingLevel;
  } else if (node.kind === "video-generate") {
    if (params?.videoResolution?.trim()) update.videoResolution = params.videoResolution;
    if (params?.videoDuration?.trim()) update.videoDuration = params.videoDuration;
    if (params?.videoPreset?.trim()) update.videoPreset = params.videoPreset;
    if (params?.videoReferenceMode) update.videoReferenceMode = params.videoReferenceMode;
  } else {
    if (params?.audioFormat?.trim()) update.audioFormat = params.audioFormat;
    if (params?.audioMode) update.audioMode = params.audioMode;
    if (params?.audioStylePrompt?.trim()) update.audioStylePrompt = params.audioStylePrompt;
    if (params?.asrLanguage) update.asrLanguage = params.asrLanguage;
    if (params?.voiceProfileId?.trim()) update.voiceProfileId = params.voiceProfileId;
    if (typeof params?.voiceCloneConsentAccepted === "boolean") update.voiceCloneConsentAccepted = params.voiceCloneConsentAccepted;
  }
  return update;
}

function hasGenerateNodeUpdate(update: BoardGenerateNodeUpdate): boolean {
  return Object.keys(update).length > 0;
}

function createPreviewBoardNode(operation: AgentBoardPatchCreateNodeOperation, index: number): BoardNode {
  const createdAt = new Date().toISOString();
  const position = operation.position ?? { x: 120 + index * 32, y: 160 + index * 24 };
  const base = {
    id: operation.tempId,
    title: operation.title ?? operation.tempId,
    position,
    createdAt,
    updatedAt: createdAt,
  };
  if (operation.kind === "prompt") {
    const prompt = operation.prompt ?? "";
    return { ...base, kind: "prompt", size: estimateBoardPromptSize(prompt), prompt };
  }
  if (operation.kind === "note") {
    const body = operation.body ?? operation.prompt ?? "";
    return { ...base, kind: "note", size: estimateBoardNoteSize(body), body };
  }
  if (operation.kind === "agent") {
    return { ...base, kind: "agent", size: DEFAULT_AGENT_NODE_SIZE, instruction: operation.instruction ?? operation.prompt ?? "" };
  }
  if (operation.kind === "image-generate") {
    const model = operation.model ?? DEFAULT_IMAGE_MODEL;
    const defaults = imageActionDefaults(model, operation.aspectRatio);
    getModelCapability(model, "image");
    return {
      ...base,
      ...defaults,
      kind: "image-generate",
      size: DEFAULT_GENERATE_NODE_SIZE,
      model,
      prompt: operation.prompt ?? "",
      status: "idle",
      variantCount: 1,
      ...(operation.aspectRatio ? { aspectRatio: operation.aspectRatio } : {}),
      ...(operation.imageResolution ? { imageResolution: operation.imageResolution } : {}),
      ...(operation.imageQuality ? { imageQuality: operation.imageQuality } : {}),
      ...(operation.thinkingLevel ? { thinkingLevel: operation.thinkingLevel } : {}),
    };
  }
  if (operation.kind === "audio-operation") {
    const selection = resolveAudioFunctionSelection({
      fallbackModel: DEFAULT_AUDIO_MODEL,
      mode: operation.audioMode,
      model: operation.model,
    });
    const model = selection.model;
    const defaults = audioActionDefaults(model);
    getModelCapability(model, "audio");
    return {
      ...base,
      ...defaults,
      kind: "audio-operation",
      size: DEFAULT_GENERATE_NODE_SIZE,
      model,
      prompt: operation.prompt ?? "",
      status: "idle",
      variantCount: 1,
      ...(operation.audioFormat ? { audioFormat: operation.audioFormat } : {}),
      audioMode: selection.mode,
      ...(operation.audioStylePrompt ? { audioStylePrompt: operation.audioStylePrompt } : {}),
      ...(operation.asrLanguage ? { asrLanguage: operation.asrLanguage } : {}),
      ...(operation.voiceProfileId ? { voiceProfileId: operation.voiceProfileId } : {}),
      ...(operation.voiceCloneConsentAccepted ? { voiceCloneConsentAccepted: operation.voiceCloneConsentAccepted } : {}),
    };
  }
  const model = operation.model ?? DEFAULT_VIDEO_MODEL;
  const defaults = videoActionDefaults(model, operation.aspectRatio);
  getModelCapability(model, "video");
  return {
    ...base,
    ...defaults,
    kind: "video-generate",
    size: DEFAULT_GENERATE_NODE_SIZE,
    model,
    prompt: operation.prompt ?? "",
    status: "idle",
    variantCount: 1,
    ...(operation.aspectRatio ? { aspectRatio: operation.aspectRatio } : {}),
    ...(operation.videoResolution ? { videoResolution: operation.videoResolution } : {}),
    ...(operation.videoDuration ? { videoDuration: operation.videoDuration } : {}),
    ...(operation.videoPreset ? { videoPreset: operation.videoPreset } : {}),
    ...(operation.videoReferenceMode ? { videoReferenceMode: operation.videoReferenceMode } : {}),
  };
}

function resolvePatchNodeId(nodeId: string, tempToRealIds: Map<string, string>): string {
  return tempToRealIds.get(nodeId) ?? nodeId;
}

function resolvePatchPortRef(ref: AgentBoardPatchPortRef, tempToRealIds: Map<string, string>): BoardPortRef {
  return {
    nodeId: resolvePatchNodeId(ref.nodeId, tempToRealIds),
    portId: ref.portId,
    portKind: ref.portKind,
  };
}

function updatePreviewNode(node: BoardNode, operation: AgentBoardPatchOperation): BoardNode {
  if (operation.op !== "update_node") return node;
  const updatedAt = new Date().toISOString();
  if (node.kind === "prompt") {
    if (!operation.prompt?.trim()) throw new Error("Prompt 节点更新缺少 prompt");
    return { ...node, prompt: operation.prompt, updatedAt };
  }
  if (node.kind === "note") {
    const body = operation.body ?? operation.prompt;
    if (!body?.trim()) throw new Error("Note 节点更新缺少 body");
    return { ...node, body, updatedAt };
  }
  if (node.kind === "agent") {
    const instruction = operation.instruction ?? operation.prompt;
    if (!instruction?.trim()) throw new Error("Agent 节点更新缺少 instruction");
    return { ...node, instruction, updatedAt };
  }
  if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation") {
    if (node.status === "processing") throw new Error("生成中的节点不可直接更新");
    const update = buildGenerateNodeUpdate(node, operation);
    if (!hasGenerateNodeUpdate(update)) throw new Error("生成节点更新缺少参数");
    return { ...node, ...update, updatedAt };
  }
  throw new Error("画板补丁不支持更新该类型节点");
}

function validateBoardPatch(patch: AgentBoardPatch, currentNodes: BoardNode[]): void {
  if (patch.operations.length === 0) throw new Error("画板补丁没有操作");
  if (patch.operations.length > AGENT_BOARD_PATCH_MAX_OPERATIONS) {
    throw new Error(`画板补丁最多支持 ${AGENT_BOARD_PATCH_MAX_OPERATIONS} 个操作`);
  }

  const previewNodes = [...currentNodes];
  const tempIds = new Set<string>();
  patch.operations.forEach((operation, index) => {
    if (operation.op === "create_node") {
      if (!operation.tempId.trim()) throw new Error("创建节点缺少 tempId");
      if (tempIds.has(operation.tempId) || currentNodes.some(node => node.id === operation.tempId)) {
        throw new Error(`重复的临时节点 ID: ${operation.tempId}`);
      }
      tempIds.add(operation.tempId);
      previewNodes.push(createPreviewBoardNode(operation, index));
      return;
    }
    if (operation.op === "update_node") {
      if (tempIds.has(operation.nodeId)) {
        throw new Error("同一补丁内不能更新临时节点；请在 create_node 中填完整字段");
      }
      const indexToUpdate = previewNodes.findIndex(node => node.id === operation.nodeId);
      if (indexToUpdate < 0) throw new Error(`未找到要更新的节点: ${operation.nodeId}`);
      previewNodes[indexToUpdate] = updatePreviewNode(previewNodes[indexToUpdate], operation);
      return;
    }
    const from = resolvePatchPortRef(operation.from, new Map());
    const to = resolvePatchPortRef(operation.to, new Map());
    resolveBoardConnectionKind(previewNodes, from, to);
  });
}

function resolveBoardPatchRunInputs(
  patch: AgentBoardPatch,
  generateOperation: AgentBoardPatchCreateNodeOperation,
  generatedNodeId: string,
  tempToRealIds: Map<string, string>,
  currentNodes: BoardNode[],
  items: StorageItem[],
  resolveUrl: BoardReferenceUrlResolver,
): { prompt: string; references: ReferenceImageRef[] } {
  let prompt = generateOperation.prompt?.trim() ?? "";
  const references: ReferenceImageRef[] = [];
  patch.operations.forEach(operation => {
    if (operation.op !== "connect_ports") return;
    const targetNodeId = resolvePatchNodeId(operation.to.nodeId, tempToRealIds);
    if (targetNodeId !== generatedNodeId) return;
    if (operation.to.portId === BOARD_PORT_IDS.promptIn) {
      const sourceTempOperation = patch.operations.find(item =>
        item.op === "create_node" &&
        item.tempId === operation.from.nodeId &&
        item.kind === "prompt"
      );
      if (sourceTempOperation?.op === "create_node" && sourceTempOperation.kind === "prompt") {
        prompt = sourceTempOperation.prompt?.trim() ?? prompt;
        return;
      }
      const sourceNodeId = resolvePatchNodeId(operation.from.nodeId, tempToRealIds);
      const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
      if (sourceNode?.kind === "prompt") {
        prompt = (getBoardTextDraft(sourceNode.id) ?? sourceNode.prompt).trim();
      }
      return;
    }
    if (operation.to.portId === BOARD_PORT_IDS.referenceIn) {
      const sourceNodeId = resolvePatchNodeId(operation.from.nodeId, tempToRealIds);
      const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
      references.push(...boardNodeReferences(sourceNode, currentNodes, items, resolveUrl));
    }
  });
  return { prompt, references };
}

function summarizeBoardNodeForAgent(node: BoardDocument["nodes"][number], draftText?: string): AgentBoardNodeSummary {
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
        prompt: sliceAgentText(draftText ?? node.prompt),
      };
    case "reference-group":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        body: `${node.references.length} references`,
      };
    case "multi-grid":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        body: `${node.gridSize}x${node.gridSize} ${node.aspectRatio} · ${node.items.length} images`,
      };
    case "group":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        body: "Board group",
      };
    case "image-generate":
    case "video-generate":
    case "audio-operation":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        prompt: sliceAgentText(draftText ?? node.prompt),
        model: node.model,
        aspectRatio: node.kind === "audio-operation" ? undefined : node.aspectRatio,
        status: node.status,
      };
    case "runninghub-app":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        prompt: sliceAgentText(draftText ?? node.prompt),
        model: runningHubAppModelValue(node),
        status: node.status,
      };
    case "agent":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        instruction: sliceAgentText(draftText ?? node.instruction),
      };
    case "result":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        assetId: node.asset.assetId,
        assetType: node.asset.type,
        model: node.asset.model,
        prompt: sliceAgentText(node.asset.prompt),
      };
    case "note":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        body: sliceAgentText(draftText ?? node.body),
      };
  }
}

function findBoardAssetNodeByAssetId(nodes: BoardDocument["nodes"], assetId: string) {
  return nodes.find(node => node.kind === "asset" && node.asset.assetId === assetId);
}

function hasResultAssetConnection(edges: BoardDocument["edges"], sourceNodeId: string, assetNodeId: string): boolean {
  return edges.some(edge => (
    edge.from.nodeId === sourceNodeId &&
    edge.from.portId === BOARD_PORT_IDS.resultOut &&
    edge.to.nodeId === assetNodeId &&
    edge.to.portId === BOARD_PORT_IDS.assetIn
  ));
}

function storageItemToBoardAssetReference(item: StorageItem): BoardAssetReference {
  return boardAssetReferenceFromStorageItem(item);
}

function hasTranscriptNoteForAsset(nodes: BoardDocument["nodes"], assetId: string): boolean {
  return nodes.some(node => node.kind === "note" && node.source?.assetId === assetId);
}

function transcriptNotePosition(sourceNode: ExecutableBoardNode): BoardPoint {
  return {
    x: sourceNode.position.x + sourceNode.size.width + 48,
    y: sourceNode.position.y,
  };
}

function findExecutableNodeById(nodes: BoardDocument["nodes"], nodeId: string): ExecutableBoardNode | undefined {
  const node = nodes.find(item => item.id === nodeId);
  return isExecutableBoardNode(node) ? node : undefined;
}

function isSourceStackItem(item: StorageItem, sourceNode: ExecutableBoardNode): boolean {
  return item.sourceBoardNodeId === sourceNode.id && (!sourceNode.resultStackKey || item.sourceBoardResultStackKey === sourceNode.resultStackKey);
}

function hasActiveSourceItems(items: StorageItem[], sourceNode: ExecutableBoardNode): boolean {
  return items.some(item => isSourceStackItem(item, sourceNode) && (item.status === "pending" || item.status === "processing"));
}

function isSourceStackTask(task: GenerationTask, sourceNode: ExecutableBoardNode): boolean {
  return task.source.boardNodeId === sourceNode.id && (!sourceNode.resultStackKey || task.source.resultStackKey === sourceNode.resultStackKey);
}

function hasActiveSourceTasks(tasks: GenerationTask[], sourceNode: ExecutableBoardNode): boolean {
  return tasks.some(task => isSourceStackTask(task, sourceNode) && (task.status === "pending" || task.status === "processing"));
}

function nextSourceNodeStatus(
  items: StorageItem[],
  tasks: GenerationTask[],
  sourceNode: ExecutableBoardNode,
  itemStatus: StorageItem["status"],
): BoardGenerationStatus {
  if (hasActiveSourceItems(items, sourceNode) || hasActiveSourceTasks(tasks, sourceNode)) return "processing";
  if (items.some(item => isSourceStackItem(item, sourceNode) && item.status === "complete")) return "complete";
  return itemStatus === "failed" ? "failed" : "complete";
}

function activeSourceTaskForNode(tasks: GenerationTask[], sourceNode: ExecutableBoardNode): GenerationTask | undefined {
  return tasks
    .filter(task => isSourceStackTask(task, sourceNode) && (task.status === "pending" || task.status === "processing"))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
}

function resultStackKeyForConfig({
  edges,
  kind,
  model,
  nodeId,
  sizeKey,
}: {
  edges: BoardDocument["edges"];
  kind: ExecutableBoardNode["kind"];
  model: string;
  nodeId: string;
  sizeKey: string;
}): string {
  const wiringKey = edges
    .filter(edge => edge.to.nodeId === nodeId && (edge.to.portId === BOARD_PORT_IDS.promptIn || edge.to.portId === BOARD_PORT_IDS.referenceIn))
    .map(edge => `${edge.kind}:${edge.from.nodeId}:${edge.from.portId}>${edge.to.nodeId}:${edge.to.portId}`)
    .sort()
    .join(",");
  return `${kind}|${model}|${sizeKey}|${wiringKey}`;
}

function resultStackKeyForNode(node: ExecutableBoardNode, edges: BoardDocument["edges"]): string {
  const sizeKey = node.kind === "image-generate"
    ? `${node.aspectRatio}|${node.imageResolution}|${node.customImageResolution}`
      : node.kind === "video-generate"
        ? `${node.aspectRatio}|${node.videoResolution ?? ""}`
        : node.kind === "audio-operation"
          ? `${node.audioMode}|${node.audioFormat}|${node.voiceCloneConsentAccepted === true ? "clone-consent" : ""}|${node.voiceProfileId ?? ""}`
      : `${node.targetType}|${node.outputType}|${node.targetId}|${node.bindings.map(binding => [
        binding.nodeId,
        binding.fieldName,
        binding.source,
        binding.deliveryMode,
        binding.valueType ?? "",
        binding.enabled === false ? "off" : "on",
        binding.required === true ? "required" : "",
        binding.referenceIndex ?? "",
        binding.referenceType ?? "",
        binding.value,
      ].join(":")).join(",")}`;
  return resultStackKeyForConfig({
    edges,
    kind: node.kind,
    model: node.kind === "runninghub-app" ? runningHubAppModelValue(node) : node.model,
    nodeId: node.id,
    sizeKey,
  });
}

function patchInputEdgesForNode(
  patch: AgentBoardPatch,
  generatedNodeId: string,
  tempToRealIds: Map<string, string>,
): BoardDocument["edges"] {
  return patch.operations
    .filter((operation): operation is AgentBoardPatchOperation & { op: "connect_ports" } => operation.op === "connect_ports")
    .filter(operation => {
      const targetNodeId = resolvePatchNodeId(operation.to.nodeId, tempToRealIds);
      return targetNodeId === generatedNodeId && (operation.to.portId === BOARD_PORT_IDS.promptIn || operation.to.portId === BOARD_PORT_IDS.referenceIn);
    })
    .map((operation, index) => {
      const toPortId = operation.to.portId;
      return {
        id: `patch-edge-${index}`,
        kind: toPortId === BOARD_PORT_IDS.promptIn ? "prompt" : "reference",
        from: resolvePatchPortRef(operation.from, tempToRealIds),
        to: resolvePatchPortRef(operation.to, tempToRealIds),
        createdAt: "",
      };
    });
}

function patchGenerateNodeForStackKey(operation: AgentBoardPatchCreateNodeOperation, generatedNodeId: string): GenerateBoardNode {
  const previewNode = createPreviewBoardNode(operation, 0);
  if (!isGenerateBoardNode(previewNode)) {
    throw new Error("画板补丁运行目标不是生成节点");
  }
  return { ...previewNode, id: generatedNodeId };
}

function appendResultAssetId(node: ExecutableBoardNode, assetId: string): string[] {
  const current = node.resultAssetIds ?? (node.resultAssetId ? [node.resultAssetId] : []);
  return current.includes(assetId) ? current : [...current, assetId];
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function pruneUnavailableGenerateResultAssets(
  node: GenerateBoardNode,
  availableAssetIds: ReadonlySet<string>,
): BoardGenerateNodeUpdate | null {
  const currentIds = node.resultAssetIds ?? (node.resultAssetId ? [node.resultAssetId] : []);
  const nextIds = currentIds.filter(id => availableAssetIds.has(id));
  const nextActiveId = node.resultAssetId && nextIds.includes(node.resultAssetId)
    ? node.resultAssetId
    : nextIds[nextIds.length - 1];
  const update: BoardGenerateNodeUpdate = {};
  if (!sameStringList(currentIds, nextIds)) update.resultAssetIds = nextIds;
  if (node.resultAssetId !== nextActiveId) update.resultAssetId = nextActiveId;
  return hasGenerateNodeUpdate(update) ? update : null;
}

function pruneUnavailableRunningHubResultAssets(
  node: BoardRunningHubAppNode,
  availableAssetIds: ReadonlySet<string>,
): BoardRunningHubAppNodeUpdate | null {
  const currentIds = node.resultAssetIds ?? (node.resultAssetId ? [node.resultAssetId] : []);
  const nextIds = currentIds.filter(id => availableAssetIds.has(id));
  const nextActiveId = node.resultAssetId && nextIds.includes(node.resultAssetId)
    ? node.resultAssetId
    : nextIds[nextIds.length - 1];
  const update: BoardRunningHubAppNodeUpdate = {};
  if (!sameStringList(currentIds, nextIds)) update.resultAssetIds = nextIds;
  if (node.resultAssetId !== nextActiveId) update.resultAssetId = nextActiveId;
  return Object.keys(update).length > 0 ? update : null;
}

function sourceStackResultAssetIds(items: StorageItem[], sourceNode: ExecutableBoardNode, activeAssetId: string): string[] {
  const completedIds = items
    .filter(item => item.type !== "transcript" && isSourceStackItem(item, sourceNode) && item.status === "complete")
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map(item => item.id);
  return completedIds.includes(activeAssetId) ? completedIds : appendResultAssetId(sourceNode, activeAssetId);
}

function boardRoute(id: string): string {
  return id === DEFAULT_BOARD_ID ? "/board" : `/board?boardId=${encodeURIComponent(id)}`;
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
  const [resolvedBoardId, setResolvedBoardId] = useState(boardId);
  useEffect(() => {
    const queryBoardId = new URLSearchParams(window.location.search).get("boardId");
    const nextBoardId = boardId !== DEFAULT_BOARD_ID ? boardId : queryBoardId?.trim() || DEFAULT_BOARD_ID;
    if (nextBoardId === resolvedBoardId) return;
    const frame = window.requestAnimationFrame(() => setResolvedBoardId(nextBoardId));
    return () => window.cancelAnimationFrame(frame);
  }, [boardId, resolvedBoardId]);
  const boardController = useBoardState(resolvedBoardId);
  const {
    items,
    isCurrentScopeLoaded: isBoardAssetScopeLoaded,
    loading: boardAssetsLoading,
    reload: reloadBoardAssets,
    setItems,
  } = useBoardAssetStore(resolvedBoardId, boardController.board.nodes);
  const updateBoardAssetReferenceUrls = boardController.updateAssetReferenceUrls;
  const { generationTasks, setGenerationTasks } = useGenerationTaskStore({ boardId: resolvedBoardId });
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
  const [selectedVideoReferenceMode, setSelectedVideoReferenceMode] = useState<VideoReferenceMode>("reference");
  const [videoResolution, setVideoResolution] = useState("720p");
  const [customImageSize] = useState("2560x1440");
  const [agentInput, setAgentInput] = useState("");
  const [isAgentDockOpen, setIsAgentDockOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [renameDialogDraft, setRenameDialogDraft] = useState<string | null>(null);

  const [, setIsOptimizing] = useState(false);
  const [imageSubmitCount, setImageSubmitCount] = useState(0);
  const [, setVideoSubmitCount] = useState(0);
  const [, setAudioSubmitCount] = useState(0);
  const [workspaceNotices, setWorkspaceNotices] = useState<WorkspaceNotice[]>([]);
  const [isMaskOpen, setIsMaskOpen] = useState(false);
  const [maskTargetUrl, setMaskTargetUrl] = useState("");
  const [maskTargetId, setMaskTargetId] = useState("");
  const [maskDestination, setMaskDestination] = useState<MaskDestination>("creative");
  const [maskSourceNodeId, setMaskSourceNodeId] = useState<string | null>(null);
  const [maskEditOperation, setMaskEditOperation] = useState<ImageEditFeature | undefined>(undefined);
  const [maskEditSourceItem, setMaskEditSourceItem] = useState<StorageItem | null>(null);
  const [fullscreenItem, setFullscreenItem] = useState<StorageItem | null>(null);
  const [panoramaItem, setPanoramaItem] = useState<StorageItem | null>(null);
  const [voiceProfileSourceItem, setVoiceProfileSourceItem] = useState<StorageItem | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const focusNodeSeqRef = useRef(0);
  const [focusNodeRequest, setFocusNodeRequest] = useState<{ nodeId: string; seq: number } | null>(null);
  const requestFocusNode = useCallback((nodeId: string) => {
    focusNodeSeqRef.current += 1;
    setFocusNodeRequest({ nodeId, seq: focusNodeSeqRef.current });
  }, []);
  const [assetCompareRequest, setAssetCompareRequest] = useState<{ originalUrl: string; resultUrl: string } | null>(null);
  const [cancelingBoardItemIds, setCancelingBoardItemIds] = useState<string[]>([]);
  const handledBoardItemIdsRef = useRef<Set<string>>(new Set());
  const handledBoardTaskIdsRef = useRef<Set<string>>(new Set());
  const pollingFailuresRef = useRef<Record<string, number>>({});
  const generationAbortControllersRef = useRef<Record<string, AbortController>>({});
  const locallyCanceledItemIdsRef = useRef<Set<string>>(new Set());
  const workspaceNoticeSequenceRef = useRef(0);
  const confirmAction = useConfirm();

  const dismissWorkspaceNotice = useCallback((id: string) => {
    setWorkspaceNotices(prev => prev.filter(notice => notice.id !== id));
  }, []);

  const pushWorkspaceNotice = useCallback((type: NoticeType, message: string) => {
    workspaceNoticeSequenceRef.current += 1;
    const id = `${makeClientId("notice")}_${workspaceNoticeSequenceRef.current}`;
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

  useEffect(() => {
    const legacyItemsById = new Map<string, StorageItem>();
    for (const node of boardController.board.nodes) {
      if (node.kind === "asset" && isLargeBoardDataUrl(node.asset.url)) {
        legacyItemsById.set(
          node.asset.assetId,
          boardMediaReferenceToStorageItem(node.asset, node.createdAt, resolvedBoardId, node.id, node.resultStackKey),
        );
      } else if (node.kind === "result" && isLargeBoardDataUrl(node.asset.url)) {
        legacyItemsById.set(
          node.asset.assetId,
          boardMediaReferenceToStorageItem(node.asset, node.createdAt, resolvedBoardId, node.sourceNodeId, node.resultStackKey),
        );
      } else if (node.kind === "reference-group") {
        for (const reference of node.references) {
          if (isLargeBoardDataUrl(reference.url)) {
            legacyItemsById.set(
              reference.assetId,
              boardMediaReferenceToStorageItem(reference, node.createdAt, resolvedBoardId),
            );
          }
        }
      }
    }
    if (legacyItemsById.size === 0) return;

    let isActive = true;
    void (async () => {
      const previewItems: StorageItem[] = [];
      const updates: Array<{ assetId: string; url: string }> = [];
      for (const item of legacyItemsById.values()) {
        const previewItem = await saveItemWithPreview(item);
        if (!isActive) return;
        if (!previewItem.url.trim()) continue;
        previewItems.push(previewItem);
        updates.push({ assetId: previewItem.id, url: previewItem.url });
      }
      if (!isActive || updates.length === 0) return;
      setItems(prev => [
        ...previewItems,
        ...prev.filter(item => !previewItems.some(previewItem => previewItem.id === item.id)),
      ]);
      boardController.updateAssetReferenceUrls(updates);
    })().catch(error => {
      if (isActive) pushWorkspaceNotice("error", toErrorMessage(error, "旧画板媒体预览迁移失败"));
    });

    return () => {
      isActive = false;
    };
  }, [
    boardController.board.nodes,
    boardController.updateAssetReferenceUrls,
    pushWorkspaceNotice,
    resolvedBoardId,
    setItems,
  ]);

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
  }, [providerKeys, selectedModel, selectedProvider, selectedVideoModel]);

  const handleSaveVoiceProfileFromAsset = useCallback(async (input: SaveVoiceProfileDialogInput): Promise<void> => {
    if (!voiceProfileSourceItem) return;
    await saveClonedVoiceProfileFromAsset(voiceProfileSourceItem, {
      ...input,
      fallbackProvider: selectedProvider,
    });
    pushWorkspaceNotice("success", "已保存克隆音色");
  }, [pushWorkspaceNotice, selectedProvider, voiceProfileSourceItem]);

  const imageCapabilities = getImageModelCapabilities(selectedModel);
  const videoCapabilities = getVideoModelCapabilities(selectedVideoModel);
  const audioCapabilities = getAudioModelCapabilities(DEFAULT_AUDIO_MODEL);
  const selectedImageProviderModel = tryParseProviderModel(selectedModel, selectedProvider) ?? {
    provider: selectedProvider,
    model: selectedModel,
    async: false,
  };
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
  const activeVideoReferenceMode = videoCapabilities.referenceModes.includes(selectedVideoReferenceMode)
    ? selectedVideoReferenceMode
    : videoCapabilities.referenceMode;

  const fetchRunningHubAppSchema = useCallback(async (webappId: string): Promise<BoardRunningHubAppSchemaResult> => {
    const response = await fetch("/api/runninghub/ai-app-schema", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildProviderHeaders("runninghub"),
      },
      body: JSON.stringify({ webappId }),
    });
    if (!response.ok) throw new Error(await readFetchError(response, "RunningHub 应用字段读取失败"));
    const data = await response.json() as unknown;
    const schema = readRunningHubAppSchemaResult(data);
    return {
      bindings: parseRunningHubBindingsFromJsonText(JSON.stringify({ nodeInfoList: schema.nodeInfoList })),
      name: schema.name,
      webappId: schema.webappId || webappId,
    };
  }, [buildProviderHeaders]);

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
    audioReferenceLimit: audioCapabilities.maxReferenceMedia,
    audioReferenceMediaTypes: audioCapabilities.referenceMediaTypes,
    imageReferenceLimit: imageCapabilities.maxReferenceImages,
    imageReferenceMediaTypes: imageCapabilities.referenceMediaTypes,
    prompt,
    videoReferenceLimit: videoCapabilities.maxReferenceImages,
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
  const activeImageModel = imageSubmitCount > 0 && canUseBackgroundImageGeneration
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

  const { searchableReferenceImages } = useAssetWorkspaceState(items);
  const resolveBoardReferenceUrl = useCallback<BoardReferenceUrlResolver>((assetId, fallbackUrl) => {
    const item = items.find(entry => entry.id === assetId);
    return item && item.status === "complete" && item.url.trim() ? item.url : fallbackUrl;
  }, [items]);
  const resolveOriginalStorageItem = useCallback(async (item: StorageItem): Promise<StorageItem> => {
    const storedItem = items.find(entry => entry.id === item.id) ?? item;
    const originalUrl = await resolveAssetOriginalUrl(storedItem);
    if (!originalUrl.trim()) {
      throw new Error("找不到原始媒体");
    }
    return { ...storedItem, url: originalUrl };
  }, [items]);
  const handleOpenFullscreen = useCallback((item: StorageItem | null) => {
    if (!item) {
      setFullscreenItem(null);
      return;
    }
    void resolveOriginalStorageItem(item).then(
      setFullscreenItem,
      error => pushWorkspaceNotice("error", toErrorMessage(error, "原始媒体读取失败")),
    );
  }, [pushWorkspaceNotice, resolveOriginalStorageItem]);
  const handleOpenPanorama = useCallback((item: StorageItem) => {
    void resolveOriginalStorageItem(item).then(
      setPanoramaItem,
      error => pushWorkspaceNotice("error", toErrorMessage(error, "原始图片读取失败")),
    );
  }, [pushWorkspaceNotice, resolveOriginalStorageItem]);
  const handleDownloadAsset = useCallback((item: StorageItem) => {
    void resolveOriginalStorageItem(item).then(
      originalItem => {
        const link = document.createElement("a");
        const extension = boardAssetDownloadExtension(originalItem);
        link.href = originalItem.url;
        link.download = `${originalItem.id}.${extension}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, "原始媒体下载失败")),
    );
  }, [pushWorkspaceNotice, resolveOriginalStorageItem]);
  const resolveOriginalReferences = useCallback(async (references: ReferenceImageRef[]): Promise<ReferenceImageRef[]> => {
    return Promise.all(references.map(async reference => {
      const item = items.find(entry => entry.id === reference.id);
      const originalUrl = item ? await resolveAssetOriginalUrl(item) : reference.url;
      if (!originalUrl.trim()) {
        throw new Error("找不到参考媒体原图");
      }
      return { ...reference, url: originalUrl };
    }));
  }, [items]);
  void handleImageUpload;
  void handleReferenceDropAsset;
  void handleReferenceDropFiles;
  void handleSelectPromptReference;
  void removeReferenceImage;
  void toggleReferenceRole;

  const renderAgentAtDropdown = useCallback(() => {
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
      scope: "board",
      boardId: resolvedBoardId,
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
          handleSelectAtItem(item.url, item.id, "agent-prompt", item.type);
        }}
      />
    );
  }, [agentReferences, atDropdown.search, handleSelectAtItem, resolvedBoardId, searchableReferenceImages]);

  useEffect(() => {
    handledBoardItemIdsRef.current.clear();
    handledBoardTaskIdsRef.current.clear();
  }, [resolvedBoardId]);

  useEffect(() => {
    void reloadBoardAssets();
  }, [reloadBoardAssets, resolvedBoardId]);

  useEffect(() => {
    const videoPreviewUpdates = items
      .filter(item => item.type === "video" && item.url.startsWith("data:image/"))
      .map(item => ({ assetId: item.id, url: item.url }));
    updateBoardAssetReferenceUrls(videoPreviewUpdates);
  }, [items, updateBoardAssetReferenceUrls]);

  useEffect(() => {
    if (boardController.saveStatus === "loading") return;
    if (boardAssetsLoading) return;
    if (!isBoardAssetScopeLoaded) return;
    const availableAssetIds = new Set(items.map(item => item.id));
    for (const node of boardController.board.nodes) {
      if (isGenerateBoardNode(node)) {
        const update = pruneUnavailableGenerateResultAssets(node, availableAssetIds);
        if (update) boardController.updateGenerateNode(node.id, update);
      }
      if (node.kind === "runninghub-app") {
        const update = pruneUnavailableRunningHubResultAssets(node, availableAssetIds);
        if (update) boardController.updateRunningHubAppNode(node.id, update);
      }
    }
  }, [boardAssetsLoading, boardController, isBoardAssetScopeLoaded, items]);

  useMediaPolling({
    buildProviderHeaders,
    generationTasks,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    setGenerationTasks,
    setItems,
  });

  const { generateManualAudio, generateManualImage, generateManualVideo } = useGenerationActions({
    boardId: resolvedBoardId,
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
    videoReferenceLimit: videoCapabilities.maxReferenceImages,
    videoReferenceMode: activeVideoReferenceMode,
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
    if (!capabilities.referenceModes.includes(selectedVideoReferenceMode)) {
      setSelectedVideoReferenceMode(capabilities.referenceMode);
    }
  }, [aspectRatio, selectedVideoReferenceMode, videoDuration, videoPreset, videoResolution]);

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

  const launchMaskEditor = useCallback((
    imageUrl: string,
    id: string,
    destination: MaskDestination = "creative",
    sourceNodeId?: string,
    operation?: ImageEditFeature,
    sourceItem?: StorageItem,
  ) => {
    setMaskTargetUrl(imageUrl);
    setMaskTargetId(id);
    setMaskDestination(destination);
    setMaskSourceNodeId(sourceNodeId ?? null);
    setMaskEditOperation(operation);
    setMaskEditSourceItem(sourceItem ?? null);
    setIsMaskOpen(true);
  }, []);

  async function saveBoardQuickEditAsset(
    sourceNodeId: string,
    sourceTitle: string,
    sourcePosition: BoardPoint,
    sourceSize: { width: number; height: number },
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    imageUrl: string,
    model: string,
    editPrompt: string,
  ) {
    const label = IMAGE_EDIT_LABELS[operation];
    const editedItem = buildStorageItem(
      {
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
        sourceBoardNodeId: sourceNodeId,
      },
      { boardId: resolvedBoardId },
    );
    const savedEditedItem = await saveItemOrWarn(editedItem, pushWorkspaceNotice);
    if (!savedEditedItem) return;
    setItems(prev => [savedEditedItem, ...prev]);
    const editedNodeId = boardController.addAssetNode({
      asset: storageItemToBoardAssetReference(savedEditedItem),
      title: `${sourceTitle} ${label}`,
      position: {
        x: sourcePosition.x + sourceSize.width + 40,
        y: sourcePosition.y,
      },
    });
    boardController.selectNode(editedNodeId);
    boardController.selectEdge(null);
    pushWorkspaceNotice("success", `${label}完成，已保存为新画板资产`);
  }

  async function runBoardImageQuickEdit(
    sourceNodeId: string,
    sourceTitle: string,
    sourcePosition: BoardPoint,
    sourceSize: { width: number; height: number },
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    editImageUrl: string,
    maskUrl: string | undefined,
    editPrompt: string,
  ) {
    const label = IMAGE_EDIT_LABELS[operation];
    const model = imageEditFeatureModels[operation];
    try {
      const image = await prepareReferenceImageUrlForRequest(editImageUrl);
      const mask = maskUrl ? await prepareReferenceImageUrlForRequest(maskUrl) : undefined;
      const response = await fetch("/api/image/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildProviderHeaders(model) },
        body: JSON.stringify({
          operation,
          model,
          image,
          mask,
          prompt: editPrompt,
          imageResolution: "auto",
        }),
      });
      if (!response.ok) throw new Error(await readFetchError(response, `${label}失败`));
      const payload = await readImageGenerationPayload(response);
      if (!payload.imageUrl) throw new Error("图片编辑接口没有返回图片");
      await saveBoardQuickEditAsset(
        sourceNodeId,
        sourceTitle,
        sourcePosition,
        sourceSize,
        sourceItem,
        operation,
        payload.imageUrl,
        model,
        editPrompt,
      );
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, `${label}失败`));
    }
  }

  const saveMaskOutput = async (output: CanvasMaskEditorOutput) => {
    if (output.operation && maskEditSourceItem && maskSourceNodeId) {
      const sourceNode = boardController.board.nodes.find(node => node.id === maskSourceNodeId);
      if (!sourceNode || (sourceNode.kind !== "asset" && sourceNode.kind !== "result")) {
        pushWorkspaceNotice("error", "未找到要编辑的图片节点");
        return;
      }
      await runBoardImageQuickEdit(
        sourceNode.id,
        sourceNode.title,
        sourceNode.position,
        sourceNode.size,
        maskEditSourceItem,
        output.operation,
        output.imageBase64,
        output.maskBase64,
        output.prompt,
      );
      setIsMaskOpen(false);
      setMaskEditOperation(undefined);
      setMaskEditSourceItem(null);
      setMaskSourceNodeId(null);
      return;
    }

    let compressedMergedImage: string;
    try {
      compressedMergedImage = await compressReferenceImageDataUrl(output.mergedImageBase64);
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
    } else if (maskDestination === "board-asset") {
      const sourceNode = maskSourceNodeId
        ? boardController.board.nodes.find(node => node.id === maskSourceNodeId)
        : undefined;
      if (sourceNode?.kind !== "asset" || sourceNode.asset.type !== "image") {
        pushWorkspaceNotice("error", "未找到要编辑的图片资产节点");
        return;
      }
      const editedTitle = `${sourceNode.title} 局部编辑`;
      const editedPrompt = sourceNode.asset.prompt.trim()
        ? `${sourceNode.asset.prompt}\n局部编辑：${sourceNode.title}`
        : editedTitle;
      const editedItem = buildStorageItem(
        {
          id: makeClientId("img_edit"),
          type: "image",
          url: compressedMergedImage,
          prompt: editedPrompt,
          model: sourceNode.asset.model,
          aspectRatio: "auto",
          createdAt: new Date().toISOString(),
          status: "complete",
          progress: 100,
          maskOriginalId: sourceNode.asset.assetId,
        },
        { boardId: resolvedBoardId },
      );
      const savedEditedItem = await saveItemOrWarn(editedItem, pushWorkspaceNotice);
      if (!savedEditedItem) return;
      setItems(prev => [savedEditedItem, ...prev]);
      const editedNodeId = boardController.addAssetNode({
        asset: storageItemToBoardAssetReference(savedEditedItem),
        title: editedTitle,
        position: {
          x: sourceNode.position.x + sourceNode.size.width + 40,
          y: sourceNode.position.y,
        },
      });
      boardController.selectNode(editedNodeId);
      boardController.selectEdge(null);
    } else {
      setReferenceImage(compressedMergedImage);
      setReferenceImages([{ id: nextReferenceId, url: compressedMergedImage, role: "general" }]);
      setPrompt(prev => `In the marked region of the image, change: ${prev || "[输入你的新修改构想...]"}`);
      handleSelectImageModel("12ai:gpt-image-2");
      setMode("image");
    }
    setIsMaskOpen(false);
    setMaskEditOperation(undefined);
    setMaskEditSourceItem(null);
    setMaskSourceNodeId(null);
    pushWorkspaceNotice(
      "success",
      maskDestination === "agent"
        ? "蒙版已应用到 Agent 参考图，可在对话中继续描述修改"
        : maskDestination === "board-asset"
          ? "已生成局部编辑资产节点"
          : "蒙版已写入参考图，可继续编辑提示词并生成",
    );
  };

  const buildAgentBoardContext = useCallback((): AgentBoardContext => {
    flushAllBoardText();
    return {
      boardId: boardController.board.id,
      title: boardController.board.title,
      selectedNodeId: boardController.selectedNodeId,
      selectedEdgeId: boardController.selectedEdgeId,
      nodes: boardController.board.nodes.slice(0, 60).map(node => summarizeBoardNodeForAgent(node, getBoardTextDraft(node.id))),
      edges: boardController.board.edges.slice(0, 100).map(edge => ({
        id: edge.id,
        kind: edge.kind,
        from: edge.from,
        to: edge.to,
      })),
    };
  }, [
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
  }): Promise<BoardAgentActionResult> => {
    if (isAgentBoardPatchAction(action)) {
      const patch = action.params?.boardPatch;
      if (!patch) {
        pushWorkspaceNotice("error", "Agent 画板补丁缺少操作");
        return handledBoardAction(false);
      }
      flushAllBoardText();
      try {
        validateBoardPatch(patch, boardController.board.nodes);
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, "Agent 画板补丁无效"));
        return handledBoardAction(false);
      }

      const tempToRealIds = new Map<string, string>();
      const runQueue: Array<{ id: string; operation: AgentBoardPatchCreateNodeOperation }> = [];
      boardController.beginUndoGesture();
      try {
        patch.operations.forEach(operation => {
          if (operation.op === "create_node") {
            let nodeId: string;
            if (operation.kind === "prompt") {
              nodeId = boardController.addPromptNode({
                title: operation.title,
                prompt: operation.prompt,
                position: operation.position,
              });
            } else if (operation.kind === "note") {
              nodeId = boardController.addNoteNode({
                title: operation.title,
                body: operation.body ?? operation.prompt,
                position: operation.position,
              });
            } else if (operation.kind === "agent") {
              nodeId = boardController.addAgentNode({
                title: operation.title,
                instruction: operation.instruction ?? operation.prompt,
                position: operation.position,
              });
            } else if (operation.kind === "image-generate") {
              const model = operation.model ?? DEFAULT_IMAGE_MODEL;
              nodeId = boardController.addGenerateNode({
                kind: operation.kind,
                title: operation.title,
                position: operation.position,
                prompt: operation.prompt,
                model,
                ...imageActionDefaults(model, operation.aspectRatio),
                ...(operation.aspectRatio ? { aspectRatio: operation.aspectRatio } : {}),
                ...(operation.imageResolution ? { imageResolution: operation.imageResolution } : {}),
                ...(operation.imageQuality ? { imageQuality: operation.imageQuality } : {}),
                ...(operation.thinkingLevel ? { thinkingLevel: operation.thinkingLevel } : {}),
              });
            } else if (operation.kind === "video-generate") {
              const model = operation.model ?? DEFAULT_VIDEO_MODEL;
              nodeId = boardController.addGenerateNode({
                kind: operation.kind,
                title: operation.title,
                position: operation.position,
                prompt: operation.prompt,
                model,
                ...videoActionDefaults(model, operation.aspectRatio),
                ...(operation.aspectRatio ? { aspectRatio: operation.aspectRatio } : {}),
                ...(operation.videoResolution ? { videoResolution: operation.videoResolution } : {}),
                ...(operation.videoDuration ? { videoDuration: operation.videoDuration } : {}),
                ...(operation.videoPreset ? { videoPreset: operation.videoPreset } : {}),
                ...(operation.videoReferenceMode ? { videoReferenceMode: operation.videoReferenceMode } : {}),
              });
            } else {
              const selection = resolveAudioFunctionSelection({
                fallbackModel: DEFAULT_AUDIO_MODEL,
                mode: operation.audioMode,
                model: operation.model,
              });
              const model = selection.model;
              nodeId = boardController.addGenerateNode({
                kind: operation.kind,
                title: operation.title,
                position: operation.position,
                prompt: operation.prompt,
                model,
                ...audioActionDefaults(model),
                ...(operation.audioFormat ? { audioFormat: operation.audioFormat } : {}),
                audioMode: selection.mode,
                ...(operation.audioStylePrompt ? { audioStylePrompt: operation.audioStylePrompt } : {}),
                ...(operation.asrLanguage ? { asrLanguage: operation.asrLanguage } : {}),
                ...(operation.voiceProfileId ? { voiceProfileId: operation.voiceProfileId } : {}),
                ...(operation.voiceCloneConsentAccepted ? { voiceCloneConsentAccepted: operation.voiceCloneConsentAccepted } : {}),
              });
            }
            tempToRealIds.set(operation.tempId, nodeId);
            if ((patch.run || operation.run) && (operation.kind === "image-generate" || operation.kind === "video-generate" || operation.kind === "audio-operation")) {
              runQueue.push({ id: nodeId, operation });
            }
            return;
          }
          if (operation.op === "update_node") {
            const nodeId = resolvePatchNodeId(operation.nodeId, tempToRealIds);
            const node = boardController.board.nodes.find(item => item.id === nodeId);
            if (node?.kind === "prompt") {
              boardController.updatePromptNode(nodeId, operation.prompt ?? "");
            } else if (node?.kind === "note") {
              boardController.updateNoteBody(nodeId, operation.body ?? operation.prompt ?? "");
            } else if (node?.kind === "agent") {
              boardController.updateAgentInstruction(nodeId, operation.instruction ?? operation.prompt ?? "");
            } else if (node?.kind === "image-generate" || node?.kind === "video-generate" || node?.kind === "audio-operation") {
              boardController.updateGenerateNode(nodeId, buildGenerateNodeUpdate(node, operation));
            }
            return;
          }
          boardController.connectPorts(
            resolvePatchPortRef(operation.from, tempToRealIds),
            resolvePatchPortRef(operation.to, tempToRealIds),
          );
        });
      } finally {
        boardController.endUndoGesture();
      }

      let runFailureCount = 0;
      for (const item of runQueue) {
        const operation = item.operation;
        const audioSelection = operation.kind === "audio-operation"
          ? resolveAudioFunctionSelection({
            fallbackModel: DEFAULT_AUDIO_MODEL,
            mode: operation.audioMode,
            model: operation.model,
          })
          : null;
        const model = audioSelection?.model ?? operation.model ?? (
          operation.kind === "image-generate" ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL
        );
        const runInputs = resolveBoardPatchRunInputs(
          patch,
          operation,
          item.id,
          tempToRealIds,
          boardController.board.nodes,
          items,
          resolveBoardReferenceUrl,
        );
        const promptValue = runInputs.prompt;
        const runReferences = await resolveOriginalReferences(runInputs.references);
        const isAsrAudioOperation = operation.kind === "audio-operation" && audioSelection?.mode === "asr";
        if (!promptValue && !isAsrAudioOperation) {
          boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "批量生成节点缺少提示词" });
          runFailureCount += 1;
          continue;
        }
        const capability = getModelCapability(model, operation.kind === "image-generate" ? "image" : operation.kind === "video-generate" ? "video" : "audio");
        if (runReferences.length > 0 && !capability.supportsReferences) {
          boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "当前模型不支持参考图输入" });
          runFailureCount += 1;
          continue;
        }
        if (operation.kind === "image-generate") {
          const defaults = imageActionDefaults(model, operation.aspectRatio);
          const resultStackKey = resultStackKeyForNode(
            patchGenerateNodeForStackKey(operation, item.id),
            patchInputEdgesForNode(patch, item.id, tempToRealIds),
          );
          boardController.updateGenerateNode(item.id, {
            status: "processing",
            errorMessage: undefined,
            prompt: promptValue,
            resultStackKey,
          });
          const didStart = await generateManualImage({
            boardId: resolvedBoardId,
            boardNodeId: item.id,
            boardResultStackKey: resultStackKey,
            imageQuality: operation.imageQuality ?? defaults.imageQuality,
            imageResolution: operation.imageResolution ?? defaults.imageResolution,
            isCustomImageResolution: isCustomImageResolutionValue(operation.imageResolution ?? defaults.imageResolution),
            model,
            prompt: promptValue,
            referenceImage: runReferences[0]?.url ?? null,
            referenceImages: runReferences,
            size: operation.aspectRatio ?? defaults.aspectRatio,
            thinkingLevel: operation.thinkingLevel ?? defaults.thinkingLevel,
          });
          if (!didStart) {
            runFailureCount += 1;
            boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "图片生成请求未启动" });
          }
        } else if (operation.kind === "video-generate") {
          const defaults = videoActionDefaults(model, operation.aspectRatio);
          const videoCapability = getVideoModelCapabilities(model);
          if (runReferences.length < videoCapability.minReferenceImages || runReferences.length > videoCapability.maxReferenceImages) {
            runFailureCount += 1;
            boardController.updateGenerateNode(item.id, {
              status: "failed",
              errorMessage: `当前视频模型需要 ${videoCapability.minReferenceImages}-${videoCapability.maxReferenceImages} 张参考图`,
            });
            continue;
          }
          const resultStackKey = resultStackKeyForNode(
            patchGenerateNodeForStackKey(operation, item.id),
            patchInputEdgesForNode(patch, item.id, tempToRealIds),
          );
          boardController.updateGenerateNode(item.id, {
            status: "processing",
            errorMessage: undefined,
            prompt: promptValue,
            resultStackKey,
          });
          const didStart = await generateManualVideo({
            boardId: resolvedBoardId,
            boardNodeId: item.id,
            boardResultStackKey: resultStackKey,
            model,
            prompt: promptValue,
            referenceImage: runReferences[0]?.url ?? null,
            referenceImages: runReferences,
            size: operation.aspectRatio ?? defaults.aspectRatio,
            videoDuration: operation.videoDuration ?? defaults.videoDuration,
            videoPreset: operation.videoPreset ?? defaults.videoPreset,
            videoReferenceMode: operation.videoReferenceMode ?? defaults.videoReferenceMode,
            videoResolution: operation.videoResolution ?? defaults.videoResolution,
          });
          if (!didStart) {
            runFailureCount += 1;
            boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "视频生成请求未启动" });
          }
        } else {
          const defaults = audioActionDefaults(model);
          const audioCapability = getAudioModelCapabilities(model);
          const audioMode = audioSelection?.mode ?? defaults.audioMode;
          const unsupportedAudioReference = runReferences.find(reference => !audioCapability.referenceMediaTypes.includes(getMediaReferenceType(reference)));
          if (unsupportedAudioReference) {
            runFailureCount += 1;
            boardController.updateGenerateNode(item.id, {
              status: "failed",
              errorMessage: `当前音频模型不支持${mediaReferenceLabel(getMediaReferenceType(unsupportedAudioReference))}输入`,
            });
            continue;
          }
          const resultStackKey = resultStackKeyForNode(
            patchGenerateNodeForStackKey(operation, item.id),
            patchInputEdgesForNode(patch, item.id, tempToRealIds),
          );
          boardController.updateGenerateNode(item.id, {
            status: "processing",
            errorMessage: undefined,
            prompt: promptValue,
            resultStackKey,
          });
          if (audioOperationRequiresStylePrompt(audioMode) && !operation.audioStylePrompt?.trim()) {
            const message = "音色设计需要填写音色描述";
            runFailureCount += 1;
            boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: message });
            pushWorkspaceNotice("error", message);
            continue;
          }
          const didStart = await generateManualAudio({
            audioFormat: operation.audioFormat ?? defaults.audioFormat,
            audioMode,
            audioStylePrompt: operation.audioStylePrompt,
            asrLanguage: operation.asrLanguage,
            boardId: resolvedBoardId,
            boardNodeId: item.id,
            boardResultStackKey: resultStackKey,
            model,
            prompt: promptValue,
            referenceImage: runReferences[0]?.url ?? null,
            referenceImages: runReferences,
            voiceCloneConsentAccepted: operation.voiceCloneConsentAccepted,
            voiceProfileId: operation.voiceProfileId,
          });
          if (!didStart) {
            runFailureCount += 1;
            boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "音频生成请求未启动" });
          }
        }
      }

      if (runFailureCount > 0) {
        pushWorkspaceNotice("error", `已应用画板补丁，但 ${runFailureCount} 个生成节点未启动`);
        return handledBoardAction(false);
      }
      pushWorkspaceNotice("success", `已应用画板补丁：${patch.operations.length} 个操作`);
      return handledBoardAction(true);
    }

    if (isAgentImageToVideoAction(action)) {
      const targetNodeId = action.params?.nodeId?.trim() || boardController.selectedNodeId;
      const promptValue = action.params?.prompt?.trim();
      const model = action.params?.model?.trim();
      if (!targetNodeId) {
        pushWorkspaceNotice("error", "请先选中要续接视频的图片节点");
        return handledBoardAction(false);
      }
      if (!promptValue || !model) {
        pushWorkspaceNotice("error", "图生视频续接缺少视频提示词或模型");
        return handledBoardAction(false);
      }
      const sourceNode = boardController.board.nodes.find(node => node.id === targetNodeId);
      if (!sourceNode) {
        pushWorkspaceNotice("error", "未找到要续接视频的来源节点");
        return handledBoardAction(false);
      }
      const sourceReference = sourceNode.kind === "asset" && sourceNode.asset.type === "image"
        ? {
          assetId: sourceNode.asset.assetId,
          model: sourceNode.asset.model,
          prompt: sourceNode.asset.prompt,
          url: resolveBoardReferenceUrl(sourceNode.asset.assetId, sourceNode.asset.url),
        }
        : sourceNode.kind === "image-generate"
          ? (() => {
            const item = activeExecutableResultItem(boardController.board.nodes, sourceNode, items);
            if (item?.type !== "image") return null;
            return item
              ? { assetId: item.id, model: item.model, prompt: item.prompt, url: resolveBoardReferenceUrl(item.id, item.url) }
              : null;
          })()
          : null;
      if (!sourceReference) {
        pushWorkspaceNotice("error", "来源节点没有可用的完成图片资产");
        return handledBoardAction(false);
      }
      const defaults = videoActionDefaults(model, action.params?.aspectRatio);
      const capability = getModelCapability(model, "video");
      if (!capability.supportsReferences) {
        pushWorkspaceNotice("error", "当前视频模型不支持参考图续接");
        return handledBoardAction(false);
      }
      const videoCapability = getVideoModelCapabilities(model);
      if (videoCapability.minReferenceImages > 1 || videoCapability.maxReferenceImages < 1) {
        pushWorkspaceNotice("error", `当前视频模型需要 ${videoCapability.minReferenceImages}-${videoCapability.maxReferenceImages} 张参考图`);
        return handledBoardAction(false);
      }

      const sourcePosition = sourceNode.position;
      boardController.beginUndoGesture();
      let assetNodeId = sourceNode.kind === "asset"
        ? sourceNode.id
        : findBoardAssetNodeByAssetId(boardController.board.nodes, sourceReference.assetId)?.id ?? "";
      let videoNodeId = "";
      try {
        if (!assetNodeId) {
          assetNodeId = boardController.addAssetNode({
            asset: {
              assetId: sourceReference.assetId,
              type: "image",
              model: sourceReference.model,
              prompt: sourceReference.prompt,
              url: sourceReference.url,
            },
            position: { x: sourcePosition.x + 360, y: sourcePosition.y + 220 },
          });
          boardController.connectPorts(
            { nodeId: sourceNode.id, portId: BOARD_PORT_IDS.resultOut, portKind: "result" },
            { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" },
          );
        } else if (sourceNode.kind === "image-generate") {
          boardController.connectPorts(
            { nodeId: sourceNode.id, portId: BOARD_PORT_IDS.resultOut, portKind: "result" },
            { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" },
          );
        }
        videoNodeId = boardController.addGenerateNode({
          kind: "video-generate",
          title: action.params?.title ?? "Image to Video",
          prompt: promptValue,
          model,
          position: { x: sourcePosition.x + 720, y: sourcePosition.y },
          ...defaults,
          ...(action.params?.aspectRatio ? { aspectRatio: action.params.aspectRatio } : {}),
          ...(action.params?.videoResolution ? { videoResolution: action.params.videoResolution } : {}),
          ...(action.params?.videoDuration ? { videoDuration: action.params.videoDuration } : {}),
          ...(action.params?.videoPreset ? { videoPreset: action.params.videoPreset } : {}),
          ...(action.params?.videoReferenceMode ? { videoReferenceMode: action.params.videoReferenceMode } : {}),
        });
        boardController.connectPorts(
          { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" },
          { nodeId: videoNodeId, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" },
        );
        boardController.selectNode(videoNodeId);
        boardController.selectEdge(null);
      } finally {
        boardController.endUndoGesture();
      }
      if (action.params?.run === true) {
        const resultStackKey = resultStackKeyForConfig({
          edges: [{
            id: "image-to-video-reference-edge",
            kind: "reference",
            from: { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" },
            to: { nodeId: videoNodeId, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" },
            createdAt: "",
          }],
          kind: "video-generate",
          model,
          nodeId: videoNodeId,
          sizeKey: `${action.params.aspectRatio ?? defaults.aspectRatio}|${action.params.videoResolution ?? defaults.videoResolution ?? ""}`,
        });
        boardController.updateGenerateNode(videoNodeId, { status: "processing", errorMessage: undefined, resultStackKey });
        const reference = { id: sourceReference.assetId, url: sourceReference.url, role: "general" as const };
        const didStart = await generateManualVideo({
          boardId: resolvedBoardId,
          boardNodeId: videoNodeId,
          boardResultStackKey: resultStackKey,
          model,
          prompt: promptValue,
          referenceImage: reference.url,
          referenceImages: [reference],
          size: action.params.aspectRatio ?? defaults.aspectRatio,
          videoDuration: action.params.videoDuration ?? defaults.videoDuration,
          videoPreset: action.params.videoPreset ?? defaults.videoPreset,
          videoReferenceMode: action.params.videoReferenceMode ?? defaults.videoReferenceMode,
          videoResolution: action.params.videoResolution ?? defaults.videoResolution,
        });
        if (!didStart) {
          boardController.updateGenerateNode(videoNodeId, { status: "failed", errorMessage: "视频生成请求未启动" });
          pushWorkspaceNotice("error", "已创建图生视频节点，但视频生成请求未启动");
          return handledBoardAction(false);
        }
      }
      pushWorkspaceNotice("success", action.params?.run === true ? "已创建并启动图生视频节点" : "已创建图生视频节点");
      return handledBoardAction(true);
    }

    if (isAgentBoardUpdateAction(action)) {
      const targetNodeId = action.params?.nodeId?.trim() || boardController.selectedNodeId;
      if (!targetNodeId) {
        pushWorkspaceNotice("error", "请先选中要更新的画板节点");
        return handledBoardAction(false);
      }
      const node = boardController.board.nodes.find(item => item.id === targetNodeId);
      if (!node) {
        pushWorkspaceNotice("error", "未找到 Agent 要更新的画板节点");
        return handledBoardAction(false);
      }
      if ((node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation") && node.status === "processing") {
        pushWorkspaceNotice("error", "生成中的节点不可直接改参数，请等待完成或取消任务");
        return handledBoardAction(false);
      }

      if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation") {
        flushBoardTextForGenerateNode(boardController.board.nodes, boardController.board.edges, node.id);
      } else {
        flushBoardText([node.id]);
      }

      if (node.kind === "prompt") {
        const prompt = firstTextParam(action.params);
        if (!prompt) {
          pushWorkspaceNotice("error", "Agent 节点更新缺少提示词内容");
          return handledBoardAction(false);
        }
        boardController.beginUndoGesture();
        try {
          boardController.updatePromptNode(node.id, prompt);
        } finally {
          boardController.endUndoGesture();
        }
      } else if (node.kind === "note") {
        const body = firstTextParam(action.params);
        if (!body) {
          pushWorkspaceNotice("error", "Agent 节点更新缺少笔记内容");
          return handledBoardAction(false);
        }
        boardController.beginUndoGesture();
        try {
          boardController.updateNoteBody(node.id, body);
        } finally {
          boardController.endUndoGesture();
        }
      } else if (node.kind === "agent") {
        const instruction = firstTextParam(action.params);
        if (!instruction) {
          pushWorkspaceNotice("error", "Agent 节点更新缺少指令内容");
          return handledBoardAction(false);
        }
        boardController.beginUndoGesture();
        try {
          boardController.updateAgentInstruction(node.id, instruction);
        } finally {
          boardController.endUndoGesture();
        }
      } else if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation") {
        let update: BoardGenerateNodeUpdate;
        try {
          update = buildGenerateNodeUpdate(node, action.params);
        } catch (error) {
          pushWorkspaceNotice("error", toErrorMessage(error, "Agent 生成节点参数无效"));
          return handledBoardAction(false);
        }
        if (!hasGenerateNodeUpdate(update)) {
          pushWorkspaceNotice("error", "Agent 节点更新缺少生成参数");
          return handledBoardAction(false);
        }
        boardController.beginUndoGesture();
        try {
          boardController.updateGenerateNode(node.id, update);
        } finally {
          boardController.endUndoGesture();
        }
      } else {
        pushWorkspaceNotice("error", "Agent 暂不支持更新该类型节点");
        return handledBoardAction(false);
      }
      boardController.selectNode(node.id);
      boardController.selectEdge(null);
      pushWorkspaceNotice("success", "已更新画板节点");
      return handledBoardAction(true);
    }

    if (isAgentBoardNoteAction(action)) {
      const body = action.params?.body?.trim() || action.params?.prompt?.trim();
      if (!body) {
        pushWorkspaceNotice("error", "Agent 画板笔记缺少内容");
        return handledBoardAction(false);
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
      return handledBoardAction(true);
    }

    if (!isAgentGenerateAction(action) && !isAgentBoardFlowAction(action)) return false;

    const promptFromAgent = action.params?.prompt?.trim() ?? "";
    const kind = action.type === "generate_image" || action.type === "create_board_image_flow"
      ? "image-generate"
      : action.type === "generate_video" || action.type === "create_board_video_flow"
        ? "video-generate"
        : "audio-operation";
    const audioSelection = kind === "audio-operation"
      ? resolveAudioFunctionSelection({
        fallbackModel: DEFAULT_AUDIO_MODEL,
        mode: action.params?.audioMode,
        model: action.params?.model,
      })
      : null;
    const model = audioSelection?.model ?? action.params?.model ?? (
      kind === "image-generate" ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL
    );
    const actionRequiresPrompt = kind !== "audio-operation" || !audioSelection || audioOperationRequiresTextInput(audioSelection.mode);
    if (!promptFromAgent && actionRequiresPrompt) {
      pushWorkspaceNotice("error", "Agent 生成动作缺少提示词");
      return handledBoardAction(false);
    }
    if (isPlaceholderRunningHubModel(model)) {
      pushWorkspaceNotice("error", "请先填写真实的 RunningHub webappId 或 workflowId");
      return handledBoardAction(false);
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
      const defaults = {
        ...imageActionDefaults(model, action.params?.aspectRatio),
        ...(action.params?.aspectRatio ? { aspectRatio: action.params.aspectRatio } : {}),
        ...(action.params?.imageResolution ? { imageResolution: action.params.imageResolution } : {}),
        ...(action.params?.imageQuality ? { imageQuality: action.params.imageQuality } : {}),
        ...(action.params?.thinkingLevel ? { thinkingLevel: action.params.thinkingLevel } : {}),
      };
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
        const message = "Agent 选中的图片模型不支持参考媒体输入";
        boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
        pushWorkspaceNotice("error", message);
        return handledBoardAction(false);
      }
      const unsupportedImageReference = references.find(reference => getMediaReferenceType(reference) !== "image");
      if (unsupportedImageReference) {
        const message = `图片生成不支持${mediaReferenceLabel(getMediaReferenceType(unsupportedImageReference))}参考`;
        boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
        pushWorkspaceNotice("error", message);
        return handledBoardAction(false);
      }

      const referenceNodeIds: string[] = [];
      references.forEach((reference, index) => {
        const matchedItem = items.find(item => item.id === reference.id);
        const referenceType = getMediaReferenceType(reference);
        const assetNodeId = boardController.addAssetNode({
          asset: {
            assetId: reference.id,
            model: matchedItem?.model ?? "agent-reference",
            prompt: matchedItem?.prompt ?? "Agent reference",
            type: referenceType,
            url: reference.url,
          },
          position: { x: 120 + index * 140, y: generatePosition.y + 280 },
        });
        referenceNodeIds.push(assetNodeId);
        boardController.connectPorts(
          { nodeId: assetNodeId, portId: "asset-out", portKind: "asset" },
          { nodeId: generateNodeId, portId: "reference-in", portKind: "asset" },
        );
      });

      if (!shouldRun) {
        pushWorkspaceNotice("success", "已创建 Agent 图片生成节点流程");
        return handledBoardAction(true);
      }

      const resultStackKey = resultStackKeyForConfig({
        edges: [
          {
            id: "agent-prompt-edge",
            kind: "prompt",
            from: { nodeId: promptNodeId, portId: BOARD_PORT_IDS.promptOut, portKind: "prompt" },
            to: { nodeId: generateNodeId, portId: BOARD_PORT_IDS.promptIn, portKind: "prompt" },
            createdAt: "",
          },
          ...referenceNodeIds.map((assetNodeId, index) => ({
            id: `agent-reference-edge-${index}`,
            kind: "reference" as const,
            from: { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" as const },
            to: { nodeId: generateNodeId, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" as const },
            createdAt: "",
          })),
        ],
        kind: "image-generate",
        model,
        nodeId: generateNodeId,
        sizeKey: `${defaults.aspectRatio}|${defaults.imageResolution}|${defaults.customImageResolution}`,
      });
      boardController.updateGenerateNode(generateNodeId, { errorMessage: undefined, resultStackKey, status: "processing" });
      const didStart = await generateManualImage({
        boardId: resolvedBoardId,
        boardNodeId: generateNodeId,
        boardResultStackKey: resultStackKey,
        imageQuality: defaults.imageQuality,
        imageResolution: defaults.imageResolution,
        isCustomImageResolution: isCustomImageResolutionValue(defaults.imageResolution),
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
        return handledBoardAction(false);
      }
      return handledBoardAction(true);
    }

    if (kind === "audio-operation") {
      if (!audioSelection) throw new Error("音频功能解析失败");
      const defaults = {
        ...audioActionDefaults(model),
        audioMode: audioSelection.mode,
        ...(action.params?.audioFormat ? { audioFormat: action.params.audioFormat } : {}),
        ...(action.params?.audioStylePrompt ? { audioStylePrompt: action.params.audioStylePrompt } : {}),
        ...(action.params?.asrLanguage ? { asrLanguage: action.params.asrLanguage } : {}),
        ...(action.params?.voiceProfileId ? { voiceProfileId: action.params.voiceProfileId } : {}),
        ...(action.params?.voiceCloneConsentAccepted ? { voiceCloneConsentAccepted: action.params.voiceCloneConsentAccepted } : {}),
      };
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

      const capability = getModelCapability(model, "audio");
      if (references.length > 0 && !capability.supportsReferences) {
        const message = "Agent 选中的音频模型不支持参考媒体输入";
        boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
        pushWorkspaceNotice("error", message);
        return handledBoardAction(false);
      }
      const audioCapability = getAudioModelCapabilities(model);
      const unsupportedAudioReference = references.find(reference => !audioCapability.referenceMediaTypes.includes(getMediaReferenceType(reference)));
      if (unsupportedAudioReference) {
        const message = `当前音频模型不支持${mediaReferenceLabel(getMediaReferenceType(unsupportedAudioReference))}输入`;
        boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
        pushWorkspaceNotice("error", message);
        return handledBoardAction(false);
      }

      const referenceNodeIds: string[] = [];
      references.forEach((reference, index) => {
        const matchedItem = items.find(item => item.id === reference.id);
        const referenceType = getMediaReferenceType(reference);
        const assetNodeId = boardController.addAssetNode({
          asset: {
            assetId: reference.id,
            model: matchedItem?.model ?? "agent-reference",
            prompt: matchedItem?.prompt ?? "Agent reference",
            type: referenceType,
            url: reference.url,
          },
          position: { x: 120 + index * 140, y: generatePosition.y + 280 },
        });
        referenceNodeIds.push(assetNodeId);
        boardController.connectPorts(
          { nodeId: assetNodeId, portId: "asset-out", portKind: "asset" },
          { nodeId: generateNodeId, portId: "reference-in", portKind: "asset" },
        );
      });

      if (!shouldRun) {
        pushWorkspaceNotice("success", "已创建 Agent 音频生成节点流程");
        return handledBoardAction(true);
      }

      const resultStackKey = resultStackKeyForConfig({
        edges: [
          {
            id: "agent-prompt-edge",
            kind: "prompt",
            from: { nodeId: promptNodeId, portId: BOARD_PORT_IDS.promptOut, portKind: "prompt" },
            to: { nodeId: generateNodeId, portId: BOARD_PORT_IDS.promptIn, portKind: "prompt" },
            createdAt: "",
          },
          ...referenceNodeIds.map((assetNodeId, index) => ({
            id: `agent-reference-edge-${index}`,
            kind: "reference" as const,
            from: { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" as const },
            to: { nodeId: generateNodeId, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" as const },
            createdAt: "",
          })),
        ],
        kind: "audio-operation",
        model,
        nodeId: generateNodeId,
        sizeKey: `${defaults.audioMode}|${defaults.audioFormat}|${defaults.asrLanguage ?? ""}|${defaults.voiceCloneConsentAccepted === true ? "clone-consent" : ""}|${defaults.voiceProfileId ?? ""}`,
      });
      boardController.updateGenerateNode(generateNodeId, { errorMessage: undefined, resultStackKey, status: "processing" });
      const didStart = await generateManualAudio({
        audioFormat: defaults.audioFormat,
        audioMode: defaults.audioMode,
        audioStylePrompt: defaults.audioStylePrompt,
        asrLanguage: defaults.asrLanguage,
        boardId: resolvedBoardId,
        boardNodeId: generateNodeId,
        boardResultStackKey: resultStackKey,
        model,
        prompt: promptFromAgent,
        referenceImage: references[0]?.url ?? null,
        referenceImages: references,
        voiceCloneConsentAccepted: defaults.voiceCloneConsentAccepted,
        voiceProfileId: defaults.voiceProfileId,
      });
      if (!didStart) {
        boardController.updateGenerateNode(generateNodeId, {
          errorMessage: "音频生成请求未启动，请检查节点参数",
          status: "failed",
        });
        return handledBoardAction(false);
      }
      return handledBoardAction(true);
    }

    const defaults = {
      ...videoActionDefaults(model, action.params?.aspectRatio),
      ...(action.params?.aspectRatio ? { aspectRatio: action.params.aspectRatio } : {}),
      ...(action.params?.videoResolution ? { videoResolution: action.params.videoResolution } : {}),
      ...(action.params?.videoDuration ? { videoDuration: action.params.videoDuration } : {}),
      ...(action.params?.videoPreset ? { videoPreset: action.params.videoPreset } : {}),
      ...(action.params?.videoReferenceMode ? { videoReferenceMode: action.params.videoReferenceMode } : {}),
    };
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
      const message = "Agent 选中的视频模型不支持参考媒体输入";
      boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
      pushWorkspaceNotice("error", message);
      return handledBoardAction(false);
    }
    const videoCapability = getVideoModelCapabilities(model);
    const unsupportedVideoReference = references.find(reference => !videoCapability.referenceMediaTypes.includes(getMediaReferenceType(reference)));
    if (unsupportedVideoReference) {
      const message = `当前视频模型不支持${mediaReferenceLabel(getMediaReferenceType(unsupportedVideoReference))}输入`;
      boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
      pushWorkspaceNotice("error", message);
      return handledBoardAction(false);
    }
    if (references.length < videoCapability.minReferenceImages || references.length > videoCapability.maxReferenceImages) {
      const message = `当前视频模型需要 ${videoCapability.minReferenceImages}-${videoCapability.maxReferenceImages} 个参考媒体`;
      boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
      pushWorkspaceNotice("error", message);
      return handledBoardAction(false);
    }

    const referenceNodeIds: string[] = [];
    references.forEach((reference, index) => {
      const matchedItem = items.find(item => item.id === reference.id);
      const referenceType = getMediaReferenceType(reference);
      const assetNodeId = boardController.addAssetNode({
        asset: {
          assetId: reference.id,
          model: matchedItem?.model ?? "agent-reference",
          prompt: matchedItem?.prompt ?? "Agent reference",
          type: referenceType,
          url: reference.url,
        },
        position: { x: 120 + index * 140, y: generatePosition.y + 280 },
      });
      referenceNodeIds.push(assetNodeId);
      boardController.connectPorts(
        { nodeId: assetNodeId, portId: "asset-out", portKind: "asset" },
        { nodeId: generateNodeId, portId: "reference-in", portKind: "asset" },
      );
    });

    if (!shouldRun) {
      pushWorkspaceNotice("success", "已创建 Agent 视频生成节点流程");
      return handledBoardAction(true);
    }

    const resultStackKey = resultStackKeyForConfig({
      edges: [
        {
          id: "agent-prompt-edge",
          kind: "prompt",
          from: { nodeId: promptNodeId, portId: BOARD_PORT_IDS.promptOut, portKind: "prompt" },
          to: { nodeId: generateNodeId, portId: BOARD_PORT_IDS.promptIn, portKind: "prompt" },
          createdAt: "",
        },
        ...referenceNodeIds.map((assetNodeId, index) => ({
          id: `agent-reference-edge-${index}`,
          kind: "reference" as const,
          from: { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" as const },
          to: { nodeId: generateNodeId, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" as const },
          createdAt: "",
        })),
      ],
      kind: "video-generate",
      model,
      nodeId: generateNodeId,
      sizeKey: `${defaults.aspectRatio}|${defaults.videoResolution ?? ""}`,
    });
    boardController.updateGenerateNode(generateNodeId, { errorMessage: undefined, resultStackKey, status: "processing" });
    const didStart = await generateManualVideo({
      boardId: resolvedBoardId,
      boardNodeId: generateNodeId,
      boardResultStackKey: resultStackKey,
      model,
      prompt: promptFromAgent,
      referenceImage: references[0]?.url ?? null,
      referenceImages: references,
      size: defaults.aspectRatio,
      videoDuration: defaults.videoDuration,
      videoPreset: defaults.videoPreset,
      videoReferenceMode: defaults.videoReferenceMode,
      videoResolution: defaults.videoResolution,
    });
    if (!didStart) {
      boardController.updateGenerateNode(generateNodeId, {
        errorMessage: "视频生成请求未启动，请检查节点参数",
        status: "failed",
      });
      return handledBoardAction(false);
    }
    return handledBoardAction(true);
  }, [
    boardController,
    generateManualAudio,
    generateManualImage,
    generateManualVideo,
    items,
    pushWorkspaceNotice,
    resolveOriginalReferences,
    resolvedBoardId,
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
    updateAgentActionDraft,
  } = useAgentController({
    agentInput,
    agentReferenceId,
    agentReferences,
    agentReferenceUrl,
    buildProviderHeaders,
    chatStorageKey: `imagine_agent_chat:${boardController.board.id}`,
    executeToolActionOverride: executeBoardAgentToolAction,
    getBoardContext: buildAgentBoardContext,
    generateManualAudio,
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
    onActionValidationError: message => pushWorkspaceNotice("error", message),
  });

  const cancelBoardGenerationNode = useCallback(async (nodeId: string): Promise<void> => {
    const sourceNode = findExecutableNodeById(boardController.board.nodes, nodeId);
    const task = sourceNode ? activeSourceTaskForNode(generationTasks, sourceNode) : undefined;
    if (!sourceNode || !task) {
      const update = {
        errorMessage: "未找到可取消的关联任务",
        status: "failed",
      } as const;
      if (sourceNode?.kind === "runninghub-app") {
        boardController.updateRunningHubAppNode(nodeId, update);
      } else {
        boardController.updateGenerateNode(nodeId, update);
      }
      return;
    }

    const operationName = task.operationName;
    if (cancelingBoardItemIds.includes(task.id)) return;
    const canCancelRemote = task.canCancelRemote && Boolean(operationName);
    const confirmText = canCancelRemote
      ? "确定要取消这个视频生成任务吗？"
      : "确定要本地取消这个任务吗？远端生成可能仍会继续。";
    if (!(await confirmAction({ message: confirmText, tone: "danger", confirmLabel: "取消任务" }))) return;

    setCancelingBoardItemIds(prev => [...prev, task.id]);
    try {
      const controller = generationAbortControllersRef.current[task.id];
      if (controller) {
        locallyCanceledItemIdsRef.current.add(task.id);
        controller.abort();
      }
      if (!canCancelRemote) {
        locallyCanceledItemIdsRef.current.add(task.id);
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

      const canceledTask = await cancelGenerationTask(task.id);
      setGenerationTasks(prev => prev.map(current => current.id === canceledTask.id ? canceledTask : current));
      delete pollingFailuresRef.current[task.id];
      const update = {
        errorMessage: canCancelRemote ? "远端生成任务已取消" : "任务已从本地取消",
        status: "failed",
      } as const;
      if (sourceNode.kind === "runninghub-app") {
        boardController.updateRunningHubAppNode(nodeId, update);
      } else {
        boardController.updateGenerateNode(nodeId, update);
      }
      pushWorkspaceNotice("success", canCancelRemote ? "视频生成任务已取消" : "任务已从本地取消");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "任务取消失败"));
    } finally {
      setCancelingBoardItemIds(prev => prev.filter(id => id !== task.id));
    }
  }, [
    boardController,
    buildProviderHeaders,
    cancelingBoardItemIds,
    confirmAction,
    generationAbortControllersRef,
    generationTasks,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    setGenerationTasks,
  ]);

  const addAssetToBoard = useCallback((asset: StorageItem, position?: BoardPoint): string => {
    const assetNodeId = boardController.addAssetNode({
      asset: boardAssetReferenceFromStorageItem(asset),
      position,
    });

    if (asset.sourceBoardNodeId) {
      const sourceNode = findExecutableNodeById(boardController.board.nodes, asset.sourceBoardNodeId);
      if (
        sourceNode &&
        findResultNodeForSource(boardController.board.nodes, sourceNode.id)?.resultAssetIds.includes(asset.id) &&
        !hasResultAssetConnection(boardController.board.edges, sourceNode.id, assetNodeId)
      ) {
        boardController.connectPorts(
          { nodeId: sourceNode.id, portId: BOARD_PORT_IDS.resultOut, portKind: "result" },
          { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" },
        );
      }
    }

    return assetNodeId;
  }, [boardController]);

  const handleExportMultiGrid = useCallback(async (nodeId: string): Promise<void> => {
    try {
      const node = boardController.board.nodes.find(item => item.id === nodeId);
      if (node?.kind !== "multi-grid") {
        throw new Error("目标节点不是多宫格");
      }
      const dataUrl = await composeBoardMultiGridImage(node);
      const item = buildStorageItem(
        {
          id: makeClientId("multi_grid"),
          type: "image",
          url: dataUrl,
          prompt: node.title,
          model: "multi-grid",
          aspectRatio: node.aspectRatio,
          createdAt: new Date().toISOString(),
          status: "complete",
          progress: 100,
          operationName: "multi-grid-export",
          sourceBoardNodeId: node.id,
        },
        { boardId: boardController.board.id },
      );
      const savedItem = await saveItemOrWarn(item, pushWorkspaceNotice);
      if (!savedItem) return;
      setItems(prev => [savedItem, ...prev]);
      addAssetToBoard(savedItem, {
        x: node.position.x + node.size.width + 40,
        y: node.position.y,
      });
      pushWorkspaceNotice("success", "多宫格已导出为图片资产");
    } catch (error) {
      pushWorkspaceNotice("error", error instanceof Error ? error.message : "多宫格导出失败");
    }
  }, [addAssetToBoard, boardController.board, pushWorkspaceNotice]);

  const handleCaptureVideoFrame = useCallback(async (
    sourceNodeId: string,
    item: StorageItem,
    frame: CapturedVideoFrame,
  ): Promise<void> => {
    if (item.type !== "video") {
      throw new Error("只有视频资产可以截帧");
    }

    const frameItem = createVideoFrameStorageItem(item, frame, makeClientId("frame"));
    const savedFrameItem = await saveItemOrWarn(frameItem, pushWorkspaceNotice);
    if (!savedFrameItem) return;
    setItems(prev => [savedFrameItem, ...prev]);

    const sourceNode = boardController.board.nodes.find(node => node.id === sourceNodeId);
    const position = sourceNode
      ? { x: sourceNode.position.x + sourceNode.size.width + 40, y: sourceNode.position.y }
      : undefined;
    addAssetToBoard(savedFrameItem, position);
    pushWorkspaceNotice("success", `已保存${getVideoFrameCaptureLabel(frame.mode)}并插入画板`);
  }, [addAssetToBoard, boardController.board.nodes, pushWorkspaceNotice]);

  const handleSavePanoramaScreenshots = useCallback(async (
    item: StorageItem,
    screenshots: PanoramaScreenshot[],
  ): Promise<void> => {
    if (item.type !== "image") {
      throw new Error("只有图片资产可以进入全景查看");
    }

    const sourceNode = boardController.board.nodes.find(node => (
      item.sourceBoardNodeId
        ? node.id === item.sourceBoardNodeId
        : node.kind === "asset" && node.asset.assetId === item.id
    ));
    const sourceNodeId = sourceNode?.id;
    const savedItems: StorageItem[] = [];
    for (const [index, screenshot] of screenshots.entries()) {
      const screenshotItem = createPanoramaScreenshotStorageItem(
        item,
        screenshot,
        makeClientId(`pano_${index}`),
        { boardId: resolvedBoardId, sourceBoardNodeId: sourceNodeId },
      );
      const savedScreenshotItem = await saveItemOrWarn(screenshotItem, pushWorkspaceNotice);
      if (savedScreenshotItem) savedItems.push(savedScreenshotItem);
    }
    if (savedItems.length === 0) return;
    setItems(prev => [
      ...savedItems,
      ...prev.filter(prevItem => !savedItems.some(savedItem => savedItem.id === prevItem.id)),
    ]);
    const anchorPosition = sourceNode
      ? { x: sourceNode.position.x + sourceNode.size.width + 40, y: sourceNode.position.y }
      : undefined;
    savedItems.forEach((savedItem, index) => {
      addAssetToBoard(
        savedItem,
        anchorPosition
          ? { x: anchorPosition.x + index * 36, y: anchorPosition.y + index * 36 }
          : undefined,
      );
    });
    pushWorkspaceNotice("success", `已保存 ${savedItems.length} 张全景截图并插入画板`);
  }, [addAssetToBoard, boardController.board.nodes, pushWorkspaceNotice, resolvedBoardId]);

  const handleImportBoardFiles = useCallback(async (files: File[], position: BoardPoint): Promise<void> => {
    const boardFiles = files.filter(file => mediaReferenceTypeFromMime(file.type) !== null);
    if (boardFiles.length === 0) {
      pushWorkspaceNotice("info", "画板只支持导入图片、视频或音频文件");
      return;
    }

    const importedItems: StorageItem[] = [];
    for (let index = 0; index < boardFiles.length; index += 1) {
      const file = boardFiles[index];
      try {
        const mediaType = mediaReferenceTypeFromMime(file.type);
        if (!mediaType) throw new Error("不支持的媒体类型");
        const item = await createBoardUploadItem(
          file,
          makeClientId(boardUploadIdPrefix(mediaType, index)),
          resolvedBoardId,
        );
        const savedItem = await saveItemOrWarn(item, pushWorkspaceNotice);
        if (!savedItem) continue;
        importedItems.push(savedItem);
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, `${file.name || "文件"} 导入失败`));
      }
    }

    if (importedItems.length === 0) return;
    boardController.addAssetNodes(importedItems.map((item, index) => ({
      asset: boardAssetReferenceFromStorageItem(item),
      position: boardImportNodePosition(position, index),
    })));
    setItems(prev => [
      ...importedItems,
      ...prev.filter(item => !importedItems.some(importedItem => importedItem.id === item.id)),
    ]);
    pushWorkspaceNotice("success", `已导入 ${importedItems.length} 个文件到画板`);
  }, [boardController, pushWorkspaceNotice, resolvedBoardId]);

  const useSelectedBoardAssetAsReference = () => {
    const references = activeBoardReference(boardController.board.nodes, boardController.selectedNodeId, items, resolveBoardReferenceUrl);
    if (references.length === 0) {
      pushWorkspaceNotice("info", "请选择一个图片资产节点");
      return;
    }
    void resolveOriginalReferences(references).then(
      originalReferences => {
        setReferenceImage(originalReferences[0].url);
        setReferenceImages(originalReferences);
        pushWorkspaceNotice("success", "已将选中节点作为生成参考图");
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, "参考媒体读取失败")),
    );
  };

  const useSelectedBoardAssetForAgent = () => {
    const references = activeBoardReference(boardController.board.nodes, boardController.selectedNodeId, items, resolveBoardReferenceUrl);
    if (references.length === 0) {
      pushWorkspaceNotice("info", "请选择一个图片资产节点");
      return;
    }
    void resolveOriginalReferences(references).then(
      originalReferences => {
        setAgentReferenceId(originalReferences[0].id);
        setAgentReferenceUrl(originalReferences[0].url);
        setAgentReferences(originalReferences);
        setIsAgentDockOpen(true);
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, "参考媒体读取失败")),
    );
  };

  const useBoardAssetForAgent = useCallback((nodeId: string) => {
    const references = activeBoardReference(boardController.board.nodes, nodeId, items, resolveBoardReferenceUrl);
    if (references.length === 0) {
      pushWorkspaceNotice("info", "请选择一个图片资产节点");
      return;
    }
    void resolveOriginalReferences(references).then(
      originalReferences => {
        setAgentReferenceId(originalReferences[0].id);
        setAgentReferenceUrl(originalReferences[0].url);
        setAgentReferences(originalReferences);
        setIsAgentDockOpen(true);
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, "参考媒体读取失败")),
    );
  }, [
    boardController.board.nodes,
    items,
    pushWorkspaceNotice,
    resolveBoardReferenceUrl,
    resolveOriginalReferences,
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
    const item = items.find(entry => entry.id === node.asset.assetId) ?? buildStorageItem(
      {
        id: node.asset.assetId,
        type: node.asset.type,
        url: node.asset.url,
        prompt: node.asset.prompt,
        model: node.asset.model,
        aspectRatio: "auto",
        createdAt: node.createdAt,
        status: "complete",
        progress: 100,
        sourceBoardNodeId: node.id,
      },
      { boardId: resolvedBoardId },
    );
    void resolveOriginalStorageItem(item).then(
      originalItem => launchMaskEditor(originalItem.url, node.asset.assetId, "board-asset", node.id),
      error => pushWorkspaceNotice("error", toErrorMessage(error, "原始图片读取失败")),
    );
  }, [
    boardController.board.nodes,
    items,
    launchMaskEditor,
    pushWorkspaceNotice,
    resolvedBoardId,
    resolveOriginalStorageItem,
  ]);

  const resolveExecutableNodeInputs = useCallback(<T extends ExecutableBoardNode,>(
    nodeId: string,
    isExpectedNode: (node: BoardDocument["nodes"][number] | undefined) => node is T,
    errorMessage: string,
  ) => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (!isExpectedNode(node)) {
      throw new Error(errorMessage);
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
      .flatMap(item => boardNodeReferences(item, boardController.board.nodes, items, resolveBoardReferenceUrl));

    return { node, prompt: resolvedPrompt, references };
  }, [boardController.board.edges, boardController.board.nodes, items, resolveBoardReferenceUrl]);

  const resolveGenerateNodeInputs = useCallback((nodeId: string) => {
    return resolveExecutableNodeInputs(nodeId, isGenerateBoardNode, "请选择图片、视频或音频生成节点");
  }, [resolveExecutableNodeInputs]);

  const resolveRunningHubAppNodeInputs = useCallback((nodeId: string) => {
    return resolveExecutableNodeInputs(nodeId, isRunningHubAppBoardNode, "请选择 RunningHub 应用节点");
  }, [resolveExecutableNodeInputs]);

  const handleExecuteGenerateNode = useCallback(async (nodeId: string) => {
    try {
      const candidateNode = boardController.board.nodes.find(item => item.id === nodeId);
      if (candidateNode?.kind === "runninghub-app") {
        const { node, prompt: nodePrompt, references: previewReferences } = resolveRunningHubAppNodeInputs(nodeId);
        const references = await resolveOriginalReferences(previewReferences);
        flushBoardTextForGenerateNode(boardController.board.nodes, boardController.board.edges, nodeId);
        const errorMessage = runningHubAppNodeError(node, nodePrompt, references.length);
        if (errorMessage) {
          boardController.updateRunningHubAppNode(nodeId, { status: "failed", errorMessage });
          pushWorkspaceNotice("error", errorMessage);
          return;
        }

        const resultStackKey = resultStackKeyForNode(node, boardController.board.edges);
        const shouldStartNewStack = node.resultStackKey !== resultStackKey;
        boardController.updateRunningHubAppNode(nodeId, {
          errorMessage: undefined,
          prompt: nodePrompt,
          resultAssetId: shouldStartNewStack ? undefined : node.resultAssetId,
          resultAssetIds: shouldStartNewStack ? [] : node.resultAssetIds,
          resultStackKey,
          status: "processing",
        });

        const model = runningHubAppModelValue(node);
        let didStart = false;
        if (node.outputType === "image") {
          didStart = await generateManualImage({
            allowEmptyPrompt: true,
            boardId: resolvedBoardId,
            boardNodeId: nodeId,
            boardResultStackKey: resultStackKey,
            imageResolution: "auto",
            isCustomImageResolution: false,
            model,
            prompt: nodePrompt,
            referenceImage: references[0]?.url ?? null,
            referenceImages: references,
            runningHubAccessPassword: node.accessPassword,
            runningHubNodeInfoList: runningHubNodeInfoBindings(node),
            size: "auto",
          });
        } else if (node.outputType === "video") {
          didStart = await generateManualVideo({
            allowEmptyPrompt: true,
            boardId: resolvedBoardId,
            boardNodeId: nodeId,
            boardResultStackKey: resultStackKey,
            model,
            prompt: nodePrompt,
            referenceImage: references[0]?.url ?? null,
            referenceImages: references,
            runningHubAccessPassword: node.accessPassword,
            runningHubNodeInfoList: runningHubNodeInfoBindings(node),
            size: "auto",
          });
        } else {
          didStart = await generateManualAudio({
            allowEmptyPrompt: true,
            boardId: resolvedBoardId,
            boardNodeId: nodeId,
            boardResultStackKey: resultStackKey,
            model,
            prompt: nodePrompt,
            referenceImage: references[0]?.url ?? null,
            referenceImages: references,
            runningHubAccessPassword: node.accessPassword,
            runningHubNodeInfoList: runningHubNodeInfoBindings(node),
          });
        }
        if (!didStart) {
          boardController.updateRunningHubAppNode(nodeId, {
            errorMessage: "RunningHub 应用请求未启动，请检查节点参数",
            status: "failed",
          });
        }
        return;
      }

      const { node, prompt: nodePrompt, references: previewReferences } = resolveGenerateNodeInputs(nodeId);
      const references = await resolveOriginalReferences(previewReferences);
      flushBoardTextForGenerateNode(boardController.board.nodes, boardController.board.edges, nodeId);
      const nextPrompt = nodePrompt.trim();
      const audioCapabilities = node.kind === "audio-operation" ? getAudioModelCapabilities(node.model) : null;
      const requiresTextInput = node.kind !== "audio-operation" || audioOperationRequiresTextInput(node.audioMode);
      if (!nextPrompt && requiresTextInput) {
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: "生成节点需要提示词输入" });
        pushWorkspaceNotice("error", "生成节点需要提示词输入");
        return;
      }
      if (node.kind === "audio-operation" && audioOperationRequiresStylePrompt(node.audioMode) && !node.audioStylePrompt?.trim()) {
        const message = "音色设计需要填写音色描述";
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      if (isPlaceholderRunningHubModel(node.model)) {
        const message = "请先填写真实的 RunningHub webappId 或 workflowId";
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      const capabilityKind = node.kind === "image-generate" ? "image" : node.kind === "video-generate" ? "video" : "audio";
      const capability = getModelCapability(node.model, capabilityKind);
      if (references.length > 0 && !capability.supportsReferences) {
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: "当前模型不支持参考媒体输入" });
        pushWorkspaceNotice("error", "当前模型不支持参考媒体输入");
        return;
      }
      const unsupportedReference = references.find(reference => {
        const type = getMediaReferenceType(reference);
        if (node.kind === "image-generate") return type !== "image";
        if (node.kind === "video-generate") return !getVideoModelCapabilities(node.model).referenceMediaTypes.includes(type);
        return !getAudioModelCapabilities(node.model).referenceMediaTypes.includes(type);
      });
      if (unsupportedReference) {
        const message = `当前模型不支持${mediaReferenceLabel(getMediaReferenceType(unsupportedReference))}输入`;
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      if (audioCapabilities && references.length < audioCapabilities.minReferenceMedia) {
        const message = audioOperationMissingReferenceMessage(audioCapabilities);
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      if (audioCapabilities && audioCapabilities.maxReferenceMedia > 0 && references.length > audioCapabilities.maxReferenceMedia) {
        const message = `当前音频模式最多支持 ${audioCapabilities.maxReferenceMedia} 个参考媒体`;
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
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

        const resultStackKey = resultStackKeyForNode(node, boardController.board.edges);
        const shouldStartNewStack = node.resultStackKey !== resultStackKey;
        boardController.updateGenerateNode(nodeId, {
          errorMessage: undefined,
          prompt: nextPrompt,
          resultAssetId: shouldStartNewStack ? undefined : node.resultAssetId,
          resultAssetIds: shouldStartNewStack ? [] : node.resultAssetIds,
          resultStackKey,
          status: "processing",
        });

        if (node.kind === "image-generate") {
          const nodeImageResolution = node.imageResolution === "custom" ? node.customImageResolution.trim() : node.imageResolution;
          let didStartAny = false;
          for (let remaining = node.variantCount; remaining > 0; remaining -= 1) {
            const didStart = await generateManualImage({
              boardId: resolvedBoardId,
              boardNodeId: nodeId,
              boardResultStackKey: resultStackKey,
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
        } else if (node.kind === "video-generate") {
          let didStartAny = false;
          for (let remaining = node.variantCount; remaining > 0; remaining -= 1) {
            const didStart = await generateManualVideo({
              boardId: resolvedBoardId,
              boardNodeId: nodeId,
              boardResultStackKey: resultStackKey,
              model: node.model,
              prompt: nextPrompt,
              referenceImage: references[0]?.url ?? null,
              referenceImages: references,
              size: node.aspectRatio,
              videoDuration: node.videoDuration,
              videoPreset: node.videoPreset,
              videoReferenceMode: node.videoReferenceMode ?? getVideoModelCapabilities(node.model).referenceMode,
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
      } else {
        let didStartAny = false;
        for (let remaining = node.variantCount; remaining > 0; remaining -= 1) {
          const didStart = await generateManualAudio({
            audioFormat: node.audioFormat,
            audioMode: node.audioMode,
            audioStylePrompt: node.audioStylePrompt,
            asrLanguage: node.asrLanguage,
            boardId: resolvedBoardId,
            boardNodeId: nodeId,
            boardResultStackKey: resultStackKey,
            model: node.model,
            prompt: nextPrompt,
            referenceImage: references[0]?.url ?? null,
            referenceImages: references,
            voiceCloneConsentAccepted: node.voiceCloneConsentAccepted,
            voiceProfileId: node.voiceProfileId,
          });
          if (!didStart) break;
          didStartAny = true;
        }
        if (!didStartAny) {
          boardController.updateGenerateNode(nodeId, {
            errorMessage: "音频生成请求未启动，请检查节点参数",
            status: "failed",
          });
        }
      }
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "节点生成失败"));
    }
  }, [
    boardController,
    generateManualAudio,
    generateManualImage,
    generateManualVideo,
    pushWorkspaceNotice,
    resolveGenerateNodeInputs,
    resolveOriginalReferences,
    resolveRunningHubAppNodeInputs,
    resolvedBoardId,
  ]);

  const handleSendAgentNode = useCallback((nodeId: string) => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (node?.kind !== "agent") {
      pushWorkspaceNotice("error", "请选择 Agent 节点");
      return;
    }

    const instruction = (getBoardTextDraft(nodeId) ?? node.instruction).trim();
    flushBoardTextForAgentNode(nodeId);

    const references = boardController.board.edges
      .filter(edge => edge.to.nodeId === nodeId && edge.to.portId === "agent-context-in")
      .map(edge => boardController.board.nodes.find(item => item.id === edge.from.nodeId))
      .flatMap(item => boardNodeReferences(item, boardController.board.nodes, items, resolveBoardReferenceUrl))
      .slice(0, IMAGE_REFERENCE_LIMIT);

    setAgentReferences(references);
    setAgentReferenceId(references[0]?.id ?? null);
    setAgentReferenceUrl(references[0]?.url ?? null);
    setAgentInput(instruction);
    setIsAgentDockOpen(true);
    if (instruction) void submitAgentPrompt(instruction, references);
  }, [
    boardController.board.edges,
    boardController.board.nodes,
    items,
    pushWorkspaceNotice,
    resolveBoardReferenceUrl,
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
      setAgentReferences(prev => [...prev, { id: newReferenceId, type: mediaType, url: dataUrl }].slice(0, IMAGE_REFERENCE_LIMIT));
      pushWorkspaceNotice("success", `已上传 Agent ${mediaReferenceLabel(mediaType)}引用`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "Agent 引用读取失败，请换一个文件"));
    }
  };

  useEffect(() => {
    if (boardController.saveStatus === "loading") return;
    if (boardAssetsLoading) return;
    const handledBoardItems = handledBoardItemIdsRef.current;
    for (const item of items) {
      const sourceBoardNodeId = item.sourceBoardNodeId;
      if (sourceBoardNodeId) {
        if (item.status === "pending" || item.status === "processing") {
          const sourceNode = findExecutableNodeById(boardController.board.nodes, sourceBoardNodeId);
          if (sourceNode && !isSourceStackItem(item, sourceNode)) continue;
          if (sourceNode && (sourceNode.status !== "processing" || sourceNode.errorMessage)) {
            const update = {
              errorMessage: undefined,
              status: "processing",
            } as const;
            if (sourceNode.kind === "runninghub-app") {
              boardController.updateRunningHubAppNode(sourceBoardNodeId, update);
            } else {
              boardController.updateGenerateNode(sourceBoardNodeId, update);
            }
          }
          continue;
        }
        if (handledBoardItems.has(item.id)) continue;
        if (item.status !== "complete" && item.status !== "failed") continue;
      }

      if (sourceBoardNodeId && item.status === "complete") {
        const sourceNode = findExecutableNodeById(boardController.board.nodes, sourceBoardNodeId);
        if (!sourceNode) continue;
        if (!isSourceStackItem(item, sourceNode)) continue;
        handledBoardItems.add(item.id);
        const nextStatus = nextSourceNodeStatus(items, generationTasks, sourceNode, item.status);
        if (item.type === "transcript") {
          const update = {
            errorMessage: undefined,
            status: nextStatus,
          } as const;
          if (sourceNode.kind === "runninghub-app") {
            boardController.updateRunningHubAppNode(sourceBoardNodeId, update);
          } else {
            boardController.updateGenerateNode(sourceBoardNodeId, update);
          }
          if (!hasTranscriptNoteForAsset(boardController.board.nodes, item.id)) {
            boardController.addNoteNodeWithConnection(
              {
                body: transcriptFromDataUrl(item.url),
                position: transcriptNotePosition(sourceNode),
                size: { width: 360, height: 260 },
                source: {
                  assetId: item.id,
                  model: item.model,
                  sourceNodeId: sourceBoardNodeId,
                },
                title: "转写结果",
                variant: "transcript",
              },
              { nodeId: sourceBoardNodeId, portId: BOARD_PORT_IDS.resultOut, portKind: "result" },
            );
          }
          continue;
        }
        const resultAssetIds = sourceStackResultAssetIds(items, sourceNode, item.id);
        const activeResultAssetId = resultAssetIds[resultAssetIds.length - 1] ?? item.id;
        const activeResultItem = items.find(candidate => candidate.id === activeResultAssetId && candidate.status === "complete") ?? item;
        const update = {
          asset: storageItemToBoardAssetReference(activeResultItem),
          resultAssetId: activeResultAssetId,
          resultAssetIds,
          status: nextStatus,
        };
        boardController.completeGenerationResult(
          sourceBoardNodeId,
          update,
        );
        continue;
      }

      if (sourceBoardNodeId && item.status === "failed") {
        const sourceNode = findExecutableNodeById(boardController.board.nodes, sourceBoardNodeId);
        if (!sourceNode) continue;
        if (!isSourceStackItem(item, sourceNode)) continue;
        handledBoardItems.add(item.id);
        const nextStatus = nextSourceNodeStatus(items, generationTasks, sourceNode, item.status);
        const update = {
          errorMessage: nextStatus === "failed" ? item.errorMessage ?? "生成失败" : undefined,
          status: nextStatus,
        };
        if (sourceNode.kind === "runninghub-app") {
          boardController.updateRunningHubAppNode(sourceBoardNodeId, update);
        } else {
          boardController.updateGenerateNode(sourceBoardNodeId, update);
        }
        continue;
      }
    }
  }, [boardAssetsLoading, boardController, generationTasks, items]);

  useEffect(() => {
    if (boardController.saveStatus === "loading") return;
    if (boardAssetsLoading) return;
    if (!isBoardAssetScopeLoaded) return;
    const handledBoardTasks = handledBoardTaskIdsRef.current;
    for (const task of generationTasks) {
      const sourceBoardNodeId = task.source.boardNodeId;
      if (!sourceBoardNodeId) continue;
      const sourceNode = findExecutableNodeById(boardController.board.nodes, sourceBoardNodeId);
      if (!sourceNode) continue;
      if (!isSourceStackTask(task, sourceNode)) continue;

      if (task.status === "pending" || task.status === "processing") {
        if (sourceNode.status !== "processing" || sourceNode.errorMessage) {
          const update = {
            errorMessage: undefined,
            status: "processing",
          } as const;
          if (sourceNode.kind === "runninghub-app") {
            boardController.updateRunningHubAppNode(sourceBoardNodeId, update);
          } else {
            boardController.updateGenerateNode(sourceBoardNodeId, update);
          }
        }
        continue;
      }

      if (handledBoardTasks.has(task.id)) continue;
      if (task.status !== "failed" && task.status !== "canceled") continue;

      handledBoardTasks.add(task.id);
      const nextStatus: BoardGenerationStatus =
        hasActiveSourceItems(items, sourceNode) || hasActiveSourceTasks(generationTasks, sourceNode)
          ? "processing"
          : items.some(item => isSourceStackItem(item, sourceNode) && item.status === "complete")
            ? "complete"
            : "failed";
      const update = {
        errorMessage: nextStatus === "failed" ? task.errorMessage ?? (task.status === "canceled" ? "任务已取消" : "生成失败") : undefined,
        status: nextStatus,
      };
      if (sourceNode.kind === "runninghub-app") {
        boardController.updateRunningHubAppNode(sourceBoardNodeId, update);
      } else {
        boardController.updateGenerateNode(sourceBoardNodeId, update);
      }
    }
  }, [boardAssetsLoading, boardController, generationTasks, isBoardAssetScopeLoaded, items]);

  const handleClearProject = async () => {
    if (!(await confirmAction({
      message: CLEAR_WORKSPACE_ASSETS_MESSAGE,
      tone: "danger",
      confirmLabel: "清空资产",
    }))) return;
    try {
      await createWorkspaceSafetySnapshot("clear-assets");
      await clearAllDB();
      handledBoardItemIdsRef.current = new Set();
      handledBoardTaskIdsRef.current = new Set();
      setItems([]);
      setGenerationTasks([]);
      pushWorkspaceNotice("success", "本地资产库已清空");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "本地资产库清空失败"));
    }
  };

  const reloadBoardAssetsFromDB = useCallback(async () => {
    await reloadBoardAssets();
  }, [reloadBoardAssets]);

  const handleDataExportWorkspace = useCallback(async (includeCredentials: boolean) => {
    try {
      const result = await exportCompleteWorkspaceBackup(includeCredentials);
      pushWorkspaceNotice("success", `已导出备份：${result.fileName}`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "完整备份导出失败"));
    }
  }, [pushWorkspaceNotice]);

  const handleDataExportCurrentBoard = useCallback(async (includeCredentials: boolean) => {
    try {
      flushSync(() => flushAllBoardText());
      await boardController.saveNow();
      const result = await exportBoardWorkspaceBackup(boardController.board, includeCredentials);
      pushWorkspaceNotice("success", `已导出当前画板：${result.fileName}`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "当前画板导出失败"));
    }
  }, [boardController, pushWorkspaceNotice]);

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
        const mediaType = mediaReferenceTypeFromMime(file.type);
        if (!mediaType) throw new Error("不支持的媒体类型");
        const item = await createLocalUploadAsset(
          file,
          makeClientId(boardUploadIdPrefix(mediaType, index).replace("board_", "local_")),
          { boardId: resolvedBoardId },
        );
        const savedItem = await saveItemOrWarn(item, pushWorkspaceNotice);
        if (!savedItem) continue;
        importedItems.push(savedItem);
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
  }, [pushWorkspaceNotice, resolvedBoardId]);

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
      await reloadBoardAssetsFromDB();
      pushWorkspaceNotice("success", `已清理 ${result.deletedIds.length} 项`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "资产清理失败"));
    }
  }, [confirmAction, pushWorkspaceNotice, reloadBoardAssetsFromDB]);

  const handleDataRepairAssetSources = useCallback(async () => {
    if (!(await confirmAction({
      message: "将扫描所有画板，并清除资产中指向已不存在画板节点的来源链接。资产文件、提示词和生成结果不会删除。确认继续？",
      confirmLabel: "修复",
    }))) return;
    try {
      const result = await repairStaleAssetSourceLinks();
      await reloadBoardAssetsFromDB();
      pushWorkspaceNotice("success", `已修复 ${result.repairedIds.length} 项来源链接`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "来源链接修复失败"));
    }
  }, [confirmAction, pushWorkspaceNotice, reloadBoardAssetsFromDB]);

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
      window.setTimeout(() => window.location.assign("/board"), 300);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "画板重置失败"));
    }
  }, [confirmAction, pushWorkspaceNotice]);

  const duplicateCurrentBoard = useCallback(async () => {
    try {
      flushSync(() => flushAllBoardText());
      await boardController.saveNow();
      const now = new Date().toISOString();
      const nextBoard: BoardDocument = {
        ...boardController.board,
        id: makeClientId("board"),
        title: `${boardController.board.title} 副本`,
        createdAt: now,
        updatedAt: now,
      };
      await saveBoardToDB(nextBoard);
      setBoardSummaries(prev => [boardSummaryFromDocument(nextBoard), ...prev]);
      setResolvedBoardId(nextBoard.id);
      router.push(boardRoute(nextBoard.id));
      pushWorkspaceNotice("success", "已复制当前画板");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "画板复制失败"));
    }
  }, [boardController, pushWorkspaceNotice, router]);

  const createBoardPage = useCallback(async () => {
    flushSync(() => flushAllBoardText());
    await boardController.saveNow();
    const nextIndex = boardSummaries.length + 1;
    const nextId = makeClientId("board");
    const nextBoard = createEmptyBoard(nextId, `画板 ${nextIndex}`);
    await saveBoardToDB(nextBoard);
    setBoardSummaries(prev => [boardSummaryFromDocument(nextBoard), ...prev]);
    setResolvedBoardId(nextId);
    router.push(boardRoute(nextId));
  }, [boardController, boardSummaries.length, router]);

  const selectBoardPage = useCallback(async (nextBoardId: string): Promise<void> => {
    flushSync(() => flushAllBoardText());
    await boardController.saveNow();
    setResolvedBoardId(nextBoardId);
    router.push(boardRoute(nextBoardId));
  }, [boardController, router]);

  const renameBoardPage = useCallback(() => {
    setRenameDialogDraft(boardController.board.title);
  }, [boardController.board.title]);

  const closeRenameDialog = useCallback(() => {
    setRenameDialogDraft(null);
  }, []);

  const submitRenameDialog = useCallback(() => {
    if (renameDialogDraft === null) return;
    try {
      boardController.updateBoardTitle(renameDialogDraft);
      setRenameDialogDraft(null);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "画板重命名失败"));
    }
  }, [boardController, pushWorkspaceNotice, renameDialogDraft]);

  const deleteBoardPage = useCallback(async () => {
    if (boardSummaries.length <= 1) {
      pushWorkspaceNotice("info", "至少保留一个画板");
      return;
    }
    if (!(await confirmAction({
      message: `确认删除「${boardController.board.title}」吗？`,
      tone: "danger",
      confirmLabel: "删除",
    }))) return;
    flushSync(() => flushAllBoardText());
    const deletedBoardId = boardController.board.id;
    const nextBoard = boardSummaries.find(item => item.id !== deletedBoardId);
    const nextBoardId = nextBoard?.id ?? DEFAULT_BOARD_ID;
    setResolvedBoardId(nextBoardId);
    router.push(boardRoute(nextBoardId));
    await deleteBoardFromDB(deletedBoardId);
    setBoardSummaries(prev => prev.filter(item => item.id !== deletedBoardId));
  }, [boardController.board.id, boardController.board.title, boardSummaries, confirmAction, pushWorkspaceNotice, router]);

  const saveBoardNow = boardController.saveNow;

  const handleBackToWorkbench = useCallback(() => {
    flushSync(() => flushAllBoardText());
    void saveBoardNow()
      .then(() => router.push("/"))
      .catch(error => pushWorkspaceNotice("error", toErrorMessage(error, "画板保存失败")));
  }, [pushWorkspaceNotice, router, saveBoardNow]);

  const handleCancelGenerateNode = useCallback((nodeId: string) => {
    void cancelBoardGenerationNode(nodeId);
  }, [cancelBoardGenerationNode]);

  const handleBoardConnectionError = useCallback((message: string) => {
    pushWorkspaceNotice("error", message);
  }, [pushWorkspaceNotice]);

  const handleCreateBoard = useCallback(() => {
    void createBoardPage().catch(error => pushWorkspaceNotice("error", toErrorMessage(error, "新建画板失败")));
  }, [createBoardPage, pushWorkspaceNotice]);

  const handleDeleteBoard = useCallback(() => {
    void deleteBoardPage().catch(error => pushWorkspaceNotice("error", toErrorMessage(error, "删除画板失败")));
  }, [deleteBoardPage, pushWorkspaceNotice]);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSelectBoard = useCallback((nextBoardId: string) => {
    void selectBoardPage(nextBoardId).catch(error => pushWorkspaceNotice("error", toErrorMessage(error, "画板切换失败")));
  }, [pushWorkspaceNotice, selectBoardPage]);

  const selectedBoardNode = boardController.board.nodes.find(node => node.id === boardController.selectedNodeId);
  const selectedBoardEdge = boardController.board.edges.find(edge => edge.id === boardController.selectedEdgeId);
  const selectedIncomingEdges = selectedBoardNode
    ? boardController.board.edges.filter(edge => edge.to.nodeId === selectedBoardNode.id)
    : [];
  const selectedOutgoingEdges = selectedBoardNode
    ? boardController.board.edges.filter(edge => edge.from.nodeId === selectedBoardNode.id)
    : [];
  const selectedGenerateInputSummary = useMemo(() => {
    if (selectedBoardNode?.kind !== "image-generate" && selectedBoardNode?.kind !== "video-generate" && selectedBoardNode?.kind !== "audio-operation") return undefined;
    const references = generateReferenceCandidates(boardController.board.nodes, boardController.board.edges, selectedBoardNode.id);
    return {
      promptPreview: null,
      referenceCount: references.length,
      referencePreviews: references.map(reference => ({
        id: reference.id,
        role: reference.role,
        type: reference.type,
        url: reference.url,
      })),
    };
  }, [boardController.board.edges, boardController.board.nodes, selectedBoardNode]);
  const canvasAssetIds = useMemo(
    () => collectPlacedBoardAssetIdsFromNodes(boardController.board.nodes),
    [boardController.board.nodes],
  );
  const highlightAssetId = selectedBoardNode?.kind === "asset" ? selectedBoardNode.asset.assetId : undefined;
  const selectedAssetCompareUrl = selectedBoardNode?.kind === "asset" && selectedBoardNode.asset.type === "image"
    ? assetCompareReferenceUrl(selectedBoardNode.id, boardController.board.nodes, boardController.board.edges)
    : null;
  const imageModelGroups = getProviderModelGroups(imageModelOptions, providerKeys, customProviders);
  const videoModelGroups = getProviderModelGroups(videoModelOptions, providerKeys, customProviders);
  const audioModelGroups = getProviderModelGroups(audioModelOptions, providerKeys, customProviders);
  const chatModelGroups = getProviderModelGroups(chatModelOptions, providerKeys, customProviders);
  const {
    featureModels: imageEditFeatureModels,
    selectFeatureModel: selectImageEditFeatureModel,
  } = useImageEditFeatureModels();
  const resolveBoardQuickEditSource = (nodeId: string) => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (!node || (node.kind !== "asset" && node.kind !== "result") || node.asset.type !== "image") return null;

    const assetId = node.kind === "result" ? node.activeAssetId : node.asset.assetId;
    const storedItem = items.find(item => item.id === assetId);
    if (storedItem) {
      return {
        node,
        item: storedItem,
      };
    }
    if (assetId !== node.asset.assetId) return null;

    return {
      node,
      item: buildStorageItem(
        {
          id: node.asset.assetId,
          type: node.asset.type,
          url: node.asset.url,
          prompt: node.asset.prompt,
          model: node.asset.model,
          aspectRatio: "auto",
          createdAt: node.createdAt,
          status: "complete",
          progress: 100,
          sourceBoardNodeId: node.id,
          ...(node.kind === "result" ? { sourceBoardResultStackKey: node.resultStackKey } : {}),
        },
        { boardId: resolvedBoardId },
      ),
    };
  };
  const handleBoardImageQuickEdit = (nodeId: string, operation: ImageEditFeature) => {
    const source = resolveBoardQuickEditSource(nodeId);
    if (!source) {
      pushWorkspaceNotice("info", "请选择一个图片节点");
      return;
    }

    void resolveOriginalStorageItem(source.item).then(
      originalItem => {
        if (operation === "cutout") {
          void runBoardImageQuickEdit(
            source.node.id,
            source.node.title,
            source.node.position,
            source.node.size,
            originalItem,
            operation,
            originalItem.url,
            undefined,
            "",
          );
          return;
        }
        launchMaskEditor(originalItem.url, originalItem.id, "board-asset", source.node.id, operation, originalItem);
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, "原始图片读取失败")),
    );
  };
  const boardSummariesForToolbar = useMemo(() => {
    if (boardController.saveStatus === "loading") return boardSummaries;
    const summary = boardSummaryFromDocument(boardController.board);
    const withoutCurrent = boardSummaries.filter(item => item.id !== summary.id);
    return [summary, ...withoutCurrent].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [boardController.board, boardController.saveStatus, boardSummaries]);

  return (
    <div className="imagine-workbench-shell imagine-theme-dark">
      <WorkspaceNotices notices={workspaceNotices} onDismiss={dismissWorkspaceNotice} />
      {renameDialogDraft !== null && (
        <div
          role="presentation"
          className="imagine-confirm-overlay fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={closeRenameDialog}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="board-rename-title"
            className="imagine-confirm-dialog w-full max-w-sm rounded-xl border p-4"
            onClick={event => event.stopPropagation()}
            onSubmit={event => {
              event.preventDefault();
              submitRenameDialog();
            }}
          >
            <h2 id="board-rename-title" className="text-sm font-semibold text-[var(--iw-text)]">
              重命名画板
            </h2>
            <input
              autoFocus
              value={renameDialogDraft}
              onChange={event => setRenameDialogDraft(event.target.value)}
              className="mt-3 h-10 w-full rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-sm text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
                onClick={closeRenameDialog}
              >
                取消
              </button>
              <button type="submit" className="imagine-primary-action h-9 rounded-lg px-3 text-[11px] font-semibold">
                保存
              </button>
            </div>
          </form>
        </div>
      )}
      <BoardWorkspace
        boardSummaries={boardSummariesForToolbar}
        controller={boardController}
        galleryItems={items}
        generationTasks={generationTasks}
        assetCompareRequest={assetCompareRequest}
        focusNodeRequest={focusNodeRequest}
        onAssetCompareRequestHandled={() => setAssetCompareRequest(null)}
        onFocusNodeRequestHandled={() => setFocusNodeRequest(null)}
        onSelectedNodeIdsChange={setSelectedNodeIds}
        onBack={handleBackToWorkbench}
        onCancelGenerateNode={handleCancelGenerateNode}
        onCaptureVideoFrame={handleCaptureVideoFrame}
        onConnectionError={handleBoardConnectionError}
        onWorkspaceNotice={pushWorkspaceNotice}
        onCreateBoard={handleCreateBoard}
        onDeleteBoard={handleDeleteBoard}
        onDownloadAsset={handleDownloadAsset}
        onEditAssetImage={editBoardAssetImage}
        onImageQuickEdit={handleBoardImageQuickEdit}
        onExecuteGenerateNode={handleExecuteGenerateNode}
        onExportMultiGrid={handleExportMultiGrid}
        onFetchRunningHubAppSchema={fetchRunningHubAppSchema}
        onImportBoardFiles={handleImportBoardFiles}
        onOpenFullscreen={handleOpenFullscreen}
        onOpenPanorama={handleOpenPanorama}
        onSaveVoiceProfile={setVoiceProfileSourceItem}
        onOpenSettings={handleOpenSettings}
        onRenameBoard={renameBoardPage}
        onSelectBoard={handleSelectBoard}
        onSendAssetToAgent={useBoardAssetForAgent}
        onSendAgentNode={handleSendAgentNode}
      >
        <BoardSidePanel
          revealKey={boardController.selectedNodeId ?? boardController.selectedEdgeId}
          inspectorPanel={(
            <BoardInspector
              audioModelGroups={audioModelGroups}
              edge={selectedBoardEdge}
              generateInputSummary={selectedGenerateInputSummary}
              imageModelGroups={imageModelGroups}
              incomingCount={selectedIncomingEdges.length}
              items={items}
              node={selectedBoardNode}
              nodes={boardController.board.nodes}
              outgoingCount={selectedOutgoingEdges.length}
              selectedNodeCount={selectedNodeIds.length}
              videoModelGroups={videoModelGroups}
              onCompareAsset={selectedAssetCompareUrl && selectedBoardNode?.kind === "asset"
                ? () => setAssetCompareRequest({
                  originalUrl: selectedAssetCompareUrl,
                  resultUrl: selectedBoardNode.asset.url,
                })
                : undefined}
              onDeleteEdge={boardController.deleteEdge}
              onEditAssetImage={selectedBoardNode?.kind === "asset"
                ? () => editBoardAssetImage(selectedBoardNode.id)
                : undefined}
              onExecuteGenerate={(nodeId) => void handleExecuteGenerateNode(nodeId)}
              onFocusNode={requestFocusNode}
              onOpenFullscreen={handleOpenFullscreen}
              onOpenSettings={() => setShowSettings(true)}
              onSendAssetToAgent={useSelectedBoardAssetForAgent}
              onSyncAssetReference={useSelectedBoardAssetAsReference}
              onUpdateGenerate={boardController.updateGenerateNode}
              onUpdateNodeTitle={boardController.updateNodeTitle}
              onUpdateRunningHubApp={boardController.updateRunningHubAppNode}
            />
          )}
          assetsPanel={(
            <BoardSideAssetList
              key={resolvedBoardId}
              canvasAssetIds={canvasAssetIds}
              highlightAssetId={highlightAssetId}
              items={items}
              loading={boardAssetsLoading}
              onAddToBoard={addAssetToBoard}
            />
          )}
        />
      </BoardWorkspace>

      {!showSettings && !isMaskOpen && !fullscreenItem && !panoramaItem && !voiceProfileSourceItem && (
        <AgentDock
          activeCountdownId={activeCountdownId}
          agentReferenceId={agentReferenceId}
          agentReferences={agentReferences}
          agentReferenceUrl={agentReferenceUrl}
          atDropdownNode={atDropdown.visible && atDropdown.type === "agent-prompt" ? renderAgentAtDropdown() : null}
          audioModelGroups={audioModelGroups}
          autoExecute={autoExecute}
          chatBottomRef={chatBottomRef}
          chatModelGroups={chatModelGroups}
          countdownSeconds={countdownSeconds}
          input={agentInput}
          isLoading={isAgentLoading}
          isOpen={isAgentDockOpen}
          isOverContent={false}
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
        hasCurrentBoard
        onAddCustomProvider={addCustomProvider}
        onAddFetchedModels={addFetchedModels}
        onAddManualModels={addManualModels}
        onCleanupAssets={handleDataCleanupAssets}
        onClearAssets={handleClearProject}
        onClearCredentials={clearProviderCredentials}
        onClearLocalStorage={handleDataClearLocalStorage}
        onClose={() => setShowSettings(false)}
        onDownloadSafetySnapshot={handleDataDownloadSafetySnapshot}
        onDuplicateCurrentBoard={duplicateCurrentBoard}
        onExportCurrentBoard={handleDataExportCurrentBoard}
        onExportWorkspace={handleDataExportWorkspace}
        onImportLocalAssets={handleDataImportLocalAssets}
        onImportWorkspace={handleDataImportWorkspace}
        onRepairAssetSources={handleDataRepairAssetSources}
        onResetBoards={handleDataResetBoards}
        onSaveCredential={handleSaveCredential}
        onSelectImageEditFeatureModel={selectImageEditFeatureModel}
        onSelectChatModel={handleSelectChatModel}
        onSelectProvider={handleSelectProvider}
        onDeleteCustomProvider={deleteCustomProvider}
        refreshProviderModels={refreshProviderModels}
        testProviderConnection={testProviderConnection}
      />

      <FullscreenPreview
        item={fullscreenItem}
        items={items.filter(item => item.status === "complete")}
        onCaptureVideoFrame={(item, frame) =>
          handleCaptureVideoFrame(boardController.selectedNodeId ?? "", item, frame)
        }
        onSavePanoramaScreenshots={handleSavePanoramaScreenshots}
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
      {isMaskOpen && (
        <CanvasMaskEditor
          imageUrl={maskTargetUrl}
          isOpen={isMaskOpen}
          operation={maskEditOperation}
          onClose={() => {
            setIsMaskOpen(false);
            setMaskEditOperation(undefined);
            setMaskEditSourceItem(null);
            setMaskSourceNodeId(null);
          }}
          onSaveMask={saveMaskOutput}
        />
      )}
    </div>
  );
}
