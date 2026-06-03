import type { BoardEdge, BoardEdgeKind, BoardNode, BoardPortDefinition, BoardPortRef } from "@/lib/board/types";
import { dedupeBoardEdgesByEndpoints } from "@/lib/board/edge-dedupe";
import { getModelCapability } from "@/lib/providers/model-catalog";

export const BOARD_PORT_IDS = {
  agentContextIn: "agent-context-in",
  assetIn: "asset-in",
  assetOut: "asset-out",
  promptIn: "prompt-in",
  promptOut: "prompt-out",
  referenceIn: "reference-in",
  resultOut: "result-out",
} as const;

interface BoardNodePortOptions {
  hasResultConnection?: boolean;
}

function isGenerateNode(node: BoardNode): node is BoardNode & { kind: "image-generate" | "video-generate"; model: string } {
  return node.kind === "image-generate" || node.kind === "video-generate";
}

export function boardNodeSupportsReferenceInput(node: BoardNode): boolean {
  if (!isGenerateNode(node)) return false;
  return getModelCapability(node.model, node.kind === "image-generate" ? "image" : "video").supportsReferences;
}

export function getBoardNodePortDefinitions(
  node: BoardNode,
  options: BoardNodePortOptions = {},
): BoardPortDefinition[] {
  if (node.kind === "asset") {
    const ports: BoardPortDefinition[] = [
      { id: BOARD_PORT_IDS.assetIn, label: "资产输入", kind: "asset", direction: "input" },
    ];
    if (node.asset.type === "image") {
      ports.push({ id: BOARD_PORT_IDS.assetOut, label: "资产输出", kind: "asset", direction: "output" });
    }
    return ports;
  }
  if (node.kind === "prompt") {
    return [{ id: BOARD_PORT_IDS.promptOut, label: "提示输出", kind: "prompt", direction: "output" }];
  }
  if (node.kind === "reference-group") {
    return [
      { id: BOARD_PORT_IDS.assetIn, label: "图片输入", kind: "asset", direction: "input" },
      { id: BOARD_PORT_IDS.assetOut, label: "参考组输出", kind: "asset", direction: "output" },
    ];
  }
  if (isGenerateNode(node)) {
    const ports: BoardPortDefinition[] = [
      { id: BOARD_PORT_IDS.promptIn, label: "提示输入", kind: "prompt", direction: "input" },
    ];
    if (boardNodeSupportsReferenceInput(node)) {
      ports.push({ id: BOARD_PORT_IDS.referenceIn, label: "参考输入", kind: "asset", direction: "input" });
    }
    if (node.status === "complete" || Boolean(node.resultAssetId) || options.hasResultConnection) {
      ports.push({ id: BOARD_PORT_IDS.resultOut, label: "结果输出", kind: "result", direction: "output" });
    }
    return ports;
  }
  if (node.kind === "agent") {
    return [{ id: BOARD_PORT_IDS.agentContextIn, label: "Agent 上下文输入", kind: "agent", direction: "input" }];
  }
  return [];
}

export function getBoardNodePortDefinition(
  node: BoardNode,
  portId: string,
  options?: BoardNodePortOptions,
): BoardPortDefinition | undefined {
  return getBoardNodePortDefinitions(node, options).find(port => port.id === portId);
}

function findNode(nodes: BoardNode[], nodeId: string): BoardNode {
  const node = nodes.find(item => item.id === nodeId);
  if (!node) throw new Error("连接端点节点不存在");
  return node;
}

function findPort(nodes: BoardNode[], ref: BoardPortRef): { node: BoardNode; port: BoardPortDefinition } {
  const node = findNode(nodes, ref.nodeId);
  const port = getBoardNodePortDefinition(node, ref.portId);
  if (!port) throw new Error("连接端点不存在或当前模型不支持该端口");
  if (port.kind !== ref.portKind) throw new Error("连接端口类型不一致");
  return { node, port };
}

function isImageReferenceSource(node: BoardNode): boolean {
  return (node.kind === "asset" && node.asset.type === "image") || node.kind === "reference-group";
}

export function resolveBoardConnectionKind(nodes: BoardNode[], from: BoardPortRef, to: BoardPortRef): BoardEdgeKind {
  const source = findPort(nodes, from);
  const target = findPort(nodes, to);
  if (source.port.direction !== "output" || target.port.direction !== "input") {
    throw new Error("连接方向不正确");
  }
  if (source.node.id === target.node.id) throw new Error("不能连接同一个节点");

  if (
    source.node.kind === "prompt" &&
    isGenerateNode(target.node) &&
    source.port.id === BOARD_PORT_IDS.promptOut &&
    target.port.id === BOARD_PORT_IDS.promptIn
  ) {
    return "prompt";
  }

  if (
    isImageReferenceSource(source.node) &&
    isGenerateNode(target.node) &&
    source.port.id === BOARD_PORT_IDS.assetOut &&
    target.port.id === BOARD_PORT_IDS.referenceIn
  ) {
    return "reference";
  }

  if (
    source.node.kind === "asset" &&
    source.node.asset.type === "image" &&
    target.node.kind === "reference-group" &&
    source.port.id === BOARD_PORT_IDS.assetOut &&
    target.port.id === BOARD_PORT_IDS.assetIn
  ) {
    return "reference";
  }

  if (
    isGenerateNode(source.node) &&
    target.node.kind === "asset" &&
    source.port.id === BOARD_PORT_IDS.resultOut &&
    target.port.id === BOARD_PORT_IDS.assetIn
  ) {
    return "result";
  }

  if (
    isImageReferenceSource(source.node) &&
    target.node.kind === "agent" &&
    source.port.id === BOARD_PORT_IDS.assetOut &&
    target.port.id === BOARD_PORT_IDS.agentContextIn
  ) {
    return "agent-context";
  }

  throw new Error("端口类型不兼容：图片可连参考/Agent，Prompt 可连生成，生成结果可连资产。");
}

export function isValidBoardConnection(nodes: BoardNode[], from: BoardPortRef, to: BoardPortRef): boolean {
  try {
    resolveBoardConnectionKind(nodes, from, to);
    return true;
  } catch {
    return false;
  }
}

export function filterValidBoardEdges(nodes: BoardNode[], edges: BoardEdge[]): BoardEdge[] {
  return dedupeBoardEdgesByEndpoints(edges.filter(edge => isValidBoardConnection(nodes, edge.from, edge.to)));
}
