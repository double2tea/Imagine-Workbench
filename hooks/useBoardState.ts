"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BOARD_UNDO_LIMIT, cloneBoardHistory, type BoardHistorySnapshot } from "@/lib/board/history";
import {
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_AUDIO_ASSET_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_BOARD_CONFIG,
  DEFAULT_BOARD_ID,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_GROUP_NODE_SIZE,
  DEFAULT_MULTI_GRID_NODE_SIZE,
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
  type BoardAudioOperationNode,
  type BoardAssetReference,
  type BoardGenerateNodeUpdate,
  type BoardGenerateVariantCount,
  type BoardGenerationStatus,
  type BoardGroupNode,
  type BoardImageGenerateNode,
  type BoardMultiGridItem,
  type BoardMultiGridNode,
  type BoardMultiGridNodeUpdate,
  type BoardNoteNode,
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
  type CreateGroupNodeInput,
  type CreateMultiGridNodeInput,
  type CreateNoteNodeInput,
  type CreatePromptNodeInput,
  type CreateReferenceGroupNodeInput,
  type CreateResultNodeInput,
  type CreateRunningHubAppNodeInput,
  boardNodeAbsolutePosition,
  boardNodesWithAbsolutePositions,
  childPositionAfterUngroup,
  createBoardGroupLayout,
  fitBoardGroupLayoutToChildren,
  resolveMovedBoardNodeParents,
} from "@/lib/board";
import {
  DEFAULT_BOARD_MULTI_GRID_ASPECT_RATIO,
  DEFAULT_BOARD_MULTI_GRID_SIZE,
  firstEmptyBoardMultiGridCell,
  isBoardMultiGridAspectRatio,
  isBoardMultiGridSize,
  normalizeBoardMultiGridItems,
} from "@/lib/board/multi-grid";
import { DEFAULT_AUDIO_MODEL, getAudioModelCapabilities, getImageModelCapabilities, getImageResolutionOptions, getVideoModelCapabilities } from "@/lib/providers/model-catalog";
import { RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS, isRunningHubYouchuanImageModel } from "@/lib/providers/runninghub";
import type { RunningHubYouchuanAdvancedSettings } from "@/lib/providers/types";
import {
  DEFAULT_CINEMATIC_PROFILE,
  normalizeCinematicProfile,
  sameCinematicProfile,
} from "@/lib/cinematic-controls";
import {
  BOARD_PORT_IDS,
  filterValidBoardEdges,
  resolveBoardConnectionKind,
  resolveBoardConnectionNodesWithCompatibleModel,
} from "@/lib/board/ports";
import { clampBoardTextNodeSize, estimateBoardNoteSize, estimateBoardPromptSize } from "@/lib/board/text-node-size";
import { findConnectedResultNodeForSourceStack, isResultSourceNode, resultNodeDefaultPosition, resultNodeIdsOwnedBySource } from "@/lib/board/utils";
import { findAvailableBoardNodePosition } from "@/lib/board/placement";

export type BoardSaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

interface CompleteGenerationResultUpdate {
  asset: BoardAssetReference;
  errorMessage?: string;
  resultAssetId: string;
  resultAssetIds: string[];
  status: BoardGenerationStatus;
}

interface AddAssetNodesInGroupResult {
  groupId: string;
  nodeIds: string[];
}

const DEFAULT_CUSTOM_IMAGE_RESOLUTION = "2560x1440";
const DEFAULT_VARIANT_COUNT: BoardGenerateVariantCount = 1;
const DEFAULT_BOARD_IMAGE_MODEL = "modelscope:Qwen/Qwen-Image";
const DEFAULT_BOARD_VIDEO_MODEL = "12ai:veo_3_1-fast";
const DEFAULT_BOARD_AUDIO_MODEL = DEFAULT_AUDIO_MODEL;
const BOARD_VIEWPORT_POSITION_EPSILON = 0.5;
const BOARD_VIEWPORT_ZOOM_EPSILON = 0.001;
const BOARD_NODE_KINDS = new Set<BoardNode["kind"]>([
  "agent",
  "asset",
  "group",
  "multi-grid",
  "audio-operation",
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
  addAssetNodes: (inputs: CreateAssetNodeInput[]) => string[];
  addAssetNodesInGroup: (inputs: CreateAssetNodeInput[]) => AddAssetNodesInGroupResult;
  addAssetNodeWithConnection: (input: CreateAssetNodeInput, from: BoardPortRef) => string;
  addResultNodeWithConnection: (input: CreateResultNodeInput, from: BoardPortRef) => string;
  completeGenerationResult: (sourceNodeId: string, update: CompleteGenerationResultUpdate) => void;
  updateAssetNodeAsset: (nodeId: string, asset: BoardAssetReference, resultAssetIds?: string[]) => void;
  updateAssetReferenceUrls: (updates: Array<{ assetId: string; url: string }>) => void;
  updateResultNodeAsset: (nodeId: string, assetId: string) => void;
  addGenerateNode: (input: CreateGenerateNodeInput) => string;
  addGroupNode: (input?: CreateGroupNodeInput) => string;
  addMultiGridNode: (input?: CreateMultiGridNodeInput) => string;
  addAssetToMultiGrid: (nodeId: string, asset: BoardAssetReference, cellIndex?: number) => void;
  extractMultiGridItemToAssetNode: (nodeId: string, assetId: string, position: BoardPoint) => string | null;
  groupNodes: (nodeIds: string[]) => string | null;
  ungroupNode: (nodeId: string) => void;
  addGenerateNodeWithConnection: (
    input: CreateGenerateNodeInput,
    from: BoardPortRef,
    targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn,
  ) => string;
  addGenerateNodeWithConnections: (
    input: CreateGenerateNodeInput,
    connections: Array<{ from: BoardPortRef; targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn }>,
  ) => string;
  addNoteNode: (input?: CreateNoteNodeInput) => string;
  addNoteNodeWithConnection: (input: CreateNoteNodeInput, from: BoardPortRef) => string;
  addPromptNode: (input?: CreatePromptNodeInput) => string;
  addReferenceGroupNode: (input?: CreateReferenceGroupNodeInput) => string;
  addReferenceGroupNodeWithAsset: (input: CreateReferenceGroupNodeInput, assetNodeId: string) => string;
  addReferenceGroupNodeWithAssets: (input: CreateReferenceGroupNodeInput, assetNodeIds: string[]) => string;
  addRunningHubAppNode: (input?: CreateRunningHubAppNodeInput) => string;
  addAssetToReferenceGroup: (assetNodeId: string, groupNodeId: string) => void;
  clearBoard: () => void;
  connectPorts: (from: BoardPortRef, to: BoardPortRef) => void;
  connectPortsBatch: (connections: Array<{ from: BoardPortRef; to: BoardPortRef }>) => void;
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
  updateMultiGridNode: (nodeId: string, input: BoardMultiGridNodeUpdate) => void;
  updateMultiGridItemTransform: (nodeId: string, assetId: string, transform: Partial<Pick<BoardMultiGridItem, "offsetX" | "offsetY" | "scale">>) => void;
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
  if (kind === "group") return "group";
  if (kind === "multi-grid") return "multi_grid";
  if (kind === "image-generate") return "image_gen";
  if (kind === "video-generate") return "video_gen";
  if (kind === "audio-operation") return "audio_op";
  if (kind === "runninghub-app") return "rh_app";
  if (kind === "agent") return "agent";
  if (kind === "result") return "asset";
  return "note";
}

function cloneBoardNodeForDuplicate(source: BoardNode, position: BoardPoint): BoardNode {
  const createdAt = nowIso();
  const shell = {
    id: createBoardId(duplicateNodeIdPrefix(source.kind)),
    parentId: source.parentId,
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
    case "group":
      return { ...shell, kind: "group" };
    case "multi-grid":
      return {
        ...shell,
        kind: "multi-grid",
        aspectRatio: source.aspectRatio,
        gridSize: source.gridSize,
        isCollapsed: source.isCollapsed,
        items: structuredClone(source.items),
        selectedItemId: source.selectedItemId,
      };
    case "image-generate":
      return {
        ...shell,
        kind: "image-generate",
        aspectRatio: source.aspectRatio,
        customImageResolution: source.customImageResolution,
        cinematicProfile: source.cinematicProfile,
        imageQuality: source.imageQuality,
        imageResolution: source.imageResolution,
        model: source.model,
        prompt: source.prompt,
        runningHubYouchuan: isRunningHubYouchuanImageModel(source.model) ? source.runningHubYouchuan : undefined,
        status: "idle",
        thinkingLevel: source.thinkingLevel,
        variantCount: source.variantCount,
      };
    case "video-generate":
      return {
        ...shell,
        kind: "video-generate",
        aspectRatio: source.aspectRatio,
        cinematicProfile: source.cinematicProfile,
        model: source.model,
        prompt: source.prompt,
        status: "idle",
        variantCount: source.variantCount,
        videoDuration: source.videoDuration,
        videoPreset: source.videoPreset,
        videoReferenceMode: source.videoReferenceMode,
        videoResolution: source.videoResolution,
      };
    case "audio-operation":
      return {
        ...shell,
        kind: "audio-operation",
        audioFormat: source.audioFormat,
        audioMode: source.audioMode,
        audioStylePrompt: source.audioStylePrompt,
        model: source.model,
        prompt: source.prompt,
        status: "idle",
        variantCount: source.variantCount,
        voiceCloneConsentAccepted: source.voiceCloneConsentAccepted,
        voiceProfileId: source.voiceProfileId,
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
        kind: "asset",
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

function duplicatedInputEdgesForClones(
  edges: BoardEdge[],
  sources: BoardNode[],
  clones: BoardNode[],
): BoardEdge[] {
  const cloneIdBySourceId = new Map(sources.map((source, index) => [source.id, clones[index]?.id]));
  const clonedTargetIds = new Set(sources
    .filter(source => source.kind === "image-generate" || source.kind === "video-generate" || source.kind === "audio-operation" || source.kind === "runninghub-app")
    .map(source => source.id));
  return edges.flatMap(edge => {
    if (!clonedTargetIds.has(edge.to.nodeId)) return [];
    if (edge.kind !== "prompt" && edge.kind !== "reference") return [];
    const clonedTargetId = cloneIdBySourceId.get(edge.to.nodeId);
    if (!clonedTargetId) return [];
    const clonedSourceId = cloneIdBySourceId.get(edge.from.nodeId);
    const from = clonedSourceId
      ? { ...edge.from, nodeId: clonedSourceId }
      : edge.from;
    const to = { ...edge.to, nodeId: clonedTargetId };
    return [{ ...edge, id: createBoardId("edge"), from, to, createdAt: nowIso() }];
  });
}

function normalizeBoard(board: unknown, fallbackId: string = DEFAULT_BOARD_ID): BoardDocument {
  const boardRecord = isRecord(board) ? board : {};
  const nodes = Array.isArray(boardRecord.nodes) ? normalizeBoardNodes(boardRecord.nodes) : [];
  return {
    ...boardRecord,
    id: fallbackId,
    title: localizeLegacyDefaultBoardTitle(readNonEmptyString(boardRecord.title, t("board.workspace.boardLabel"))),
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

  return fitBoardGroupLayoutsToChildren(normalizeBoardNodeParents(normalizedNodes), nowIso());
}

function nodeHasValidParent(node: BoardNode, nodesById: Map<string, BoardNode>): boolean {
  if (!node.parentId) return true;
  const seen = new Set<string>([node.id]);
  let parentId: string | undefined = node.parentId;
  while (parentId) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = nodesById.get(parentId);
    if (!parent || parent.kind !== "group") return false;
    parentId = parent.parentId;
  }
  return true;
}

function normalizeBoardNodeParents(nodes: BoardNode[]): BoardNode[] {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  return nodes.map(node => {
    if (nodeHasValidParent(node, nodesById)) return node;
    const { parentId: _parentId, ...nodeWithoutParent } = node;
    return nodeWithoutParent;
  });
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

function sameBoardPointValue(left: BoardPoint, right: BoardPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameBoardSizeValue(left: BoardSize, right: BoardSize): boolean {
  return left.width === right.width && left.height === right.height;
}

function fitAncestorGroupsAfterNodeResize(nodes: BoardNode[], nodeId: string, updatedAt: string): BoardNode[] {
  let nextNodes = nodes;
  let currentNodeId = nodeId;
  const visitedGroupIds = new Set<string>();

  while (true) {
    const currentNode = nextNodes.find(node => node.id === currentNodeId);
    const groupId = currentNode?.parentId;
    if (!groupId || visitedGroupIds.has(groupId)) return nextNodes;
    visitedGroupIds.add(groupId);
    nextNodes = applyBoardGroupLayoutToChildren(nextNodes, groupId, updatedAt).nodes;
    currentNodeId = groupId;
  }
}

function applyBoardGroupLayoutToChildren(
  nodes: BoardNode[],
  groupId: string,
  updatedAt: string,
): { changed: boolean; nodes: BoardNode[] } {
  const layout = fitBoardGroupLayoutToChildren(nodes, groupId);
  if (!layout) return { changed: false, nodes };
  let changed = false;
  const nextNodes = nodes.map(node => {
    if (node.id === groupId && node.kind === "group") {
      if (
        node.parentId === layout.parentId &&
        sameBoardPointValue(node.position, layout.position) &&
        sameBoardSizeValue(node.size, layout.size)
      ) {
        return node;
      }
      changed = true;
      return { ...node, parentId: layout.parentId, position: layout.position, size: layout.size, updatedAt };
    }
    const position = layout.childPositions.get(node.id);
    if (!position || sameBoardPointValue(node.position, position)) return node;
    changed = true;
    return { ...node, position, updatedAt };
  });
  return { changed, nodes: changed ? nextNodes : nodes };
}

function fitBoardGroupLayoutsToChildren(nodes: BoardNode[], updatedAt: string): BoardNode[] {
  const groupIds = nodes.flatMap(node => node.kind === "group" ? [node.id] : []);
  let nextNodes = nodes;
  for (let iteration = 0; iteration < groupIds.length; iteration += 1) {
    let didChange = false;
    for (const groupId of groupIds) {
      const result = applyBoardGroupLayoutToChildren(nextNodes, groupId, updatedAt);
      nextNodes = result.nodes;
      didChange = didChange || result.changed;
    }
    if (!didChange) return nextNodes;
  }
  return nextNodes;
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

function readRunningHubYouchuanAdvancedSettings(value: unknown): RunningHubYouchuanAdvancedSettings | undefined {
  if (!isRecord(value)) return undefined;
  const chaos = readNumberInRange(value.chaos, 0, 100);
  const stylize = readNumberInRange(value.stylize, 0, 1000);
  const raw = typeof value.raw === "boolean" ? value.raw : undefined;
  const iw = readNumberInRange(value.iw, 0, 3);
  const sw = readNumberInRange(value.sw, 0, 1000);
  const weird = readNumberInRange(value.weird, 0, 3000);
  const tile = typeof value.tile === "boolean" ? value.tile : undefined;
  const sref = readOptionalString(value.sref);
  const oref = readOptionalString(value.oref);
  const ow = readNumberInRange(value.ow, 1, 1000);
  const hd = typeof value.hd === "boolean" ? value.hd : undefined;
  if (chaos === undefined || stylize === undefined || raw === undefined || iw === undefined || sw === undefined) {
    return undefined;
  }
  return {
    chaos,
    stylize,
    raw,
    iw,
    sw,
    ...(weird === undefined ? {} : { weird }),
    ...(tile === undefined ? {} : { tile }),
    ...(sref === undefined ? {} : { sref }),
    ...(oref === undefined ? {} : { oref }),
    ...(ow === undefined ? {} : { ow }),
    ...(hd === undefined ? {} : { hd }),
  };
}

function readNumberInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function readAsrLanguage(value: unknown): "auto" | "zh" | "en" {
  if (value === "zh" || value === "en") return value;
  return "auto";
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

function defaultAudioParams(model: string): {
  audioFormat: string;
  audioMode: BoardAudioOperationNode["audioMode"];
} {
  const capabilities = getAudioModelCapabilities(model);
  return {
    audioFormat: capabilities.formats[0]?.value ?? "",
    audioMode: capabilities.defaultMode,
  };
}

function normalizeBoardNode(node: unknown, index: number): BoardNode | null {
  if (!isRecord(node) || !isBoardNodeKind(node.kind)) return null;
  const normalizedSize = normalizeBoardSize(node.size, defaultNodeSize(node.kind));
  const shell = {
    id: readNonEmptyString(node.id, `${duplicateNodeIdPrefix(node.kind)}_legacy_${index}`),
    parentId: readOptionalString(node.parentId),
    position: normalizeBoardPoint(node.position, index),
    size: node.kind === "runninghub-app" ? minimumBoardSize(normalizedSize, DEFAULT_RUNNINGHUB_APP_NODE_SIZE) : normalizedSize,
    title: localizeLegacyDefaultNodeTitle(node.kind, readNonEmptyString(node.title, defaultNodeTitle(node.kind))),
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
    const prompt = typeof node.prompt === "string" ? node.prompt : "";
    const estimatedPromptSize = estimateBoardPromptSize(prompt);
    return {
      ...shell,
      kind: "prompt",
      prompt,
      size: clampBoardTextNodeSize({
        width: Math.max(shell.size.width, estimatedPromptSize.width),
        height: Math.max(shell.size.height, estimatedPromptSize.height),
      }, DEFAULT_PROMPT_NODE_SIZE),
    };
  }
  if (node.kind === "reference-group") {
    return {
      ...shell,
      kind: "reference-group",
      references: Array.isArray(node.references) ? normalizeReferenceGroupItems(node.references) : [],
    };
  }
  if (node.kind === "group") {
    return {
      ...shell,
      kind: "group",
    };
  }
  if (node.kind === "multi-grid") {
    const rawGridSize = typeof node.gridSize === "number" ? node.gridSize : DEFAULT_BOARD_MULTI_GRID_SIZE;
    const gridSize = isBoardMultiGridSize(rawGridSize) ? rawGridSize : DEFAULT_BOARD_MULTI_GRID_SIZE;
    const rawAspectRatio = readOptionalString(node.aspectRatio) ?? DEFAULT_BOARD_MULTI_GRID_ASPECT_RATIO;
    return {
      ...shell,
      kind: "multi-grid",
      aspectRatio: isBoardMultiGridAspectRatio(rawAspectRatio) ? rawAspectRatio : DEFAULT_BOARD_MULTI_GRID_ASPECT_RATIO,
      gridSize,
      isCollapsed: node.isCollapsed === true,
      items: Array.isArray(node.items) ? normalizeMultiGridItems(node.items, gridSize) : [],
      selectedItemId: readOptionalString(node.selectedItemId),
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
      cinematicProfile: normalizeCinematicProfile(node.cinematicProfile),
      customImageResolution: readOptionalString(node.customImageResolution) || defaults.customImageResolution,
      imageQuality: readOptionalString(node.imageQuality) ?? defaults.imageQuality,
      imageResolution: readOptionalString(node.imageResolution) || defaults.imageResolution,
      runningHubYouchuan: isRunningHubYouchuanImageModel(model)
        ? readRunningHubYouchuanAdvancedSettings(node.runningHubYouchuan) ?? RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS
        : undefined,
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
        cinematicProfile: normalizeCinematicProfile(node.cinematicProfile),
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
  if (node.kind === "audio-operation") {
    const model = normalizeAudioModel(node.model);
    const defaults = defaultAudioParams(model);
    const audioFormat = readOptionalString(node.audioFormat);
    const capabilities = getAudioModelCapabilities(model);
    return {
      ...shell,
      kind: "audio-operation",
      audioFormat: audioFormat && capabilities.formats.some(option => option.value === audioFormat)
        ? audioFormat
        : defaults.audioFormat,
      audioMode: readAudioOperationMode(node.audioMode, model),
      audioStylePrompt: readOptionalString(node.audioStylePrompt),
      asrLanguage: readAsrLanguage(node.asrLanguage),
      model,
      prompt: typeof node.prompt === "string" ? node.prompt : "",
      resultStackKey: readOptionalString(node.resultStackKey),
      status: normalizeGenerationStatus(node.status),
      variantCount: 1,
      voiceCloneConsentAccepted: node.voiceCloneConsentAccepted === true,
      voiceProfileId: readOptionalString(node.voiceProfileId),
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
  const noteBody = typeof node.body === "string" ? node.body : "";
  const noteVariant = node.variant === "transcript" ? "transcript" : "plain";
  const estimatedNoteSize = estimateBoardNoteSize(noteBody, noteVariant);
  return {
    ...shell,
    kind: "note",
    body: noteBody,
    source: normalizeNoteSource(node.source),
    size: clampBoardTextNodeSize({
      width: Math.max(shell.size.width, estimatedNoteSize.width),
      height: Math.max(shell.size.height, estimatedNoteSize.height),
    }, DEFAULT_NOTE_NODE_SIZE),
    variant: noteVariant,
  };
}

function normalizeNoteSource(value: unknown): BoardNoteNode["source"] {
  if (!isRecord(value) || typeof value.assetId !== "string" || typeof value.model !== "string") return undefined;
  return {
    assetId: value.assetId,
    model: value.model,
    sourceNodeId: readOptionalString(value.sourceNodeId),
  };
}

function defaultNodeSize(kind: BoardNode["kind"]): BoardSize {
  if (kind === "asset" || kind === "result") return DEFAULT_ASSET_NODE_SIZE;
  if (kind === "prompt") return DEFAULT_PROMPT_NODE_SIZE;
  if (kind === "reference-group") return DEFAULT_REFERENCE_GROUP_NODE_SIZE;
  if (kind === "group") return DEFAULT_GROUP_NODE_SIZE;
  if (kind === "multi-grid") return DEFAULT_MULTI_GRID_NODE_SIZE;
  if (kind === "image-generate" || kind === "video-generate" || kind === "audio-operation") return DEFAULT_GENERATE_NODE_SIZE;
  if (kind === "runninghub-app") return DEFAULT_RUNNINGHUB_APP_NODE_SIZE;
  if (kind === "agent") return DEFAULT_AGENT_NODE_SIZE;
  return DEFAULT_NOTE_NODE_SIZE;
}

function defaultNodeTitle(kind: BoardNode["kind"]): string {
  if (kind === "asset") return t("board.node.types.asset");
  if (kind === "prompt") return t("board.node.types.prompt");
  if (kind === "reference-group") return t("board.node.types.referenceGroup");
  if (kind === "group") return t("board.node.types.group");
  if (kind === "multi-grid") return t("board.node.types.multiGrid");
  if (kind === "image-generate") return t("board.node.types.imageGenerate");
  if (kind === "video-generate") return t("board.node.types.videoGenerate");
  if (kind === "audio-operation") return t("board.node.types.audioOperation");
  if (kind === "runninghub-app") return t("board.node.types.runninghubApp");
  if (kind === "agent") return t("board.node.types.agent");
  return t("board.node.types.note");
}

function localizeLegacyDefaultBoardTitle(title: string): string {
  return title === "Board" ? t("board.workspace.boardLabel") : title;
}

function localizeLegacyDefaultNodeTitle(kind: BoardNode["kind"], title: string): string {
  if (kind === "prompt" && title === "Prompt") return t("board.node.types.prompt");
  if (kind === "reference-group" && title === "Reference Group") return t("board.node.types.referenceGroup");
  if (kind === "image-generate" && title === "Image Generate") return t("board.node.types.imageGenerate");
  if (kind === "video-generate" && title === "Video Generate") return t("board.node.types.videoGenerate");
  if (kind === "audio-operation" && title === "Audio Operation") return t("board.node.types.audioOperation");
  if (kind === "runninghub-app" && title === "RunningHub App") return t("board.node.types.runninghubApp");
  if (kind === "note" && title === "Note") return t("board.node.types.note");
  if ((kind === "asset" || kind === "result") && title === "Image Asset") return t("board.node.types.imageAsset");
  if ((kind === "asset" || kind === "result") && title === "Video Asset") return t("board.node.types.videoAsset");
  if ((kind === "asset" || kind === "result") && title === "Audio Asset") return t("board.node.types.audioAsset");
  return title;
}

function defaultAssetNodeTitle(type: BoardAssetReference["type"]): string {
  if (type === "image") return t("board.node.types.imageAsset");
  if (type === "video") return t("board.node.types.videoAsset");
  return t("board.node.types.audioAsset");
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

function normalizeAudioModel(value: unknown): string {
  const model = readNonEmptyString(value, DEFAULT_BOARD_AUDIO_MODEL);
  try {
    getAudioModelCapabilities(model);
    return model;
  } catch {
    return DEFAULT_BOARD_AUDIO_MODEL;
  }
}

function readAudioOperationMode(value: unknown, model: string): BoardAudioOperationNode["audioMode"] {
  const capabilities = getAudioModelCapabilities(model);
  return typeof value === "string" && capabilities.modes.includes(value as BoardAudioOperationNode["audioMode"])
    ? value as BoardAudioOperationNode["audioMode"]
    : capabilities.defaultMode;
}

function normalizeReferenceGroupItems(items: unknown[]): BoardReferenceGroupItem[] {
  const normalizedItems: BoardReferenceGroupItem[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.assetId !== "string" || item.assetId.length === 0) continue;
    normalizedItems.push({
      assetId: item.assetId,
      model: readNonEmptyString(item.model, "unknown"),
      prompt: readNonEmptyString(item.prompt, t("board.compare.referenceLabel")),
      role: item.role === "start" || item.role === "end" ? item.role : "general",
      type: item.type === "video" || item.type === "audio" ? item.type : "image",
      url: readNonEmptyString(item.url, ""),
    });
  }
  return normalizedItems;
}

function normalizeMultiGridItems(items: unknown[], gridSize: BoardMultiGridNode["gridSize"]): BoardMultiGridItem[] {
  const normalizedItems: BoardMultiGridItem[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.assetId !== "string" || item.assetId.length === 0) continue;
    const cellIndex = typeof item.cellIndex === "number" && Number.isInteger(item.cellIndex)
      ? item.cellIndex
      : undefined;
    normalizedItems.push({
      assetId: item.assetId,
      cellIndex,
      model: readNonEmptyString(item.model, "unknown"),
      offsetX: readFiniteNumber(item.offsetX, 0),
      offsetY: readFiniteNumber(item.offsetY, 0),
      prompt: readNonEmptyString(item.prompt, t("common.mediaTypeLabels.image")),
      scale: Math.max(0.25, readFiniteNumber(item.scale, 1)),
      url: readNonEmptyString(item.url, ""),
    });
  }
  return normalizeBoardMultiGridItems(normalizedItems, gridSize);
}

function isMediaReferenceSourceNode(node: BoardNode | undefined): node is BoardNode & { kind: "asset" | "result" } {
  return node?.kind === "asset" || node?.kind === "result";
}

function referenceGroupItemFromMediaNode(node: BoardNode & { kind: "asset" | "result" }): BoardReferenceGroupItem {
  return {
    assetId: node.asset.assetId,
    model: node.asset.model,
    prompt: node.asset.prompt,
    role: "general",
    type: node.asset.type,
    url: node.asset.url,
  };
}

function referenceGroupItemsFromMediaNodes(nodes: Array<BoardNode & { kind: "asset" | "result" }>): BoardReferenceGroupItem[] {
  const seenAssetIds = new Set<string>();
  return nodes.flatMap(node => {
    if (seenAssetIds.has(node.asset.assetId)) return [];
    seenAssetIds.add(node.asset.assetId);
    return [referenceGroupItemFromMediaNode(node)];
  });
}

function appendReferenceGroupItem(
  node: BoardReferenceGroupNode,
  reference: BoardReferenceGroupItem,
  updatedAt: string,
): BoardReferenceGroupNode {
  if (node.references.some(item => item.assetId === reference.assetId)) return node;
  return { ...node, references: [...node.references, reference], updatedAt };
}

function multiGridItemFromAssetReference(asset: BoardAssetReference, cellIndex?: number): BoardMultiGridItem {
  if (asset.type !== "image") {
    throw new Error(t("board.workspace.multiGridOnlyImage"));
  }
  return {
    assetId: asset.assetId,
    cellIndex,
    model: asset.model,
    offsetX: 0,
    offsetY: 0,
    prompt: asset.prompt,
    scale: 1,
    url: asset.url,
  };
}

function appendMultiGridItem(
  node: BoardMultiGridNode,
  item: BoardMultiGridItem,
  updatedAt: string,
): BoardMultiGridNode {
  const targetCellIndex = typeof item.cellIndex === "number"
    ? item.cellIndex
    : firstEmptyBoardMultiGridCell(node.items, node.gridSize);
  const nextItem = { ...item, cellIndex: targetCellIndex };
  const itemsWithoutAsset = node.items.filter(currentItem => currentItem.assetId !== item.assetId);
  const displacedItems = targetCellIndex === undefined
    ? itemsWithoutAsset
    : itemsWithoutAsset.map(currentItem =>
      currentItem.cellIndex === targetCellIndex ? { ...currentItem, cellIndex: undefined } : currentItem,
    );
  return {
    ...node,
    items: normalizeBoardMultiGridItems([...displacedItems, nextItem], node.gridSize),
    selectedItemId: item.assetId,
    updatedAt,
  };
}

function assetNodeIdsForReference(nodes: BoardNode[], assetId: string): string[] {
  return nodes
    .filter(node => node.kind === "asset" && node.asset.assetId === assetId)
    .map(node => node.id);
}

function removeReferenceGroupAsset(
  nodes: BoardNode[],
  edges: BoardEdge[],
  groupNodeId: string,
  assetId: string,
  updatedAt: string,
): { nodes: BoardNode[]; edges: BoardEdge[] } {
  const assetNodeIds = assetNodeIdsForReference(nodes, assetId);
  return {
    nodes: nodes.map(node =>
      node.id === groupNodeId && node.kind === "reference-group"
        ? { ...node, references: node.references.filter(item => item.assetId !== assetId), updatedAt }
        : node,
    ),
    edges: edges.filter(edge =>
      !(
        edge.to.nodeId === groupNodeId &&
        edge.to.portId === BOARD_PORT_IDS.assetIn &&
        assetNodeIds.includes(edge.from.nodeId)
      ),
    ),
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
  const size = input.size ?? defaultAssetNodeSize(input.asset.type);
  const preferredPosition = input.position ?? moveDefaultPosition(nodes);
  return {
    id: createBoardId("asset"),
    kind: "asset",
    title: input.title ?? defaultAssetNodeTitle(input.asset.type),
    asset: input.asset,
    position: findAvailableBoardNodePosition(boardNodesWithAbsolutePositions(nodes), preferredPosition, size),
    size,
    createdAt,
    updatedAt: createdAt,
  };
}

function boardAssetReferenceFromMultiGridItem(item: BoardMultiGridItem): BoardAssetReference {
  return {
    assetId: item.assetId,
    type: "image",
    url: item.url,
    model: item.model,
    prompt: item.prompt,
  };
}

function createResultBoardNode(input: CreateResultNodeInput, nodes: BoardNode[]): BoardResultNode {
  const createdAt = nowIso();
  const size = input.size ?? defaultAssetNodeSize(input.asset.type);
  const preferredPosition = input.position ?? moveDefaultPosition(nodes);
  return {
    id: createBoardId("result"),
    kind: "result",
    title: input.title ?? defaultAssetNodeTitle(input.asset.type),
    sourceNodeId: input.sourceNodeId,
    resultStackKey: input.resultStackKey,
    activeAssetId: input.activeAssetId,
    resultAssetIds: input.resultAssetIds,
    asset: input.asset,
    position: findAvailableBoardNodePosition(boardNodesWithAbsolutePositions(nodes), preferredPosition, size),
    size,
    createdAt,
    updatedAt: createdAt,
  };
}

function createReferenceGroupBoardNode(
  input: CreateReferenceGroupNodeInput,
  nodes: BoardNode[],
): BoardReferenceGroupNode {
  const createdAt = nowIso();
  const size = input.size ?? DEFAULT_REFERENCE_GROUP_NODE_SIZE;
  const preferredPosition = input.position ?? moveDefaultPosition(nodes);
  return {
    id: createBoardId("ref_group"),
    kind: "reference-group",
    title: input.title ?? t("board.node.types.referenceGroup"),
    references: input.references ?? [],
    position: findAvailableBoardNodePosition(boardNodesWithAbsolutePositions(nodes), preferredPosition, size),
    size,
    createdAt,
    updatedAt: createdAt,
  };
}

function createGroupBoardNode(input: CreateGroupNodeInput, nodes: BoardNode[]): BoardGroupNode {
  const createdAt = nowIso();
  return {
    id: createBoardId("group"),
    kind: "group",
    title: input.title ?? t("board.node.types.group"),
    parentId: input.parentId,
    position: input.position ?? moveDefaultPosition(nodes),
    size: input.size ?? DEFAULT_GROUP_NODE_SIZE,
    createdAt,
    updatedAt: createdAt,
  };
}

function createMultiGridBoardNode(input: CreateMultiGridNodeInput, nodes: BoardNode[]): BoardMultiGridNode {
  const createdAt = nowIso();
  const gridSize = input.gridSize ?? DEFAULT_BOARD_MULTI_GRID_SIZE;
  return {
    id: createBoardId("multi_grid"),
    kind: "multi-grid",
    title: input.title ?? t("board.node.types.multiGrid"),
    aspectRatio: input.aspectRatio ?? DEFAULT_BOARD_MULTI_GRID_ASPECT_RATIO,
    gridSize,
    items: normalizeBoardMultiGridItems(input.items ?? [], gridSize),
    position: input.position ?? moveDefaultPosition(nodes),
    size: input.size ?? DEFAULT_MULTI_GRID_NODE_SIZE,
    createdAt,
    updatedAt: createdAt,
  };
}

function createGenerateBoardNode(input: CreateGenerateNodeInput, nodes: BoardNode[]): BoardImageGenerateNode | BoardVideoGenerateNode | BoardAudioOperationNode {
  const createdAt = nowIso();
  const nodeId = createBoardId(input.kind === "image-generate" ? "image_gen" : input.kind === "audio-operation" ? "audio_op" : "video_gen");
  const baseNode = {
    id: nodeId,
    title: input.title ?? defaultNodeTitle(input.kind),
    prompt: input.prompt ?? "",
    model: input.model,
    status: "idle" as BoardGenerationStatus,
    variantCount: input.kind === "audio-operation" ? 1 : input.variantCount ?? DEFAULT_VARIANT_COUNT,
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
      cinematicProfile: input.cinematicProfile ?? DEFAULT_CINEMATIC_PROFILE,
      customImageResolution: input.customImageResolution ?? imageDefaults.customImageResolution,
      imageQuality: input.imageQuality ?? imageDefaults.imageQuality,
      imageResolution: input.imageResolution ?? imageDefaults.imageResolution,
      runningHubYouchuan: isRunningHubYouchuanImageModel(input.model)
        ? input.runningHubYouchuan ?? RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS
        : undefined,
      thinkingLevel: input.thinkingLevel ?? imageDefaults.thinkingLevel,
    };
  }

  if (input.kind === "audio-operation") {
    const audioDefaults = defaultAudioParams(input.model);
    return {
      ...baseNode,
      kind: "audio-operation",
      audioFormat: input.audioFormat ?? audioDefaults.audioFormat,
      audioMode: input.audioMode ?? audioDefaults.audioMode,
      audioStylePrompt: input.audioStylePrompt,
      asrLanguage: input.asrLanguage ?? "auto",
      voiceCloneConsentAccepted: input.voiceCloneConsentAccepted,
      voiceProfileId: input.voiceProfileId,
    };
  }

  const videoDefaults = defaultVideoParams(input.model, input.aspectRatio);
  return {
    ...baseNode,
    kind: "video-generate",
    aspectRatio: input.aspectRatio || videoDefaults.aspectRatio,
    cinematicProfile: input.cinematicProfile ?? DEFAULT_CINEMATIC_PROFILE,
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
    title: input.title ?? t("board.node.types.runninghubApp"),
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

function sameBoardAssetReference(left: BoardAssetReference, right: BoardAssetReference): boolean {
  return (
    left.assetId === right.assetId &&
    left.model === right.model &&
    left.prompt === right.prompt &&
    left.type === right.type &&
    left.url === right.url
  );
}

function sameIdList(left: string[] | undefined, right: string[]): boolean {
  const current = left ?? [];
  return current.length === right.length && current.every((value, index) => value === right[index]);
}

function mergeIdLists(left: string[] | undefined, right: string[]): string[] {
  const merged: string[] = [];
  for (const id of [...(left ?? []), ...right]) {
    if (id.trim() && !merged.includes(id)) merged.push(id);
  }
  return merged;
}

function sameGenerateUpdate(node: BoardImageGenerateNode | BoardVideoGenerateNode | BoardAudioOperationNode, input: BoardGenerateNodeUpdate): boolean {
  if ("errorMessage" in input && node.errorMessage !== input.errorMessage) return false;
  if ("model" in input && node.model !== input.model) return false;
  if ("prompt" in input && node.prompt !== input.prompt) return false;
  if ("resultStackKey" in input && node.resultStackKey !== input.resultStackKey) return false;
  if ("status" in input && node.status !== input.status) return false;
  if ("variantCount" in input && node.variantCount !== input.variantCount) return false;

  if (node.kind === "image-generate") {
    if ("aspectRatio" in input && node.aspectRatio !== input.aspectRatio) return false;
    if ("cinematicProfile" in input && !sameCinematicProfile(node.cinematicProfile, input.cinematicProfile)) return false;
    if ("customImageResolution" in input && node.customImageResolution !== input.customImageResolution) return false;
    if ("imageQuality" in input && node.imageQuality !== input.imageQuality) return false;
    if ("imageResolution" in input && node.imageResolution !== input.imageResolution) return false;
    if ("runningHubYouchuan" in input && !sameRunningHubYouchuan(node.runningHubYouchuan, input.runningHubYouchuan)) return false;
    if ("thinkingLevel" in input && node.thinkingLevel !== input.thinkingLevel) return false;
  }

  if (node.kind === "video-generate") {
    if ("aspectRatio" in input && node.aspectRatio !== input.aspectRatio) return false;
    if ("cinematicProfile" in input && !sameCinematicProfile(node.cinematicProfile, input.cinematicProfile)) return false;
    if ("videoDuration" in input && node.videoDuration !== input.videoDuration) return false;
    if ("videoPreset" in input && node.videoPreset !== input.videoPreset) return false;
    if ("videoReferenceMode" in input && node.videoReferenceMode !== input.videoReferenceMode) return false;
    if ("videoResolution" in input && node.videoResolution !== input.videoResolution) return false;
  }

  if (node.kind === "audio-operation") {
    if ("audioFormat" in input && node.audioFormat !== input.audioFormat) return false;
    if ("audioMode" in input && node.audioMode !== input.audioMode) return false;
    if ("audioStylePrompt" in input && node.audioStylePrompt !== input.audioStylePrompt) return false;
    if ("asrLanguage" in input && node.asrLanguage !== input.asrLanguage) return false;
    if ("voiceCloneConsentAccepted" in input && node.voiceCloneConsentAccepted !== input.voiceCloneConsentAccepted) return false;
    if ("voiceProfileId" in input && node.voiceProfileId !== input.voiceProfileId) return false;
  }

  return true;
}

function normalizeGenerateUpdateForNode(
  node: BoardImageGenerateNode | BoardVideoGenerateNode | BoardAudioOperationNode,
  input: BoardGenerateNodeUpdate,
): BoardGenerateNodeUpdate {
  return node.kind === "audio-operation" && "variantCount" in input ? { ...input, variantCount: 1 } : input;
}

function sameRunningHubYouchuan(
  left: RunningHubYouchuanAdvancedSettings | undefined,
  right: RunningHubYouchuanAdvancedSettings | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.chaos === right.chaos &&
    left.stylize === right.stylize &&
    left.raw === right.raw &&
    left.iw === right.iw &&
    left.sw === right.sw &&
    (left.weird ?? 0) === (right.weird ?? 0) &&
    (left.tile ?? false) === (right.tile ?? false) &&
    (left.sref ?? "") === (right.sref ?? "") &&
    (left.oref ?? "") === (right.oref ?? "") &&
    (left.ow ?? 100) === (right.ow ?? 100) &&
    (left.hd ?? false) === (right.hd ?? false);
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

function clampMultiGridOffset(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

function clampMultiGridScale(value: number): number {
  return Math.max(0.5, Math.min(3, value));
}

export function useBoardState(boardId: string = DEFAULT_BOARD_ID): BoardStateController {
  const [board, setBoardState] = useState<BoardDocument>(() => createEmptyBoard(boardId, t("board.workspace.boardLabel")));
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
      setBoardState(storedBoard ? normalizeBoard(storedBoard, boardId) : createEmptyBoard(boardId, t("board.workspace.boardLabel")));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSaveError(null);
      setSaveStatus("idle");
      setHasLoaded(true);
    }

    loadBoard().catch((error: unknown) => {
      if (!isActive) return;
      setSaveError(error instanceof Error ? error.message : t("board.workspace.loadFailed"));
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
          setSaveError(error instanceof Error ? error.message : t("board.workspace.saveFailed"));
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
      setSaveError(error instanceof Error ? error.message : t("board.workspace.saveFailed"));
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

  const addAssetNodes = useCallback((inputs: CreateAssetNodeInput[]): string[] => {
    if (inputs.length === 0) return [];
    const nodesToAdd: BoardNode[] = [];
    for (const input of inputs) {
      const node = createAssetBoardNode(input, [...board.nodes, ...nodesToAdd]);
      nodesToAdd.push(node);
    }
    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, ...nodesToAdd]));
    const lastNode = nodesToAdd[nodesToAdd.length - 1];
    setSelectedNodeId(lastNode.id);
    setSelectedEdgeId(null);
    return nodesToAdd.map(node => node.id);
  }, [board.nodes, mutateBoard]);

  const addAssetNodesInGroup = useCallback((inputs: CreateAssetNodeInput[]): AddAssetNodesInGroupResult => {
    if (inputs.length < 2) throw new Error(t("board.workspace.atLeastTwoNodesToGroup"));
    const nodesToAdd: BoardNode[] = [];
    for (const input of inputs) {
      const node = createAssetBoardNode(input, [...board.nodes, ...nodesToAdd]);
      nodesToAdd.push(node);
    }
    const nodeIds = nodesToAdd.map(node => node.id);
    const groupId = createBoardId("group");
    mutateBoard(currentBoard => {
      const combinedNodes = [...currentBoard.nodes, ...nodesToAdd];
      const layout = createBoardGroupLayout(combinedNodes, nodeIds);
      if (!layout) throw new Error(t("board.workspace.importGroupLayoutFailed"));
      const updatedAt = nowIso();
      const groupNode: BoardGroupNode = {
        id: groupId,
        kind: "group",
        title: t("board.workspace.importMediaGroup"),
        parentId: layout.parentId,
        position: layout.position,
        size: layout.size,
        createdAt: updatedAt,
        updatedAt,
      };
      const nextNodes = combinedNodes.map(node => {
        const position = layout.childPositions.get(node.id);
        return position ? { ...node, parentId: groupId, position, updatedAt } : node;
      });
      const firstChildIndex = nextNodes.findIndex(node => nodeIds.includes(node.id));
      const insertIndex = firstChildIndex >= 0 ? firstChildIndex : nextNodes.length;
      return touchBoard(
        currentBoard,
        [...nextNodes.slice(0, insertIndex), groupNode, ...nextNodes.slice(insertIndex)],
      );
    });
    setSelectedNodeId(groupId);
    setSelectedEdgeId(null);
    return { groupId, nodeIds };
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

  const extractMultiGridItemToAssetNode = useCallback((nodeId: string, assetId: string, position: BoardPoint): string | null => {
    const sourceNode = boardRef.current.nodes.find(node => node.id === nodeId);
    if (sourceNode?.kind !== "multi-grid") return null;
    const sourceItem = sourceNode.items.find(item => item.assetId === assetId && typeof item.cellIndex === "number");
    if (!sourceItem) return null;
    const assetNodeId = createBoardId("asset");
    mutateBoard(currentBoard => {
      const currentSourceNode = currentBoard.nodes.find(node => node.id === nodeId);
      if (currentSourceNode?.kind !== "multi-grid") return currentBoard;
      const currentItem = currentSourceNode.items.find(item => item.assetId === assetId && typeof item.cellIndex === "number");
      if (!currentItem) return currentBoard;
      const updatedAt = nowIso();
      const assetNode: BoardNode = {
        ...createAssetBoardNode({
          asset: boardAssetReferenceFromMultiGridItem(currentItem),
          position,
        }, currentBoard.nodes),
        id: assetNodeId,
      };
      const nextNodes = currentBoard.nodes.map(node =>
        node.id === nodeId && node.kind === "multi-grid"
          ? {
            ...node,
            items: normalizeBoardMultiGridItems(
              node.items.filter(item => item.assetId !== assetId),
              node.gridSize,
            ),
            selectedItemId: node.selectedItemId === assetId ? undefined : node.selectedItemId,
            updatedAt,
          }
          : node,
      );
      return touchBoard(currentBoard, [...nextNodes, assetNode]);
    });
    setSelectedNodeId(assetNodeId);
    setSelectedEdgeId(null);
    return assetNodeId;
  }, [mutateBoard]);

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
      const from: BoardPortRef = { nodeId: sourceNodeId, portId: BOARD_PORT_IDS.resultOut, portKind: "result" };
      const existingResultNode = findConnectedResultNodeForSourceStack(currentBoard.nodes, currentBoard.edges, sourceNodeId, resultStackKey);
      const existingResultEdge = existingResultNode
        ? findMatchingEdge(currentBoard.edges, from, { nodeId: existingResultNode.id, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" })
        : undefined;
      const currentResultAssetIds = sourceNode.resultAssetIds ?? (sourceNode.resultAssetId ? [sourceNode.resultAssetId] : []);
      const resultAssetIds = mergeIdLists(currentResultAssetIds, input.resultAssetIds);
      const sourceAlreadyCurrent =
        sourceNode.status === input.status &&
        sourceNode.resultAssetId === input.resultAssetId &&
        sameIdList(sourceNode.resultAssetIds, resultAssetIds) &&
        (input.errorMessage === undefined || sourceNode.errorMessage === input.errorMessage);
      const resultAlreadyCurrent = existingResultNode !== undefined &&
        existingResultNode.activeAssetId === input.resultAssetId &&
        existingResultNode.resultStackKey === resultStackKey &&
        sameIdList(existingResultNode.resultAssetIds, resultAssetIds) &&
        sameBoardAssetReference(existingResultNode.asset, input.asset);
      if (sourceAlreadyCurrent && resultAlreadyCurrent && existingResultEdge) return currentBoard;

      let nextNodes = currentBoard.nodes.map(node =>
        node.id === sourceNodeId ? { ...node, ...input, resultAssetIds, updatedAt } : node,
      );
      let nextEdges = currentBoard.edges;
      const sourcePosition = boardNodeAbsolutePosition(currentBoard.nodes, sourceNodeId) ?? sourceNode.position;

      const resultNode: BoardResultNode = existingResultNode
        ? {
          ...existingResultNode,
          asset: input.asset,
          activeAssetId: input.resultAssetId,
          resultStackKey,
          resultAssetIds,
          updatedAt,
        }
        : createResultBoardNode(
          {
            sourceNodeId,
            resultStackKey,
            activeAssetId: input.resultAssetId,
            resultAssetIds,
            asset: input.asset,
            position: resultNodeDefaultPosition({ position: sourcePosition, size: sourceNode.size }),
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
    const prompt = input.prompt ?? "";
    const node: BoardPromptNode = {
      id: nodeId,
      kind: "prompt",
      title: input.title ?? t("board.node.types.prompt"),
      prompt,
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ? clampBoardTextNodeSize(input.size, DEFAULT_PROMPT_NODE_SIZE) : estimateBoardPromptSize(prompt),
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

  const addGroupNode = useCallback((input: CreateGroupNodeInput = {}): string => {
    const node = createGroupBoardNode(input, board.nodes);
    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addMultiGridNode = useCallback((input: CreateMultiGridNodeInput = {}): string => {
    const node = createMultiGridBoardNode(input, board.nodes);
    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addAssetToMultiGrid = useCallback((nodeId: string, asset: BoardAssetReference, cellIndex?: number): void => {
    const updatedAt = nowIso();
    const item = multiGridItemFromAssetReference(asset, cellIndex);
    mutateBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => {
          if (node.id !== nodeId) return node;
          if (node.kind !== "multi-grid") throw new Error(t("board.workspace.targetNotMultiGrid"));
          return appendMultiGridItem(node, item, updatedAt);
        }),
      ),
    );
  }, [mutateBoard]);

  const groupNodes = useCallback((nodeIds: string[]): string | null => {
    if (!createBoardGroupLayout(boardRef.current.nodes, nodeIds)) return null;
    const groupId = createBoardId("group");
    mutateBoard(currentBoard => {
      const layout = createBoardGroupLayout(currentBoard.nodes, nodeIds);
      if (!layout) return currentBoard;
      const updatedAt = nowIso();
      const groupNode: BoardGroupNode = {
        id: groupId,
        kind: "group",
        title: t("board.node.types.group"),
        parentId: layout.parentId,
        position: layout.position,
        size: layout.size,
        createdAt: updatedAt,
        updatedAt,
      };
      const childIds = new Set(layout.childNodeIds);
      const firstChildIndex = currentBoard.nodes.findIndex(node => childIds.has(node.id));
      const nextNodes = currentBoard.nodes.map(node => {
        const position = layout.childPositions.get(node.id);
        return position ? { ...node, parentId: groupId, position, updatedAt } : node;
      });
      const insertIndex = firstChildIndex >= 0 ? firstChildIndex : nextNodes.length;
      return touchBoard(
        currentBoard,
        [...nextNodes.slice(0, insertIndex), groupNode, ...nextNodes.slice(insertIndex)],
      );
    });
    setSelectedNodeId(groupId);
    setSelectedEdgeId(null);
    return groupId;
  }, [mutateBoard]);

  const ungroupNode = useCallback((nodeId: string): void => {
    mutateBoard(currentBoard => {
      const group = currentBoard.nodes.find(node => node.id === nodeId);
      if (group?.kind !== "group") return currentBoard;
      const updatedAt = nowIso();
      const nextNodes = currentBoard.nodes.flatMap(node => {
        if (node.id === group.id) return [];
        if (node.parentId !== group.id) return [node];
        const position = childPositionAfterUngroup(currentBoard.nodes, group, node);
        if (!position) return [node];
        return [{ ...node, parentId: group.parentId, position, updatedAt }];
      });
      return touchBoard(currentBoard, nextNodes);
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [mutateBoard]);

  const addReferenceGroupNodeWithAssets = useCallback((input: CreateReferenceGroupNodeInput, assetNodeIds: string[]): string => {
    if (assetNodeIds.length === 0) throw new Error(t("board.workspace.referenceGroupNeedsMedia"));
    const node = createReferenceGroupBoardNode(input, board.nodes);
    const to: BoardPortRef = { nodeId: node.id, portId: BOARD_PORT_IDS.assetIn, portKind: "asset" };
    const edgeIds = assetNodeIds.map(() => createBoardId("edge"));
    mutateBoard(currentBoard => {
      const assetNodes = assetNodeIds.map(assetNodeId => {
        const assetNode = currentBoard.nodes.find(currentNode => currentNode.id === assetNodeId);
        if (!isMediaReferenceSourceNode(assetNode)) throw new Error(t("board.workspace.referenceGroupOnlyMedia"));
        return assetNode;
      });
      const references = referenceGroupItemsFromMediaNodes(assetNodes);
      const nextNode: BoardReferenceGroupNode = { ...node, references: [...references, ...node.references] };
      const nextNodes = [...currentBoard.nodes, nextNode];
      const nextEdges = assetNodes.reduce((edges, assetNode, index) => {
        const from: BoardPortRef = { nodeId: assetNode.id, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" };
        const edge: BoardEdge = {
          id: edgeIds[index] ?? createBoardId("edge"),
          kind: resolveBoardConnectionKind(nextNodes, from, to),
          from,
          to,
          createdAt: nowIso(),
        };
        return connectEdge(nextNodes, edges, edge);
      }, currentBoard.edges);
      return touchBoard(currentBoard, nextNodes, nextEdges);
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(edgeIds[0] ?? null);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addReferenceGroupNodeWithAsset = useCallback((input: CreateReferenceGroupNodeInput, assetNodeId: string): string => {
    return addReferenceGroupNodeWithAssets(input, [assetNodeId]);
  }, [addReferenceGroupNodeWithAssets]);

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

  const addGenerateNodeWithConnections = useCallback((
    input: CreateGenerateNodeInput,
    connections: Array<{ from: BoardPortRef; targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn }>,
  ): string => {
    if (connections.length === 0) throw new Error(t("board.workspace.newGenerateNodeNeedsSource"));
    const node = createGenerateBoardNode(input, board.nodes);
    const edgeIds = connections.map(() => createBoardId("edge"));
    mutateBoard(currentBoard => {
      let nextNodes = [...currentBoard.nodes, node];
      let nextEdges = currentBoard.edges;
      let firstEdgeId: string | null = null;
      for (let index = 0; index < connections.length; index += 1) {
        const connection = connections[index];
        if (!connection) continue;
        const to: BoardPortRef = {
          nodeId: node.id,
          portId: connection.targetPortId,
          portKind: connection.targetPortId === BOARD_PORT_IDS.promptIn ? "prompt" : "asset",
        };
        try {
          nextNodes = resolveBoardConnectionNodesWithCompatibleModel(nextNodes, connection.from, to);
          const edge: BoardEdge = {
            id: edgeIds[index] ?? createBoardId("edge"),
            kind: resolveBoardConnectionKind(nextNodes, connection.from, to),
            from: connection.from,
            to,
            createdAt: nowIso(),
          };
          nextEdges = connectEdge(nextNodes, nextEdges, edge);
          firstEdgeId ??= edge.id;
        } catch {
          // Incompatible selected nodes are ignored for batch quick-insert.
        }
      }
      if (!firstEdgeId) throw new Error(t("board.workspace.noConnectablePorts"));
      return touchBoard(currentBoard, nextNodes, nextEdges);
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(edgeIds[0] ?? null);
    return node.id;
  }, [board.nodes, mutateBoard]);

  const addGenerateNodeWithConnection = useCallback((
    input: CreateGenerateNodeInput,
    from: BoardPortRef,
    targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn,
  ): string => {
    return addGenerateNodeWithConnections(input, [{ from, targetPortId }]);
  }, [addGenerateNodeWithConnections]);

  const addAgentNode = useCallback((input: CreateAgentNodeInput = {}): string => {
    const createdAt = nowIso();
    const nodeId = createBoardId("agent");
    const node: BoardAgentNode = {
      id: nodeId,
      kind: "agent",
      title: input.title ?? t("board.node.types.agent"),
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
    const body = input.body ?? "";
    const variant = input.variant ?? "plain";
    const node: BoardNode = {
      id: nodeId,
      kind: "note",
      title: input.title ?? t("board.node.types.note"),
      body,
      source: input.source,
      variant,
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ? clampBoardTextNodeSize(input.size, DEFAULT_NOTE_NODE_SIZE) : estimateBoardNoteSize(body, variant),
      createdAt,
      updatedAt: createdAt,
    };

    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes, mutateBoard]);

  const addNoteNodeWithConnection = useCallback((input: CreateNoteNodeInput, from: BoardPortRef): string => {
    const createdAt = nowIso();
    const nodeId = createBoardId("note");
    const body = input.body ?? "";
    const variant = input.variant ?? "plain";
    const node: BoardNode = {
      id: nodeId,
      kind: "note",
      title: input.title ?? "Note",
      body,
      source: input.source,
      variant,
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ? clampBoardTextNodeSize(input.size, DEFAULT_NOTE_NODE_SIZE) : estimateBoardNoteSize(body, variant),
      createdAt,
      updatedAt: createdAt,
    };
    const to: BoardPortRef = { nodeId, portId: BOARD_PORT_IDS.noteIn, portKind: "result" };

    mutateBoard(currentBoard => {
      const nextNodes = [...currentBoard.nodes, node];
      const edge: BoardEdge = {
        id: createBoardId("edge"),
        kind: resolveBoardConnectionKind(nextNodes, from, to),
        from,
        to,
        createdAt: nowIso(),
      };
      return touchBoard(currentBoard, nextNodes, connectEdge(nextNodes, currentBoard.edges, edge));
    });
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
      if (deletedNode?.kind === "group") {
        const remainingNodes = currentBoard.nodes.flatMap(node => {
          if (node.id === deletedNode.id) return [];
          if (node.parentId !== deletedNode.id) return [node];
          const position = childPositionAfterUngroup(currentBoard.nodes, deletedNode, node);
          if (!position) return [node];
          return [{ ...node, parentId: deletedNode.parentId, position, updatedAt }];
        });
        const remainingEdges = currentBoard.edges.filter(edge => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId);
        return touchBoard(currentBoard, remainingNodes, remainingEdges);
      }
      const removedGroupReferences = deletedNode?.kind === "asset"
        ? currentBoard.edges
          .filter(edge => edge.from.nodeId === nodeId && edge.to.portId === "asset-in")
          .map(edge => ({ assetId: deletedNode.asset.assetId, groupNodeId: edge.to.nodeId }))
        : [];
      // Cascade-delete only the auto-owned result node when deleting a generate node.
      const resultNodeIdsToDelete = isResultSourceNode(deletedNode)
        ? resultNodeIdsOwnedBySource(currentBoard.nodes, nodeId)
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
                  return isMediaReferenceSourceNode(sourceNode) && sourceNode.asset.assetId === reference.assetId;
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
      if (targetNode?.kind === "reference-group" && isMediaReferenceSourceNode(sourceNode)) {
        const updatedAt = nowIso();
        const nextBoard = removeReferenceGroupAsset(
          currentBoard.nodes,
          currentBoard.edges,
          targetNode.id,
          sourceNode.asset.assetId,
          updatedAt,
        );
        return touchBoard(currentBoard, nextBoard.nodes, nextBoard.edges);
      }
      const nextEdges = currentBoard.edges.filter(boardEdge => boardEdge.id !== edgeId);
      if (
        isResultSourceNode(sourceNode) &&
        targetNode?.kind === "result" &&
        edge.from.portId === BOARD_PORT_IDS.resultOut &&
        edge.to.portId === BOARD_PORT_IDS.assetIn
      ) {
        const updatedAt = nowIso();
        const nextNodes = currentBoard.nodes.map(node =>
          node.id === targetNode.id
            ? {
              id: targetNode.id,
              kind: "asset" as const,
              title: targetNode.title,
              parentId: targetNode.parentId,
              asset: targetNode.asset,
              position: targetNode.position,
              size: targetNode.size,
              createdAt: targetNode.createdAt,
              updatedAt,
            }
            : node,
        );
        return touchBoard(currentBoard, nextNodes, nextEdges);
      }
      return touchBoard(currentBoard, currentBoard.nodes, nextEdges);
    });
    setSelectedEdgeId(currentId => (currentId === edgeId ? null : currentId));
  }, [mutateBoard]);

  const reconnectEdge = useCallback((edgeId: string, from: BoardPortRef, to: BoardPortRef) => {
    mutateBoard(currentBoard => {
      const oldEdge = currentBoard.edges.find(edge => edge.id === edgeId);
      if (!oldEdge) {
        throw new Error(t("board.workspace.reconnectFailed"));
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
      const oldReference: BoardReferenceGroupItem | null = isMediaReferenceSourceNode(oldSourceNode)
        ? referenceGroupItemFromMediaNode(oldSourceNode)
        : null;
      const nextReference: BoardReferenceGroupItem | null = isMediaReferenceSourceNode(nextSourceNode)
        ? referenceGroupItemFromMediaNode(nextSourceNode)
        : null;
      if (!oldReference && !nextReference) return touchBoard(currentBoard, compatibleNodes, nextEdges);

      const updatedAt = nowIso();
      const nextNodes = compatibleNodes.map(node => {
        if (node.kind !== "reference-group") return node;
        let references = node.references;
        if (node.id === oldEdge.to.nodeId && oldEdge.to.portId === BOARD_PORT_IDS.assetIn) {
          references = oldReference ? references.filter(item => item.assetId !== oldReference.assetId) : references;
        }
        if (node.id === to.nodeId && to.portId === BOARD_PORT_IDS.assetIn && nextReference) {
          references = appendReferenceGroupItem({ ...node, references }, nextReference, updatedAt).references;
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
        throw new Error(t("board.workspace.nodeAlreadyExists"));
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

    const occupiedNodes = [...board.nodes];
    const clones = sources.map(source => {
      const size = source.kind === "runninghub-app"
        ? minimumBoardSize(source.size, DEFAULT_RUNNINGHUB_APP_NODE_SIZE)
        : source.size;
      const sourcePosition = boardNodesWithAbsolutePositions(board.nodes).find(node => node.id === source.id)?.position ?? source.position;
      const position = findAvailableBoardNodePosition(
        boardNodesWithAbsolutePositions(occupiedNodes),
        { x: sourcePosition.x + source.size.width + 48, y: sourcePosition.y },
        size,
      );
      const parentPosition = source.parentId ? boardNodeAbsolutePosition(board.nodes, source.parentId) : null;
      const clonePosition = parentPosition
        ? { x: position.x - parentPosition.x, y: position.y - parentPosition.y }
        : position;
      const clone = cloneBoardNodeForDuplicate(source, clonePosition);
      occupiedNodes.push(clone);
      return clone;
    });
    mutateBoard(currentBoard => {
      const inputEdges = duplicatedInputEdgesForClones(currentBoard.edges, sources, clones);
      return touchBoard(currentBoard, [...currentBoard.nodes, ...clones], [...currentBoard.edges, ...inputEdges]);
    });
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

  const connectPortsBatch = useCallback((connections: Array<{ from: BoardPortRef; to: BoardPortRef }>) => {
    if (connections.length === 0) return;
    mutateBoard(currentBoard => {
      let nextNodes = currentBoard.nodes;
      let nextEdges = currentBoard.edges;
      let didChange = false;
      const updatedAt = nowIso();

      for (const connection of connections) {
        if (findMatchingEdge(nextEdges, connection.from, connection.to)) continue;
        nextNodes = resolveBoardConnectionNodesWithCompatibleModel(nextNodes, connection.from, connection.to);
        const edge: BoardEdge = {
          ...createBoardEdge(nextNodes, connection.from, connection.to),
          id: createBoardId("edge"),
        };
        nextEdges = connectEdge(nextNodes, nextEdges, edge);
        didChange = true;

        const sourceNode = nextNodes.find(node => node.id === connection.from.nodeId);
        if (isMediaReferenceSourceNode(sourceNode) && connection.to.portId === BOARD_PORT_IDS.assetIn) {
          const reference = referenceGroupItemFromMediaNode(sourceNode);
          nextNodes = nextNodes.map(node =>
            node.id === connection.to.nodeId && node.kind === "reference-group"
              ? appendReferenceGroupItem(node, reference, updatedAt)
              : node,
          );
        }
      }

      return didChange ? touchBoard(currentBoard, nextNodes, nextEdges) : currentBoard;
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [mutateBoard]);

  const addAssetToReferenceGroup = useCallback((assetNodeId: string, groupNodeId: string) => {
    const updatedAt = nowIso();
    mutateBoard(currentBoard => {
      const assetNode = currentBoard.nodes.find(node => node.id === assetNodeId);
      if (!isMediaReferenceSourceNode(assetNode)) {
        throw new Error(t("board.workspace.referenceGroupOnlyMedia"));
      }
      const reference = referenceGroupItemFromMediaNode(assetNode);
      return touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => {
          if (node.id !== groupNodeId) return node;
          if (node.kind !== "reference-group") throw new Error(t("board.workspace.targetNotReferenceGroup"));
          return appendReferenceGroupItem(node, reference, updatedAt);
        }),
      );
    });
  }, [mutateBoard]);

  const removeReferenceGroupItem = useCallback((groupNodeId: string, assetId: string) => {
    const updatedAt = nowIso();
    mutateBoard(currentBoard => {
      const nextBoard = removeReferenceGroupAsset(currentBoard.nodes, currentBoard.edges, groupNodeId, assetId, updatedAt);
      return touchBoard(currentBoard, nextBoard.nodes, nextBoard.edges);
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
      throw new Error(t("board.workspace.boardNameEmpty"));
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
        const provisionalNodes = currentBoard.nodes.map(node => {
          const position = positionById.get(node.id);
          if (!position) return node;
          return { ...node, position };
        });
        const parentResolutionById = resolveMovedBoardNodeParents(
          provisionalNodes,
          Array.from(positionById.keys()),
        );
        const nextNodes = provisionalNodes.map((node, index) => {
          if (!positionById.has(node.id)) return node;
          const resolution = parentResolutionById.get(node.id);
          if (!resolution) return node;
          const currentNode = currentBoard.nodes[index];
          if (!currentNode) return node;
          const nextNode = {
            ...node,
            parentId: resolution.parentId,
            position: resolution.position,
          };
          if (
            currentNode.parentId === nextNode.parentId &&
            currentNode.position.x === nextNode.position.x &&
            currentNode.position.y === nextNode.position.y
          ) {
            return currentNode;
          }
          didChange = true;
          return { ...nextNode, updatedAt };
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
      currentBoard => {
        let didResize = false;
        const resizedNodes = currentBoard.nodes.map(node => {
          if (node.id !== nodeId) return node;
          if (sameBoardSizeValue(node.size, size)) return node;
          didResize = true;
          return { ...node, size, updatedAt };
        });
        if (!didResize) return currentBoard;
        return touchBoard(currentBoard, fitAncestorGroupsAfterNodeResize(resizedNodes, nodeId, updatedAt));
      },
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
          if (
            node.asset.assetId === asset.assetId &&
            node.asset.type === asset.type &&
            node.asset.url === asset.url &&
            node.asset.prompt === asset.prompt &&
            node.asset.model === asset.model
          ) return node;
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

  const updateAssetReferenceUrls = useCallback((updates: Array<{ assetId: string; url: string }>) => {
    if (updates.length === 0) return;
    const urlByAssetId = new Map(updates.filter(update => update.url.trim()).map(update => [update.assetId, update.url]));
    if (urlByAssetId.size === 0) return;
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node => {
          if (node.kind === "asset" || node.kind === "result") {
            const nextUrl = urlByAssetId.get(node.asset.assetId);
            if (!nextUrl || node.asset.url === nextUrl) return node;
            didChange = true;
            return { ...node, asset: { ...node.asset, url: nextUrl }, updatedAt };
          }
          if (node.kind === "reference-group") {
            let didUpdateReferences = false;
            const references = node.references.map(reference => {
              const nextUrl = urlByAssetId.get(reference.assetId);
              if (!nextUrl || reference.url === nextUrl) return reference;
              didUpdateReferences = true;
              return { ...reference, url: nextUrl };
            });
            if (!didUpdateReferences) return node;
            didChange = true;
            return { ...node, references, updatedAt };
          }
          if (node.kind === "multi-grid") {
            let didUpdateItems = false;
            const items = node.items.map(item => {
              const nextUrl = urlByAssetId.get(item.assetId);
              if (!nextUrl || item.url === nextUrl) return item;
              didUpdateItems = true;
              return { ...item, url: nextUrl };
            });
            if (!didUpdateItems) return node;
            didChange = true;
            return { ...node, items, updatedAt };
          }
          return node;
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
        currentBoard.nodes.map(node => {
          if (node.id !== nodeId || node.kind !== "prompt") return node;
          const estimatedSize = estimateBoardPromptSize(prompt);
          return {
            ...node,
            prompt,
            size: clampBoardTextNodeSize({
              width: Math.max(node.size.width, estimatedSize.width),
              height: Math.max(node.size.height, estimatedSize.height),
            }, DEFAULT_PROMPT_NODE_SIZE),
            updatedAt,
          };
        }),
      ),
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateGenerateNode = useCallback((nodeId: string, input: BoardGenerateNodeUpdate) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node => {
          if (node.id !== nodeId || (node.kind !== "image-generate" && node.kind !== "video-generate" && node.kind !== "audio-operation")) {
            return node;
          }
          const normalizedInput = normalizeGenerateUpdateForNode(node, input);
          if (sameGenerateUpdate(node, normalizedInput)) return node;
          didChange = true;
          return { ...node, ...normalizedInput, updatedAt };
        });
        if (!didChange) return currentBoard;
        return touchBoard(currentBoard, nextNodes, filterValidBoardEdges(nextNodes, currentBoard.edges));
      },
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateMultiGridNode = useCallback((nodeId: string, input: BoardMultiGridNodeUpdate) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node => {
          if (node.id !== nodeId || node.kind !== "multi-grid") return node;
          const gridSize = input.gridSize ?? node.gridSize;
          const items = normalizeBoardMultiGridItems(input.items ?? node.items, gridSize);
          const isCollapsed = "isCollapsed" in input ? input.isCollapsed === true : node.isCollapsed === true;
          const nextNode: BoardMultiGridNode = {
            ...node,
            aspectRatio: input.aspectRatio ?? node.aspectRatio,
            gridSize,
            isCollapsed,
            items,
            selectedItemId: "selectedItemId" in input ? input.selectedItemId : node.selectedItemId,
            updatedAt,
          };
          if (
            nextNode.aspectRatio === node.aspectRatio &&
            nextNode.gridSize === node.gridSize &&
            nextNode.isCollapsed === (node.isCollapsed === true) &&
            nextNode.selectedItemId === node.selectedItemId &&
            JSON.stringify(nextNode.items) === JSON.stringify(node.items)
          ) {
            return node;
          }
          didChange = true;
          return nextNode;
        });
        return didChange ? touchBoard(currentBoard, nextNodes) : currentBoard;
      },
      { skipUndo: true },
    );
  }, [mutateBoard]);

  const updateMultiGridItemTransform = useCallback((
    nodeId: string,
    assetId: string,
    transform: Partial<Pick<BoardMultiGridItem, "offsetX" | "offsetY" | "scale">>,
  ) => {
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => {
        let didChange = false;
        const nextNodes = currentBoard.nodes.map(node => {
          if (node.id !== nodeId || node.kind !== "multi-grid") return node;
          let didUpdateNode = false;
          const items = node.items.map(item => {
            if (item.assetId !== assetId) return item;
            const nextItem = {
              ...item,
              offsetX: transform.offsetX === undefined ? item.offsetX : clampMultiGridOffset(transform.offsetX),
              offsetY: transform.offsetY === undefined ? item.offsetY : clampMultiGridOffset(transform.offsetY),
              scale: transform.scale === undefined ? item.scale : clampMultiGridScale(transform.scale),
            };
            if (nextItem.offsetX === item.offsetX && nextItem.offsetY === item.offsetY && nextItem.scale === item.scale) return item;
            didChange = true;
            didUpdateNode = true;
            return nextItem;
          });
          return didUpdateNode ? { ...node, items, selectedItemId: assetId, updatedAt } : node;
        });
        return didChange ? touchBoard(currentBoard, nextNodes) : currentBoard;
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
        currentBoard.nodes.map(node => {
          if (node.id !== nodeId || node.kind !== "note") return node;
          const estimatedSize = estimateBoardNoteSize(body, node.variant ?? "plain");
          return {
            ...node,
            body,
            size: clampBoardTextNodeSize({
              width: Math.max(node.size.width, estimatedSize.width),
              height: Math.max(node.size.height, estimatedSize.height),
            }, DEFAULT_NOTE_NODE_SIZE),
            updatedAt,
          };
        }),
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
      addAssetNodes,
      addAssetNodesInGroup,
      addAssetNodeWithConnection,
      addResultNodeWithConnection,
      completeGenerationResult,
      addGenerateNode,
      addGroupNode,
      addMultiGridNode,
      addAssetToMultiGrid,
      extractMultiGridItemToAssetNode,
      addGenerateNodeWithConnection,
      addGenerateNodeWithConnections,
      groupNodes,
      addNoteNode,
      addNoteNodeWithConnection,
      addPromptNode,
      addReferenceGroupNode,
      addReferenceGroupNodeWithAsset,
      addReferenceGroupNodeWithAssets,
      addRunningHubAppNode,
      addAssetToReferenceGroup,
      clearBoard,
      connectPorts,
      connectPortsBatch,
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
      updateAssetReferenceUrls,
      updateResultNodeAsset,
      updateAgentInstruction,
      updateGenerateNode,
      updateMultiGridNode,
      updateMultiGridItemTransform,
      ungroupNode,
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
      addAssetNodes,
      addAssetNodesInGroup,
      addAssetNodeWithConnection,
      addResultNodeWithConnection,
      addGenerateNode,
      addGroupNode,
      addMultiGridNode,
      addAssetToMultiGrid,
      extractMultiGridItemToAssetNode,
      addGenerateNodeWithConnection,
      addGenerateNodeWithConnections,
      groupNodes,
      addNoteNode,
      addNoteNodeWithConnection,
      addPromptNode,
      addReferenceGroupNode,
      addReferenceGroupNodeWithAsset,
      addReferenceGroupNodeWithAssets,
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
      connectPortsBatch,
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
      updateAssetReferenceUrls,
      updateResultNodeAsset,
      updateAgentInstruction,
      updateGenerateNode,
      updateMultiGridNode,
      updateMultiGridItemTransform,
      ungroupNode,
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
