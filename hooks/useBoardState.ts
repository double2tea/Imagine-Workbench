"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOARD_UNDO_LIMIT, cloneBoardHistory, type BoardHistorySnapshot } from "@/lib/board/history";
import {
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_BOARD_CONFIG,
  DEFAULT_BOARD_ID,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_NODE_POSITION,
  DEFAULT_NOTE_NODE_SIZE,
  DEFAULT_PROMPT_NODE_SIZE,
  DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  createEmptyBoard,
  getBoardFromDB,
  saveBoardToDB,
  type BoardAgentNode,
  type BoardConfig,
  type BoardDocument,
  type BoardEdge,
  type BoardEdgeKind,
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
} from "@/lib/board";
import { getImageModelCapabilities, getImageResolutionOptions, getVideoModelCapabilities } from "@/lib/providers/model-catalog";

export type BoardSaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

const DEFAULT_CUSTOM_IMAGE_RESOLUTION = "2560x1440";
const DEFAULT_VARIANT_COUNT: BoardGenerateVariantCount = 1;

export interface BoardStateController {
  board: BoardDocument;
  canRedo: boolean;
  canUndo: boolean;
  saveStatus: BoardSaveStatus;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  saveError: string | null;
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
  addGenerateNode: (input: CreateGenerateNodeInput) => string;
  addNoteNode: (input?: CreateNoteNodeInput) => string;
  addPromptNode: (input?: CreatePromptNodeInput) => string;
  addReferenceGroupNode: (input?: CreateReferenceGroupNodeInput) => string;
  addAssetToReferenceGroup: (assetNodeId: string, groupNodeId: string) => void;
  clearBoard: () => void;
  connectPorts: (from: BoardPortRef, to: BoardPortRef) => void;
  deleteEdge: (edgeId: string) => void;
  deleteNode: (nodeId: string) => void;
  moveReferenceGroupItem: (groupNodeId: string, assetId: string, direction: "up" | "down") => void;
  removeReferenceGroupItem: (groupNodeId: string, assetId: string) => void;
  selectEdge: (edgeId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  setViewport: (viewport: BoardViewport) => void;
  updateBoardConfig: (config: Partial<BoardConfig>) => void;
  updateBoardTitle: (title: string) => void;
  updateReferenceGroupItemRole: (groupNodeId: string, assetId: string, role: BoardReferenceRole) => void;
  updateAgentInstruction: (nodeId: string, instruction: string) => void;
  updateGenerateNode: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  updateNodePosition: (nodeId: string, position: BoardPoint) => void;
  updateNodesPositions: (updates: Array<{ nodeId: string; position: BoardPoint }>) => void;
  updateNodeSize: (nodeId: string, size: BoardSize) => void;
  updateNoteBody: (nodeId: string, body: string) => void;
  updatePromptNode: (nodeId: string, prompt: string) => void;
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
  if (kind === "agent") return "agent";
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
    size: source.size,
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
        videoResolution: source.videoResolution,
      };
    case "agent":
      return { ...shell, kind: "agent", instruction: source.instruction };
    case "note":
      return { ...shell, kind: "note", body: source.body };
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

function normalizeBoard(board: BoardDocument): BoardDocument {
  return {
    ...board,
    config: { ...DEFAULT_BOARD_CONFIG, ...board.config },
    nodes: Array.isArray(board.nodes) ? board.nodes.map(normalizeBoardNode) : [],
    edges: Array.isArray(board.edges) ? board.edges : [],
  };
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

function normalizeBoardNode(node: BoardNode): BoardNode {
  if (node.kind === "image-generate") {
    const defaults = defaultImageParams(node.model, node.aspectRatio);
    return {
      ...node,
      aspectRatio: node.aspectRatio || defaults.aspectRatio,
      customImageResolution: node.customImageResolution || defaults.customImageResolution,
      imageQuality: node.imageQuality ?? defaults.imageQuality,
      imageResolution: node.imageResolution || defaults.imageResolution,
      thinkingLevel: node.thinkingLevel ?? defaults.thinkingLevel,
      variantCount: node.variantCount || DEFAULT_VARIANT_COUNT,
    };
  }
  if (node.kind === "video-generate") {
    const defaults = defaultVideoParams(node.model, node.aspectRatio);
    return {
      ...node,
      aspectRatio: node.aspectRatio || defaults.aspectRatio,
      videoDuration: node.videoDuration ?? defaults.videoDuration,
      videoPreset: node.videoPreset ?? defaults.videoPreset,
      videoResolution: node.videoResolution ?? defaults.videoResolution,
      variantCount: node.variantCount || DEFAULT_VARIANT_COUNT,
    };
  }
  return node;
}

function touchBoard(board: BoardDocument, nodes: BoardNode[] = board.nodes, edges: BoardEdge[] = board.edges): BoardDocument {
  return {
    ...board,
    nodes,
    edges,
    updatedAt: nowIso(),
  };
}

function moveDefaultPosition(nodes: BoardNode[]): BoardPoint {
  return {
    x: DEFAULT_NODE_POSITION.x + nodes.length * 36,
    y: DEFAULT_NODE_POSITION.y + nodes.length * 28,
  };
}

function isCompatibleConnection(from: BoardPortRef, to: BoardPortRef): BoardEdgeKind {
  if (from.portKind === "asset" && to.portKind === "asset") return "reference";
  if (from.portKind === "prompt" && to.portKind === "prompt") return "prompt";
  if (from.portKind === "result" && to.portKind === "asset") return "result";
  if (from.portKind === "asset" && to.portKind === "agent") return "agent-context";
  throw new Error(`Cannot connect ${from.portKind} output to ${to.portKind} input`);
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
      return updater(current);
    });
  }, [hasLoaded, pushUndoSnapshot]);

  const beginUndoGesture = useCallback(() => {
    if (!hasLoaded || dragUndoCapturedRef.current) return;
    dragUndoCapturedRef.current = true;
    pushUndoSnapshot(board);
  }, [board, hasLoaded, pushUndoSnapshot]);

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
      setBoardState(storedBoard ? normalizeBoard(storedBoard) : createEmptyBoard(boardId));
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

  const addAssetNode = useCallback((input: CreateAssetNodeInput): string => {
    const createdAt = nowIso();
    const nodeId = createBoardId("asset");
    const node: BoardNode = {
      id: nodeId,
      kind: "asset",
      title: input.title ?? input.asset.prompt,
      asset: input.asset,
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ?? DEFAULT_ASSET_NODE_SIZE,
      createdAt,
      updatedAt: createdAt,
    };

    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes, mutateBoard]);

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
    const createdAt = nowIso();
    const nodeId = createBoardId("ref_group");
    const node: BoardReferenceGroupNode = {
      id: nodeId,
      kind: "reference-group",
      title: input.title ?? "Reference Group",
      references: input.references ?? [],
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ?? DEFAULT_REFERENCE_GROUP_NODE_SIZE,
      createdAt,
      updatedAt: createdAt,
    };

    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes, mutateBoard]);

  const addGenerateNode = useCallback((input: CreateGenerateNodeInput): string => {
    const createdAt = nowIso();
    const nodeId = createBoardId(input.kind === "image-generate" ? "image_gen" : "video_gen");
    const baseNode = {
      id: nodeId,
      title: input.title ?? (input.kind === "image-generate" ? "Image Generate" : "Video Generate"),
      prompt: input.prompt ?? "",
      model: input.model,
      status: "idle" as BoardGenerationStatus,
      variantCount: input.variantCount ?? DEFAULT_VARIANT_COUNT,
      position: input.position ?? moveDefaultPosition(board.nodes),
      size: input.size ?? DEFAULT_GENERATE_NODE_SIZE,
      createdAt,
      updatedAt: createdAt,
    };
    let node: BoardImageGenerateNode | BoardVideoGenerateNode;
    if (input.kind === "image-generate") {
      const imageDefaults = defaultImageParams(input.model, input.aspectRatio);
      node = {
        ...baseNode,
        kind: "image-generate",
        aspectRatio: input.aspectRatio || imageDefaults.aspectRatio,
        customImageResolution: input.customImageResolution ?? imageDefaults.customImageResolution,
        imageQuality: input.imageQuality ?? imageDefaults.imageQuality,
        imageResolution: input.imageResolution ?? imageDefaults.imageResolution,
        thinkingLevel: input.thinkingLevel ?? imageDefaults.thinkingLevel,
      };
    } else {
      const videoDefaults = defaultVideoParams(input.model, input.aspectRatio);
      node = {
        ...baseNode,
        kind: "video-generate",
        aspectRatio: input.aspectRatio || videoDefaults.aspectRatio,
        videoDuration: input.videoDuration ?? videoDefaults.videoDuration,
        videoPreset: input.videoPreset ?? videoDefaults.videoPreset,
        videoResolution: input.videoResolution ?? videoDefaults.videoResolution,
      };
    }

    mutateBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
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
      const remainingNodes = currentBoard.nodes.filter(node => node.id !== nodeId);
      const remainingEdges = currentBoard.edges.filter(edge => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId);
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
    mutateBoard(currentBoard => touchBoard(currentBoard, currentBoard.nodes, currentBoard.edges.filter(edge => edge.id !== edgeId)));
    setSelectedEdgeId(currentId => (currentId === edgeId ? null : currentId));
  }, [mutateBoard]);

  const reconnectEdge = useCallback((edgeId: string, from: BoardPortRef, to: BoardPortRef) => {
    const kind = isCompatibleConnection(from, to);
    mutateBoard(currentBoard => {
      if (!currentBoard.edges.some(edge => edge.id === edgeId)) {
        throw new Error("连接不存在");
      }
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
      return touchBoard(currentBoard, currentBoard.nodes, nextEdges);
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
      const restoredEdges = edges.filter(
        edge => nodeIds.has(edge.from.nodeId) && nodeIds.has(edge.to.nodeId),
      );
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
    const kind = isCompatibleConnection(from, to);
    const createdAt = nowIso();
    const edge: BoardEdge = {
      id: createBoardId("edge"),
      kind,
      from,
      to,
      createdAt,
    };
    mutateBoard(currentBoard => {
      const withoutDuplicate = currentBoard.edges.filter(
        currentEdge =>
          !(
            currentEdge.from.nodeId === from.nodeId &&
            currentEdge.from.portId === from.portId &&
            currentEdge.to.nodeId === to.nodeId &&
            currentEdge.to.portId === to.portId
          ),
      );
      return touchBoard(currentBoard, currentBoard.nodes, [...withoutDuplicate, edge]);
    });
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, [mutateBoard]);

  const addAssetToReferenceGroup = useCallback((assetNodeId: string, groupNodeId: string) => {
    const updatedAt = nowIso();
    mutateBoard(currentBoard => {
      const assetNode = currentBoard.nodes.find(node => node.id === assetNodeId);
      if (assetNode?.kind !== "asset" || assetNode.asset.type !== "image") {
        throw new Error("参考组只支持图片资产");
      }
      const reference: BoardReferenceGroupItem = {
        assetId: assetNode.asset.assetId,
        model: assetNode.asset.model,
        prompt: assetNode.asset.prompt,
        role: "general",
        url: assetNode.asset.url,
      };
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
    setSelectedNodeId(nodeId);
    if (nodeId) setSelectedEdgeId(null);
  }, []);

  const selectEdge = useCallback((edgeId: string | null) => {
    setSelectedEdgeId(edgeId);
    if (edgeId) setSelectedNodeId(null);
  }, []);

  const setViewport = useCallback((viewport: BoardViewport) => {
    mutateBoard(currentBoard => ({
      ...currentBoard,
      viewport,
      updatedAt: nowIso(),
    }), { skipUndo: true });
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

  const updateNodesPositions = useCallback((updates: Array<{ nodeId: string; position: BoardPoint }>) => {
    if (updates.length === 0) return;
    const positionById = new Map(updates.map(update => [update.nodeId, update.position]));
    const updatedAt = nowIso();
    mutateBoard(
      currentBoard => touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => {
          const position = positionById.get(node.id);
          return position ? { ...node, position, updatedAt } : node;
        }),
      ),
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
      currentBoard => touchBoard(
        currentBoard,
        currentBoard.nodes.map(node =>
          node.id === nodeId && (node.kind === "image-generate" || node.kind === "video-generate")
            ? { ...node, ...input, updatedAt }
            : node,
        ),
      ),
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
      addGenerateNode,
      addNoteNode,
      addPromptNode,
      addReferenceGroupNode,
      addAssetToReferenceGroup,
      clearBoard,
      connectPorts,
      deleteEdge,
      deleteNode,
      moveReferenceGroupItem,
      removeReferenceGroupItem,
      selectEdge,
      selectNode,
      setViewport,
      updateBoardConfig,
      updateBoardTitle,
      updateReferenceGroupItemRole,
      updateAgentInstruction,
      updateGenerateNode,
      updateNodePosition,
      updateNodesPositions,
      updateNodeSize,
      updateNoteBody,
      updatePromptNode,
    }),
    [
      addAgentNode,
      addAssetNode,
      addGenerateNode,
      addNoteNode,
      addPromptNode,
      addReferenceGroupNode,
      addAssetToReferenceGroup,
      beginUndoGesture,
      endUndoGesture,
      board,
      canRedo,
      canUndo,
      clearBoard,
      connectPorts,
      deleteEdge,
      deleteNode,
      duplicateNode,
      duplicateNodes,
      moveReferenceGroupItem,
      reconnectEdge,
      restoreNodeWithEdges,
      removeReferenceGroupItem,
      redo,
      saveError,
      saveStatus,
      selectedEdgeId,
      selectedNodeId,
      selectEdge,
      selectNode,
      setViewport,
      updateBoardConfig,
      updateBoardTitle,
      updateReferenceGroupItemRole,
      updateAgentInstruction,
      updateGenerateNode,
      updateNodePosition,
      updateNodesPositions,
      updateNodeSize,
      undo,
      updateNoteBody,
      updatePromptNode,
    ],
  );
}
