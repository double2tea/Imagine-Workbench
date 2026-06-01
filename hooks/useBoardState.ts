"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_BOARD_ID,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_NODE_POSITION,
  DEFAULT_NOTE_NODE_SIZE,
  DEFAULT_PROMPT_NODE_SIZE,
  createEmptyBoard,
  getBoardFromDB,
  saveBoardToDB,
  type BoardAgentNode,
  type BoardDocument,
  type BoardEdge,
  type BoardEdgeKind,
  type BoardGenerateNodeUpdate,
  type BoardGenerationStatus,
  type BoardImageGenerateNode,
  type BoardNode,
  type BoardPoint,
  type BoardPortRef,
  type BoardPromptNode,
  type BoardSize,
  type BoardVideoGenerateNode,
  type BoardViewport,
  type CreateAgentNodeInput,
  type CreateAssetNodeInput,
  type CreateGenerateNodeInput,
  type CreateNoteNodeInput,
  type CreatePromptNodeInput,
} from "@/lib/board";
import { getImageModelCapabilities, getImageResolutionOptions, getVideoModelCapabilities } from "@/lib/providers/model-catalog";

export type BoardSaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

const DEFAULT_CUSTOM_IMAGE_RESOLUTION = "2560x1440";

export interface BoardStateController {
  board: BoardDocument;
  saveStatus: BoardSaveStatus;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  saveError: string | null;
  addAgentNode: (input?: CreateAgentNodeInput) => string;
  addAssetNode: (input: CreateAssetNodeInput) => string;
  addGenerateNode: (input: CreateGenerateNodeInput) => string;
  addNoteNode: (input?: CreateNoteNodeInput) => string;
  addPromptNode: (input?: CreatePromptNodeInput) => string;
  clearBoard: () => void;
  connectPorts: (from: BoardPortRef, to: BoardPortRef) => void;
  deleteEdge: (edgeId: string) => void;
  deleteNode: (nodeId: string) => void;
  selectEdge: (edgeId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  setViewport: (viewport: BoardViewport) => void;
  updateAgentInstruction: (nodeId: string, instruction: string) => void;
  updateGenerateNode: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  updateNodePosition: (nodeId: string, position: BoardPoint) => void;
  updateNodeSize: (nodeId: string, size: BoardSize) => void;
  updateNoteBody: (nodeId: string, body: string) => void;
  updatePromptNode: (nodeId: string, prompt: string) => void;
}

function createBoardId(prefix: string): string {
  if (typeof crypto === "undefined") {
    throw new Error("crypto is required to create board ids");
  }
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeBoard(board: BoardDocument): BoardDocument {
  return {
    ...board,
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
  const [board, setBoard] = useState<BoardDocument>(() => createEmptyBoard());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<BoardSaveStatus>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadBoard(): Promise<void> {
      setSaveStatus("loading");
      const storedBoard = await getBoardFromDB(boardId);
      if (!isActive) return;

      setBoard(storedBoard ? normalizeBoard(storedBoard) : createEmptyBoard());
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
  }, [boardId]);

  useEffect(() => {
    if (!hasLoaded) return;

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
  }, [board, hasLoaded]);

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

    setBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes]);

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

    setBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes]);

  const addGenerateNode = useCallback((input: CreateGenerateNodeInput): string => {
    const createdAt = nowIso();
    const nodeId = createBoardId(input.kind === "image-generate" ? "image_gen" : "video_gen");
    const baseNode = {
      id: nodeId,
      title: input.title ?? (input.kind === "image-generate" ? "Image Generate" : "Video Generate"),
      prompt: input.prompt ?? "",
      model: input.model,
      status: "idle" as BoardGenerationStatus,
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

    setBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes]);

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

    setBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes]);

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

    setBoard(currentBoard => touchBoard(currentBoard, [...currentBoard.nodes, node]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    return nodeId;
  }, [board.nodes]);

  const clearBoard = useCallback(() => {
    setBoard(currentBoard => touchBoard(currentBoard, [], []));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.filter(node => node.id !== nodeId),
        currentBoard.edges.filter(edge => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId),
      ),
    );
    setSelectedNodeId(currentId => (currentId === nodeId ? null : currentId));
  }, []);

  const deleteEdge = useCallback((edgeId: string) => {
    setBoard(currentBoard => touchBoard(currentBoard, currentBoard.nodes, currentBoard.edges.filter(edge => edge.id !== edgeId)));
    setSelectedEdgeId(currentId => (currentId === edgeId ? null : currentId));
  }, []);

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
    setBoard(currentBoard => {
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
  }, []);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    if (nodeId) setSelectedEdgeId(null);
  }, []);

  const selectEdge = useCallback((edgeId: string | null) => {
    setSelectedEdgeId(edgeId);
    if (edgeId) setSelectedNodeId(null);
  }, []);

  const setViewport = useCallback((viewport: BoardViewport) => {
    setBoard(currentBoard => ({
      ...currentBoard,
      viewport,
      updatedAt: nowIso(),
    }));
  }, []);

  const updateNodePosition = useCallback((nodeId: string, position: BoardPoint) => {
    const updatedAt = nowIso();
    setBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId ? { ...node, position, updatedAt } : node)),
      ),
    );
  }, []);

  const updateNodeSize = useCallback((nodeId: string, size: BoardSize) => {
    const updatedAt = nowIso();
    setBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId ? { ...node, size, updatedAt } : node)),
      ),
    );
  }, []);

  const updatePromptNode = useCallback((nodeId: string, prompt: string) => {
    const updatedAt = nowIso();
    setBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId && node.kind === "prompt" ? { ...node, prompt, updatedAt } : node)),
      ),
    );
  }, []);

  const updateGenerateNode = useCallback((nodeId: string, input: BoardGenerateNodeUpdate) => {
    const updatedAt = nowIso();
    setBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node =>
          node.id === nodeId && (node.kind === "image-generate" || node.kind === "video-generate")
            ? { ...node, ...input, updatedAt }
            : node,
        ),
      ),
    );
  }, []);

  const updateAgentInstruction = useCallback((nodeId: string, instruction: string) => {
    const updatedAt = nowIso();
    setBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId && node.kind === "agent" ? { ...node, instruction, updatedAt } : node)),
      ),
    );
  }, []);

  const updateNoteBody = useCallback((nodeId: string, body: string) => {
    const updatedAt = nowIso();
    setBoard(currentBoard =>
      touchBoard(
        currentBoard,
        currentBoard.nodes.map(node => (node.id === nodeId && node.kind === "note" ? { ...node, body, updatedAt } : node)),
      ),
    );
  }, []);

  return useMemo(
    () => ({
      board,
      saveStatus,
      selectedEdgeId,
      selectedNodeId,
      saveError,
      addAgentNode,
      addAssetNode,
      addGenerateNode,
      addNoteNode,
      addPromptNode,
      clearBoard,
      connectPorts,
      deleteEdge,
      deleteNode,
      selectEdge,
      selectNode,
      setViewport,
      updateAgentInstruction,
      updateGenerateNode,
      updateNodePosition,
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
      board,
      clearBoard,
      connectPorts,
      deleteEdge,
      deleteNode,
      saveError,
      saveStatus,
      selectedEdgeId,
      selectedNodeId,
      selectEdge,
      selectNode,
      setViewport,
      updateAgentInstruction,
      updateGenerateNode,
      updateNodePosition,
      updateNodeSize,
      updateNoteBody,
      updatePromptNode,
    ],
  );
}
