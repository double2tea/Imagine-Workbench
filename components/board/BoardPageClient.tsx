"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { t as i18nT, useTranslations, type Locale } from "@/lib/i18n";
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
import VisualPromptAdjustEditor from "@/components/VisualPromptAdjustEditor";
import FullscreenPreview from "@/components/assets/FullscreenPreview";
import AssetLibraryModal from "@/components/library/AssetLibraryModal";
import PanoramaOverlay from "@/components/panorama/PanoramaOverlay";
import BoardInspector from "@/components/board/BoardInspector";
import BoardSidePanel from "@/components/board/BoardSidePanel";
import BoardSideAssetList from "@/components/board/BoardSideAssetList";
import BoardTaskQueuePanel from "@/components/board/BoardTaskQueuePanel";
import BoardWorkspace from "@/components/board/BoardWorkspace";
import SettingsModal from "@/components/settings/SettingsModal";
import WorkspaceNotices, { type WorkspaceNotice } from "@/components/workbench/WorkspaceNotices";
import type { AgentBoardContext, AgentBoardContextSnapshot, AgentBoardNodeDetail, AgentBoardNodeParams, AgentBoardNodeSummary } from "@/lib/agent-context";
import { getSendableAgentMediaReferences, type AgentReferenceInputSupport } from "@/lib/agent-chat-model";

import { useAgentController } from "@/hooks/useAgentController";
import { useAssetWorkspaceState } from "@/hooks/useAssetWorkspaceState";
import { useAssetLibrary, type LibraryAssetEntry } from "@/hooks/useAssetLibrary";
import { useBoardAssetStore } from "@/hooks/useBoardAssetStore";
import { collectPlacedBoardAssetIdsFromNodes } from "@/lib/assets/board-scope";
import { downloadStorageItemsZip, storageItemDownloadFileName } from "@/lib/assets/download-zip";
import { saveItemWithPreview } from "@/lib/assets/previews";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { estimateBoardNoteSize, estimateBoardPromptSize } from "@/lib/board/text-node-size";
import { findConnectedResultNodeForSourceStack } from "@/lib/board/utils";
import { buildBoardResultStackKey, type BoardResultStackValue } from "@/lib/board/result-stack";
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
import {
  useResolveConnectionCheck,
  useResolveIntegrationSettings,
} from "@/hooks/useResolveIntegrationSettings";
import { useImageEditFeatureModels } from "@/hooks/useImageEditFeatureModels";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import { persistDefaultGenerationModel, readDefaultGenerationModel } from "@/lib/default-generation-models";
import {
  imageEditFeatureLabel,
  imageQuickEditFallbackPrompt,
  type ImageQuickEditTarget,
  resolveImageQuickEditTarget,
  submitImageQuickEdit,
} from "@/lib/image-quick-edit-targets";
import { isVisualAdjustmentFeature } from "@/lib/image-visual-adjustment-prompts";
import {
  buildStorageItem,
  clearAllDB,
  deleteFromDB,
  saveToDB,
  type StorageItem,
} from "@/lib/db";
import {
  cancelGenerationTask,
  deleteGenerationTask,
  generationTaskToGalleryItem,
  legacyGenerationTaskId,
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
  resolveAsyncImageModelValue,
  tryParseProviderModel,
  type AiProvider,
  type AudioOperationMode,
  type ModelOption,
  type VideoReferenceMode,
} from "@/lib/providers/model-catalog";
import { getProviderMeta, type CustomProviderDefinition } from "@/lib/providers/registry";
import { RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS, isRunningHubYouchuanImageModel, runningHubAppPresetRequiresPrompt } from "@/lib/providers/runninghub";
import { saveClonedVoiceProfileFromAsset } from "@/lib/voice-profiles";
import type { RunningHubTaskNodeBinding, RunningHubYouchuanAdvancedSettings } from "@/lib/providers/types";
import {
  REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES,
  compressReferenceImageDataUrl,
  compressReferenceImageFile,
  prepareReferenceImageUrlForRequest,
  prepareReferenceMediaUrlForRequest,
} from "@/lib/reference-images";
import { DEFAULT_CINEMATIC_PROFILE, type CinematicProfile } from "@/lib/cinematic-controls";
import { transcriptFromDataUrl } from "@/lib/transcripts";
import {
  DEFAULT_AUDIO_ASSET_NODE_SIZE,
  DEFAULT_BOARD_ID,
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_GENERATE_NODE_SIZE,
  BOARD_PORT_IDS,
  composeBoardMultiGridImage,
  createEmptyBoard,
  boardNodeAbsolutePosition,
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
  type BoardSize,
  type BoardAssetReference,
  type BoardRunningHubAppNode,
  type BoardRunningHubAppNodeUpdate,
  type BoardRunningHubAppSchemaResult,
  type BoardSummary,
  type BoardVideoGenerateNode,
  type BoardVideoReferenceMode,
  analyzeRunningHubBindings,
  hasRunningHubBindingIdentity,
  parseRunningHubBindingsFromJsonText,
} from "@/lib/board";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import {
  getMediaReferenceType,
  mediaReferenceLabel,
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
import { API_ROUTES } from "@/lib/api/routes";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";

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

interface BoardImageQuickEditJob {
  controller: AbortController;
  editAspectRatio: string;
  editImageResolution: string;
  editImageUrl: string;
  editPrompt: string;
  guideUrl: string | undefined;
  maskUrl: string | undefined;
  operation: ImageEditFeature;
  pendingItem: StorageItem;
  pendingNodeId: string;
  pendingTaskIds: string[];
  target: ImageQuickEditTarget;
}

interface BoardMediaAnalysisResponse {
  text?: string;
  thought?: string;
}

const LARGE_BOARD_DATA_URL_MIN_LENGTH = 120_000;

function relatedQuickEditTaskIds(assetId: string): string[] {
  return [assetId, legacyGenerationTaskId(assetId)];
}

function hasLocallyCanceledQuickEdit(ids: string[], canceledIds: Set<string>): boolean {
  return ids.some(id => canceledIds.has(id));
}

function clearLocallyCanceledQuickEdit(ids: string[], canceledIds: Set<string>): void {
  for (const id of ids) canceledIds.delete(id);
}

async function runSequentialGenerationVariants(variantCount: number, run: () => Promise<boolean>): Promise<boolean[]> {
  const results: boolean[] = [];
  for (let index = 0; index < variantCount; index += 1) {
    results.push(await run());
  }
  return results;
}

function boardMediaAnalysisInstruction(locale: Locale): string {
  const outputLanguage = locale === "zh" ? "Simplified Chinese" : "English";
  return [
    `Analyze the attached media and write a structured note in ${outputLanguage}.`,
    "Use these sections in order, translating section headings naturally into the output language: Subject, Style, Camera, Lighting, Color, Motion, Generation Prompt.",
    "If the media is audio or includes audio, summarize sound content, rhythm, emotion, or visual/video prompt implications in the relevant sections.",
    "If there is no visual content, state that clearly in the Subject section.",
    "Keep the Generation Prompt section in English even when the rest of the note is not English.",
    "Do not return boardAction or recommendedAction. Put the note-ready analysis body in the text field.",
  ].join("\n");
}

interface BoardPageProps {
  boardId?: string;
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

const VIEWED_GENERATED_ASSET_IDS_STORAGE_PREFIX = "imagine_board_viewed_generated_asset_ids";

function viewedGeneratedAssetIdsStorageKey(boardId: string): string {
  return `${VIEWED_GENERATED_ASSET_IDS_STORAGE_PREFIX}:${boardId}`;
}

function readViewedGeneratedAssetIds(boardId: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(viewedGeneratedAssetIdsStorageKey(boardId));
    if (stored === null) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  } catch {
    return null;
  }
}

function persistViewedGeneratedAssetIds(boardId: string, assetIds: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(viewedGeneratedAssetIdsStorageKey(boardId), JSON.stringify(Array.from(assetIds).sort()));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function isGeneratedBoardMediaItem(item: StorageItem): boolean {
  return (
    (item.type === "audio" || item.type === "image" || item.type === "video") &&
    item.status === "complete" &&
    Boolean(item.sourceBoardNodeId)
  );
}

function getStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRunningHubAppSchemaResult(value: unknown): { name?: string; nodeInfoList: unknown[]; webappId: string } {
  if (!isUnknownRecord(value) || !Array.isArray(value.nodeInfoList)) {
    throw new Error("RunningHub field response missing nodeInfoList");
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
    pushWorkspaceNotice("error", `Local storage failed, may be lost after refresh: ${toErrorMessage(error, "IndexedDB write failed")}`);
    return null;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("File read result is not a Data URL"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
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
    throw new Error("Board only supports importing image, video, or audio files");
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
const BOARD_IMPORT_NODE_VISIBLE_GAP = 32;
const BOARD_IMPORT_NODE_VISUAL_OUTSET = {
  top: 36,
  right: 16,
  bottom: 42,
  left: 16,
} as const;
const BOARD_IMPORT_IMAGE_MAX_SIZE: BoardSize = { width: 420, height: 340 };
const BOARD_IMPORT_IMAGE_MIN_SIZE: BoardSize = { width: 220, height: 180 };

interface ImportedBoardItem {
  item: StorageItem;
  nodeSize: BoardSize;
}

function readImageDataUrlSize(url: string): Promise<BoardSize> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error(i18nT("board.import.imageSizeInvalid")));
        return;
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => reject(new Error(i18nT("board.import.imageSizeReadFailed")));
    image.src = url;
  });
}

function fitBoardImportImageNodeSize(size: BoardSize): BoardSize {
  if (size.width <= 0 || size.height <= 0) throw new Error(i18nT("board.import.imageSizeInvalid"));
  const aspectRatio = size.width / size.height;
  let width = BOARD_IMPORT_IMAGE_MAX_SIZE.width;
  let height = width / aspectRatio;

  if (height > BOARD_IMPORT_IMAGE_MAX_SIZE.height) {
    height = BOARD_IMPORT_IMAGE_MAX_SIZE.height;
    width = height * aspectRatio;
  }

  return {
    width: Math.round(Math.max(BOARD_IMPORT_IMAGE_MIN_SIZE.width, Math.min(BOARD_IMPORT_IMAGE_MAX_SIZE.width, width))),
    height: Math.round(Math.max(BOARD_IMPORT_IMAGE_MIN_SIZE.height, Math.min(BOARD_IMPORT_IMAGE_MAX_SIZE.height, height))),
  };
}

async function boardImportNodeSize(item: StorageItem): Promise<BoardSize> {
  if (item.type === "audio") return DEFAULT_AUDIO_ASSET_NODE_SIZE;
  if (item.type === "video") return DEFAULT_ASSET_NODE_SIZE;
  if (item.type !== "image") throw new Error("Board only supports importing image, video, or audio files");
  return fitBoardImportImageNodeSize(await readImageDataUrlSize(item.url));
}

function boardImportNodePositions(origin: BoardPoint, sizes: readonly BoardSize[]): BoardPoint[] {
  if (sizes.length === 0) return [];
  if (sizes.length === 1) return [origin];
  const columnCount = Math.min(BOARD_IMPORT_GRID_COLUMNS, sizes.length);
  const rowCount = Math.ceil(sizes.length / columnCount);
  const columnWidths = Array.from({ length: columnCount }, () => 0);
  const rowHeights = Array.from({ length: rowCount }, () => 0);

  sizes.forEach((size, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    columnWidths[column] = Math.max(
      columnWidths[column],
      size.width + BOARD_IMPORT_NODE_VISUAL_OUTSET.left + BOARD_IMPORT_NODE_VISUAL_OUTSET.right,
    );
    rowHeights[row] = Math.max(
      rowHeights[row],
      size.height + BOARD_IMPORT_NODE_VISUAL_OUTSET.top + BOARD_IMPORT_NODE_VISUAL_OUTSET.bottom,
    );
  });

  return sizes.map((_size, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const visualX = columnWidths.slice(0, column).reduce(
      (sum, width) => sum + width + BOARD_IMPORT_NODE_VISIBLE_GAP,
      origin.x - BOARD_IMPORT_NODE_VISUAL_OUTSET.left,
    );
    const visualY = rowHeights.slice(0, row).reduce(
      (sum, height) => sum + height + BOARD_IMPORT_NODE_VISIBLE_GAP,
      origin.y - BOARD_IMPORT_NODE_VISUAL_OUTSET.top,
    );
    return {
      x: visualX + BOARD_IMPORT_NODE_VISUAL_OUTSET.left,
      y: visualY + BOARD_IMPORT_NODE_VISUAL_OUTSET.top,
    };
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
  edges: BoardDocument["edges"],
  node: ExecutableBoardNode,
  items: StorageItem[],
): StorageItem | undefined {
  const resultNode = findConnectedResultNodeForSourceStack(nodes, edges, node.id, node.resultStackKey ?? "");
  if (resultNode) {
    const resultItem = items.find(item => item.id === resultNode.activeAssetId && item.status === "complete");
    if (resultItem) return resultItem;
  }
  return undefined;
}

interface DetachedSourceResultMetadata {
  assetIds: string[];
  resultStackKey: string;
  sourceNodeId: string;
}

function detachedSourceResultMetadata(board: BoardDocument, edgeId: string): DetachedSourceResultMetadata | null {
  const edge = board.edges.find(item => item.id === edgeId);
  if (
    !edge ||
    edge.from.portId !== BOARD_PORT_IDS.resultOut ||
    edge.to.portId !== BOARD_PORT_IDS.assetIn
  ) {
    return null;
  }
  const resultNode = board.nodes.find(node => node.id === edge.to.nodeId);
  if (resultNode?.kind !== "result") return null;
  return {
    assetIds: Array.from(new Set(resultNode.resultAssetIds)),
    resultStackKey: resultNode.resultStackKey,
    sourceNodeId: resultNode.sourceNodeId,
  };
}

function isDetachedSourceResultItem(item: StorageItem, metadata: DetachedSourceResultMetadata): boolean {
  return metadata.assetIds.includes(item.id) &&
    item.sourceBoardNodeId === metadata.sourceNodeId &&
    (item.sourceBoardResultStackKey ?? "") === metadata.resultStackKey;
}

function isMediaStorageItem(item: StorageItem): item is StorageItem & { type: MediaReferenceType } {
  return item.type === "image" || item.type === "video" || item.type === "audio";
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

function downloadableBoardNodeStorageItem(
  node: BoardNode | undefined,
  items: StorageItem[],
  boardId: string,
): StorageItem | null {
  if (!node || (node.kind !== "asset" && node.kind !== "result")) return null;

  const assetId = node.kind === "result" ? node.activeAssetId : node.asset.assetId;
  const storedItem = items.find(item => item.id === assetId && item.status === "complete");
  if (storedItem) return storedItem;
  if (assetId !== node.asset.assetId) return null;

  return buildStorageItem(
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
    { boardId },
  );
}

function activeBoardReference(
  nodes: ReturnType<typeof useBoardState>["board"]["nodes"],
  edges: ReturnType<typeof useBoardState>["board"]["edges"],
  selectedNodeId: string | null,
  items: StorageItem[],
  resolveUrl: BoardReferenceUrlResolver,
): ReferenceImageRef[] {
  const node = nodes.find(item => item.id === selectedNodeId);
  if (!node) return [];
  if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") {
    const item = activeExecutableResultItem(nodes, edges, node, items);
    return item && isMediaStorageItem(item) ? [{ id: item.id, type: item.type, url: resolveUrl(item.id, item.url), role: "general" }] : [];
  }
  if (node.kind !== "asset") return [];
  return [{ id: node.asset.assetId, type: node.asset.type, url: resolveUrl(node.asset.assetId, node.asset.url), role: "general" }];
}

function boardNodeReferences(
  node: BoardDocument["nodes"][number] | undefined,
  nodes: BoardDocument["nodes"],
  edges: BoardDocument["edges"],
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
    const item = activeExecutableResultItem(nodes, edges, node, items);
    return item && isMediaStorageItem(item) ? [{ id: item.id, type: item.type, url: resolveUrl(item.id, item.url), role: "general" }] : [];
  }
  if (node?.kind === "result") {
    const item = items.find(current => current.id === node.activeAssetId && current.status === "complete");
    return item && isMediaStorageItem(item) ? [{ id: item.id, type: item.type, url: resolveUrl(item.id, item.url), role: "general" }] : [];
  }
  return [];
}

function resolveAgentSelectedNodeIds(selectedNodeIds: string[], selectedNodeId: string | null): string[] {
  const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
  return Array.from(new Set(ids));
}

function selectedBoardNodes(
  nodes: BoardDocument["nodes"],
  selectedNodeIds: string[],
): BoardDocument["nodes"] {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  return selectedNodeIds
    .map(nodeId => nodeById.get(nodeId))
    .filter((node): node is BoardDocument["nodes"][number] => node !== undefined);
}

function selectedBoardNodeReferences(
  selectedNodes: BoardDocument["nodes"],
  nodes: BoardDocument["nodes"],
  edges: BoardDocument["edges"],
  items: StorageItem[],
  resolveUrl: BoardReferenceUrlResolver,
): ReferenceImageRef[] {
  const referenceById = new Map<string, ReferenceImageRef>();
  for (const node of selectedNodes) {
    for (const reference of boardNodeReferences(node, nodes, edges, items, resolveUrl)) {
      if (!referenceById.has(reference.id)) {
        referenceById.set(reference.id, reference);
      }
    }
  }
  return Array.from(referenceById.values());
}

function uniqueBoardReferences(references: ReferenceImageRef[]): ReferenceImageRef[] {
  const seen = new Set<string>();
  const uniqueReferences: ReferenceImageRef[] = [];
  for (const reference of references) {
    const key = `${reference.id}:${reference.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueReferences.push(reference);
  }
  return uniqueReferences;
}

function readAgentInputSupportPayload(payload: unknown): AgentReferenceInputSupport | null {
  if (typeof payload !== "object" || payload === null || !("inputSupport" in payload)) return null;
  const inputSupport = payload.inputSupport;
  if (typeof inputSupport !== "object" || inputSupport === null) return null;
  return {
    audio: "audio" in inputSupport && typeof inputSupport.audio === "boolean" ? inputSupport.audio : null,
    image: "image" in inputSupport && typeof inputSupport.image === "boolean" ? inputSupport.image : null,
    video: "video" in inputSupport && typeof inputSupport.video === "boolean" ? inputSupport.video : null,
  };
}

async function prepareAgentAnalysisReferences(references: ReferenceImageRef[]): Promise<ReferenceImageRef[]> {
  return Promise.all(references.map(async reference => {
    if (getMediaReferenceType(reference) !== "audio") return reference;
    return { ...reference, url: await prepareReferenceMediaUrlForRequest(reference.url) };
  }));
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
    return i18nT("board.runninghubFillRealId");
  }
  const readiness = analyzeRunningHubBindings(node.bindings, prompt, referenceCount);
  if (readiness.missingCount > 0) return i18nT("board.runninghub.missingFieldCount", { count: readiness.missingCount });
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
  runningHubYouchuan?: RunningHubYouchuanAdvancedSettings;
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
    runningHubYouchuan: isRunningHubYouchuanImageModel(model) ? RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS : undefined,
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
    if (params?.cinematicProfile) update.cinematicProfile = params.cinematicProfile;
  } else if (node.kind === "video-generate") {
    if (params?.videoResolution?.trim()) update.videoResolution = params.videoResolution;
    if (params?.videoDuration?.trim()) update.videoDuration = params.videoDuration;
    if (params?.videoPreset?.trim()) update.videoPreset = params.videoPreset;
    if (params?.videoReferenceMode) update.videoReferenceMode = params.videoReferenceMode;
    if (params?.cinematicProfile) update.cinematicProfile = params.cinematicProfile;
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
      cinematicProfile: operation.cinematicProfile ?? DEFAULT_CINEMATIC_PROFILE,
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
    cinematicProfile: operation.cinematicProfile ?? DEFAULT_CINEMATIC_PROFILE,
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
    if (!operation.prompt?.trim()) throw new Error(i18nT("board.agent.promptContentMissing"));
    return { ...node, prompt: operation.prompt, updatedAt };
  }
  if (node.kind === "note") {
    const body = operation.body ?? operation.prompt;
    if (!body?.trim()) throw new Error(i18nT("board.agent.noteContentMissing"));
    return { ...node, body, updatedAt };
  }
  if (node.kind === "agent") {
    const instruction = operation.instruction ?? operation.prompt;
    if (!instruction?.trim()) throw new Error(i18nT("board.agent.instructionContentMissing"));
    return { ...node, instruction, updatedAt };
  }
  if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation") {
    if (node.status === "processing") throw new Error(i18nT("board.agent.nodeProcessingCannotUpdate"));
    const update = buildGenerateNodeUpdate(node, operation);
    if (!hasGenerateNodeUpdate(update)) throw new Error(i18nT("board.agent.generationParamsMissing"));
    return { ...node, ...update, updatedAt };
  }
  throw new Error(i18nT("board.agent.unsupportedNodeType"));
}

function validateBoardPatch(patch: AgentBoardPatch, currentNodes: BoardNode[]): void {
  if (patch.operations.length === 0) throw new Error(i18nT("board.agent.patchMissingOperations"));
  if (patch.operations.length > AGENT_BOARD_PATCH_MAX_OPERATIONS) {
    throw new Error(i18nT("board.agent.patchInvalid"));
  }

  const previewNodes = [...currentNodes];
  const tempIds = new Set<string>();
  patch.operations.forEach((operation, index) => {
    if (operation.op === "create_node") {
      if (!operation.tempId.trim()) throw new Error(i18nT("board.agent.patchInvalid"));
      if (tempIds.has(operation.tempId) || currentNodes.some(node => node.id === operation.tempId)) {
        throw new Error(i18nT("board.agent.patchInvalid"));
      }
      tempIds.add(operation.tempId);
      previewNodes.push(createPreviewBoardNode(operation, index));
      return;
    }
    if (operation.op === "update_node") {
      if (tempIds.has(operation.nodeId)) {
        throw new Error(i18nT("board.agent.patchInvalid"));
      }
      const indexToUpdate = previewNodes.findIndex(node => node.id === operation.nodeId);
      if (indexToUpdate < 0) throw new Error(i18nT("board.agent.nodeNotFoundForUpdate"));
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
  currentEdges: BoardDocument["edges"],
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
      references.push(...boardNodeReferences(sourceNode, currentNodes, currentEdges, items, resolveUrl));
    }
  });
  return { prompt, references };
}

function summarizeBoardNodeForAgent(node: BoardDocument["nodes"][number], draftText?: string): AgentBoardNodeSummary {
  const params = summarizeBoardNodeParamsForAgent(node);
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
        params,
        status: node.status,
      };
    case "runninghub-app":
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        prompt: sliceAgentText(draftText ?? node.prompt),
        model: runningHubAppModelValue(node),
        params,
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

function summarizeBoardNodeParamsForAgent(node: BoardDocument["nodes"][number]): AgentBoardNodeParams | undefined {
  switch (node.kind) {
    case "image-generate":
      return {
        customImageResolution: node.customImageResolution,
        errorMessage: node.errorMessage,
        imageQuality: node.imageQuality,
        imageResolution: node.imageResolution,
        resultAssetId: node.resultAssetId,
        resultAssetIds: node.resultAssetIds,
        resultStackKey: node.resultStackKey,
        thinkingLevel: node.thinkingLevel,
        variantCount: node.variantCount,
      };
    case "video-generate":
      return {
        errorMessage: node.errorMessage,
        resultAssetId: node.resultAssetId,
        resultAssetIds: node.resultAssetIds,
        resultStackKey: node.resultStackKey,
        variantCount: node.variantCount,
        videoDuration: node.videoDuration,
        videoPreset: node.videoPreset,
        videoReferenceMode: node.videoReferenceMode,
        videoResolution: node.videoResolution,
      };
    case "audio-operation":
      return {
        asrLanguage: node.asrLanguage,
        audioFormat: node.audioFormat,
        audioMode: node.audioMode,
        audioStylePrompt: node.audioStylePrompt,
        errorMessage: node.errorMessage,
        resultAssetId: node.resultAssetId,
        resultAssetIds: node.resultAssetIds,
        resultStackKey: node.resultStackKey,
        variantCount: node.variantCount,
        voiceCloneConsentAccepted: node.voiceCloneConsentAccepted,
        voiceProfileId: node.voiceProfileId,
      };
    case "runninghub-app":
      return {
        bindingCount: node.bindings.length,
        errorMessage: node.errorMessage,
        outputType: node.outputType,
        resultAssetId: node.resultAssetId,
        resultAssetIds: node.resultAssetIds,
        resultStackKey: node.resultStackKey,
        targetId: node.targetId,
        targetType: node.targetType,
      };
    default:
      return undefined;
  }
}

function detailBoardNodeForAgent(node: BoardDocument["nodes"][number], draftText?: string): AgentBoardNodeDetail {
  const summary = summarizeBoardNodeForAgent(node, draftText);
  switch (node.kind) {
    case "image-generate":
    case "video-generate":
      return {
        ...summary,
        details: {
          cinematicProfile: node.cinematicProfile,
          ...(node.kind === "image-generate" && node.runningHubYouchuan ? { runningHubYouchuan: node.runningHubYouchuan } : {}),
        },
      };
    case "audio-operation":
      return {
        ...summary,
        details: {
          audioFormat: node.audioFormat,
          audioMode: node.audioMode,
          audioStylePrompt: node.audioStylePrompt,
          asrLanguage: node.asrLanguage,
          voiceCloneConsentAccepted: node.voiceCloneConsentAccepted,
          voiceProfileId: node.voiceProfileId,
        },
      };
    case "runninghub-app":
      return {
        ...summary,
        details: {
          bindings: node.bindings,
          outputType: node.outputType,
          targetId: node.targetId,
          targetType: node.targetType,
        },
      };
    case "reference-group":
      return { ...summary, details: { references: node.references } };
    case "multi-grid":
      return { ...summary, details: { aspectRatio: node.aspectRatio, gridSize: node.gridSize, items: node.items } };
    case "result":
      return { ...summary, details: { activeAssetId: node.activeAssetId, resultAssetIds: node.resultAssetIds, resultStackKey: node.resultStackKey, sourceNodeId: node.sourceNodeId } };
    default:
      return summary;
  }
}

function storageItemToBoardAssetReference(item: StorageItem): BoardAssetReference {
  return boardAssetReferenceFromStorageItem(item);
}

function quickEditNodeSize(sourceSize: BoardSize, operation: ImageEditFeature, outputSize?: BoardSize): BoardSize {
  if (operation !== "outpaint" || !outputSize || outputSize.width <= 0 || outputSize.height <= 0) {
    return sourceSize;
  }
  const aspectRatio = outputSize.width / outputSize.height;
  const area = sourceSize.width * sourceSize.height;
  const width = Math.max(1, Math.round(Math.sqrt(area * aspectRatio)));
  return {
    width,
    height: Math.max(1, Math.round(width / aspectRatio)),
  };
}

function boardNodeAdjacentPosition(
  nodes: BoardDocument["nodes"],
  sourceNode: Pick<BoardNode, "id" | "position" | "size">,
  gap: number = 40,
): BoardPoint {
  const position = boardNodeAbsolutePosition(nodes, sourceNode.id) ?? sourceNode.position;
  return {
    x: position.x + sourceNode.size.width + gap,
    y: position.y,
  };
}

function hasTranscriptNoteForAsset(nodes: BoardDocument["nodes"], assetId: string): boolean {
  return nodes.some(node => node.kind === "note" && node.source?.assetId === assetId);
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

function activeProcessingSourceStackItems(
  items: StorageItem[],
  tasks: GenerationTask[],
  sourceNode: ExecutableBoardNode,
): StorageItem[] {
  const activeItems = items
    .filter(item => item.type !== "transcript" && isSourceStackItem(item, sourceNode) && (item.status === "pending" || item.status === "processing"));
  const activeTaskItems = tasks
    .filter(task => isSourceStackTask(task, sourceNode) && (task.status === "pending" || task.status === "processing"))
    .map(generationTaskToGalleryItem)
    .filter((item): item is StorageItem => item !== null && item.type !== "transcript");
  const sortedItems = [...activeItems, ...activeTaskItems]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  return sortedItems.filter((item, index) => sortedItems.findIndex(candidate => candidate.id === item.id) === index);
}

function resultStackKeyForConfig({
  kind,
  model,
  params,
  prompt,
  references,
}: {
  kind: ExecutableBoardNode["kind"];
  model: string;
  params: BoardResultStackValue;
  prompt: string;
  references: readonly ReferenceImageRef[];
}): string {
  return buildBoardResultStackKey({ kind, model, params, prompt, references });
}

function cinematicProfileStackValue(profile: CinematicProfile): BoardResultStackValue {
  return {
    aperture: profile.aperture,
    camera: profile.camera,
    effect: profile.effect,
    enabled: profile.enabled,
    focalLength: profile.focalLength,
    lens: profile.lens,
    lighting: profile.lighting,
    movement: profile.movement,
    palette: profile.palette,
  };
}

function runningHubYouchuanStackValue(settings: RunningHubYouchuanAdvancedSettings | undefined): BoardResultStackValue {
  if (!settings) return null;
  return {
    chaos: settings.chaos,
    hd: settings.hd === true,
    iw: settings.iw,
    oref: settings.oref ?? "",
    ow: settings.ow ?? "",
    raw: settings.raw,
    sref: settings.sref ?? "",
    stylize: settings.stylize,
    sw: settings.sw,
    tile: settings.tile === true,
    weird: settings.weird ?? "",
  };
}

function resultStackParamsForNode(node: ExecutableBoardNode): BoardResultStackValue {
  if (node.kind === "image-generate") {
    return {
      aspectRatio: node.aspectRatio,
      cinematicProfile: cinematicProfileStackValue(node.cinematicProfile),
      customImageResolution: node.customImageResolution,
      imageQuality: node.imageQuality ?? "",
      imageResolution: node.imageResolution,
      runningHubYouchuan: runningHubYouchuanStackValue(node.runningHubYouchuan),
      thinkingLevel: node.thinkingLevel ?? "",
    };
  }
  if (node.kind === "video-generate") {
    return {
      aspectRatio: node.aspectRatio,
      cinematicProfile: cinematicProfileStackValue(node.cinematicProfile),
      videoDuration: node.videoDuration ?? "",
      videoPreset: node.videoPreset ?? "",
      videoReferenceMode: node.videoReferenceMode ?? "",
      videoResolution: node.videoResolution ?? "",
    };
  }
  if (node.kind === "audio-operation") {
    return {
      asrLanguage: node.asrLanguage ?? "",
      audioFormat: node.audioFormat,
      audioMode: node.audioMode,
      audioStylePrompt: node.audioStylePrompt ?? "",
      voiceCloneConsentAccepted: node.voiceCloneConsentAccepted === true,
      voiceProfileId: node.voiceProfileId ?? "",
    };
  }
  return {
    accessPassword: node.accessPassword ?? "",
    bindings: node.bindings.map(binding => ({
      deliveryMode: binding.deliveryMode,
      enabled: binding.enabled !== false,
      fieldName: binding.fieldName,
      nodeId: binding.nodeId,
      referenceIndex: binding.referenceIndex ?? "",
      referenceType: binding.referenceType ?? "",
      required: binding.required === true,
      source: binding.source,
      value: binding.value,
      valueType: binding.valueType ?? "",
    })),
    outputType: node.outputType,
    targetId: node.targetId,
    targetType: node.targetType,
  };
}

function resultStackKeyForNode(node: ExecutableBoardNode, input: { prompt: string; references: readonly ReferenceImageRef[] }): string {
  return resultStackKeyForConfig({
    kind: node.kind,
    model: node.kind === "runninghub-app" ? runningHubAppModelValue(node) : node.model,
    params: resultStackParamsForNode(node),
    prompt: input.prompt,
    references: input.references,
  });
}

function patchGenerateNodeForStackKey(operation: AgentBoardPatchCreateNodeOperation, generatedNodeId: string): GenerateBoardNode {
  const previewNode = createPreviewBoardNode(operation, 0);
  if (!isGenerateBoardNode(previewNode)) {
    throw new Error(i18nT("board.agent.unsupportedNodeType"));
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

function latestCompleteSourceStackItem(items: StorageItem[], sourceNode: ExecutableBoardNode): StorageItem | undefined {
  return items
    .filter(item => item.type !== "transcript" && isSourceStackItem(item, sourceNode) && item.status === "complete")
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
}

function appendUniqueResultAssetId(assetIds: string[], assetId: string): string[] {
  return assetIds.includes(assetId) ? assetIds : [...assetIds, assetId];
}

function terminalResultUpdate(
  items: StorageItem[],
  tasks: GenerationTask[],
  sourceNode: ExecutableBoardNode,
  terminalItem: StorageItem,
  status: BoardGenerationStatus,
  errorMessage: string,
) {
  const activeCompleteItem = latestCompleteSourceStackItem(items, sourceNode);
  const activeProcessingItems = status === "processing" && !activeCompleteItem ? activeProcessingSourceStackItems(items, tasks, sourceNode) : [];
  const activeItem = activeCompleteItem ?? activeProcessingItems[activeProcessingItems.length - 1] ?? terminalItem;
  const activeProcessingIds = activeProcessingItems.map(item => item.id);
  const resultAssetIds = activeCompleteItem
    ? sourceStackResultAssetIds(items, sourceNode, activeCompleteItem.id)
    : activeProcessingIds.length > 0
      ? appendUniqueResultAssetId(activeProcessingIds, terminalItem.id)
    : appendResultAssetId(sourceNode, terminalItem.id);
  return {
    asset: storageItemToBoardAssetReference(activeItem),
    errorMessage: status === "failed" ? errorMessage : undefined,
    resultAssetId: activeItem.id,
    resultAssetIds,
    status,
  };
}

function boardRoute(id: string): string {
  return id === DEFAULT_BOARD_ID ? "/board" : `/board?boardId=${encodeURIComponent(id)}`;
}

function initialResolvedBoardId(boardId: string): string {
  if (boardId !== DEFAULT_BOARD_ID) return boardId;
  if (typeof window === "undefined") return boardId;
  return new URLSearchParams(window.location.search).get("boardId")?.trim() || boardId;
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
  const { t, locale } = useTranslations();
  const { t: creationT } = useTranslations("creation");
  const router = useRouter();
  const [resolvedBoardId, setResolvedBoardId] = useState(() => initialResolvedBoardId(boardId));
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
  const [selectedModel, setSelectedModel] = useState(() => readDefaultGenerationModel("image"));
  const [selectedVideoModel, setSelectedVideoModel] = useState(() => readDefaultGenerationModel("video"));
  const [selectedAudioModel, setSelectedAudioModel] = useState(() => readDefaultGenerationModel("audio"));
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageResolution, setImageResolution] = useState("2K");
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
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
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
  const [viewedGeneratedAssetIds, setViewedGeneratedAssetIds] = useState<Set<string>>(() => new Set());
  const selectOnlyBoardNode = useCallback((nodeId: string): void => {
    boardController.selectNode(nodeId);
    boardController.selectEdge(null);
    setSelectedNodeIds([nodeId]);
  }, [boardController]);
  const focusNodeSeqRef = useRef(0);
  const originalAssetPromoteIdsRef = useRef<Set<string>>(new Set());
  const viewedGeneratedAssetBoardIdRef = useRef<string | null>(null);
  const [focusNodeRequest, setFocusNodeRequest] = useState<{ nodeId: string; seq: number } | null>(null);
  const [preserveTasksRevealKey, setPreserveTasksRevealKey] = useState<string | null>(null);
  const requestFocusNode = useCallback((nodeId: string) => {
    focusNodeSeqRef.current += 1;
    setFocusNodeRequest({ nodeId, seq: focusNodeSeqRef.current });
  }, []);
  const requestTaskQueueFocusNode = useCallback((nodeId: string) => {
    setPreserveTasksRevealKey(nodeId);
    requestFocusNode(nodeId);
  }, [requestFocusNode]);
  const clearPreserveTasksRevealKey = useCallback(() => {
    setPreserveTasksRevealKey(null);
  }, []);
  const [assetCompareRequest, setAssetCompareRequest] = useState<{ originalUrl: string; resultUrl: string } | null>(null);
  const [cancelingBoardItemIds, setCancelingBoardItemIds] = useState<string[]>([]);
  const handledBoardItemIdsRef = useRef<Set<string>>(new Set());
  const handledBoardTaskIdsRef = useRef<Set<string>>(new Set());
  const pollingFailuresRef = useRef<Record<string, number>>({});
  const generationAbortControllersRef = useRef<Record<string, AbortController>>({});
  const locallyCanceledItemIdsRef = useRef<Set<string>>(new Set());
  const analyzingBoardMediaNodeIdsRef = useRef<Set<string>>(new Set());
  const workspaceNoticeSequenceRef = useRef(0);
  const confirmAction = useConfirm();
  const generatedBoardAssetIds = useMemo(
    () => new Set(items.filter(isGeneratedBoardMediaItem).map(item => item.id)),
    [items],
  );

  useEffect(() => {
    viewedGeneratedAssetBoardIdRef.current = null;
    setViewedGeneratedAssetIds(new Set());
  }, [resolvedBoardId]);

  useEffect(() => {
    if (boardAssetsLoading || !isBoardAssetScopeLoaded) return;
    if (viewedGeneratedAssetBoardIdRef.current === resolvedBoardId) return;
    const stored = readViewedGeneratedAssetIds(resolvedBoardId);
    const initialViewedAssetIds = stored ?? new Set(generatedBoardAssetIds);
    viewedGeneratedAssetBoardIdRef.current = resolvedBoardId;
    setViewedGeneratedAssetIds(initialViewedAssetIds);
    if (stored === null) persistViewedGeneratedAssetIds(resolvedBoardId, initialViewedAssetIds);
  }, [boardAssetsLoading, generatedBoardAssetIds, isBoardAssetScopeLoaded, resolvedBoardId]);

  const markGeneratedAssetsViewed = useCallback((assetIds: readonly string[]) => {
    const nextAssetIds = assetIds.filter(assetId => assetId.trim().length > 0 && generatedBoardAssetIds.has(assetId));
    if (nextAssetIds.length === 0) return;
    setViewedGeneratedAssetIds(current => {
      let didChange = false;
      const next = new Set(current);
      for (const assetId of nextAssetIds) {
        if (next.has(assetId)) continue;
        next.add(assetId);
        didChange = true;
      }
      if (!didChange) return current;
      persistViewedGeneratedAssetIds(resolvedBoardId, next);
      return next;
    });
  }, [generatedBoardAssetIds, resolvedBoardId]);

  const dismissWorkspaceNotice = useCallback((id: string) => {
    setWorkspaceNotices(prev => prev.filter(notice => notice.id !== id));
  }, []);

  const pushWorkspaceNotice = useCallback((type: NoticeType, message: string) => {
    workspaceNoticeSequenceRef.current += 1;
    const id = `${makeClientId("notice")}_${workspaceNoticeSequenceRef.current}`;
    setWorkspaceNotices(prev => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => dismissWorkspaceNotice(id), 8000);
  }, [dismissWorkspaceNotice]);

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
    void listBoardSummariesFromDB()
      .then(summaries => {
        if (isActive) setBoardSummaries(summaries);
      })
      .catch(error => {
        if (isActive) pushWorkspaceNotice("error", `Board list read failed: ${toErrorMessage(error, "IndexedDB read failed")}`);
      });
    return () => {
      isActive = false;
    };
  }, [pushWorkspaceNotice, t]);

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
      if (isActive) pushWorkspaceNotice("error", toErrorMessage(error, "Old board media preview migration failed"));
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
    pushWorkspaceNotice("success", "Cloned voice profile saved");
  }, [pushWorkspaceNotice, selectedProvider, voiceProfileSourceItem]);

  const imageCapabilities = getImageModelCapabilities(selectedModel);
  const videoCapabilities = getVideoModelCapabilities(selectedVideoModel);
  const audioCapabilities = getAudioModelCapabilities(selectedAudioModel);
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
    if (!response.ok) throw new Error(await readFetchError(response, t("board.runninghub.schemaReadFailed")));
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
    t,
    videoReferenceLimit: videoCapabilities.maxReferenceImages,
    videoReferenceMediaTypes: videoCapabilities.referenceMediaTypes,
    videoReferenceMode: activeVideoReferenceMode,
    pushWorkspaceNotice,
    setAgentInput,
    setPrompt,
  });

  const asyncImageModel = resolveAsyncImageModelValue(selectedModel, referenceImages.length);
  const canUseBackgroundImageGeneration = asyncImageModel !== null;
  const activeImageModel = imageSubmitCount > 0 && canUseBackgroundImageGeneration
    ? asyncImageModel ?? selectedModel
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
  const assetLibrary = useAssetLibrary();
  const resolveBoardReferenceUrl = useCallback<BoardReferenceUrlResolver>((assetId, fallbackUrl) => {
    const item = items.find(entry => entry.id === assetId);
    return item && item.status === "complete" && item.url.trim() ? item.url : fallbackUrl;
  }, [items]);
  const resolveOriginalStorageItem = useCallback(async (item: StorageItem): Promise<StorageItem> => {
    const storedItem = items.find(entry => entry.id === item.id) ?? item;
    const originalUrl = await resolveAssetOriginalUrl(storedItem);
    if (!originalUrl.trim()) {
      throw new Error("Original media not found");
    }
    return { ...storedItem, url: originalUrl };
  }, [items]);
  const saveBoardDerivedAsset = useCallback(async (item: StorageItem): Promise<StorageItem | null> => {
    const savedItem = await saveItemOrWarn(item, pushWorkspaceNotice);
    if (!savedItem) return null;
    setItems(prev => [savedItem, ...prev.filter(current => current.id !== savedItem.id)]);
    return savedItem;
  }, [pushWorkspaceNotice, setItems]);
  const deleteBoardEdge = useCallback(async (edgeId: string): Promise<void> => {
    const detachMetadata = detachedSourceResultMetadata(boardController.board, edgeId);
    if (detachMetadata) {
      const itemsToUpdate = items.filter(item => isDetachedSourceResultItem(item, detachMetadata));
      try {
        await Promise.all(itemsToUpdate.map(async item => {
          const originalItem = await resolveOriginalStorageItem(item);
          await saveToDB({
            ...originalItem,
            sourceBoardNodeId: undefined,
            sourceBoardResultStackKey: undefined,
          });
        }));
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, t("board.workspace.resultDetachFailed")));
        return;
      }
      if (itemsToUpdate.length > 0) {
        setItems(current => current.map(item =>
          isDetachedSourceResultItem(item, detachMetadata)
            ? { ...item, sourceBoardNodeId: undefined, sourceBoardResultStackKey: undefined }
            : item,
        ));
      }
    }
    boardController.deleteEdge(edgeId);
    if (detachMetadata) {
      pushWorkspaceNotice("info", t("board.workspace.resultDetachedToMedia"));
    }
  }, [boardController, items, pushWorkspaceNotice, resolveOriginalStorageItem, setItems, t]);
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
        console.error("Original board asset promotion failed:", error);
      },
    );
  }, [resolveOriginalStorageItem, setItems]);
  const handleOpenFullscreen = useCallback((item: StorageItem | null) => {
    if (!item) {
      setFullscreenItem(null);
      return;
    }
    markGeneratedAssetsViewed([item.id]);
    void resolveOriginalStorageItem(item).then(
      setFullscreenItem,
      error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.originalMediaReadFailed"))),
    );
  }, [markGeneratedAssetsViewed, pushWorkspaceNotice, resolveOriginalStorageItem, t]);
  const handleOpenPanorama = useCallback((item: StorageItem) => {
    markGeneratedAssetsViewed([item.id]);
    void resolveOriginalStorageItem(item).then(
      setPanoramaItem,
      error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.originalImageReadFailed"))),
    );
  }, [markGeneratedAssetsViewed, pushWorkspaceNotice, resolveOriginalStorageItem, t]);
  const handleDownloadAsset = useCallback((item: StorageItem, fileNameLabel?: string) => {
    void resolveOriginalStorageItem(item).then(
      originalItem => {
        const link = document.createElement("a");
        link.href = originalItem.url;
        link.download = storageItemDownloadFileName(originalItem, { label: fileNameLabel, prefix: "board_creation" });
        document.body.appendChild(link);
        link.click();
        link.remove();
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, "Original media download failed")),
    );
  }, [pushWorkspaceNotice, resolveOriginalStorageItem, t]);
  const handleSaveVoiceProfileSource = useCallback((item: StorageItem) => {
    void resolveOriginalStorageItem(item).then(
      setVoiceProfileSourceItem,
      error => pushWorkspaceNotice("error", toErrorMessage(error, "Original audio read failed")),
    );
  }, [pushWorkspaceNotice, resolveOriginalStorageItem, t]);
  const resolveOriginalReferences = useCallback(async (references: ReferenceImageRef[]): Promise<ReferenceImageRef[]> => {
    return Promise.all(references.map(async reference => {
      const item = items.find(entry => entry.id === reference.id);
      const originalUrl = item ? await resolveAssetOriginalUrl(item) : reference.url;
      if (!originalUrl.trim()) {
        throw new Error("Reference media original not found");
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
      prompt: t("common.agentRefLabel", { n: index + 1 }),
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
    const availableAssetIds = new Set([
      ...items.map(item => item.id),
      ...generationTasks
        .map(generationTaskToGalleryItem)
        .filter((item): item is StorageItem => item !== null)
        .map(item => item.id),
    ]);
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
  }, [boardAssetsLoading, boardController, generationTasks, isBoardAssetScopeLoaded, items]);

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
    runningHubYouchuan: RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS,
    selectedModel,
    selectedVideoModel,
    setGenerationTasks,
    setAudioSubmitCount,
    setImageSubmitCount,
    setItems,
    setVideoSubmitCount,
    t,
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

  const handleDefaultImageModelChange = useCallback((model: string) => {
    persistDefaultGenerationModel("image", model);
    handleSelectImageModel(model);
  }, [handleSelectImageModel]);

  const handleDefaultVideoModelChange = useCallback((model: string) => {
    persistDefaultGenerationModel("video", model);
    handleSelectVideoModel(model);
  }, [handleSelectVideoModel]);

  const handleDefaultAudioModelChange = useCallback((model: string) => {
    persistDefaultGenerationModel("audio", model);
    setSelectedAudioModel(model);
  }, []);

  const optimizeActivePrompt = async (promptOverride?: string) => {
    const promptToOptimize = promptOverride ?? prompt;
    if (!promptToOptimize.trim()) return;
    setIsOptimizing(true);
    try {
      const res = await fetch(API_ROUTES.prompts.optimize, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildProviderHeaders(selectedChatModel) },
        body: JSON.stringify({ prompt: promptToOptimize, model: selectedChatModel }),
      });
      if (!res.ok) throw new Error(await readFetchError(res, t("common.notices.promptOptimizationFailed")));
      const data: unknown = await res.json();
      const optimized = getStringField(data, "optimized");
      if (!optimized) throw new Error(t("common.notices.promptOptimizationBadFormat"));
      setPrompt(optimized);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.promptOptimizationFailed")));
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

  async function createBoardQuickEditProcessingAsset(
    sourceNodeId: string,
    sourceTitle: string,
    sourcePosition: BoardPoint,
    sourceSize: BoardSize,
    outputSize: BoardSize,
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    previewUrl: string,
    model: string,
    editPrompt: string,
  ): Promise<{ item: StorageItem; nodeId: string } | null> {
    const label = imageEditFeatureLabel(operation, creationT);
    const item = buildStorageItem(
      {
        id: makeClientId("img_edit"),
        type: "image",
        url: previewUrl,
      prompt: editPrompt || imageQuickEditFallbackPrompt(operation, sourceItem.prompt || sourceItem.id, creationT),
        model,
        aspectRatio: "auto",
        createdAt: new Date().toISOString(),
        status: "processing",
        progress: 15,
        maskOriginalId: sourceItem.id,
        sourceBoardNodeId: sourceNodeId,
      },
      { boardId: resolvedBoardId },
    );
    const savedItem = await saveItemOrWarn(item, pushWorkspaceNotice);
    if (!savedItem) return null;
    setItems(prev => [savedItem, ...prev]);
    const nodeId = boardController.addAssetNodeWithConnection(
      {
        asset: storageItemToBoardAssetReference(savedItem),
        size: outputSize,
        title: `${sourceTitle} ${label}`,
        position: {
          x: sourcePosition.x + sourceSize.width + 40,
          y: sourcePosition.y,
        },
      },
      { nodeId: sourceNodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" },
    );
    selectOnlyBoardNode(nodeId);
    pushWorkspaceNotice("info", `${label} started, result will update this node`);
    return { item: savedItem, nodeId };
  }

  async function completeBoardQuickEditAsset(
    nodeId: string,
    item: StorageItem,
    operation: ImageEditFeature,
    imageUrl: string,
  ) {
    const nextItem = buildStorageItem(
      {
        ...item,
        url: imageUrl,
        status: "complete",
        progress: 100,
      },
      { boardId: resolvedBoardId },
    );
    const savedItem = await saveItemOrWarn(nextItem, pushWorkspaceNotice);
    if (!savedItem) return;
    setItems(prev => prev.map(current => current.id === savedItem.id ? savedItem : current));
    boardController.updateAssetNodeAsset(nodeId, storageItemToBoardAssetReference(savedItem));
    const label = imageEditFeatureLabel(operation, creationT);
    pushWorkspaceNotice("success", `${label} complete, saved as new board asset`);
  }

  async function failBoardQuickEditAsset(nodeId: string, item: StorageItem, errorMessage: string) {
    const nextItem = buildStorageItem(
      {
        ...item,
        status: "failed",
        progress: 100,
        errorMessage,
      },
      { boardId: resolvedBoardId },
    );
    const savedItem = await saveItemOrWarn(nextItem, pushWorkspaceNotice);
    if (!savedItem) return;
    setItems(prev => prev.map(current => current.id === savedItem.id ? savedItem : current));
    boardController.updateAssetNodeAsset(nodeId, storageItemToBoardAssetReference(savedItem));
  }

  async function startBoardImageQuickEdit(
    sourceNodeId: string,
    sourceTitle: string,
    sourcePosition: BoardPoint,
    sourceSize: BoardSize,
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    editImageUrl: string,
    maskUrl: string | undefined,
    guideUrl: string | undefined,
    editPrompt: string,
    editImageResolution: string,
    editAspectRatio: string,
    outputSize?: BoardSize,
  ) {
    const target = resolveImageQuickEditTarget(operation, imageEditFeatureTargets[operation]);
    const pending = await createBoardQuickEditProcessingAsset(
      sourceNodeId,
      sourceTitle,
      sourcePosition,
      sourceSize,
      quickEditNodeSize(sourceSize, operation, outputSize),
      sourceItem,
      operation,
      editImageUrl,
      target.model,
      editPrompt,
    );
    if (!pending) return null;
    const pendingTaskIds = relatedQuickEditTaskIds(pending.item.id);
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
      pendingItem: pending.item,
      pendingNodeId: pending.nodeId,
      pendingTaskIds,
      target,
    };
  }

  async function finishBoardImageQuickEdit(job: BoardImageQuickEditJob) {
    const {
      controller,
      editAspectRatio,
      editImageResolution,
      editImageUrl,
      editPrompt,
      guideUrl,
      maskUrl,
      operation,
      pendingItem,
      pendingNodeId,
      pendingTaskIds,
      target,
    } = job;
    const label = imageEditFeatureLabel(operation, creationT);
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
      await completeBoardQuickEditAsset(
        pendingNodeId,
        pendingItem,
        operation,
        imageUrl,
      );
    } catch (error) {
      if (hasLocallyCanceledQuickEdit(pendingTaskIds, locallyCanceledItemIdsRef.current) || isAbortError(error)) {
        clearLocallyCanceledQuickEdit(pendingTaskIds, locallyCanceledItemIdsRef.current);
        return;
      }
      const message = toErrorMessage(error, `${label} failed`);
      await failBoardQuickEditAsset(pendingNodeId, pendingItem, message);
      pushWorkspaceNotice("error", message);
    } finally {
      for (const id of pendingTaskIds) delete generationAbortControllersRef.current[id];
    }
  }

  async function runBoardImageQuickEdit(
    sourceNodeId: string,
    sourceTitle: string,
    sourcePosition: BoardPoint,
    sourceSize: BoardSize,
    sourceItem: StorageItem,
    operation: ImageEditFeature,
    editImageUrl: string,
    maskUrl: string | undefined,
    guideUrl: string | undefined,
    editPrompt: string,
    editImageResolution: string,
    editAspectRatio: string,
    outputSize?: BoardSize,
  ) {
    const job = await startBoardImageQuickEdit(
      sourceNodeId,
      sourceTitle,
      sourcePosition,
      sourceSize,
      sourceItem,
      operation,
      editImageUrl,
      maskUrl,
      guideUrl,
      editPrompt,
      editImageResolution,
      editAspectRatio,
      outputSize,
    );
    if (!job) return;
    await finishBoardImageQuickEdit(job);
  }

  const saveMaskOutput = async (output: CanvasMaskEditorOutput) => {
    if (output.operation && maskEditSourceItem && maskSourceNodeId) {
      const sourceNode = boardController.board.nodes.find(node => node.id === maskSourceNodeId);
      if (!sourceNode || (sourceNode.kind !== "asset" && sourceNode.kind !== "result")) {
        pushWorkspaceNotice("error", "Image node not found for editing");
        return;
      }
      const job = await startBoardImageQuickEdit(
        sourceNode.id,
        sourceNode.title,
        boardNodeAbsolutePosition(boardController.board.nodes, sourceNode.id) ?? sourceNode.position,
        sourceNode.size,
        maskEditSourceItem,
        output.operation,
        output.imageBase64,
        output.maskBase64,
        output.mergedImageBase64,
        output.prompt,
        output.imageResolution,
        output.aspectRatio,
        output.outputSize,
      );
      if (!job) return;
      setIsMaskOpen(false);
      setMaskEditOperation(undefined);
      setMaskEditSourceItem(null);
      setMaskSourceNodeId(null);
      void finishBoardImageQuickEdit(job);
      return;
    }

    let compressedMergedImage: string;
    try {
      compressedMergedImage = await compressReferenceImageDataUrl(output.mergedImageBase64);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("board.quickEdit.maskCompressFailed")));
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
        pushWorkspaceNotice("error", t("board.quickEdit.cannotFindEditAssetNode"));
        return;
      }
      const editedTitle = `${sourceNode.title} local edit`;
      const editedPrompt = sourceNode.asset.prompt.trim()
        ? `${sourceNode.asset.prompt}\n${t("board.quickEdit.localEditPrompt", { title: sourceNode.title })}`
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
        position: boardNodeAdjacentPosition(boardController.board.nodes, sourceNode),
      });
      selectOnlyBoardNode(editedNodeId);
    } else {
      setReferenceImage(compressedMergedImage);
      setReferenceImages([{ id: nextReferenceId, url: compressedMergedImage, role: "general" }]);
      setPrompt(prev => `${t("common.references.promptPrefix")}${prev || t("common.references.emptyPromptPlaceholder")}`);
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
        ? t("board.quickEdit.maskAppliedToAgent")
        : maskDestination === "board-asset"
          ? t("board.quickEdit.maskAppliedToBoardAsset")
          : t("board.quickEdit.maskAppliedToCreative"),
    );
  };

  const buildAgentBoardContext = useCallback((): AgentBoardContext => {
    flushAllBoardText();
    const selectedIds = resolveAgentSelectedNodeIds(selectedNodeIds, boardController.selectedNodeId);
    const agentSelectedNodes = selectedBoardNodes(boardController.board.nodes, selectedIds);
    const agentSelectedNodeIds = agentSelectedNodes.map(node => node.id);
    const selectedReferences = selectedBoardNodeReferences(
      agentSelectedNodes,
      boardController.board.nodes,
      boardController.board.edges,
      items,
      resolveBoardReferenceUrl,
    );
    return {
      boardId: boardController.board.id,
      title: boardController.board.title,
      selectedNodeId: boardController.selectedNodeId,
      selectedNodeIds: agentSelectedNodeIds,
      selectedEdgeId: boardController.selectedEdgeId,
      selectedNodes: agentSelectedNodes.map(node => summarizeBoardNodeForAgent(node, getBoardTextDraft(node.id))),
      selectedNodeDetails: agentSelectedNodes.map(node => detailBoardNodeForAgent(node, getBoardTextDraft(node.id))),
      selectedAssetReferenceCount: selectedReferences.length,
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
    items,
    resolveBoardReferenceUrl,
    selectedNodeIds,
  ]);

  const getAgentBoardContextReferences = useCallback(async (): Promise<ReferenceImageRef[]> => {
    const selectedIds = resolveAgentSelectedNodeIds(selectedNodeIds, boardController.selectedNodeId);
    const agentSelectedNodes = selectedBoardNodes(boardController.board.nodes, selectedIds);
    const references = selectedBoardNodeReferences(
      agentSelectedNodes,
      boardController.board.nodes,
      boardController.board.edges,
      items,
      resolveBoardReferenceUrl,
    );
    return prepareAgentAnalysisReferences(await resolveOriginalReferences(references));
  }, [
    boardController.board.edges,
    boardController.board.nodes,
    boardController.selectedNodeId,
    items,
    resolveBoardReferenceUrl,
    resolveOriginalReferences,
    selectedNodeIds,
  ]);

  const getAgentBoardContextSnapshot = useCallback((): AgentBoardContextSnapshot | null => {
    const selectedIds = resolveAgentSelectedNodeIds(selectedNodeIds, boardController.selectedNodeId);
    const agentSelectedNodes = selectedBoardNodes(boardController.board.nodes, selectedIds);
    if (agentSelectedNodes.length === 0) return null;
    const selectedReferences = selectedBoardNodeReferences(
      agentSelectedNodes,
      boardController.board.nodes,
      boardController.board.edges,
      items,
      resolveBoardReferenceUrl,
    );
    return {
      assetCount: selectedReferences.length,
      boardTitle: boardController.board.title,
      nodeCount: agentSelectedNodes.length,
    };
  }, [
    boardController.board.edges,
    boardController.board.nodes,
    boardController.board.title,
    boardController.selectedNodeId,
    items,
    resolveBoardReferenceUrl,
    selectedNodeIds,
  ]);

  const handleAnalyzeBoardMedia = useCallback(async (nodeId: string): Promise<void> => {
    if (analyzingBoardMediaNodeIdsRef.current.has(nodeId)) {
      pushWorkspaceNotice("info", "Media analysis in progress");
      return;
    }
    const sourceNode = boardController.board.nodes.find(node => node.id === nodeId);
    if (!sourceNode || (sourceNode.kind !== "asset" && sourceNode.kind !== "result")) {
      pushWorkspaceNotice("error", "Please select a media node");
      return;
    }

    const previewReferences = boardNodeReferences(
      sourceNode,
      boardController.board.nodes,
      boardController.board.edges,
      items,
      resolveBoardReferenceUrl,
    );
    if (previewReferences.length === 0) {
      pushWorkspaceNotice("error", "Current media node has no analyzable assets");
      return;
    }

    const mediaType = getMediaReferenceType(previewReferences[0]);
    analyzingBoardMediaNodeIdsRef.current.add(nodeId);
    try {
      pushWorkspaceNotice("info", `Analyzing ${mediaReferenceLabel(mediaType)} media`);
      const supportResponse = await fetch(`/api/model-vision-support?model=${encodeURIComponent(selectedChatModel)}`);
      if (supportResponse.ok) {
        const inputSupport = readAgentInputSupportPayload(await supportResponse.json());
        if (inputSupport?.[mediaType] === false) {
          throw new Error(`Current Agent model does not support ${mediaReferenceLabel(mediaType)} analysis`);
        }
      }

      const references = getSendableAgentMediaReferences(
        await prepareAgentAnalysisReferences(await resolveOriginalReferences(previewReferences)),
      );
      if (references.length === 0) {
        throw new Error("Current media cannot be sent to Agent for analysis");
      }

      const response = await fetch(API_ROUTES.agent.respond, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildProviderHeaders(selectedChatModel) },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: boardMediaAnalysisInstruction(locale),
          }],
          surface: "board",
          boardContext: buildAgentBoardContext(),
          gallerySummary: items.map(item => ({
            id: item.id,
            type: item.type,
            prompt: item.prompt,
            aspectRatio: item.aspectRatio,
          })),
          agentReferences: references.map(reference => ({
            id: reference.id,
            type: getMediaReferenceType(reference),
            url: reference.url,
          })),
          agentReferenceId: references[0]?.id,
          model: selectedChatModel,
        }),
      });

      if (!response.ok) {
        throw new Error(await readFetchError(response, "Media analysis failed"));
      }

      const payload = await response.json() as BoardMediaAnalysisResponse;
      if (payload.thought === "Agent provider request failed.") {
        throw new Error(payload.text || "Media analysis failed");
      }
      const body = payload.text?.trim();
      if (!body) throw new Error("Media analysis returned no content");

      boardController.addNoteNodeWithConnection({
        title: `${sourceNode.title} analysis`,
        body,
        source: {
          assetId: references[0].id,
          model: selectedChatModel,
          sourceNodeId: sourceNode.id,
        },
        position: boardNodeAdjacentPosition(boardController.board.nodes, sourceNode, 48),
      }, {
        nodeId: sourceNode.id,
        portId: BOARD_PORT_IDS.assetOut,
        portKind: "asset",
      });
      pushWorkspaceNotice("success", "Media analysis Note created");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "Media analysis failed"));
    } finally {
      analyzingBoardMediaNodeIdsRef.current.delete(nodeId);
    }
  }, [
    boardController,
    buildAgentBoardContext,
    buildProviderHeaders,
    items,
    pushWorkspaceNotice,
    resolveOriginalReferences,
    selectedChatModel,
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
        pushWorkspaceNotice("error", "Agent board patch missing operations");
        return handledBoardAction(false);
      }
      flushAllBoardText();
      try {
        validateBoardPatch(patch, boardController.board.nodes);
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, "Agent board patch invalid"));
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
              const model = operation.model ?? selectedModel;
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
              const model = operation.model ?? selectedVideoModel;
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
                fallbackModel: selectedAudioModel,
                mode: operation.audioMode,
                model: operation.model,
                t,
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

      const executionNodeIds = runQueue.map(item => item.id);
      if (executionNodeIds.length > 1) {
        boardController.groupNodes(executionNodeIds);
      }

      let runFailureCount = 0;
      for (const item of runQueue) {
        const operation = item.operation;
        const audioSelection = operation.kind === "audio-operation"
          ? resolveAudioFunctionSelection({
            fallbackModel: selectedAudioModel,
            mode: operation.audioMode,
            model: operation.model,
            t,
          })
          : null;
        const model = audioSelection?.model ?? operation.model ?? (
          operation.kind === "image-generate" ? selectedModel : selectedVideoModel
        );
        const runInputs = resolveBoardPatchRunInputs(
          patch,
          operation,
          item.id,
          tempToRealIds,
          boardController.board.nodes,
          boardController.board.edges,
          items,
          resolveBoardReferenceUrl,
        );
        const promptValue = runInputs.prompt;
        const runReferences = await resolveOriginalReferences(runInputs.references);
        const isAsrAudioOperation = operation.kind === "audio-operation" && audioSelection?.mode === "asr";
        if (!promptValue && !isAsrAudioOperation) {
          boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "Batch generation node missing prompt" });
          runFailureCount += 1;
          continue;
        }
        const capability = getModelCapability(model, operation.kind === "image-generate" ? "image" : operation.kind === "video-generate" ? "video" : "audio");
        if (runReferences.length > 0 && !capability.supportsReferences) {
          boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "Current model does not support reference input" });
          runFailureCount += 1;
          continue;
        }
        if (operation.kind === "image-generate") {
          const defaults = imageActionDefaults(model, operation.aspectRatio);
          const resultStackKey = resultStackKeyForNode(
            patchGenerateNodeForStackKey(operation, item.id),
            { prompt: promptValue, references: runReferences },
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
            cinematicProfile: operation.cinematicProfile,
            model,
            prompt: promptValue,
            referenceImage: runReferences[0]?.url ?? null,
            referenceImages: runReferences,
            runningHubYouchuan: defaults.runningHubYouchuan,
            size: operation.aspectRatio ?? defaults.aspectRatio,
            thinkingLevel: operation.thinkingLevel ?? defaults.thinkingLevel,
          });
          if (!didStart) {
            runFailureCount += 1;
            boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "Image generation request not started" });
          }
        } else if (operation.kind === "video-generate") {
          const defaults = videoActionDefaults(model, operation.aspectRatio);
          const videoCapability = getVideoModelCapabilities(model);
          if (runReferences.length < videoCapability.minReferenceImages || runReferences.length > videoCapability.maxReferenceImages) {
            runFailureCount += 1;
            boardController.updateGenerateNode(item.id, {
              status: "failed",
              errorMessage: `Video model needs ${videoCapability.minReferenceImages}-${videoCapability.maxReferenceImages} reference images`,
            });
            continue;
          }
          const resultStackKey = resultStackKeyForNode(
            patchGenerateNodeForStackKey(operation, item.id),
            { prompt: promptValue, references: runReferences },
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
            cinematicProfile: operation.cinematicProfile,
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
            boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "Video generation request not started" });
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
              errorMessage: t("board.agent.audioModelNotSupportMediaTypeInput", { type: mediaReferenceLabel(getMediaReferenceType(unsupportedAudioReference)) }),
            });
            continue;
          }
          const resultStackKey = resultStackKeyForNode(
            patchGenerateNodeForStackKey(operation, item.id),
            { prompt: promptValue, references: runReferences },
          );
          boardController.updateGenerateNode(item.id, {
            status: "processing",
            errorMessage: undefined,
            prompt: promptValue,
            resultStackKey,
          });
          if (audioOperationRequiresStylePrompt(audioMode) && !operation.audioStylePrompt?.trim()) {
            const message = "Voice design needs description";
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
            boardController.updateGenerateNode(item.id, { status: "failed", errorMessage: "Audio generation request not started" });
          }
        }
      }

      if (runFailureCount > 0) {
        pushWorkspaceNotice("error", t("board.agent.patchAppliedWithFailures", { count: runFailureCount }));
        return handledBoardAction(false);
      }
      pushWorkspaceNotice("success", t("board.agent.patchApplied", { count: patch.operations.length }));
      return handledBoardAction(true);
    }

    if (isAgentImageToVideoAction(action)) {
      const targetNodeId = action.params?.nodeId?.trim() || boardController.selectedNodeId;
      const promptValue = action.params?.prompt?.trim();
      const model = action.params?.model?.trim();
      if (!targetNodeId) {
        pushWorkspaceNotice("error", t("board.agent.imageToVideoMissingNode"));
        return handledBoardAction(false);
      }
      if (!promptValue || !model) {
        pushWorkspaceNotice("error", t("board.agent.imageToVideoMissingPrompt"));
        return handledBoardAction(false);
      }
      const sourceNode = boardController.board.nodes.find(node => node.id === targetNodeId);
      if (!sourceNode) {
        pushWorkspaceNotice("error", t("board.agent.imageToVideoSourceNotFound"));
        return handledBoardAction(false);
      }
      const sourceResultNode = sourceNode.kind === "image-generate"
        ? findConnectedResultNodeForSourceStack(boardController.board.nodes, boardController.board.edges, sourceNode.id, sourceNode.resultStackKey ?? "")
        : undefined;
      const sourceReference = sourceNode.kind === "asset" && sourceNode.asset.type === "image"
        ? {
          assetId: sourceNode.asset.assetId,
          model: sourceNode.asset.model,
          prompt: sourceNode.asset.prompt,
          url: resolveBoardReferenceUrl(sourceNode.asset.assetId, sourceNode.asset.url),
        }
        : sourceNode.kind === "image-generate"
          ? (() => {
            const item = activeExecutableResultItem(boardController.board.nodes, boardController.board.edges, sourceNode, items);
            if (item?.type !== "image") return null;
            return item
              ? { assetId: item.id, model: item.model, prompt: item.prompt, url: resolveBoardReferenceUrl(item.id, item.url) }
              : null;
          })()
          : null;
      if (!sourceReference) {
        pushWorkspaceNotice("error", t("board.agent.imageToVideoNoImageAsset"));
        return handledBoardAction(false);
      }
      const defaults = videoActionDefaults(model, action.params?.aspectRatio);
      const capability = getModelCapability(model, "video");
      if (!capability.supportsReferences) {
        pushWorkspaceNotice("error", "Video model does not support reference continuation");
        return handledBoardAction(false);
      }
      const videoCapability = getVideoModelCapabilities(model);
      if (videoCapability.minReferenceImages > 1 || videoCapability.maxReferenceImages < 1) {
        pushWorkspaceNotice("error", `Video model needs ${videoCapability.minReferenceImages}-${videoCapability.maxReferenceImages} reference images`);
        return handledBoardAction(false);
      }

      const sourcePosition = boardNodeAbsolutePosition(boardController.board.nodes, sourceNode.id) ?? sourceNode.position;
      boardController.beginUndoGesture();
      const referenceSourceNodeId = sourceNode.kind === "asset"
        ? sourceNode.id
        : sourceResultNode?.id ?? "";
      if (!referenceSourceNodeId) {
        boardController.endUndoGesture();
        pushWorkspaceNotice("error", t("board.agent.imageToVideoNoConnectedMedia"));
        return handledBoardAction(false);
      }
      let videoNodeId = "";
      try {
        videoNodeId = boardController.addGenerateNode({
          kind: "video-generate",
          title: action.params?.title ?? t("board.agent.imageToVideoTitle"),
          prompt: promptValue,
          model,
          position: { x: sourcePosition.x + 720, y: sourcePosition.y },
          ...defaults,
          ...(action.params?.aspectRatio ? { aspectRatio: action.params.aspectRatio } : {}),
          ...(action.params?.cinematicProfile ? { cinematicProfile: action.params.cinematicProfile } : {}),
          ...(action.params?.videoResolution ? { videoResolution: action.params.videoResolution } : {}),
          ...(action.params?.videoDuration ? { videoDuration: action.params.videoDuration } : {}),
          ...(action.params?.videoPreset ? { videoPreset: action.params.videoPreset } : {}),
          ...(action.params?.videoReferenceMode ? { videoReferenceMode: action.params.videoReferenceMode } : {}),
        });
        boardController.connectPorts(
          { nodeId: referenceSourceNodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" },
          { nodeId: videoNodeId, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" },
        );
        selectOnlyBoardNode(videoNodeId);
      } finally {
        boardController.endUndoGesture();
      }
      if (action.params?.run === true) {
        const cinematicProfile = action.params.cinematicProfile ?? DEFAULT_CINEMATIC_PROFILE;
        const resultStackKey = resultStackKeyForConfig({
          kind: "video-generate",
          model,
          params: {
            aspectRatio: action.params.aspectRatio ?? defaults.aspectRatio,
            cinematicProfile: cinematicProfileStackValue(cinematicProfile),
            videoDuration: action.params.videoDuration ?? defaults.videoDuration ?? "",
            videoPreset: action.params.videoPreset ?? defaults.videoPreset ?? "",
            videoReferenceMode: action.params.videoReferenceMode ?? defaults.videoReferenceMode ?? "",
            videoResolution: action.params.videoResolution ?? defaults.videoResolution ?? "",
          },
          prompt: promptValue,
          references: [{ id: sourceReference.assetId, url: sourceReference.url, role: "general" }],
        });
        boardController.updateGenerateNode(videoNodeId, { status: "processing", errorMessage: undefined, resultStackKey });
        const reference = { id: sourceReference.assetId, url: sourceReference.url, role: "general" as const };
        const didStart = await generateManualVideo({
          boardId: resolvedBoardId,
          boardNodeId: videoNodeId,
          boardResultStackKey: resultStackKey,
          cinematicProfile,
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
          boardController.updateGenerateNode(videoNodeId, { status: "failed", errorMessage: t("board.agent.videoGenRequestNotStarted") });
          pushWorkspaceNotice("error", t("board.agent.imageToVideoCreated"));
          return handledBoardAction(false);
        }
      }
      pushWorkspaceNotice("success", action.params?.run === true ? t("board.agent.imageToVideoCreatedAndStarted") : t("board.agent.imageToVideoCreated"));
      return handledBoardAction(true);
    }

    if (isAgentBoardUpdateAction(action)) {
      const targetNodeId = action.params?.nodeId?.trim() || boardController.selectedNodeId;
      if (!targetNodeId) {
        pushWorkspaceNotice("error", t("board.agent.selectNodeForUpdate"));
        return handledBoardAction(false);
      }
      const node = boardController.board.nodes.find(item => item.id === targetNodeId);
      if (!node) {
        pushWorkspaceNotice("error", t("board.agent.nodeNotFoundForUpdate"));
        return handledBoardAction(false);
      }
      if ((node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation") && node.status === "processing") {
        pushWorkspaceNotice("error", t("board.agent.nodeProcessingCannotUpdate"));
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
          pushWorkspaceNotice("error", t("board.agent.promptContentMissing"));
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
          pushWorkspaceNotice("error", t("board.agent.noteContentMissing"));
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
          pushWorkspaceNotice("error", t("board.agent.instructionContentMissing"));
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
          pushWorkspaceNotice("error", toErrorMessage(error, t("board.agent.invalidGenerationParams")));
          return handledBoardAction(false);
        }
        if (!hasGenerateNodeUpdate(update)) {
          pushWorkspaceNotice("error", t("board.agent.generationParamsMissing"));
          return handledBoardAction(false);
        }
        boardController.beginUndoGesture();
        try {
          boardController.updateGenerateNode(node.id, update);
        } finally {
          boardController.endUndoGesture();
        }
      } else {
        pushWorkspaceNotice("error", t("board.agent.unsupportedNodeType"));
        return handledBoardAction(false);
      }
      selectOnlyBoardNode(node.id);
      pushWorkspaceNotice("success", t("board.agent.boardNodeUpdated"));
      return handledBoardAction(true);
    }

    if (isAgentBoardNoteAction(action)) {
      const body = action.params?.body?.trim() || action.params?.prompt?.trim();
      if (!body) {
        pushWorkspaceNotice("error", t("board.agent.boardNoteContentMissing"));
        return handledBoardAction(false);
      }
      boardController.addNoteNode({
        body,
        title: action.params?.title || t("board.agent.agentNoteTitle"),
        position: {
          x: 160 + boardController.board.nodes.length * 28,
          y: 180 + boardController.board.nodes.length * 24,
        },
      });
      pushWorkspaceNotice("success", t("board.agent.boardNoteCreated"));
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
        fallbackModel: selectedAudioModel,
        mode: action.params?.audioMode,
        model: action.params?.model,
        t,
      })
      : null;
    const model = audioSelection?.model ?? action.params?.model ?? (
      kind === "image-generate" ? selectedModel : selectedVideoModel
    );
    const actionRequiresPrompt = kind !== "audio-operation" || !audioSelection || audioOperationRequiresTextInput(audioSelection.mode);
    if (!promptFromAgent && actionRequiresPrompt) {
      pushWorkspaceNotice("error", t("board.agent.generationPromptMissing"));
      return handledBoardAction(false);
    }
    if (isPlaceholderRunningHubModel(model)) {
      pushWorkspaceNotice("error", t("board.agent.runninghubFillRealId"));
      return handledBoardAction(false);
    }
    const shouldRun = shouldRunAgentBoardFlow(action);
    const baseIndex = boardController.board.nodes.length;
    const promptNodeId = boardController.addPromptNode({
      prompt: promptFromAgent,
      position: { x: 120 + baseIndex * 32, y: 120 + baseIndex * 24 },
      title: t("board.agent.agentPromptTitle"),
    });
    const generatePosition = { x: 520 + baseIndex * 32, y: 120 + baseIndex * 24 };

    if (kind === "image-generate") {
      const defaults = {
        ...imageActionDefaults(model, action.params?.aspectRatio),
        ...(action.params?.aspectRatio ? { aspectRatio: action.params.aspectRatio } : {}),
        ...(action.params?.cinematicProfile ? { cinematicProfile: action.params.cinematicProfile } : {}),
        ...(action.params?.imageResolution ? { imageResolution: action.params.imageResolution } : {}),
        ...(action.params?.imageQuality ? { imageQuality: action.params.imageQuality } : {}),
        ...(action.params?.thinkingLevel ? { thinkingLevel: action.params.thinkingLevel } : {}),
      };
      const cinematicProfile = defaults.cinematicProfile ?? DEFAULT_CINEMATIC_PROFILE;
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
        const message = "Selected Agent image model does not support reference media input";
        boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
        pushWorkspaceNotice("error", message);
        return handledBoardAction(false);
      }
      const unsupportedImageReference = references.find(reference => getMediaReferenceType(reference) !== "image");
      if (unsupportedImageReference) {
        const message = `Image generation does not support ${mediaReferenceLabel(getMediaReferenceType(unsupportedImageReference))} reference`;
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
        pushWorkspaceNotice("success", "Agent image generation node flow created");
        return handledBoardAction(true);
      }

      const resultStackKey = resultStackKeyForConfig({
        kind: "image-generate",
        model,
        params: {
          aspectRatio: defaults.aspectRatio,
          customImageResolution: defaults.customImageResolution,
          imageQuality: defaults.imageQuality ?? "",
          imageResolution: defaults.imageResolution,
          cinematicProfile: cinematicProfileStackValue(cinematicProfile),
          runningHubYouchuan: runningHubYouchuanStackValue(defaults.runningHubYouchuan),
          thinkingLevel: defaults.thinkingLevel ?? "",
        },
        prompt: promptFromAgent,
        references,
      });
      boardController.updateGenerateNode(generateNodeId, { errorMessage: undefined, resultStackKey, status: "processing" });
      const didStart = await generateManualImage({
        boardId: resolvedBoardId,
        boardNodeId: generateNodeId,
        boardResultStackKey: resultStackKey,
        imageQuality: defaults.imageQuality,
        imageResolution: defaults.imageResolution,
        isCustomImageResolution: isCustomImageResolutionValue(defaults.imageResolution),
        cinematicProfile,
        model,
        prompt: promptFromAgent,
        referenceImage: references[0]?.url ?? null,
        referenceImages: references,
        runningHubYouchuan: defaults.runningHubYouchuan,
        size: defaults.aspectRatio,
        thinkingLevel: defaults.thinkingLevel,
      });
      if (!didStart) {
        boardController.updateGenerateNode(generateNodeId, {
          errorMessage: "Image generation request not started, check node params",
          status: "failed",
        });
        return handledBoardAction(false);
      }
      return handledBoardAction(true);
    }

    if (kind === "audio-operation") {
      if (!audioSelection) throw new Error("Audio function parse failed");
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
        const message = "Selected Agent audio model does not support reference media input";
        boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
        pushWorkspaceNotice("error", message);
        return handledBoardAction(false);
      }
      const audioCapability = getAudioModelCapabilities(model);
      const unsupportedAudioReference = references.find(reference => !audioCapability.referenceMediaTypes.includes(getMediaReferenceType(reference)));
      if (unsupportedAudioReference) {
        const message = t("board.agent.audioModelNotSupportMediaTypeInput", { type: mediaReferenceLabel(getMediaReferenceType(unsupportedAudioReference)) });
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
        pushWorkspaceNotice("success", t("board.agent.audioGenFlowCreated"));
        return handledBoardAction(true);
      }

      const resultStackKey = resultStackKeyForConfig({
        kind: "audio-operation",
        model,
        params: {
          asrLanguage: defaults.asrLanguage ?? "",
          audioFormat: defaults.audioFormat,
          audioMode: defaults.audioMode,
          audioStylePrompt: defaults.audioStylePrompt ?? "",
          voiceCloneConsentAccepted: defaults.voiceCloneConsentAccepted === true,
          voiceProfileId: defaults.voiceProfileId ?? "",
        },
        prompt: promptFromAgent,
        references,
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
          errorMessage: "Audio generation request not started, check node params",
          status: "failed",
        });
        return handledBoardAction(false);
      }
      return handledBoardAction(true);
    }

    const defaults = {
      ...videoActionDefaults(model, action.params?.aspectRatio),
      ...(action.params?.aspectRatio ? { aspectRatio: action.params.aspectRatio } : {}),
      ...(action.params?.cinematicProfile ? { cinematicProfile: action.params.cinematicProfile } : {}),
      ...(action.params?.videoResolution ? { videoResolution: action.params.videoResolution } : {}),
      ...(action.params?.videoDuration ? { videoDuration: action.params.videoDuration } : {}),
      ...(action.params?.videoPreset ? { videoPreset: action.params.videoPreset } : {}),
      ...(action.params?.videoReferenceMode ? { videoReferenceMode: action.params.videoReferenceMode } : {}),
    };
    const cinematicProfile = defaults.cinematicProfile ?? DEFAULT_CINEMATIC_PROFILE;
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
      const message = "Selected Agent video model does not support reference media input";
      boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
      pushWorkspaceNotice("error", message);
      return handledBoardAction(false);
    }
    const videoCapability = getVideoModelCapabilities(model);
    const unsupportedVideoReference = references.find(reference => !videoCapability.referenceMediaTypes.includes(getMediaReferenceType(reference)));
    if (unsupportedVideoReference) {
      const message = t("board.agent.agentVideoModelNotSupportReference");
      boardController.updateGenerateNode(generateNodeId, { errorMessage: message, status: "failed" });
      pushWorkspaceNotice("error", message);
      return handledBoardAction(false);
    }
    if (references.length < videoCapability.minReferenceImages || references.length > videoCapability.maxReferenceImages) {
      const message = t("board.agent.videoModelNeedsReferenceRange", { min: videoCapability.minReferenceImages, max: videoCapability.maxReferenceImages });
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
      pushWorkspaceNotice("success", "Agent video generation node flow created");
      return handledBoardAction(true);
    }

    const resultStackKey = resultStackKeyForConfig({
      kind: "video-generate",
      model,
      params: {
        aspectRatio: defaults.aspectRatio,
        cinematicProfile: cinematicProfileStackValue(cinematicProfile),
        videoDuration: defaults.videoDuration ?? "",
        videoPreset: defaults.videoPreset ?? "",
        videoReferenceMode: defaults.videoReferenceMode ?? "",
        videoResolution: defaults.videoResolution ?? "",
      },
      prompt: promptFromAgent,
      references,
    });
    boardController.updateGenerateNode(generateNodeId, { errorMessage: undefined, resultStackKey, status: "processing" });
    const didStart = await generateManualVideo({
      boardId: resolvedBoardId,
      boardNodeId: generateNodeId,
      boardResultStackKey: resultStackKey,
      cinematicProfile,
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
        errorMessage: "Video generation request not started, check node params",
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
    selectedAudioModel,
    selectedModel,
    selectedVideoModel,
    t,
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
    getBoardContextReferences: getAgentBoardContextReferences,
    getBoardContextSnapshot: getAgentBoardContextSnapshot,
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

  const cancelBoardAssetTaskNode = useCallback(async (nodeId: string): Promise<void> => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (node?.kind !== "asset") {
      pushWorkspaceNotice("error", t("board.agent.noLocalImageEditTask"));
      return;
    }
    const item = items.find(current => current.id === node.asset.assetId);
    if (!item || (item.status !== "pending" && item.status !== "processing")) {
      pushWorkspaceNotice("error", t("board.agent.noLocalImageEditTask"));
      return;
    }
    if (cancelingBoardItemIds.includes(item.id)) return;
    if (!(await confirmAction({
      message: t("board.agent.confirmCancelImageEditTask"),
      tone: "danger",
      confirmLabel: t("cancelTask"),
    }))) return;

    setCancelingBoardItemIds(prev => [...prev, item.id]);
    try {
      locallyCanceledItemIdsRef.current.add(item.id);
      generationAbortControllersRef.current[item.id]?.abort();
      await deleteFromDB(item.id);
      delete generationAbortControllersRef.current[item.id];
      delete pollingFailuresRef.current[item.id];
      setItems(prev => prev.filter(current => current.id !== item.id));
      boardController.deleteNode(nodeId);
      pushWorkspaceNotice("success", t("board.agent.imageEditTaskCanceledLocally"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("board.agent.imageEditTaskCancelFailed")));
    } finally {
      setCancelingBoardItemIds(prev => prev.filter(id => id !== item.id));
    }
  }, [
    boardController,
    cancelingBoardItemIds,
    confirmAction,
    generationAbortControllersRef,
    items,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    setItems,
  ]);

  const cancelBoardGenerationTask = useCallback(async (task: GenerationTask): Promise<void> => {
    const nodeId = task.source.boardNodeId;
    const sourceNode = nodeId ? findExecutableNodeById(boardController.board.nodes, nodeId) : undefined;
    if (!nodeId || !sourceNode) {
      pushWorkspaceNotice("error", t("board.agent.noSourceNodeToCancel"));
      return;
    }
    if (task.status !== "pending" && task.status !== "processing") return;

    const operationName = task.operationName;
    if (cancelingBoardItemIds.includes(task.id)) return;
    const canCancelRemote = task.canCancelRemote && Boolean(operationName);
    const confirmText = canCancelRemote
      ? t("common.confirmDialogs.cancelVideoTask")
      : t("common.confirmDialogs.cancelLocalTask");
    if (!(await confirmAction({ message: confirmText, tone: "danger", confirmLabel: t("cancelTask") }))) return;

    setCancelingBoardItemIds(prev => [...prev, task.id]);
    try {
      if (canCancelRemote && operationName) {
        const response = await fetch(API_ROUTES.media.cancel, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildProviderHeaders(operationName) },
          body: JSON.stringify({ operationName }),
        });
      if (!response.ok) {
        throw new Error(await readFetchError(response, t("board.agent.taskCancelFailed")));
      }
    }

      const controller = generationAbortControllersRef.current[task.id];
      if (controller) {
        controller.abort();
      }
      locallyCanceledItemIdsRef.current.add(task.id);

      const canceledTask = await cancelGenerationTask(task.id);
      setGenerationTasks(prev => prev.map(current => current.id === canceledTask.id ? canceledTask : current));
      delete pollingFailuresRef.current[task.id];
      if (isSourceStackTask(task, sourceNode)) {
        const nextTasks = generationTasks.map(current => current.id === canceledTask.id ? canceledTask : current);
        const nextStatus = nextSourceNodeStatus(items, nextTasks, sourceNode, "failed");
        const cancellationMessage = canCancelRemote ? t("common.notices.generationTaskCancelled") : t("board.agent.taskCanceledLocally");
        const update = {
          errorMessage: nextStatus === "failed" ? cancellationMessage : undefined,
          status: nextStatus,
        } as const;
      if (sourceNode.kind === "runninghub-app") {
          boardController.updateRunningHubAppNode(nodeId, update);
        } else {
          boardController.updateGenerateNode(nodeId, update);
        }
      }
      pushWorkspaceNotice("success", canCancelRemote ? t("common.notices.generationTaskCancelled") : t("board.agent.taskCanceledLocally"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("board.agent.taskCancelFailed")));
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
    items,
    locallyCanceledItemIdsRef,
    pollingFailuresRef,
    pushWorkspaceNotice,
    setGenerationTasks,
  ]);

  const cancelBoardGenerationNode = useCallback(async (nodeId: string): Promise<void> => {
    const sourceNode = findExecutableNodeById(boardController.board.nodes, nodeId);
    const task = sourceNode ? activeSourceTaskForNode(generationTasks, sourceNode) : undefined;
    if (!sourceNode || !task) {
      const update = {
        errorMessage: "No cancelable task found",
        status: "failed",
      } as const;
      if (sourceNode?.kind === "runninghub-app") {
        boardController.updateRunningHubAppNode(nodeId, update);
      } else {
        boardController.updateGenerateNode(nodeId, update);
      }
      return;
    }
    await cancelBoardGenerationTask(task);
  }, [boardController, cancelBoardGenerationTask, generationTasks]);

  const addAssetToBoard = useCallback((asset: StorageItem, position?: BoardPoint): string => {
    return boardController.addAssetNode({
      asset: boardAssetReferenceFromStorageItem(asset),
      position,
    });
  }, [boardController]);

  const handleImportFilesToLibrary = useCallback(async (files: File[]) => {
    try {
      const imported = await assetLibrary.importFiles(files);
      pushWorkspaceNotice("success", `Imported ${imported.length} assets`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "Asset import failed"));
    }
  }, [assetLibrary, pushWorkspaceNotice]);

  const handleSelectLibraryAsset = useCallback((entry: LibraryAssetEntry) => {
    const item = entry.item;
    if (!item) {
      pushWorkspaceNotice("error", "Asset missing media content");
      return;
    }
    try {
      addAssetToBoard(item);
      setIsAssetLibraryOpen(false);
      pushWorkspaceNotice("success", "Added to current board");
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "Add to board failed"));
    }
  }, [addAssetToBoard, pushWorkspaceNotice]);

  const handleExportMultiGrid = useCallback(async (nodeId: string): Promise<void> => {
    try {
      const node = boardController.board.nodes.find(item => item.id === nodeId);
      if (node?.kind !== "multi-grid") {
        throw new Error("Target node is not multi-grid");
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
      pushWorkspaceNotice("success", "Multi-grid exported as image asset");
    } catch (error) {
      pushWorkspaceNotice("error", error instanceof Error ? error.message : "Multi-grid export failed");
    }
  }, [addAssetToBoard, boardController.board, pushWorkspaceNotice]);

  const handleCaptureVideoFrame = useCallback(async (
    sourceNodeId: string,
    item: StorageItem,
    frame: CapturedVideoFrame,
  ): Promise<void> => {
    if (item.type !== "video") {
      throw new Error("Only video assets can capture frames");
    }

    const frameItem = createVideoFrameStorageItem(item, frame, makeClientId("frame"));
    const savedFrameItem = await saveItemOrWarn(frameItem, pushWorkspaceNotice);
    if (!savedFrameItem) return;
    setItems(prev => [savedFrameItem, ...prev]);

    const sourceNode = boardController.board.nodes.find(node => node.id === sourceNodeId);
    const position = sourceNode
      ? boardNodeAdjacentPosition(boardController.board.nodes, sourceNode)
      : undefined;
    addAssetToBoard(savedFrameItem, position);
    pushWorkspaceNotice("success", t("board.import.frameSavedToBoard", { label: getVideoFrameCaptureLabel(frame.mode) }));
  }, [addAssetToBoard, boardController.board.nodes, pushWorkspaceNotice, t]);

  const handleSavePanoramaScreenshots = useCallback(async (
    item: StorageItem,
    screenshots: PanoramaScreenshot[],
  ): Promise<void> => {
    if (item.type !== "image") {
      throw new Error(t("board.import.onlyImageCanPanorama"));
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
      ? boardNodeAdjacentPosition(boardController.board.nodes, sourceNode)
      : undefined;
    savedItems.forEach((savedItem, index) => {
      addAssetToBoard(
        savedItem,
        anchorPosition
          ? { x: anchorPosition.x + index * 36, y: anchorPosition.y + index * 36 }
          : undefined,
      );
    });
    pushWorkspaceNotice("success", t("board.import.panoramaScreenshotsSaved", { count: savedItems.length }));
  }, [addAssetToBoard, boardController.board.nodes, pushWorkspaceNotice, resolvedBoardId, t]);

  const handleImportBoardFiles = useCallback(async (files: File[], position: BoardPoint): Promise<void> => {
    const boardFiles = files.filter(file => mediaReferenceTypeFromMime(file.type) !== null);
    if (boardFiles.length === 0) {
      pushWorkspaceNotice("info", t("board.import.boardUploadNotSupported"));
      return;
    }

    const importedItems: ImportedBoardItem[] = [];
    for (let index = 0; index < boardFiles.length; index += 1) {
      const file = boardFiles[index];
      try {
        const mediaType = mediaReferenceTypeFromMime(file.type);
        if (!mediaType) throw new Error(t("board.workspace.unsupportedMediaType"));
        const item = await createBoardUploadItem(
          file,
          makeClientId(boardUploadIdPrefix(mediaType, index)),
          resolvedBoardId,
        );
        const nodeSize = await boardImportNodeSize(item);
        const savedItem = await saveItemOrWarn(item, pushWorkspaceNotice);
        if (!savedItem) continue;
        importedItems.push({ item: savedItem, nodeSize });
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, t("board.import.fileImportFailed")));
      }
    }

    if (importedItems.length === 0) return;
    const nodePositions = boardImportNodePositions(position, importedItems.map(imported => imported.nodeSize));
    const inputs = importedItems.map((imported, index) => ({
      asset: boardAssetReferenceFromStorageItem(imported.item),
      position: nodePositions[index],
      size: importedItems.length > 1 ? imported.nodeSize : undefined,
    }));
    if (inputs.length > 1) {
      boardController.addAssetNodesInGroup(inputs);
    } else {
      boardController.addAssetNodes(inputs);
    }
    setItems(prev => [
      ...importedItems.map(imported => imported.item),
      ...prev.filter(item => !importedItems.some(imported => imported.item.id === item.id)),
    ]);
    pushWorkspaceNotice("success", t("board.import.filesImported", { count: importedItems.length }));
  }, [boardController, pushWorkspaceNotice, resolvedBoardId, t]);

  const useSelectedBoardAssetAsReference = () => {
    const references = activeBoardReference(boardController.board.nodes, boardController.board.edges, boardController.selectedNodeId, items, resolveBoardReferenceUrl);
    if (references.length === 0) {
      pushWorkspaceNotice("info", t("board.import.selectImageNode"));
      return;
    }
    void resolveOriginalReferences(references).then(
      originalReferences => {
        setReferenceImage(originalReferences[0].url);
        setReferenceImages(originalReferences);
        pushWorkspaceNotice("success", t("board.import.useAsGenerationReference"));
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, t("board.agent.referenceMediaReadFailed"))),
    );
  };

  const useSelectedBoardAssetForAgent = () => {
    const references = activeBoardReference(boardController.board.nodes, boardController.board.edges, boardController.selectedNodeId, items, resolveBoardReferenceUrl);
    if (references.length === 0) {
      pushWorkspaceNotice("info", t("board.import.selectImageNode"));
      return;
    }
    void resolveOriginalReferences(references).then(
      originalReferences => {
        setAgentReferenceId(originalReferences[0].id);
        setAgentReferenceUrl(originalReferences[0].url);
        setAgentReferences(originalReferences);
        setIsAgentDockOpen(true);
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, t("board.agent.referenceMediaReadFailed"))),
    );
  };

  const useBoardAssetForAgent = useCallback((nodeId: string) => {
    const references = activeBoardReference(boardController.board.nodes, boardController.board.edges, nodeId, items, resolveBoardReferenceUrl);
    if (references.length === 0) {
      pushWorkspaceNotice("info", t("board.import.selectImageNode"));
      return;
    }
    void resolveOriginalReferences(references).then(
      originalReferences => {
        setAgentReferenceId(originalReferences[0].id);
        setAgentReferenceUrl(originalReferences[0].url);
        setAgentReferences(originalReferences);
        setIsAgentDockOpen(true);
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, t("board.agent.referenceMediaReadFailed"))),
    );
  }, [
    boardController.board.edges,
    boardController.board.nodes,
    items,
    pushWorkspaceNotice,
    resolveBoardReferenceUrl,
    resolveOriginalReferences,
    setAgentReferenceId,
    setAgentReferenceUrl,
    setAgentReferences,
    t,
  ]);

  const editBoardAssetImage = useCallback((nodeId: string) => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (node?.kind !== "asset" || node.asset.type !== "image") {
      pushWorkspaceNotice("info", t("board.import.selectImageNode"));
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
      error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.originalImageReadFailed"))),
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
    const promptReferences: ReferenceImageRef[] = promptNode?.kind === "prompt"
      ? boardController.board.edges
        .filter(edge => edge.to.nodeId === promptNode.id && edge.to.portId === BOARD_PORT_IDS.assetIn)
        .map(edge => boardController.board.nodes.find(item => item.id === edge.from.nodeId))
        .flatMap(item => boardNodeReferences(item, boardController.board.nodes, boardController.board.edges, items, resolveBoardReferenceUrl))
      : [];
    const directReferences: ReferenceImageRef[] = boardController.board.edges
      .filter(edge => edge.to.nodeId === nodeId && edge.to.portId === "reference-in")
      .map(edge => boardController.board.nodes.find(item => item.id === edge.from.nodeId))
      .flatMap(item => boardNodeReferences(item, boardController.board.nodes, boardController.board.edges, items, resolveBoardReferenceUrl));

    return { node, prompt: resolvedPrompt, references: uniqueBoardReferences([...promptReferences, ...directReferences]) };
  }, [boardController.board.edges, boardController.board.nodes, items, resolveBoardReferenceUrl]);

  const resolveGenerateNodeInputs = useCallback((nodeId: string) => {
    return resolveExecutableNodeInputs(nodeId, isGenerateBoardNode, t("board.agent.noImageNodeForVideoContinue"));
  }, [resolveExecutableNodeInputs, t]);

  const resolveRunningHubAppNodeInputs = useCallback((nodeId: string) => {
    return resolveExecutableNodeInputs(nodeId, isRunningHubAppBoardNode, t("board.agent.noRunninghubAppNode"));
  }, [resolveExecutableNodeInputs, t]);

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

        const resultStackKey = resultStackKeyForNode(node, { prompt: nodePrompt, references });
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
            errorMessage: t("board.agent.runninghubAppRequestNotStarted"),
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
      const allowsEmptyPrompt =
        (node.kind === "image-generate" || node.kind === "video-generate") &&
        !runningHubAppPresetRequiresPrompt(node.model);
      if (!nextPrompt && requiresTextInput && !allowsEmptyPrompt) {
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: t("board.agent.genNodeNeedPrompt") });
        pushWorkspaceNotice("error", t("board.agent.genNodeNeedPrompt"));
        return;
      }
      if (node.kind === "audio-operation" && audioOperationRequiresStylePrompt(node.audioMode) && !node.audioStylePrompt?.trim()) {
        const message = t("board.agent.audioDesignNeedsDescription");
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      if (isPlaceholderRunningHubModel(node.model)) {
        const message = t("board.agent.runninghubFillRealId");
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      const capabilityKind = node.kind === "image-generate" ? "image" : node.kind === "video-generate" ? "video" : "audio";
      const capability = getModelCapability(node.model, capabilityKind);
      if (references.length > 0 && !capability.supportsReferences) {
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: t("board.agent.modelNotSupportMediaReference") });
        pushWorkspaceNotice("error", t("board.agent.modelNotSupportMediaReference"));
        return;
      }
      const unsupportedReference = references.find(reference => {
        const type = getMediaReferenceType(reference);
        if (node.kind === "image-generate") return type !== "image";
        if (node.kind === "video-generate") return !getVideoModelCapabilities(node.model).referenceMediaTypes.includes(type);
        return !getAudioModelCapabilities(node.model).referenceMediaTypes.includes(type);
      });
      if (unsupportedReference) {
        const message = t("board.agent.modelNotSupportMediaTypeInput", { type: mediaReferenceLabel(getMediaReferenceType(unsupportedReference)) });
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      const audioVoiceProfileProvidesReference = node.kind === "audio-operation" && Boolean(node.voiceProfileId);
      if (audioCapabilities && references.length < audioCapabilities.minReferenceMedia && !audioVoiceProfileProvidesReference) {
        const message = audioOperationMissingReferenceMessage(audioCapabilities);
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      if (audioCapabilities && audioCapabilities.maxReferenceMedia > 0 && references.length > audioCapabilities.maxReferenceMedia) {
        const message = t("board.agent.audioModelMaxReference", { maxCount: audioCapabilities.maxReferenceMedia });
        boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
        pushWorkspaceNotice("error", message);
        return;
      }
      if (node.kind === "video-generate") {
        const videoCapability = getVideoModelCapabilities(node.model);
        if (references.length < videoCapability.minReferenceImages || references.length > videoCapability.maxReferenceImages) {
          const message = t("board.agent.videoModelNeedsReferenceRange", { min: videoCapability.minReferenceImages, max: videoCapability.maxReferenceImages });
          boardController.updateGenerateNode(nodeId, { status: "failed", errorMessage: message });
          pushWorkspaceNotice("error", message);
          return;
        }
      }

        const resultStackKey = resultStackKeyForNode(node, { prompt: nextPrompt, references });
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
          const didStartResults = await runSequentialGenerationVariants(node.variantCount, () =>
            generateManualImage({
              boardId: resolvedBoardId,
              boardNodeId: nodeId,
              boardResultStackKey: resultStackKey,
              imageQuality: node.imageQuality,
              imageResolution: nodeImageResolution,
              isCustomImageResolution: node.imageResolution === "custom",
              cinematicProfile: node.cinematicProfile,
              model: node.model,
              prompt: nextPrompt,
              referenceImage: references[0]?.url ?? null,
              referenceImages: references,
              runningHubYouchuan: node.runningHubYouchuan ?? RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS,
              size: node.aspectRatio,
              thinkingLevel: node.thinkingLevel,
              allowEmptyPrompt: allowsEmptyPrompt,
            }),
          );
          if (!didStartResults.some(Boolean)) {
            boardController.updateGenerateNode(nodeId, {
              errorMessage: t("board.agent.imageGenRequestNotStarted"),
              status: "failed",
            });
          }
        } else if (node.kind === "video-generate") {
          const didStartResults = await runSequentialGenerationVariants(node.variantCount, () =>
            generateManualVideo({
              boardId: resolvedBoardId,
              boardNodeId: nodeId,
              boardResultStackKey: resultStackKey,
              cinematicProfile: node.cinematicProfile,
              model: node.model,
              prompt: nextPrompt,
              referenceImage: references[0]?.url ?? null,
              referenceImages: references,
              size: node.aspectRatio,
              videoDuration: node.videoDuration,
              videoPreset: node.videoPreset,
              videoReferenceMode: node.videoReferenceMode ?? getVideoModelCapabilities(node.model).referenceMode,
              videoResolution: node.videoResolution,
            }),
          );
          if (!didStartResults.some(Boolean)) {
            boardController.updateGenerateNode(nodeId, {
              errorMessage: t("board.agent.videoGenRequestNotStarted"),
              status: "failed",
            });
          }
        } else {
          const didStartResults = await runSequentialGenerationVariants(1, () =>
            generateManualAudio({
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
              voiceCloneConsentAccepted: node.voiceProfileId ? true : node.voiceCloneConsentAccepted,
              voiceProfileId: node.voiceProfileId,
            }),
          );
          if (!didStartResults.some(Boolean)) {
            boardController.updateGenerateNode(nodeId, {
              errorMessage: t("board.agent.audioGenRequestNotStarted"),
              status: "failed",
            });
          }
        }
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, t("common.failedTitles.default")));
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
    t,
  ]);

  const handleSendAgentNode = useCallback((nodeId: string) => {
    const node = boardController.board.nodes.find(item => item.id === nodeId);
    if (node?.kind !== "agent") {
      pushWorkspaceNotice("error", "Please select Agent node");
      return;
    }

    const instruction = (getBoardTextDraft(nodeId) ?? node.instruction).trim();
    flushBoardTextForAgentNode(nodeId);

    const references = boardController.board.edges
      .filter(edge => edge.to.nodeId === nodeId && edge.to.portId === "agent-context-in")
      .map(edge => boardController.board.nodes.find(item => item.id === edge.from.nodeId))
      .flatMap(item => boardNodeReferences(item, boardController.board.nodes, boardController.board.edges, items, resolveBoardReferenceUrl))
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
      pushWorkspaceNotice("error", `Agent reference limit reached: max ${IMAGE_REFERENCE_LIMIT}`);
      return;
    }
    const mediaType = mediaReferenceTypeFromMime(file.type);
    if (!mediaType) {
      pushWorkspaceNotice("error", "Agent only supports image, video, or audio references");
      return;
    }
    if (mediaType !== "image" && file.size > Math.floor(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES * 0.75)) {
      pushWorkspaceNotice("error", `${mediaReferenceLabel(mediaType)} reference too large, compress and retry`);
      return;
    }
    try {
      const dataUrl = mediaType === "image" ? await compressReferenceImageFile(file) : await readFileAsDataUrl(file);
      const newReferenceId = makeClientId("agent_upload");
      setAgentReferenceId(newReferenceId);
      setAgentReferenceUrl(dataUrl);
      setAgentReferences(prev => [...prev, { id: newReferenceId, type: mediaType, url: dataUrl }].slice(0, IMAGE_REFERENCE_LIMIT));
      pushWorkspaceNotice("success", `Uploaded Agent ${mediaReferenceLabel(mediaType)} reference`);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, "Agent reference read failed, try a different file"));
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
          if (sourceNode && item.type !== "transcript") {
            const activeCompleteItem = latestCompleteSourceStackItem(items, sourceNode);
            if (!activeCompleteItem) {
              const activeItems = activeProcessingSourceStackItems(items, generationTasks, sourceNode);
              const activeItem = activeItems[activeItems.length - 1] ?? item;
              boardController.completeGenerationResult(
                sourceBoardNodeId,
                {
                  asset: storageItemToBoardAssetReference(activeItem),
                  resultAssetId: activeItem.id,
                  resultAssetIds: activeItems.length > 0 ? activeItems.map(active => active.id) : appendResultAssetId(sourceNode, item.id),
                  status: "processing",
                },
              );
            }
          }
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
                position: boardNodeAdjacentPosition(boardController.board.nodes, sourceNode, 48),
                size: { width: 360, height: 260 },
                source: {
                  assetId: item.id,
                  model: item.model,
                  sourceNodeId: sourceBoardNodeId,
                },
                title: t("common.mediaTypeLabels.transcript"),
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
        if (item.type !== "transcript") {
          boardController.completeGenerationResult(
            sourceBoardNodeId,
            terminalResultUpdate(items, generationTasks, sourceNode, item, nextStatus, item.errorMessage ?? t("common.failedTitles.default")),
          );
        }
        const update = {
          errorMessage: nextStatus === "failed" ? item.errorMessage ?? t("common.failedTitles.default") : undefined,
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
        const taskItem = generationTaskToGalleryItem(task);
        if (taskItem && taskItem.type !== "transcript") {
          const activeCompleteItem = latestCompleteSourceStackItem(items, sourceNode);
          if (!activeCompleteItem) {
            const activeItems = activeProcessingSourceStackItems(items, generationTasks, sourceNode);
            const activeItem = activeItems[activeItems.length - 1] ?? taskItem;
            boardController.completeGenerationResult(
              sourceBoardNodeId,
              {
                asset: storageItemToBoardAssetReference(activeItem),
                resultAssetId: activeItem.id,
                resultAssetIds: activeItems.length > 0 ? activeItems.map(active => active.id) : appendResultAssetId(sourceNode, taskItem.id),
                status: "processing",
              },
            );
          }
        }
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
      const taskItem = generationTaskToGalleryItem(task);
      const nextStatus: BoardGenerationStatus =
        hasActiveSourceItems(items, sourceNode) || hasActiveSourceTasks(generationTasks, sourceNode)
          ? "processing"
          : items.some(item => isSourceStackItem(item, sourceNode) && item.status === "complete")
            ? "complete"
            : "failed";
      if (taskItem && taskItem.type !== "transcript") {
        boardController.completeGenerationResult(
          sourceBoardNodeId,
          terminalResultUpdate(
            items,
            generationTasks,
            sourceNode,
            taskItem,
            nextStatus,
            task.errorMessage ?? (task.status === "canceled" ? t("board.agent.taskCanceledLocally") : t("common.failedTitles.default")),
          ),
        );
      }
      const update = {
        errorMessage: nextStatus === "failed" ? task.errorMessage ?? (task.status === "canceled" ? t("board.agent.taskCanceledLocally") : t("common.failedTitles.default")) : undefined,
        status: nextStatus,
      };
      if (sourceNode.kind === "runninghub-app") {
        boardController.updateRunningHubAppNode(sourceBoardNodeId, update);
      } else {
        boardController.updateGenerateNode(sourceBoardNodeId, update);
      }
    }
  }, [boardAssetsLoading, boardController, generationTasks, isBoardAssetScopeLoaded, items]);

  const clearProjectAssets = useCallback(async () => {
    try {
      await createWorkspaceSafetySnapshot("clear-assets");
      await clearAllDB();
      handledBoardItemIdsRef.current = new Set();
      handledBoardTaskIdsRef.current = new Set();
      setItems([]);
      setGenerationTasks([]);
      pushWorkspaceNotice("success", t("common.dataManagement.localAssetsCleaned"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.localAssetsCleanFailed")));
    }
  }, [pushWorkspaceNotice]);

  const reloadBoardAssetsFromDB = useCallback(async () => {
    await reloadBoardAssets();
  }, [reloadBoardAssets]);

  const handleDataExportWorkspace = useCallback(async (includeCredentials: boolean) => {
    try {
      const result = await exportCompleteWorkspaceBackup(includeCredentials);
      pushWorkspaceNotice("success", t("common.dataManagement.exportComplete", { fileName: result.fileName }));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.boardRenameFailed")));
    }
  }, [pushWorkspaceNotice]);

  const handleDataExportCurrentBoard = useCallback(async (includeCredentials: boolean) => {
    try {
      flushSync(() => flushAllBoardText());
      await boardController.saveNow();
      const result = await exportBoardWorkspaceBackup(boardController.board, includeCredentials);
      pushWorkspaceNotice("success", t("common.dataManagement.exportComplete", { fileName: result.fileName }));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.exportFailed")));
    }
  }, [boardController, pushWorkspaceNotice, t]);

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
        ? `\n${t("common.confirmDialogs.credentialNote")}`
        : "";
      if (!(await confirmAction({
        message: t("common.confirmDialogs.confirmImportWorkspace", { assetCount: preview.assetCount, boardCount: preview.boardCount, settingsCount: preview.settingsKeyCount, credentialNote }),
        tone: "danger",
        confirmLabel: t("common.buttons.restore"),
      }))) {
        return;
      }
      const result = await importWorkspaceBackup(file, includeCredentials);
      pushWorkspaceNotice("success", t("common.dataManagement.workspaceRestored", { assetCount: result.assetCount, boardCount: result.boardCount }));
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.workspaceRestoreFailed")));
    }
  }, [confirmAction, pushWorkspaceNotice, t]);

  const handleDataImportLocalAssets = useCallback(async (files: File[]) => {
    const importedItems: StorageItem[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const mediaType = mediaReferenceTypeFromMime(file.type);
        if (!mediaType) throw new Error("Unsupported media type");
        const item = await createLocalUploadAsset(
          file,
          makeClientId(boardUploadIdPrefix(mediaType, index).replace("board_", "local_")),
          { boardId: resolvedBoardId },
        );
        const savedItem = await saveItemOrWarn(item, pushWorkspaceNotice);
        if (!savedItem) continue;
        importedItems.push(savedItem);
      } catch (error) {
        pushWorkspaceNotice("error", toErrorMessage(error, t("board.import.fileImportFailed")));
      }
    }
    if (importedItems.length === 0) return;
    setItems(prev => [
      ...importedItems,
      ...prev.filter(item => !importedItems.some(importedItem => importedItem.id === item.id)),
    ]);
    pushWorkspaceNotice("success", `Imported ${importedItems.length} local media`);
  }, [pushWorkspaceNotice, resolvedBoardId, t]);

  const handleDataCleanupAssets = useCallback(async (kind: WorkspaceCleanupKind) => {
    try {
      const result = await cleanupWorkspaceAssets(kind);
      await reloadBoardAssetsFromDB();
      pushWorkspaceNotice("success", t("common.dataManagement.assetsCleanupSuccess", { count: result.deletedIds.length }));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.assetsCleanupFailed")));
    }
  }, [pushWorkspaceNotice, reloadBoardAssetsFromDB]);

  const handleDataRepairAssetSources = useCallback(async () => {
    try {
      const result = await repairStaleAssetSourceLinks();
      await reloadBoardAssetsFromDB();
      pushWorkspaceNotice("success", t("common.dataManagement.sourceLinkRepairSuccess", { count: result.repairedIds.length }));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.sourceLinkRepairFailed")));
    }
  }, [pushWorkspaceNotice, reloadBoardAssetsFromDB]);

  const handleDataClearLocalStorage = useCallback(async (kind: LocalStorageCleanupKind) => {
    const count = clearLocalStorageGroup(kind);
    pushWorkspaceNotice("success", t("common.dataManagement.localKeysCleaned", { count }));
  }, [pushWorkspaceNotice, t]);

  const handleDataResetBoards = useCallback(async () => {
    try {
      await resetBoardsToDefault();
      pushWorkspaceNotice("success", t("common.dataManagement.boardsReset"));
      window.setTimeout(() => window.location.assign("/board"), 300);
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.boardsResetFailed")));
    }
  }, [pushWorkspaceNotice]);

  const duplicateCurrentBoard = useCallback(async () => {
    try {
      flushSync(() => flushAllBoardText());
      await boardController.saveNow();
      const now = new Date().toISOString();
      const nextBoard: BoardDocument = {
        ...boardController.board,
        id: makeClientId("board"),
        title: `${boardController.board.title} ${t("board.contextMenu.duplicate")}`,
        createdAt: now,
        updatedAt: now,
      };
      await saveBoardToDB(nextBoard);
      setBoardSummaries(prev => [boardSummaryFromDocument(nextBoard), ...prev]);
      setResolvedBoardId(nextBoard.id);
      router.push(boardRoute(nextBoard.id));
      pushWorkspaceNotice("success", t("common.dataManagement.boardCopied"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.boardCopyFailed")));
    }
  }, [boardController, pushWorkspaceNotice, router, t]);

  const createBoardPage = useCallback(async () => {
    flushSync(() => flushAllBoardText());
    await boardController.saveNow();
    const nextIndex = boardSummaries.length + 1;
    const nextId = makeClientId("board");
    const nextBoard = createEmptyBoard(nextId, `${t("board.boardLabel")} ${nextIndex}`);
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
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.exportFailed")));
    }
  }, [boardController, pushWorkspaceNotice, renameDialogDraft, t]);

  const deleteBoardPage = useCallback(async () => {
    if (boardSummaries.length <= 1) {
      pushWorkspaceNotice("info", t("common.dataManagement.atLeastOneBoard"));
      return;
    }
    if (!(await confirmAction({
      message: t("common.confirmDialogs.deleteSingleItem"),
      tone: "danger",
      confirmLabel: t("common.buttons.delete"),
    }))) return;
    flushSync(() => flushAllBoardText());
    const deletedBoardId = boardController.board.id;
    const nextBoard = boardSummaries.find(item => item.id !== deletedBoardId);
    const nextBoardId = nextBoard?.id ?? DEFAULT_BOARD_ID;
    setResolvedBoardId(nextBoardId);
    router.push(boardRoute(nextBoardId));
    await deleteBoardFromDB(deletedBoardId);
    setBoardSummaries(prev => prev.filter(item => item.id !== deletedBoardId));
  }, [boardController.board.id, boardController.board.title, boardSummaries, confirmAction, pushWorkspaceNotice, router, t]);

  const saveBoardNow = boardController.saveNow;

  const handleBackToWorkbench = useCallback(() => {
    flushSync(() => flushAllBoardText());
    void saveBoardNow()
      .then(() => router.push("/"))
      .catch(error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.boardSaveFailed"))));
  }, [pushWorkspaceNotice, router, saveBoardNow, t]);

  const handleCancelGenerateNode = useCallback((nodeId: string) => {
    void cancelBoardGenerationNode(nodeId);
  }, [cancelBoardGenerationNode]);

  const handleCancelBoardTask = useCallback((task: GenerationTask) => {
    void cancelBoardGenerationTask(task);
  }, [cancelBoardGenerationTask]);

  const handleFocusBoardTaskResult = useCallback((task: GenerationTask) => {
    const sourceNodeId = task.source.boardNodeId;
    if (!sourceNodeId) {
      pushWorkspaceNotice("error", t("common.dataManagement.focusTaskResultMissingSourceNode"));
      return;
    }
    const resultAssetId = task.activeResultAssetId ?? task.resultAssetIds.at(-1);
    const resultItem = resultAssetId
      ? items.find(item => item.id === resultAssetId && item.status === "complete")
      : undefined;
    const sourceNode = findExecutableNodeById(boardController.board.nodes, sourceNodeId);
    const resultNode = sourceNode
      ? findConnectedResultNodeForSourceStack(
        boardController.board.nodes,
        boardController.board.edges,
        sourceNodeId,
        task.source.resultStackKey ?? sourceNode.resultStackKey ?? "",
      )
      : undefined;
    if (!resultNode && resultItem) {
      handleOpenFullscreen(resultItem);
      return;
    }
    if (!resultNode) {
      pushWorkspaceNotice("error", t("common.dataManagement.focusTaskResultMissingResultNode"));
      return;
    }
    if (resultAssetId && resultNode.resultAssetIds.includes(resultAssetId)) {
      if (resultItem) {
        markGeneratedAssetsViewed([resultAssetId]);
        boardController.updateResultNodeAsset(resultNode.id, storageItemToBoardAssetReference(resultItem));
      }
      requestTaskQueueFocusNode(resultNode.id);
      return;
    }
    if (resultItem) {
      handleOpenFullscreen(resultItem);
      return;
    }
    requestTaskQueueFocusNode(resultNode.id);
  }, [boardController, handleOpenFullscreen, items, markGeneratedAssetsViewed, pushWorkspaceNotice, requestTaskQueueFocusNode, t]);

  const handleRerunBoardTaskSource = useCallback((task: GenerationTask) => {
    const sourceNodeId = task.source.boardNodeId;
    if (!sourceNodeId) {
      pushWorkspaceNotice("error", t("common.dataManagement.rerunTaskMissingSourceNode"));
      return;
    }
    void handleExecuteGenerateNode(sourceNodeId);
  }, [handleExecuteGenerateNode, pushWorkspaceNotice, t]);

  const handleDismissBoardTask = useCallback((task: GenerationTask) => {
    void (async () => {
      if (!(await confirmAction({
        message: t("common.dataManagement.ignoreFailedTaskConfirm"),
        confirmLabel: t("common.buttons.ignore"),
      }))) return;
      await deleteGenerationTask(task.id);
      setGenerationTasks(prev => prev.filter(current => current.id !== task.id));
      delete pollingFailuresRef.current[task.id];
      pushWorkspaceNotice("success", t("common.dataManagement.taskIgnored"));
    })().catch(error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.taskIgnoreFailed"))));
  }, [confirmAction, pollingFailuresRef, pushWorkspaceNotice, setGenerationTasks, t]);

  const handleBoardConnectionError = useCallback((message: string) => {
    pushWorkspaceNotice("error", message);
  }, [pushWorkspaceNotice]);

  const handleCreateBoard = useCallback(() => {
    void createBoardPage().catch(error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.newBoardFailed"))));
  }, [createBoardPage, pushWorkspaceNotice, t]);

  const handleDeleteBoard = useCallback(() => {
    void deleteBoardPage().catch(error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.deleteBoardFailed"))));
  }, [deleteBoardPage, pushWorkspaceNotice, t]);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSelectBoard = useCallback((nextBoardId: string) => {
    void selectBoardPage(nextBoardId).catch(error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.switchBoardFailed"))));
  }, [pushWorkspaceNotice, selectBoardPage, t]);

  const selectedBoardNode = boardController.board.nodes.find(node => node.id === boardController.selectedNodeId);
  const selectedBoardEdge = boardController.board.edges.find(edge => edge.id === boardController.selectedEdgeId);
  const boardTaskBadgeCount = useMemo(
    () => generationTasks.filter(task => task.status === "pending" || task.status === "processing" || task.status === "failed").length,
    [generationTasks],
  );
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
  useEffect(() => {
    const selectedAssetIds: string[] = [];
    for (const nodeId of selectedNodeIds) {
      const node = boardController.board.nodes.find(candidate => candidate.id === nodeId);
      const assetId = node?.kind === "asset"
        ? node.asset.assetId
        : node?.kind === "result"
          ? node.activeAssetId
          : undefined;
      if (assetId) selectedAssetIds.push(assetId);
      const item = assetId ? items.find(candidate => candidate.id === assetId) : undefined;
      if (item) promoteItemToOriginal(item);
    }
    markGeneratedAssetsViewed(selectedAssetIds);
  }, [boardController.board.nodes, items, markGeneratedAssetsViewed, promoteItemToOriginal, selectedNodeIds]);
  const selectedDownloadableBoardItems = useMemo(() => {
    const itemById = new Map<string, StorageItem>();
    for (const nodeId of selectedNodeIds) {
      const node = boardController.board.nodes.find(candidate => candidate.id === nodeId);
      const item = downloadableBoardNodeStorageItem(node, items, resolvedBoardId);
      if (item) itemById.set(item.id, item);
    }
    return Array.from(itemById.values());
  }, [boardController.board.nodes, items, resolvedBoardId, selectedNodeIds]);
  const selectedDownloadableBoardItemLabels = useMemo(() => {
    const labelsByAssetId = new Map<string, string>();
    for (const nodeId of selectedNodeIds) {
      const node = boardController.board.nodes.find(candidate => candidate.id === nodeId);
      if (node?.kind === "asset") labelsByAssetId.set(node.asset.assetId, node.title);
      if (node?.kind === "result") labelsByAssetId.set(node.activeAssetId, node.title);
    }
    return labelsByAssetId;
  }, [boardController.board.nodes, selectedNodeIds]);
  const handleDownloadSelectedBoardAssets = useCallback(() => {
    if (selectedDownloadableBoardItems.length === 0) return;
    void downloadStorageItemsZip({
      archiveName: makeClientId("Imagine_Board_Export"),
      fileNamePrefix: "board_creation",
      fileNameLabel: item => selectedDownloadableBoardItemLabels.get(item.id),
      items: selectedDownloadableBoardItems,
      resolveOriginalItem: resolveOriginalStorageItem,
    }).catch(error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.dataManagement.batchDownloadFailed"))));
  }, [pushWorkspaceNotice, resolveOriginalStorageItem, selectedDownloadableBoardItemLabels, selectedDownloadableBoardItems, t]);
  const imageModelGroups = getProviderModelGroups(imageModelOptions, providerKeys, customProviders);
  const videoModelGroups = getProviderModelGroups(videoModelOptions, providerKeys, customProviders);
  const audioModelGroups = getProviderModelGroups(audioModelOptions, providerKeys, customProviders);
  const chatModelGroups = getProviderModelGroups(chatModelOptions, providerKeys, customProviders);
  const {
    featureModels: imageEditFeatureTargets,
    selectFeatureModel: selectImageEditFeatureTarget,
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
      pushWorkspaceNotice("info", t("common.dataManagement.selectImageNode"));
      return;
    }

    void resolveOriginalStorageItem(source.item).then(
      originalItem => {
        if (operation === "cutout") {
          void runBoardImageQuickEdit(
            source.node.id,
            source.node.title,
            boardNodeAbsolutePosition(boardController.board.nodes, source.node.id) ?? source.node.position,
            source.node.size,
            originalItem,
            operation,
            originalItem.url,
            undefined,
            undefined,
            "",
            "auto",
            originalItem.aspectRatio,
          );
          return;
        }
        launchMaskEditor(originalItem.url, originalItem.id, "board-asset", source.node.id, operation, originalItem);
      },
      error => pushWorkspaceNotice("error", toErrorMessage(error, t("common.originalImageReadFailed"))),
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
              {t("board.renameCurrentBoard")}
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
                {t("common.buttons.cancel")}
              </button>
              <button type="submit" className="imagine-primary-action h-9 rounded-lg px-3 text-[11px] font-semibold">
                {t("common.buttons.save")}
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
        externalSelectedNodeIds={selectedNodeIds}
        onBack={handleBackToWorkbench}
        onCancelAssetTask={nodeId => void cancelBoardAssetTaskNode(nodeId)}
        onCancelGenerateNode={handleCancelGenerateNode}
        onCaptureVideoFrame={handleCaptureVideoFrame}
        onConnectionError={handleBoardConnectionError}
        onWorkspaceNotice={pushWorkspaceNotice}
        onAnalyzeBoardMedia={handleAnalyzeBoardMedia}
        onDeleteEdge={deleteBoardEdge}
        onCreateBoard={handleCreateBoard}
        onDeleteBoard={handleDeleteBoard}
        onDownloadAsset={handleDownloadAsset}
        onDownloadSelectedAssets={handleDownloadSelectedBoardAssets}
        onEditAssetImage={editBoardAssetImage}
        onImageQuickEdit={handleBoardImageQuickEdit}
        onExecuteGenerateNode={handleExecuteGenerateNode}
        onExportMultiGrid={handleExportMultiGrid}
        onFetchRunningHubAppSchema={fetchRunningHubAppSchema}
        onImportBoardFiles={handleImportBoardFiles}
        onMarkGeneratedAssetsViewed={markGeneratedAssetsViewed}
        onOpenFullscreen={handleOpenFullscreen}
        onOpenPanorama={handleOpenPanorama}
        onResolveOriginalAsset={resolveOriginalStorageItem}
        onSaveDerivedAsset={saveBoardDerivedAsset}
        onSaveVoiceProfile={handleSaveVoiceProfileSource}
        onOpenSettings={handleOpenSettings}
        onRenameBoard={renameBoardPage}
        onSelectBoard={handleSelectBoard}
        onSendAssetToAgent={useBoardAssetForAgent}
        onSendAgentNode={handleSendAgentNode}
        selectedDownloadableCount={selectedDownloadableBoardItems.length}
        viewedGeneratedAssetIds={viewedGeneratedAssetIds}
      >
        <BoardSidePanel
          preserveTasksRevealKey={preserveTasksRevealKey}
          onPreserveTasksRevealConsumed={clearPreserveTasksRevealKey}
          revealCanExpand={selectedNodeIds.length <= 1}
          revealKey={boardController.selectedNodeId ?? boardController.selectedEdgeId}
          taskBadgeCount={boardTaskBadgeCount}
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
              onDeleteEdge={edgeId => void deleteBoardEdge(edgeId)}
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
              onOpenAssetLibrary={() => setIsAssetLibraryOpen(true)}
            />
          )}
          tasksPanel={(
            <BoardTaskQueuePanel
              cancelingTaskIds={cancelingBoardItemIds}
              edges={boardController.board.edges}
              items={items}
              nodes={boardController.board.nodes}
              tasks={generationTasks}
              onCancelTask={handleCancelBoardTask}
              onDismissTask={handleDismissBoardTask}
              onFocusTaskResult={handleFocusBoardTaskResult}
              onFocusNode={requestTaskQueueFocusNode}
              onRerunTaskSource={handleRerunBoardTaskSource}
            />
          )}
        />
      </BoardWorkspace>

      <AssetLibraryModal
        entries={assetLibrary.entries}
        loading={assetLibrary.loading}
        mode="select"
        open={isAssetLibraryOpen}
        title={t("common.selectTitle")}
        onClose={() => setIsAssetLibraryOpen(false)}
        onImportFiles={handleImportFilesToLibrary}
        onRemove={assetLibrary.removeRecord}
        onSelect={handleSelectLibraryAsset}
        onUpdate={assetLibrary.updateRecord}
      />

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
          boardContextSnapshot={getAgentBoardContextSnapshot()}
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
        hasCurrentBoard
        onAddCustomProvider={addCustomProvider}
        onAddFetchedModels={addFetchedModels}
        onAddManualModels={addManualModels}
        onCleanupAssets={handleDataCleanupAssets}
        onClearAssets={clearProjectAssets}
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
        onRunResolveCheck={() => void runResolveCheck()}
        onSaveCredential={handleSaveCredential}
        onSelectImageEditFeatureModel={selectImageEditFeatureTarget}
        onSelectChatModel={handleSelectChatModel}
        onSelectDefaultAudioModel={handleDefaultAudioModelChange}
        onSelectDefaultImageModel={handleDefaultImageModelChange}
        onSelectDefaultVideoModel={handleDefaultVideoModelChange}
        onSelectProvider={handleSelectProvider}
        onToggleResolveIntegration={setResolveIntegrationEnabled}
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
      {isMaskOpen && maskEditOperation && isVisualAdjustmentFeature(maskEditOperation) && (
        <VisualPromptAdjustEditor
          imageUrl={maskTargetUrl}
          editModel={resolveImageQuickEditTarget(maskEditOperation, imageEditFeatureTargets[maskEditOperation])?.model}
          isOpen={isMaskOpen}
          operation={maskEditOperation}
          onClose={() => {
            setIsMaskOpen(false);
            setMaskEditOperation(undefined);
            setMaskEditSourceItem(null);
            setMaskSourceNodeId(null);
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
