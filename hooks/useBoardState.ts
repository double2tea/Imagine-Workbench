"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BOARD_UNDO_LIMIT, cloneBoardHistory, type BoardHistorySnapshot } from "@/lib/board/history";
import {
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_AUDIO_ASSET_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_BOARD_CONFIG,
  DEFAULT_BOARD_ID,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_NODE_POSITION,
  DEFAULT_NOTE_NODE_SIZE,
  DEFAULT_PROMPT_NODE_SIZE,
  DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  DEFAULT_RUNNINGHUB_APP_NODE_SIZE,
  createEmptyBoard,
  getBoardFromDB,
  saveBoardToDB,
  type BoardAgentNode,
  type BoardConfig,
  type BoardDocument,
  type BoardEdge,
  type BoardAssetReference,
  type BoardGenerateNodeUpdate,
  type BoardGenerateVariantCount,
  type BoardGenerationStatus,
  type BoardImageGenerateNode,
  type BoardNode,
  type BoardPoint,
  type BoardPortRef,
  type BoardReferenceGroupItem,
  type BoardReferenceGroupNode,
  type BoardReferenceRole,
  type BoardResultNode,
  type BoardRunningHubAppNode,
  type BoardRunningHubAppNodeUpdate,
  type BoardRunningHubBindingDelivery,
  type BoardRunningHubBindingSource,
  type BoardRunningHubBindingValueType,
  type BoardRunningHubNodeInfoBinding,
  type BoardRunningHubOutputType,
  type BoardRunningHubTargetType,
  type BoardVideoReferenceMode,
  type BoardPromptNode,
  type BoardSize,
  type BoardVideoGenerateNode,
  type BoardViewport,
  type CreateAgentNodeInput,
  type CreateAssetNodeInput,
  type CreateGenerateNodeInput,
  type CreateNoteNodeInput,
  type CreatePromptNodeInput,
  type CreateReferenceGroupNodeInput,
  type CreateResultNodeInput,
  type CreateRunningHubAppNodeInput,
} from "@/lib/board";
import { getImageModelCapabilities, getImageResolutionOptions, getVideoModelCapabilities } from "@/lib/providers/model-catalog";
import {
  BOARD_PORT_IDS,
  filterValidBoardEdges,
  resolveBoardConnectionKind,
  resolveBoardConnectionNodesWithCompatibleModel,
} from "@/lib/board/ports";
import { findResultNodeForSource, isResultSourceNode, resultNodeDefaultPosition } from "@/lib/board/utils";

export type BoardSaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

interface CompleteGenerationResultUpdate {
  asset: BoardAssetReference;
  resultAssetId: string;
  resultAssetIds: string[];
  status: BoardGenerationStatus;
}

const DEFAULT_CUSTOM_IMAGE_RESOLUTION = "2560x1440";
const DEFAULT_VARIANT_COUNT: BoardGenerateVariantCount = 1;
const DEFAULT_BOARD_IMAGE_MODEL = "modelscope:Qwen/Qwen-Image";
const DEFAULT_BOARD_VIDEO_MODEL = "12ai:veo_3_1-fast";
const BOARD_VIEWPORT_POSITION_EPSILON = 0.5;
const BOARD_VIEWPORT_ZOOM_EPSILON = 0.001;
const BOARD_NODE_KINDS = new Set<BoardNode["kind"]>([
  "agent",
  "asset",
  "image-generate",
  "note",
  "prompt",
  "reference-group",
  "result",
  "runninghub-app",
  "video-generate",
]);

export interface BoardStateController {
  board: BoardDocument;
  canRedo: boolean;
  canUndo: boolean;
  saveStatus: BoardSaveStatus;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  saveError: string | null;
  saveNow: () => Promise<void>;
  beginUndoGesture: () => void;
  endUndoGesture: () => void;
  redo: () => void;
  undo: () => void;
  duplicateNode: (nodeId: string) => string | null;
  duplicateNodes: (nodeIds: string[]) => string[];
  reconnectEdge: (edgeId: string, from: BoardPortRef, to: BoardPortRef) => void;
  restoreNodeWithEdges: (node: BoardNode, edges: BoardEdge[]) => void;
  addAgentNode: (input?: CreateAgentNodeInput) => string;
  addAssetNode: (input: CreateAssetNodeInput) => string;
  addAssetNodeWithConnection: (input: CreateAssetNodeInput, from: BoardPortRef) => string;
  addResultNodeWithConnection: (input: CreateResultNodeInput, from: BoardPortRef) => string;
  completeGenerationResult: (sourceNodeId: string, update: CompleteGenerationResultUpdate) => void;
  updateAssetNodeAsset: (nodeId: string, asset: BoardAssetReference, resultAssetIds?: string[]) => void;
  updateResultNodeAsset: (nodeId: string, assetId: string) => void;
  addGenerateNode: (input: CreateGenerateNodeInput) => string;
  addGenerateNodeWithConnection: (
    input: CreateGenerateNodeInput,
    from: BoardPortRef,
    targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn,
  ) => string;
  addNoteNode: (input?: CreateNoteNodeInput) => string;
  addPromptNode: (input?: CreatePromptNodeInput) => string;
  addReferenceGroupNode: (input?: CreateReferenceGroupNodeInput) => string;
  addReferenceGroupNodeWithAsset: (input: CreateReferenceGroupNodeInput, assetNodeId: string) => string;
  addRunningHubAppNode: (input?: CreateRunningHubAppNodeInput) => string;
  addAssetToReferenceGroup: (assetNodeId: string, groupNodeId: string) => void;
  clearBoard: () => void;
  connectPorts: (from: BoardPortRef, to: BoardPortRef) => void;
  deleteEdge: (edgeId: string) => void;
  deleteNode: (nodeId: string) => void;
  moveReferenceGroupItem: (groupNodeId: string, assetId: string, direction: "up" | "down") => void;
  moveGenerateReferenceEdge: (nodeId: string, sourceEdgeId: string, targetEdgeId: string) => void;
  removeReferenceGroupItem: (groupNodeId: string, assetId: string) => void;
  selectEdge: (edgeId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  setViewport: (viewport: BoardViewport) => void;
  updateBoardConfig: (config: Partial<BoardConfig>) => void;
  updateBoardTitle: (title: string) => void;
  updateReferenceGroupItemRole: (groupNodeId: string, assetId: string, role: BoardReferenceRole) => void;
  updateAgentInstruction: (nodeId: string, instruction: string) => void;
  updateGenerateNode: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  updateNodeTitle: (nodeId: string, title: string) => void;
  updateNodePosition: (nodeId: string, position: BoardPoint) => void;
  updateNodesPositions: (updates: Array<{ nodeId: string; position: BoardPoint }>) => void;
  updateNodeSize: (nodeId: string, size: BoardSize) => void;
  updateNoteBody: (nodeId: string, body: string) => void;
  updatePromptNode: (nodeId: string, prompt: string) => void;
  updateRunningHubAppNode: (nodeId: string, input: BoardRunningHubAppNodeUpdate) => void;
}

function createBoardId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error("crypto is required to create board ids");
  }
  if (typeof cryptoApi.randomUUID === "function") {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }
  if (typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValues is required to create board ids");
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
  return `${prefix}_${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function duplicateNodeIdPrefix(kind: BoardNode["kind"]): string {
  if (kind === "asset") return "asset";
  if (kind === "prompt") return "prompt";
  if (kind === "reference-group") return "ref_group";
  if (kind === "image-generate") return "image_gen";
  if (kind === "video-generate") return "video_gen";
  if (kind === "runninghub-app") return "rh_app";
  if (kind === "agent") return "agent";
  if (kind === "result") return "result";
  return "note";
}

function cloneBoardNodeForDuplicate(source: BoardNode, stackIndex: number): BoardNode {
  const createdAt = nowIso();
  const offset = 28 * (stackIndex + 1);
  const position = {
    x: source.position.x + offset,
    y: source.position.y + offset,
  };
  const shell = {
    id: createBoardId(duplicateNodeIdPrefix(source.kind)),
    title: source.title,
    position,
    size: source.kind === "runninghub-app" ? minimumBoardSize(source.size, DEFAULT_RUNNINGHUB_APP_NODE_SIZE) : source.size,
    createdAt,
    updatedAt: createdAt,
  };

  switch (source.kind) {
    case "asset":
      return { ...shell, kind: "asset", asset: source.asset };
    case "prompt":
      return { ...shell, kind: "prompt", prompt: source.prompt };
    case "reference-group":
      return { ...shell, kind: "reference-group", references: structuredClone(source.references) };
    case "image-generate":
      return {
        ...shell,
        kind: "image-generate",
        aspectRatio: source.aspectRatio,
        customImageResolution: source.customImageResolution,
        imageQuality: source.imageQuality,
        imageResolution: source.imageResolution,
        model: source.model,
        prompt: source.prompt,
        status: "idle",
        thinkingLevel: source.thinkingLevel,
        variantCount: source.variantCount,
      };
    case "video-generate":
      return {
        ...shell,
        kind: "video-generate",
        aspectRatio: source.aspectRatio,
        model: source.model,
        prompt: source.prompt,
        status: "idle",
        variantCount: source.variantCount,
        videoDuration: source.videoDuration,
        videoPreset: source.videoPreset,
        videoReferenceMode: source.videoReferenceMode,
        videoResolution: source.videoResolution,
      };
    case "runninghub-app":
      return {
        ...shell,
        kind: "runninghub-app",
        accessPassword: source.accessPassword,
        bindings: structuredClone(source.bindings),
        outputType: source.outputType,
        prompt: source.prompt,
        status: "idle",
        targetId: source.targetId,
        targetType: source.targetType,
      };
    case "agent":
      return { ...shell, kind: "agent", instruction: source.instruction };
    case "result":
      return {
        ...shell,
        kind: "result",
        sourceNodeId: source.sourceNodeId,
        resultStackKey: source.resultStackKey,
        activeAssetId: source.activeAssetId,
        resultAssetIds: source.resultAssetIds,
        asset: source.asset,
      };
    case "note":
      return { ...shell, kind: "note", body: source.body };
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

function normalizeBoard(board: unknown, fallbackId: string = DEFAULT_BOARD_ID): BoardDocument {
  const boardRecord = isRecord(board) ? board : {};
  const nodes = Array.isArray(boardRecord.nodes) ? normalizeBoardNodes(boardRecord.nodes) : [];
  return {
    ...boardRecord,
    id: fallbackId,
    title: readNonEmptyString(boardRecord.title, "Board"),
    config: normalizeBoardConfig(boardRecord.config),
    nodes,
    edges: Array.isArray(boardRecord.edges) ? normalizeBoardEdges(nodes, boardRecord.edges) : [],
    viewport: normalizeBoardViewport(boardRecord.viewport),
    createdAt: readNonEmptyString(boardRecord.createdAt, nowIso()),
    updatedAt: readNonEmptyString(boardRecord.updatedAt, nowIso()),
  };
}

function normalizeBoardNodes(nodes: unknown[]): BoardNode[] {
  const seenIds = new Set<string>();
  const normalizedNodes: BoardNode[] = [];

  nodes.forEach((node, index) => {
    const normalizedNode = normalizeBoardNode(node, index);
    if (!normalizedNode || seenIds.has(normalizedNode.id)) return;
    seenIds.add(normalizedNode.id);
    normalizedNodes.push(normalizedNode);
  });

  return normalizedNodes;
}

function normalizeBoardEdges(nodes: BoardNode[], edges: unknown[]): BoardEdge[] {
  const normalizedEdges: BoardEdge[] = [];
  const seenIds = new Set<string>();

  edges.forEach((edge, index) => {
    const normalizedEdge = normalizeBoardEdge(nodes, edge, index);
    if (!normalizedEdge || seenIds.has(normalizedEdge.id)) return;
    seenIds.add(normalizedEdge.id);
    normalizedEdges.push(normalizedEdge);
  });

  return filterValidBoardEdges(nodes, normalizedEdges);
}

function normalizeBoardEdge(nodes: BoardNode[], edge: unknown, index: number): BoardEdge | null {
  if (!isRecord(edge)) return null;
  const from = normalizeBoardPortRef(edge.from);
  const to = normalizeBoardPortRef(edge.to);
  if (!from || !to) return null;

  try {
    return {
      id: readNonEmptyString(edge.id, `edge_legacy_${index}`),
      kind: resolveBoardConnectionKind(nodes, from, to),
      from,
      to,
      createdAt: readNonEmptyString(edge.createdAt, nowIso()),
    };
  } catch {
    return null;
  }
}

function normalizeBoardPortRef(ref: unknown): BoardPortRef | null {
  if (!isRecord(ref)) return null;
  const nodeId = readOptionalString(ref.nodeId);
  const portId = readOptionalString(ref.portId);
  if (!nodeId || !portId || !isBoardPortKind(ref.portKind)) return null;
  return { nodeId, portId, portKind: ref.portKind };
}

function normalizeBoardConfig(config: unknown): BoardConfig {
  const configRecord = isRecord(config) ? config : {};
  return {
    showGrid: typeof configRecord.showGrid === "boolean" ? configRecord.showGrid : DEFAULT_BOARD_CONFIG.showGrid,
    showMiniMap: typeof configRecord.showMiniMap === "boolean" ? configRecord.showMiniMap : DEFAULT_BOARD_CONFIG.showMiniMap,
    snapToGrid: typeof configRecord.snapToGrid === "boolean" ? configRecord.snapToGrid : DEFAULT_BOARD_CONFIG.snapToGrid,
  };
}

function normalizeBoardViewport(viewport: unknown): BoardViewport {
  const viewportRecord = isRecord(viewport) ? viewport : {};
  return {
    x: readFiniteNumber(viewportRecord.x, 0),
    y: readFiniteNumber(viewportRecord.y, 0),
    zoom: Math.max(0.25, Math.min(1.8, readFiniteNumber(viewportRecord.zoom, 1))),
  };
}

function sameBoardViewport(left: BoardViewport, right: BoardViewport): boolean {
  return (
    Math.abs(left.x - right.x) < BOARD_VIEWPORT_POSITION_EPSILON &&
    Math.abs(left.y - right.y) < BOARD_VIEWPORT_POSITION_EPSILON &&
    Math.abs(left.zoom - right.zoom) < BOARD_VIEWPORT_ZOOM_EPSILON
  );
}

function normalizeBoardPoint(point: unknown, index: number): BoardPoint {
  const pointRecord = isRecord(point) ? point : {};
  return {
    x: readFiniteNumber(pointRecord.x, DEFAULT_NODE_POSITION.x + index * 36),
    y: readFiniteNumber(pointRecord.y, DEFAULT_NODE_POSITION.y + index * 28),
  };
}

function normalizeBoardSize(size: unknown, fallback: BoardSize): BoardSize {
  const sizeRecord = isRecord(size) ? size : {};
  return {
    width: Math.max(120, readFiniteNumber(sizeRecord.width, fallback.width)),
    height: Math.max(120, readFiniteNumber(sizeRecord.height, fallback.height)),
  };
}

function minimumBoardSize(size: BoardSize, minimum: BoardSize): BoardSize {
  return {
    width: Math.max(minimum.width, size.width),
    height: Math.max(minimum.height, size.height),
  };
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readVideoReferenceMode(value: unknown): BoardVideoReferenceMode | undefined {
  return value === "reference" || value === "firstLast" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBoardNodeKind(value: unknown): value is BoardNode["kind"] {
  return typeof value === "string" && BOARD_NODE_KINDS.has(value as BoardNode["kind"]);
}

function isBoardPortKind(value: unknown): value is BoardPortRef["portKind"] {
  return value === "asset" || value === "prompt" || value === "result" || value === "agent";
}

function firstOptionValue(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
}

function defaultImageParams(model: string, aspectRatio?: string): {
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
  return {
    aspectRatio: resolvedAspectRatio,
    customImageResolution: DEFAULT_CUSTOM_IMAGE_RESOLUTION,
    imageQuality: capabilities.qualities[0]?.value,
    imageResolution: firstOptionValue(resolutionOptions.length > 0 ? resolutionOptions : capabilities.resolutions, "1K"),
    thinkingLevel: capabilities.thinkingLevels[0]?.value,
  };
}

function defaultVideoParams(model: string, aspectRatio?: string): {
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
    videoReferenceMode: capabilities.referenceMode === "none" ? undefined : capabilities.referenceMode,
    videoResolution: capabilities.resolutions[0]?.value,
  };
}

function normalizeBoardNode(node: unknown, index: number): BoardNode | null {
  if (!isRecord(node) || !isBoardNodeKind(node.kind)) return null;
  const normalizedSize = normalizeBoardSize(node.size, defaultNodeSize(node.kind));
  const shell = {
    id: readNonEmptyString(node.id, `${duplicateNodeIdPrefix(node.kind)}_legacy_${index}`),
    position: normalizeBoardPoint(node.position, index),
    size: node.kind === "runninghub-app" ? minimumBoardSize(normalizedSize, DEFAULT_RUNNINGHUB_APP_NODE_SIZE) : normalizedSize,
    title: readNonEmptyString(node.title, defaultNodeTitle(node.kind)),
    createdAt: readNonEmptyString(node.createdAt, nowIso()),
    updatedAt: readNonEmptyString(node.updatedAt, nowIso()),
  };

  if (node.kind === "asset") {
    const asset = isRecord(node.asset) ? node.asset : null;
    if (!asset || (asset.type !== "image" && asset.type !== "video" && asset.type !== "audio")) return null;
    return {
      ...shell,
      kind: "asset",
      asset: {
        assetId: readNonEmptyString(asset.assetId, shell.id),
        model: readNonEmptyString(asset.model, "unknown"),
        prompt: readNonEmptyString(asset.prompt, shell.title),
        type: asset.type,
        url: readNonEmptyString(asset.url, ""),
      },
    };
  }
  if (node.kind === "result") {
    const asset = isRecord(node.asset) ? node.asset : null;
    if (!asset || (asset.type !== "image" && asset.type !== "video" && asset.type !== "audio")) return null;
    return {
      ...shell,
      kind: "result",
      sourceNodeId: readNonEmptyString(node.sourceNodeId, ""),
      resultStackKey: readNonEmptyString(node.resultStackKey, ""),
      activeAssetId: readNonEmptyString(node.activeAssetId, readNonEmptyString(asset.assetId, shell.id)),
      resultAssetIds: readOptionalStringArray(node.resultAssetIds) ?? [],
      asset: {
        assetId: readNonEmptyString(asset.assetId, shell.id),
        model: readNonEmptyString(asset.model, "unknown"),
        prompt: readNonEmptyString(asset.prompt, shell.title),
        type: asset.type,
        url: readNonEmptyString(asset.url, ""),
      },
    };
  }
  if (node.kind === "prompt") {
    return {
      ...shell,
      kind: "prompt",
      prompt: typeof node.prompt === "string" ? node.prompt : "",
    };
  }
  if (node.kind === "reference-group") {
    return {
      ...shell,
      kind: "reference-group",
      references: Array.isArray(node.references) ? normalizeReferenceGroupItems(node.references) : [],
    };
  }
  if (node.kind === "image-generate") {
    const model = normalizeImageModel(node.model);
    const aspectRatio = readOptionalString(node.aspectRatio);
    const defaults = defaultImageParams(model, aspectRatio);
    return {
      ...shell,
      kind: "image-generate",
      model,
      prompt: typeof node.prompt === "string" ? node.prompt : "",
        aspectRatio: aspectRatio || defaults.aspectRatio,
        customImageResolution: readOptionalString(node.customImageResolution) || defaults.customImageResolution,
        imageQuality: readOptionalString(node.imageQuality) ?? defaults.imageQuality,
        imageResolution: readOptionalString(node.imageResolution) || defaults.imageResolution,
        resultStackKey: readOptionalString(node.resultStackKey),
        status: normalizeGenerationStatus(node.status),
      thinkingLevel: readOptionalString(node.thinkingLevel) ?? defaults.thinkingLevel,
      variantCount: normalizeVariantCount(node.variantCount),
      errorMessage: typeof node.errorMessage === "string" ? node.errorMessage : undefined,
    };
  }
  if (node.kind === "video-generate") {
    const model = normalizeVideoModel(node.model);
    const aspectRatio = readOptionalString(node.aspectRatio);
    const defaults = defaultVideoParams(model, aspectRatio);
    return {
      ...shell,
        kind: "video-generate",
        model,
        prompt: typeof node.prompt === "string" ? node.prompt : "",
        aspectRatio: aspectRatio || defaults.aspectRatio,
        resultStackKey: readOptionalString(node.resultStackKey),
        status: normalizeGenerationStatus(node.status),
      videoDuration: readOptionalString(node.videoDuration) ?? defaults.videoDuration,
      videoPreset: readOptionalString(node.videoPreset) ?? defaults.videoPreset,
      videoReferenceMode: readVideoReferenceMode(node.videoReferenceMode) ?? defaults.videoReferenceMode,
      videoResolution: readOptionalString(node.videoResolution) ?? defaults.videoResolution,
      variantCount: normalizeVariantCount(node.variantCount),
      errorMessage: typeof node.errorMessage === "string" ? node.errorMessage : undefined,
    };
  }
  if (node.kind === "runninghub-app") {
    return {
      ...shell,
      kind: "runninghub-app",
      accessPassword: readOptionalString(node.accessPassword),
      bindings: Array.isArray(node.bindings) ? normalizeRunningHubBindings(node.bindings) : defaultRunningHubBindings(),
      outputType: readRunningHubOutputType(node.outputType),
      prompt: typeof node.prompt === "string" ? node.prompt : "",
      resultStackKey: readOptionalString(node.resultStackKey),
      status: normalizeGenerationStatus(node.status),
      targetId: readOptionalString(node.targetId) ?? "",
      targetType: readRunningHubTargetType(node.targetType),
      errorMessage: typeof node.errorMessage === "string" ? node.errorMessage : undefined,
    };
  }
  if (node.kind === "agent") {
    return {
      ...shell,
      kind: "agent",
      instruction: typeof node.instruction === "string" ? node.instruction : "",
    };
  }
  return {
    ...shell,
    kind: "note",
    body: typeof node.body === "string" ? node.body : "",
  };
}

function defaultNodeSize(kind: BoardNode["kind"]): BoardSize {
  if (kind === "asset" || kind === "result") return DEFAULT_ASSET_NODE_SIZE;
  if (kind === "prompt") return DEFAULT_PROMPT_NODE_SIZE;
  if (kind === "reference-group") return DEFAULT_REFERENCE_GROUP_NODE_SIZE;
  if (kind === "image-generate" || kind === "video-generate") return DEFAULT_GENERATE_NODE_SIZE;
  if (kind === "runninghub-app") return DEFAULT_RUNNINGHUB_APP_NODE_SIZE;
  if (kind === "agent") return DEFAULT_AGENT_NODE_SIZE;
  return DEFAULT_NOTE_NODE_SIZE;
}

function defaultNodeTitle(kind: BoardNode["kind"]): string {
  if (kind === "asset") return "Asset";
  if (kind === "prompt") return "Prompt";
  if (kind === "reference-group") return "Reference Group";
  if (kind === "image-generate") return "Image Generate";
  if (kind === "video-generate") return "Video Generate";
  if (kind === "runninghub-app") return "RunningHub App";
  if (kind === "agent") return "Agent";
  return "Note";
}

function defaultAssetNodeTitle(type: BoardAssetReference["type"]): string {
  if (type === "image") return "图片资产";
  if (type === "video") return "视频资产";
  return "音频资产";
}

function defaultAssetNodeSize(type: BoardAssetReference["type"]): BoardSize {
  if (type === "audio") return DEFAULT_AUDIO_ASSET_NODE_SIZE;
  return DEFAULT_ASSET_NODE_SIZE;
}

function defaultRunningHubBindings(): BoardRunningHubNodeInfoBinding[] {
  return [];
}

function readRunningHubTargetType(value: unknown): BoardRunningHubTargetType {
  return value === "workflow" ? "workflow" : "ai-app";
}

function readRunningHubOutputType(value: unknown): BoardRunningHubOutputType {
  if (value === "video" || value === "audio") return value;
  return "image";
}

function readRunningHubBindingSource(value: unknown): BoardRunningHubBindingSource {
  if (value === "prompt" || value === "reference" || value === "randomSeed") return value;
  return "literal";
}

function readRunningHubBindingDelivery(value: unknown): BoardRunningHubBindingDelivery {
  if (value === "url" || value === "fileName") return value;
  return "raw";
}

function readRunningHubBindingValueType(value: unknown): BoardRunningHubBindingValueType | undefined {
  if (
    value === "text" ||
    value === "number" ||
    value === "boolean" ||
    value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "raw"
  ) {
    return value;
  }
  return undefined;
}

function normalizeRunningHubBindings(bindings: unknown[]): BoardRunningHubNodeInfoBinding[] {
  const normalized = bindings
    .filter(isRecord)
    .map((binding): BoardRunningHubNodeInfoBinding => ({
      id: readNonEmptyString(binding.id, createBoardId("rh_bind")),
      nodeId: readOptionalString(binding.nodeId) ?? "",
      fieldName: readOptionalString(binding.fieldName) ?? "",
      label: readOptionalString(binding.label),
      source: readRunningHubBindingSource(binding.source),
      value: readOptionalString(binding.value) ?? "",
      valueType: readRunningHubBindingValueType(binding.valueType),
      enabled: typeof binding.enabled === "boolean" ? binding.enabled : true,
      required: typeof binding.required === "boolean" ? binding.required : undefined,
      referenceIndex: typeof binding.referenceIndex === "number" && Number.isInteger(binding.referenceIndex) && binding.referenceIndex >= 0
        ? binding.referenceIndex
        : undefined,
      referenceType: binding.referenceType === "video" || binding.referenceType === "audio" ? binding.referenceType : "image",
      deliveryMode: readRunningHubBindingDelivery(binding.deliveryMode),
    }));
  return normalized;
}

function normalizeImageModel(value: unknown): string {
  const model = readNonEmptyString(value, DEFAULT_BOARD_IMAGE_MODEL);
  try {
    getImageModelCapabilities(model);
    return model;
  } catch {
    return DEFAULT_BOARD_IMAGE_MODEL;
  }
}

function normalizeVideoModel(value: unknown): string {
  const model = readNonEmptyString(value, DEFAULT_BOARD_VIDEO_MODEL);
  try {
    getVideoModelCapabilities(model);
    return model;
  } catch {
    return DEFAULT_BOARD_VIDEO_MODEL;
  }
}

function normalizeReferenceGroupItems(items: unknown[]): BoardReferenceGroupItem[] {
  const normalizedItems: BoardReferenceGroupItem[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.assetId !== "string" || item.assetId.length === 0) continue;
    normalizedItems.push({
      assetId: item.assetId,
      model: readNonEmptyString(item.model, "unknown"),
      prompt: readNonEmptyString(item.prompt, "Reference"),
      role: item.role === "start" || item.role === "end" ? item.role : "general",
      type: item.type === "video" || item.type === "audio" ? item.type : "image",
      url: readNonEmptyString(item.url, ""),
    });
  }
  return normalizedItems;
}

function referenceGroupItemFromAssetNode(assetNode: BoardNode & { kind: "asset" }): BoardReferenceGroupItem {
  return {
    assetId: assetNode.asset.assetId,
    model: assetNode.asset.model,
    prompt: assetNode.asset.prompt,
    role: "general",
    type: assetNode.asset.type,
    url: assetNode.asset.url,
  };
}

function normalizeGenerationStatus(status: unknown): BoardGenerationStatus {
  if (status === "processing" || status === "complete" || status === "failed") return status;
  return "idle";
}

function normalizeVariantCount(value: unknown): BoardGenerateVariantCount {
  return value === 2 || value === 4 ? value : DEFAULT_VARIANT_COUNT;
}

function touchBoard(board: BoardDocument, nodes: BoardNode[] = board.nodes, edges: BoardEdge[] = board.edges): BoardDocument {
  return {
    ...board,
    nodes,
    edges,
    updatedAt: nowIso(),
  };
}

function createAssetBoardNode(input: CreateAssetNodeInput, nodes: BoardNode[]): BoardNode {
  const createdAt = nowIso();
  return {
    id: createBoardId("asset"),
    kind: "asset",
    title: input.title ?? defaultAssetNodeTitle(input.asset.type),
    asset: input.asset,
    position: input.position ?? moveDefaultPosition(nodes),
    size: input.size ?? defaultAssetNodeSize(input.asset.type),
    createdAt,
    updatedAt: createdAt,
  };
}

function createResultBoardNode(input: CreateResultNodeInput, nodes: BoardNode[]): BoardResultNode {
  const createdAt = nowIso();
  return {
    id: createBoardId("result"),
    kind: "result",
    title: input.title ?? defaultAssetNodeTitle(input.asset.type),
    sourceNodeId: input.sourceNodeId,
    resultStackKey: input.resultStackKey,
    activeAssetId: input.activeAssetId,
    resultAssetIds: input.resultAssetIds,
    asset: input.asset,
    position: input.position ?? moveDefaultPosition(nodes),
    size: input.size ?? defaultAssetNodeSize(input.asset.type),
    createdAt,
    updatedAt: createdAt,
  };
}

function createReferenceGroupBoardNode(
  input: CreateReferenceGroupNodeInput,
  nodes: BoardNode[],
): BoardReferenceGroupNode {
  const createdAt = nowIso();
  return {
    id: createBoardId("ref_group"),
    kind: "reference-group",
    title: input.title ?? "Reference Group",
    references: input.references ?? [],
    position: input.position ?? moveDefaultPosition(nodes),
    size: input.size ?? DEFAULT_REFERENCE_GROUP_NODE_SIZE,
    createdAt,
    updatedAt: createdAt,
  };
}

function createGenerateBoardNode(input: CreateGenerateNodeInput, nodes: BoardNode[]): BoardImageGenerateNode | BoardVideoGenerateNode {
  const createdAt = nowIso();
  const nodeId = createBoardId(input.kind === "image-generate" ? "image_gen" : "video_gen");
  const baseNode = {
    id: nodeId,
    title: input.title ?? (input.kind === "image-generate" ? "Image Generate" : "Video Generate"),
    prompt: input.prompt ?? "",
    model: input.model,
    status: "idle" as BoardGenerationStatus,
    variantCount: input.variantCount ?? DEFAULT_VARIANT_COUNT,
    position: input.position ?? moveDefaultPosition(nodes),
    size: input.size ?? DEFAULT_GENERATE_NODE_SIZE,
    createdAt,
    updatedAt: createdAt,
  };

  if (input.kind === "image-generate") {
    const imageDefaults = defaultImageParams(input.model, input.aspectRatio);
    return {
      ...baseNode,
      kind: "image-generate",
      aspectRatio: input.aspectRatio || imageDefaults.aspectRatio,
      customImageResolution: input.customImageResolution ?? imageDefaults.customImageResolution,
      imageQuality: input.imageQuality ?? imageDefaults.imageQuality,
      imageResolution: input.imageResolution ?? imageDefaults.imageResolution,
      thinkingLevel: input.thinkingLevel ?? imageDefaults.thinkingLevel,
    };
  }

  const videoDefaults = defaultVideoParams(input.model, input.aspectRatio);
  return {
    ...baseNode,
    kind: "video-generate",
    aspectRatio: input.aspectRatio || videoDefaults.aspectRatio,
    videoDuration: input.videoDuration ?? videoDefaults.videoDuration,
    videoPreset: input.videoPreset ?? videoDefaults.videoPreset,
    videoReferenceMode: input.videoReferenceMode ?? videoDefaults.videoReferenceMode,
    videoResolution: input.videoResolution ?? videoDefaults.videoResolution,
  };
}

function createRunningHubAppBoardNode(input: CreateRunningHubAppNodeInput, nodes: BoardNode[]): BoardRunningHubAppNode {
  const createdAt = nowIso();
  return {
    id: createBoardId("rh_app"),
    kind: "runninghub-app",
    title: input.title ?? "RunningHub App",
    targetType: input.targetType ?? "ai-app",
    outputType: input.outputType ?? "image",
    targetId: input.targetId ?? "",
    accessPassword: input.accessPassword,
    prompt: input.prompt ?? "",
    bindings: input.bindings ?? defaultRunningHubBindings(),
    status: "idle",
    position: input.position ?? moveDefaultPosition(nodes),
    size: input.size ?? DEFAULT_RUNNINGHUB_APP_NODE_SIZE,
    createdAt,
    updatedAt: createdAt,
  };
}

function moveDefaultPosition(nodes: BoardNode[]): BoardPoint {
  return {
    x: DEFAULT_NODE_POSITION.x + nodes.length * 36,
    y: DEFAULT_NODE_POSITION.y + nodes.length * 28,
  };
}

function createBoardEdge(nodes: BoardNode[], from: BoardPortRef, to: BoardPortRef): BoardEdge {
  return {
    id: createBoardId("edge"),
    kind: resolveBoardConnectionKind(nodes, from, to),
    from,
    to,
    createdAt: nowIso(),
  };
}

function connectEdge(nodes: BoardNode[], edges: BoardEdge[], edge: BoardEdge): BoardEdge[] {
  const withoutDuplicate = edges.filter(
    currentEdge =>
      !(
        currentEdge.from.nodeId === edge.from.nodeId &&
        currentEdge.from.portId === edge.from.portId &&
        currentEdge.to.nodeId === edge.to.nodeId &&
        currentEdge.to.portId === edge.to.portId
      ),
  );
  return [...withoutDuplicate, edge];
}

function findMatchingEdge(edges: BoardEdge[], from: BoardPortRef, to: BoardPortRef): BoardEdge | undefined {
  return edges.find(edge =>
    edge.from.nodeId === from.nodeId &&
    edge.from.portId === from.portId &&
    edge.to.nodeId === to.nodeId &&
    edge.to.portId === to.portId
  );
}

function sameGenerateUpdate(node: BoardImageGenerateNode | BoardVideoGenerateNode, input: BoardGenerateNodeUpdate): boolean {
  if ("aspectRatio" in input && node.aspectRatio !== input.aspectRatio) return false;
  if ("errorMessage" in input && node.errorMessage !== input.errorMessage) return false;
  if ("model" in input && node.model !== input.model) return false;
  if ("prompt" in input && node.prompt !== input.prompt) return false;
  if ("resultStackKey" in input && node.resultStackKey !== input.resultStackKey) return false;
  if ("status" in input && node.status !== input.status) return false;
  if ("variantCount" in input && node.variantCount !== input.variantCount) return false;

  if (node.kind === "image-generate") {
    if ("customImageResolution" in input && node.customImageResolution !== input.customImageResolution) return false;
    if ("imageQuality" in input && node.imageQuality !== input.imageQuality) return false;
    if ("imageResolution" in input && node.imageResolution !== input.imageResolution) return false;
    if ("thinkingLevel" in input && node.thinkingLevel !== input.thinkingLevel) return false;
  }

  if (node.kind === "video-generate") {
    if ("videoDuration" in input && node.videoDuration !== input.videoDuration) return false;
    if ("videoPreset" in input && node.videoPreset !== input.videoPreset) return false;
    if ("videoReferenceMode" in input && node.videoReferenceMode !== input.videoReferenceMode) return false;
    if ("videoResolution" in input && node.videoResolution !== input.videoResolution) return false;
  }

  return true;
}

function sameRunningHubAppUpdate(node: BoardRunningHubAppNode, input: BoardRunningHubAppNodeUpdate): boolean {
  if ("accessPassword" in input && node.accessPassword !== input.accessPassword) return false;
  if ("bindings" in input && JSON.stringify(node.bindings) !== JSON.stringify(input.bindings ?? [])) return false;
  if ("errorMessage" in input && node.errorMessage !== input.errorMessage) return false;
  if ("outputType" in input && node.outputType !== input.outputType) return false;
  if ("prompt" in input && node.prompt !== input.prompt) return false;
  if ("resultStackKey" in input && node.resultStackKey !== input.resultStackKey) return false;
  if ("status" in input && node.status !== input.status) return false;
  if ("targetId" in input && node.targetId !== input.targetId) return false;
  if ("targetType" in input && node.targetType !== input.targetType) return false;
  return true;
}

export function useBoardState(boardId: string = DEFAULT_BOARD_ID): BoardStateController {
  const [board, setBoardState] = useState<BoardDocument>(() => createEmptyBoard(boardId));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<BoardSaveStatus>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStackRef = useRef<BoardHistorySnapshot[]>([]);
  const redoStackRef = useRef<BoardHistorySnapshot[]>([]);
  const dragUndoCapturedRef = useRef(false);
  const boardRef = useRef(board);

  useLayoutEffect(() => {
    boardRef.current = board;
  }, [board]);

  const syncUndoRedoFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const clearUndoHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    dragUndoCapturedRef.current = false;
    syncUndoRedoFlags();
  }, [syncUndoRedoFlags]);

  const pushUndoSnapshot = useCallback((snapshot: BoardDocument) => {
    const stack = undoStackRef.current;
    stack.push(cloneBoardHistory(snapshot));
    if (stack.length > BOARD_UNDO_LIMIT) stack.shift();
    redoStackRef.current = [];
    syncUndoRedoFlags();
  }, [syncUndoRedoFlags]);

  const mutateBoard = useCallback((
    updater: (current: BoardDocument) => BoardDocument,
    options?: { skipUndo?: boolean },
  ) => {
    setBoardState(current => {
      if (!options?.skipUndo && hasLoaded) pushUndoSnapshot(current);
      const nextBoard = updater(current);
      boardRef.current = nextBoard;
      return nextBoard;
    });
  }, [hasLoaded, pushUndoSnapshot]);

  const beginUndoGesture = useCallback(() => {
    if (!hasLoaded || dragUndoCapturedRef.current) return;
    dragUndoCapturedRef.current = true;
    pushUndoSnapshot(boardRef.current);
  }, [hasLoaded, pushUndoSnapshot]);

  const endUndoGesture = useCallback(() => {
    dragUndoCapturedRef.current = false;
  }, []);

  const undo = useCallback(() => {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) {
      syncUndoRedoFlags();
      return;
    }
    setBoardState(current => {
      redoStackRef.current.push(cloneBoardHistory(current));
      if (redoStackRef.current.length > BOARD_UNDO_LIMIT) redoStackRef.current.shift();
      return {
        ...current,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        config: snapshot.config,
        viewport: snapshot.viewport,
        updatedAt: nowIso(),
      };
    });
    dragUndoCapturedRef.current = false;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    syncUndoRedoFlags();
  }, [syncUndoRedoFlags]);

  const redo = useCallback(() => {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) {
      syncUndoRedoFlags();
      return;
    }
    setBoardState(current => {
      undoStackRef.current.push(cloneBoardHistory(current));
      if (undoStackRef.current.length > BOARD_UNDO_LIMIT) undoStackRef.current.shift();
      return {
        ...current,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        config: snapshot.config,
        viewport: snapshot.viewport,
        updatedAt: nowIso(),
      };
    });
    dragUndoCapturedRef.current = false;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    syncUndoRedoFlags();
  }, [syncUndoRedoFlags]);

  useEffect(() => {
    let isActive = true;

    async function loadBoard(): Promise<void> {
      setHasLoaded(false);
      setSaveStatus("loading");
      const storedBoard = await getBoardFromDB(boardId);
      if (!isActive) return;

      clearUndoHistory();
      setBoardState(storedBoard ? normalizeBoard(storedBoard, boardId) : createEmptyBoard(boardId));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSaveError(null);
      setSaveStatus("idle");
      setHasLoaded(true);
    }

    loadBoard().catch((error: unknown) => {
      if (!isActive) return;
      setSaveError(error instanceof Error ? error.message : "Board load failed");
      setSaveStatus("error");
      setHasLoaded(true);
    });

    return () => {
      isActive = false;
    };
  }, [boardId, clearUndoHistory]);

  useEffect(() => {
    if (!hasLoaded) return;
    if (board.id !== boardId) return;

    let isActive = true;
    const saveTimer = window.setTimeout(() => {
      setSaveStatus("saving");
      saveBoardToDB(board)
        .then(() => {
          if (!isActive) return;
          setSaveError(null);
          setSaveStatus("saved");
        })
        .catch((error: unknown) => {
          if (!isActive) return;
          setSaveError(error instanceof Error ? error.message : "Board save failed");
          setSaveStatus("error");
        });
    }, 450);

    return () => {
      isActive = false;
      window.clearTimeout(saveTimer);
    };
  }, [board, boardId, hasLoaded]);

  const saveNow = useCallback(async () => {
    const currentBoard = boardRef.current;
    if (!hasLoaded || currentBoard.id !== boardId) return;
    setSaveStatus("saving");
    try {
      await saveBoardToDB(currentBoard);
      setSaveError(null);
      setSaveStatus("saved");
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Board save failed");
      setSaveStatus("error");
      throw error;
    }
  }, [boardId, hasLoaded]);

  const addAssetNode = useCallback((input: CreateAssetNodeInput): string => {
    const node = createAssetBoardNode(input, board.nodes);
    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addAssetNodeWithConnection = useCallback((input: CreateAssetNodeInput, from: BoardPortRef): string => {
    const node = createAssetBoardNode(input, board.nodes);
    const to: BoardPortRef = { nodeId: node.id, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" };
    const edgeId = createBoardId("edge");
    mutateBoard(currentBoard => {
      const nextNodes = [...currentBoard.nodes, node];
      const edge: BoardEdge = {
        id: edgeId,
        kind: resolveBoardConnectionKind(nextNodes, from, to),
        from,
        to,
        createdAt: nowIso(),
      };
      return touchBoard(currentBoard, nextNodes, connectEdge(nextNodes, currentBoard.edges, edge));
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(edgeId);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addResultNodeWithConnection = useCallback((input: CreateResultNodeInput, from: BoardPortRef): string => {
    const node = createResultBoardNode(input, board.nodes);
    const to: BoardPortRef = { nodeId: node.id, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" };
    const edgeId = createBoardId("edge");
    mutateBoard(currentBoard => {
      const nextNodes = [...currentBoard.nodes, node];
      const edge: BoardEdge = {
        id: edgeId,
        kind: resolveBoardConnectionKind(nextNodes, from, to),
        from,
        to,
        createdAt: nowIso(),
      };
      return touchBoard(currentBoard, nextNodes, connectEdge(nextNodes, currentBoard.edges, edge));
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(edgeId);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const completeGenerationResult = useCallback((
    sourceNodeId: string,
    input: CompleteGenerationResultUpdate,
  ) => {
    mutateBoard(currentBoard => {
      const sourceNode = currentBoard.nodes.find(node => node.id === sourceNodeId);
      if (!isResultSourceNode(sourceNode)) return currentBoard;
      const updatedAt = nowIso();
      const resultStackKey = sourceNode.resultStackKey ?? "";
      let nextNodes = currentBoard.nodes.map(node =>
        node.id === sourceNodeId ? { ...node, ...input, updatedAt } : node,
      );
      let nextEdges = currentBoard.edges;

      const from: BoardPortRef = { nodeId: sourceNodeId, portId: BOARD_PORT_IDS.resultOut, portKind: "result" };
      const existingResultNode = findResultNodeForSource(nextNodes, sourceNodeId);
      const resultNode: BoardResultNode = existingResultNode
        ? {
          ...existingResultNode,
          asset: input.asset,
          activeAssetId: input.resultAssetId,
          resultAssetIds: input.resultAssetIds,
          updatedAt,
        }
        : createResultBoardNode(
          {
            sourceNodeId,
            resultStackKey,
            activeAssetId: input.resultAssetId,
            resultAssetIds: input.resultAssetIds,
            asset: input.asset,
            position: resultNodeDefaultPosition(sourceNode),
          },
          nextNodes,
        );
      if (existingResultNode) {
        nextNodes = nextNodes.map(node => (node.id === resultNode.id ? resultNode : node));
      } else {
        nextNodes = [...nextNodes, resultNode];
      }
      const to: BoardPortRef = { nodeId: resultNode.id, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" };
      if (!findMatchingEdge(nextEdges, from, to)) {
        const edge: BoardEdge = {
          ...createBoardEdge(nextNodes, from, to),
          id: createBoardId("edge"),
        };
        nextEdges = connectEdge(nextNodes, nextEdges, edge);
      }

      return touchBoard(currentBoard, nextNodes, nextEdges);
    });
  }, [mutateBoard]);

  const addPromptNode = useCallback((input: CreatePromptNodeInput = {}): string => {
    const createdAt = nowIso();
    const nodeId = createBoardId("prompt");
    const node: BoardPromptNode = {
      id: nodeId,
      kind: "prompt",
      title: input.title ?? "Prompt",
      prompt: input.prompt ?? "",
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ?? DEFAULT_PROMPT_NODE_SIZE,
      createdAt,
      updatedAt: createdAt,
    };

    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes, mutateBoard]);

  const addReferenceGroupNode = useCallback((input: CreateReferenceGroupNodeInput = {}): string => {
    const node = createReferenceGroupBoardNode(input, board.nodes);
    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addReferenceGroupNodeWithAsset = useCallback((input: CreateReferenceGroupNodeInput, assetNodeId: string): string => {
    const node = createReferenceGroupBoardNode(input, board.nodes);
    const from: BoardPortRef = { nodeId: assetNodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" };
    const to: BoardPortRef = { nodeId: node.id, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" };
    const edgeId = createBoardId("edge");
    mutateBoard(currentBoard => {
      const assetNode = currentBoard.nodes.find(currentNode => currentNode.id === assetNodeId);
      if (assetNode?.kind !== "asset") {
        throw new Error("参考组只支持媒体资产");
      }
      const reference = referenceGroupItemFromAssetNode(assetNode);
      const nextNode: BoardReferenceGroupNode = { ...node, references: [reference, ...node.references] };
      const nextNodes = [...currentBoard.nodes, nextNode];
      const edge: BoardEdge = {
        id: edgeId,
        kind: resolveBoardConnectionKind(nextNodes, from, to),
        from,
        to,
        createdAt: nowIso(),
      };
      return touchBoard(currentBoard, nextNodes, connectEdge(nextNodes, currentBoard.edges, edge));
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(edgeId);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addGenerateNode = useCallback((input: CreateGenerateNodeInput): string => {
    const node = createGenerateBoardNode(input, board.nodes);
    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addRunningHubAppNode = useCallback((input: CreateRunningHubAppNodeInput = {}): string => {
    const node = createRunningHubAppBoardNode(input, board.nodes);
    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addGenerateNodeWithConnection = useCallback((
    input: CreateGenerateNodeInput,
    from: BoardPortRef,
    targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn,
  ): string => {
    const node = createGenerateBoardNode(input, board.nodes);
    const to: BoardPortRef = {
      nodeId: node.id,
      portId: targetPortId,
      portKind: targetPortId === BOARD_PORT_IDS.promptIn ? "prompt" : "asset",
    };
    const edgeId = createBoardId("edge");
    mutateBoard(currentBoard => {
      const nextNodes = resolveBoardConnectionNodesWithCompatibleModel([...currentBoard.nodes, node], from, to);
      const edge: BoardEdge = {
        id: edgeId,
        kind: resolveBoardConnectionKind(nextNodes, from, to),
        from,
        to,
        createdAt: nowIso(),
      };
      return touchBoard(currentBoard, nextNodes, connectEdge(nextNodes, currentBoard.edges, edge));
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(edgeId);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addAgentNode = useCallback((input: CreateAgentNodeInput = {}): string => {
    const createdAt = nowIso();
    const nodeId = createBoardId("agent");
    const node: BoardAgentNode = {
      id: nodeId,
      kind: "agent",
      title: input.title ?? "Agent",
      instruction: input.instruction ?? "",
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ?? DEFAULT_AGENT_NODE_SIZE,
      createdAt,
      updatedAt: createdAt,
    };

    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes, mutateBoard]);

  const addNoteNode = useCallback((input: CreateNoteNodeInput = {}): string => {
    const createdAt = nowIso();
    const nodeId = createBoardId("note");
    const node: BoardNode = {
      id: nodeId,
      kind: "note",
      title: input.title ?? "Note",
      body: input.body ?? "",
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ?? DEFAULT_NOTE_NODE_SIZE,
      createdAt,
      updatedAt: createdAt,
    };

    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes, mutateBoard]);

  const clearBoard = useCallback(() => {
    mutateBoard(currentBoard => touchBoard(currentBoard, [], []));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [mutateBoard]);

  const deleteNode = useCallback((nodeId: string) => {
    mutateBoard(currentBoard => {
      const deletedNode = currentBoard.nodes.find(node => node.id === nodeId);
      const updatedAt = nowIso();
      const removedGroupReferences = deletedNode?.kind === "asset"
        ? currentBoard.edges
          .filter(edge => edge.from.nodeId === nodeId && edge.to.portId === "asset-in")
          .map(edge => ({ assetId: deletedNode.asset.assetId, groupNodeId: edge.to.nodeId }))
        : [];
      // Cascade-delete connected result nodes when deleting a generate node
      const resultNodeIdsToDelete = isResultSourceNode(deletedNode)
        ? currentBoard.edges
          .filter(edge => edge.from.nodeId === nodeId && edge.from.portId === BOARD_PORT_IDS.resultOut)
          .map(edge => edge.to.nodeId)
        : [];
      const remainingNodes = currentBoard.nodes
        .filter(node => node.id !== nodeId && !resultNodeIdsToDelete.includes(node.id));
      const remainingEdges = currentBoard.edges.filter(edge =>
        edge.from.nodeId !== nodeId &&
        edge.to.nodeId !== nodeId &&
        !resultNodeIdsToDelete.includes(edge.from.nodeId) &&
        !resultNodeIdsToDelete.includes(edge.to.nodeId)
      );
      return touchBoard(
        currentBoard,
        remainingNodes
          .map(node => {
            if (node.kind !== "reference-group") return node;
            const removedAssetIds = removedGroupReferences
              .filter(reference => reference.groupNodeId === node.id)
              .map(reference => reference.assetId);
            if (removedAssetIds.length === 0) return node;
            return {
              ...node,
              references: node.references.filter(reference => {
                if (!removedAssetIds.includes(reference.assetId)) return true;
                return remainingEdges.some(edge => {
                  if (edge.to.nodeId !== node.id || edge.to.portId !== "asset-in") return false;
                  const sourceNode = remainingNodes.find(item => item.id === edge.from.nodeId);
                  return sourceNode?.kind === "asset" && sourceNode.asset.assetId === reference.assetId;
                });
              }),
              updatedAt,
            };
          }),
        remainingEdges,
      );
    });
    setSelectedNodeId(currentId => (currentId === nodeId ? null : currentId));
  }, [mutateBoard]);

  const deleteEdge = useCallback((edgeId: string) => {
    mutateBoard(currentBoard => {
      const edge = currentBoard.edges.find(item => item.id === edgeId);
      if (!edge) return currentBoard;
      const targetNode = currentBoard.nodes.find(node => node.id === edge.to.nodeId);
      const sourceNode = currentBoard.nodes.find(node => node.id === edge.from.nodeId);
      if (targetNode?.kind === "reference-group" && sourceNode?.kind === "asset") {
        const assetId = sourceNode.asset.assetId;
        const assetNodeIds = currentBoard.nodes
          .filter(node => node.kind === "asset" && node.asset.assetId === assetId)
          .map(node => node.id);
        const updatedAt = nowIso();
        return touchBoard(
          currentBoard,
          currentBoard.nodes.map(node =>
            node.id === targetNode.id && node.kind === "reference-group"
              ? { ...node, references: node.references.filter(item => item.assetId !== assetId), updatedAt }
              : node,
          ),
          currentBoard.edges.filter(boardEdge =>
            !(
              boardEdge.to.nodeId === targetNode.id &&
              boardEdge.to.portId === BOARD_PORT_IDS.assetIn &&
              assetNodeIds.includes(boardEdge.from.nodeId)
            ),
          ),
        );
      }
      return touchBoard(currentBoard, currentBoard.nodes, currentBoard.edges.filter(boardEdge => boardEdge.id !== edgeId));
    });
    setSelectedEdgeId(currentId => (currentId === edgeId ? null : currentId));
  }, [mutateBoard]);

  const reconnectEdge = useCallback((edgeId: string, from: BoardPortRef, to: BoardPortRef) => {
    mutateBoard(currentBoard => {
      const oldEdge = currentBoard.edges.find(edge => edge.id === edgeId);
      if (!oldEdge) {
        throw new Error("连接不存在");
      }
      const compatibleNodes = resolveBoardConnectionNodesWithCompatibleModel(currentBoard.nodes, from, to);
      const kind = resolveBoardConnectionKind(compatibleNodes, from, to);
      const withoutDuplicate = currentBoard.edges.filter(currentEdge => {
        if (currentEdge.id === edgeId) return true;
        return !(
          currentEdge.from.nodeId === from.nodeId &&
          currentEdge.from.portId === from.portId &&
          currentEdge.to.nodeId === to.nodeId &&
          currentEdge.to.portId === to.portId
        );
      });
      const nextEdges = withoutDuplicate.map(edge =>
        edge.id === edgeId ? { ...edge, kind, from, to } : edge,
      );
      const oldSourceNode = currentBoard.nodes.find(node => node.id === oldEdge.from.nodeId);
      const nextSourceNode = compatibleNodes.find(node => node.id === from.nodeId);
      const oldReference: BoardReferenceGroupItem | null = oldSourceNode?.kind === "asset"
        ? referenceGroupItemFromAssetNode(oldSourceNode)
        : null;
      const nextReference: BoardReferenceGroupItem | null = nextSourceNode?.kind === "asset"
        ? referenceGroupItemFromAssetNode(nextSourceNode)
        : null;
      if (!oldReference && !nextReference) return touchBoard(currentBoard, compatibleNodes, nextEdges);

      const updatedAt = nowIso();
      const nextNodes = compatibleNodes.map(node => {
        if (node.kind !== "reference-group") return node;
        let references = node.references;
        if (node.id === oldEdge.to.nodeId && oldEdge.to.portId === BOARD_PORT_IDS.assetIn) {
          references = oldReference ? references.filter(item => item.assetId !== oldReference.assetId) : references;
        }
        if (node.id === to.nodeId && to.portId === BOARD_PORT_IDS.assetIn && nextReference && !references.some(item => item.assetId === nextReference.assetId)) {
          references = [...references, nextReference];
        }
        return references === node.references ? node : { ...node, references, updatedAt };
      });
      return touchBoard(currentBoard, nextNodes, nextEdges);
    });
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
  }, [mutateBoard]);

  const restoreNodeWithEdges = useCallback((node: BoardNode, edges: BoardEdge[]) => {
    mutateBoard(currentBoard => {
      if (currentBoard.nodes.some(item => item.id === node.id)) {
        throw new Error("节点已存在");
      }
      const nodeIds = new Set([...currentBoard.nodes.map(item => item.id), node.id]);
      const possibleEdges = edges.filter(
        edge => nodeIds.has(edge.from.nodeId) && nodeIds.has(edge.to.nodeId),
      );
      const restoredEdges = filterValidBoardEdges([...currentBoard.nodes, node], possibleEdges);
      return touchBoard(currentBoard, [...currentBoard.nodes, node], [...currentBoard.edges, ...restoredEdges]);
    });
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, [mutateBoard]);

  const duplicateNodes = useCallback((nodeIds: string[]): string[] => {
    const sources = nodeIds
      .map(nodeId => board.nodes.find(node => node.id === nodeId))
      .filter((node): node is BoardNode => node !== undefined);
    if (sources.length === 0) return [];

    const clones = sources.map((source, index) => cloneBoardNodeForDuplicate(source, index));
    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, ...clones]));
    const lastClone = clones[clones.length - 1];
    if (lastClone) {
      setSelectedNodeId(lastClone.id);
      setSelectedEdgeId(null);
    }
    return clones.map(clone => clone.id);
  }, [board.nodes, mutateBoard]);

  const duplicateNode = useCallback((nodeId: string): string | null => {
    const ids = duplicateNodes([nodeId]);
    return ids[0] ?? null;
  }, [duplicateNodes]);

  const connectPorts = useCallback((from: BoardPortRef, to: BoardPortRef) => {
    const existingEdge = findMatchingEdge(boardRef.current.edges, from, to);
    if (existingEdge) {
      setSelectedEdgeId(existingEdge.id);
      setSelectedNodeId(null);
      return;
    }
    const edgeId = createBoardId("edge");
    mutateBoard(currentBoard => {
      if (findMatchingEdge(currentBoard.edges, from, to)) return currentBoard;
      const nextNodes = resolveBoardConnectionNodesWithCompatibleModel(currentBoard.nodes, from, to);
      const edge: BoardEdge = {
        ...createBoardEdge(nextNodes, from, to),
        id: edgeId,
      };
      return touchBoard(currentBoard, nextNodes, connectEdge(nextNodes, currentBoard.edges, edge));
    });
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
  }, [mutateBoard]);

  const addAssetToReferenceGroup = useCallback((assetNodeId: string, groupNodeId: string) => {
    const updatedAt = nowIso();
    mutateBoard(currentBoard => {
      const assetNode = currentBoard.nodes.find(node => node.id === assetNodeId);
      if (assetNode?.kind !== "asset") {
        throw new Error("参考组只支持媒体资产");
      }
      const reference = referenceGroupItemFromAssetNode(assetNode);
      return touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => {
          if (node.id !== groupNodeId) return node;
          if (node.kind !== "reference-group") throw new Error("目标节点不是参考组");
          if (node.references.some(item => item.assetId === reference.assetId)) return node;
          return { ...node, references: [...node.references, reference], updatedAt };
        }),
      );
    });
  }, [mutateBoard]);

  const removeReferenceGroupItem = useCallback((groupNodeId: string, assetId: string) => {
    const updatedAt = nowIso();
    mutateBoard(currentBoard => {
      const assetNodeIds = currentBoard.nodes
        .filter(node => node.kind === "asset" && node.asset.assetId === assetId)
        .map(node => node.id);
      return touchBoard(
        currentBoard,
        currentBoard.nodes.map(node =>
          node.id === groupNodeId && node.kind === "reference-group"
            ? { ...node, references: node.references.filter(item => item.assetId !== assetId), updatedAt }
            : node,
        ),
        currentBoard.edges.filter(edge =>
          !(
            edge.to.nodeId === groupNodeId &&
            edge.to.portId === "asset-in" &&
            assetNodeIds.includes(edge.from.nodeId)
          ),
        ),
      );
    });
  }, [mutateBoard]);

  const moveReferenceGroupItem = useCallback((groupNodeId: string, assetId: string, direction: "up" | "down") => {
    const updatedAt = nowIso();
    mutateBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => {
          if (node.id !== groupNodeId || node.kind !== "reference-group") return node;
          const index = node.references.findIndex(item => item.assetId === assetId);
          const targetIndex = direction === "up" ? index - 1 : index + 1;
          if (index < 0 || targetIndex < 0 || targetIndex >= node.references.length) return node;
          const references = [...node.references];
          const [item] = references.splice(index, 1);
          references.splice(targetIndex, 0, item);
          return { ...node, references, updatedAt };
        }),
      ),
    );
  }, [mutateBoard]);

  const moveGenerateReferenceEdge = useCallback((nodeId: string, sourceEdgeId: string, targetEdgeId: string) => {
    if (sourceEdgeId === targetEdgeId) return;
    mutateBoard(currentBoard => {
      const referenceEdges = currentBoard.edges.filter(
        edge => edge.to.nodeId === nodeId && edge.to.portId === BOARD_PORT_IDS.referenceIn,
      );
      const sourceIndex = referenceEdges.findIndex(edge => edge.id === sourceEdgeId);
      const targetIndex = referenceEdges.findIndex(edge => edge.id === targetEdgeId);
      if (sourceIndex < 0 || targetIndex < 0) return currentBoard;

      const nextReferenceEdges = [...referenceEdges];
      const sourceEdge = nextReferenceEdges[sourceIndex];
      const targetEdge = nextReferenceEdges[targetIndex];
      if (!sourceEdge || !targetEdge) return currentBoard;
      nextReferenceEdges[sourceIndex] = targetEdge;
      nextReferenceEdges[targetIndex] = sourceEdge;

      let nextReferenceIndex = 0;
      const nextEdges = currentBoard.edges.map(edge => {
        if (edge.to.nodeId !== nodeId || edge.to.portId !== BOARD_PORT_IDS.referenceIn) return edge;
        const nextEdge = nextReferenceEdges[nextReferenceIndex];
        nextReferenceIndex += 1;
        return nextEdge ?? edge;
      });
      return touchBoard(currentBoard, currentBoard.nodes, nextEdges);
    });
  }, [mutateBoard]);

  const updateReferenceGroupItemRole = useCallback((groupNodeId: string, assetId: string, role: BoardReferenceRole) => {
    const updatedAt = nowIso();
    mutateBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node =>
          node.id === groupNodeId && node.kind === "reference-group"
            ? { ...node, references: node.references.map(item => (item.assetId === assetId ? { ...item, role } : item)), updatedAt }
            : node,
        ),
      ),
    );
  }, [mutateBoard]);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(current => (current === nodeId ? current : nodeId));
    if (nodeId) setSelectedEdgeId(current => (current === null ? current : null));
  }, []);

  const selectEdge = useCallback((edgeId: string | null) => {
    setSelectedEdgeId(current => (current === edgeId ? current : edgeId));
    if (edgeId) setSelectedNodeId(current => (current === null ? current : null));
  }, []);

  const setViewport = useCallback((viewport: BoardViewport) => {
    mutateBoard(currentBoard => (
      sameBoardViewport(currentBoard.viewport, viewport)
        ? currentBoard
        : {
          ...currentBoard,
          viewport,
          updatedAt: nowIso(),
        }
    ), { skipUndo: true });
  }, [mutateBoard]);

  const updateBoardTitle = useCallback((title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new Error("画板名称不能为空");
    }
    mutateBoard(currentBoard => ({
      ...currentBoard,
      title: trimmedTitle,
      updatedAt: nowIso(),
    }));
  }, [mutateBoard]);

  const updateBoardConfig = useCallback((config: Partial<BoardConfig>) => {
    mutateBoard(currentBoard => ({
      ...currentBoard,
      config: { ...currentBoard.config, ...config },
      updatedAt: nowIso(),
    }), { skipUndo: true });
  }, [mutateBoard]);

  const updateNodeTitle = useCallback((nodeId: string, title: string) => {
    const updatedAt = nowIso();
    mutateBoard(currentBoard => {
      let didChange = false;
      const nextNodes = currentBoard.nodes.map(node => {
        if (node.id !== nodeId) return node;
        if (node.title === title) return node;
        didChange = true;
        return { ...node, title, updatedAt };
      });
      return didChange ? touchBoard(currentBoard, nextNodes) : currentBoard;
    });
  }, [mutateBoard]);

  const updateNodesPositions = useCallback((updates: Array<{ nodeId: string; position: BoardPoint }>) => {
    if (updates.length === 0) return;
    const positionById = new Map(updates.map(update => [update.nodeId, update.position]));
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node => {
          const position = positionById.get(node.id);
          if (!position) return node;
          if (node.position.x === position.x && node.position.y === position.y) return node;
          didChange = true;
          return { ...node, position, updatedAt };
        });
        return didChange ? touchBoard(currentBoard, nextNodes) : currentBoard;
      },
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateNodePosition = useCallback((nodeId: string, position: BoardPoint) => {
    updateNodesPositions([{ nodeId, position }]);
  }, [updateNodesPositions]);

  const updateNodeSize = useCallback((nodeId: string, size: BoardSize) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId ? { ...node, size, updatedAt } : node)),
      ),
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateAssetNodeAsset = useCallback((nodeId: string, asset: BoardAssetReference) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node => {
          if (node.id !== nodeId || node.kind !== "asset") return node;
          if (node.asset.assetId === asset.assetId) return node;
          didChange = true;
          return { ...node, asset, updatedAt };
        });
        return didChange ? touchBoard(currentBoard, nextNodes) : currentBoard;
      },
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateResultNodeAsset = useCallback((nodeId: string, assetId: string) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node => {
          if (node.id !== nodeId || node.kind !== "result") return node;
          if (node.activeAssetId === assetId) return node;
          didChange = true;
          return { ...node, activeAssetId: assetId, updatedAt };
        });
        return didChange ? touchBoard(currentBoard, nextNodes) : currentBoard;
      },
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updatePromptNode = useCallback((nodeId: string, prompt: string) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId && node.kind === "prompt" ? { ...node, prompt, updatedAt } : node)),
      ),
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateGenerateNode = useCallback((nodeId: string, input: BoardGenerateNodeUpdate) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node =>
          node.id === nodeId && (node.kind === "image-generate" || node.kind === "video-generate")
            ? sameGenerateUpdate(node, input)
              ? node
              : (() => {
                didChange = true;
                return { ...node, ...input, updatedAt };
              })()
            : node
        );
        if (!didChange) return currentBoard;
        return touchBoard(currentBoard, nextNodes, filterValidBoardEdges(nextNodes, currentBoard.edges));
      },
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateRunningHubAppNode = useCallback((nodeId: string, input: BoardRunningHubAppNodeUpdate) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node =>
          node.id === nodeId && node.kind === "runninghub-app"
            ? sameRunningHubAppUpdate(node, input)
              ? node
              : (() => {
                didChange = true;
                return { ...node, ...input, updatedAt };
              })()
            : node
        );
        if (!didChange) return currentBoard;
        return touchBoard(currentBoard, nextNodes, filterValidBoardEdges(nextNodes, currentBoard.edges));
      },
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateAgentInstruction = useCallback((nodeId: string, instruction: string) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId && node.kind === "agent" ? { ...node, instruction, updatedAt } : node)),
      ),
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateNoteBody = useCallback((nodeId: string, body: string) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId && node.kind === "note" ? { ...node, body, updatedAt } : node)),
      ),
      { skipUndo: true },
    );
  }, [mutateBoard]);

  return useMemo(
    () => ({
      board,
      canRedo,
      canUndo,
      saveStatus,
      selectedEdgeId,
      selectedNodeId,
      saveError,
      saveNow,
      beginUndoGesture,
      endUndoGesture,
      redo,
      undo,
      duplicateNode,
      duplicateNodes,
      reconnectEdge,
      restoreNodeWithEdges,
      addAgentNode,
      addAssetNode,
      addAssetNodeWithConnection,
      addResultNodeWithConnection,
      completeGenerationResult,
      addGenerateNode,
      addGenerateNodeWithConnection,
      addNoteNode,
      addPromptNode,
      addReferenceGroupNode,
      addReferenceGroupNodeWithAsset,
      addRunningHubAppNode,
      addAssetToReferenceGroup,
      clearBoard,
      connectPorts,
      deleteEdge,
      deleteNode,
      moveReferenceGroupItem,
      moveGenerateReferenceEdge,
      removeReferenceGroupItem,
      selectEdge,
      selectNode,
      setViewport,
      updateBoardConfig,
      updateBoardTitle,
      updateReferenceGroupItemRole,
      updateAssetNodeAsset,
      updateResultNodeAsset,
      updateAgentInstruction,
      updateGenerateNode,
      updateNodeTitle,
      updateNodePosition,
      updateNodesPositions,
      updateNodeSize,
      updateNoteBody,
      updatePromptNode,
      updateRunningHubAppNode,
    }),
    [
      addAgentNode,
      addAssetNode,
      addAssetNodeWithConnection,
      addResultNodeWithConnection,
      addGenerateNode,
      addGenerateNodeWithConnection,
      addNoteNode,
      addPromptNode,
      addReferenceGroupNode,
      addReferenceGroupNodeWithAsset,
      addRunningHubAppNode,
      addAssetToReferenceGroup,
      beginUndoGesture,
      endUndoGesture,
      board,
      canRedo,
      canUndo,
      clearBoard,
      completeGenerationResult,
      connectPorts,
      deleteEdge,
      deleteNode,
      duplicateNode,
      duplicateNodes,
      moveReferenceGroupItem,
      moveGenerateReferenceEdge,
      reconnectEdge,
      restoreNodeWithEdges,
      removeReferenceGroupItem,
      redo,
      saveError,
      saveStatus,
      saveNow,
      selectedEdgeId,
      selectedNodeId,
      selectEdge,
      selectNode,
      setViewport,
      updateBoardConfig,
      updateBoardTitle,
      updateReferenceGroupItemRole,
      updateAssetNodeAsset,
      updateResultNodeAsset,
      updateAgentInstruction,
      updateGenerateNode,
      updateNodeTitle,
      updateNodePosition,
      updateNodesPositions,
      updateNodeSize,
      undo,
      updateNoteBody,
      updatePromptNode,
      updateRunningHubAppNode,
    ],
  );
}
