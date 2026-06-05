import type { BoardEdge, BoardEdgeKind, BoardNode, BoardPortDefinition, BoardPortRef } from "./types";
import { dedupeBoardEdgesByEndpoints } from "./edge-dedupe";
import type { MediaReferenceType } from "@/lib/media-references";
import { getModelCapabilities, getModelCapability, getVideoModelCapabilities } from "../providers/model-catalog";

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

function isExecutableNode(node: BoardNode): boolean {
  return isGenerateNode(node) || node.kind === "runninghub-app";
}

export function boardNodeSupportsReferenceInput(node: BoardNode): boolean {
  if (node.kind === "runninghub-app") return true;
  if (!isGenerateNode(node)) return false;
  return getModelCapability(node.model, node.kind === "image-generate" ? "image" : "video").supportsReferences;
}

export function getBoardNodePortDefinitions(
  node: BoardNode,
  options: BoardNodePortOptions = {},
): BoardPortDefinition[] {
  if (node.kind === "asset" || node.kind === "result") {
    return [
      { id: BOARD_PORT_IDS.assetIn, label: "资产输入", kind: "asset", direction: "input" },
      { id: BOARD_PORT_IDS.assetOut, label: "资产输出", kind: "asset", direction: "output" },
    ];
  }
  if (node.kind === "prompt") {
    return [{ id: BOARD_PORT_IDS.promptOut, label: "提示输出", kind: "prompt", direction: "output" }];
  }
  if (node.kind === "reference-group") {
    return [
      { id: BOARD_PORT_IDS.assetIn, label: "媒体输入", kind: "asset", direction: "input" },
      { id: BOARD_PORT_IDS.assetOut, label: "参考组输出", kind: "asset", direction: "output" },
    ];
  }
  if (isGenerateNode(node) || node.kind === "runninghub-app") {
    const ports: BoardPortDefinition[] = [
      { id: BOARD_PORT_IDS.promptIn, label: "提示输入", kind: "prompt", direction: "input" },
    ];
    if (boardNodeSupportsReferenceInput(node)) {
      ports.push({ id: BOARD_PORT_IDS.referenceIn, label: "参考输入", kind: "asset", direction: "input" });
    }
    if (node.status === "complete" || options.hasResultConnection) {
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

function findPort(
  nodes: BoardNode[],
  ref: BoardPortRef,
  options?: BoardNodePortOptions,
): { node: BoardNode; port: BoardPortDefinition } {
  const node = findNode(nodes, ref.nodeId);
  const port = getBoardNodePortDefinition(node, ref.portId, options);
  if (!port) throw new Error("连接端点不存在或当前模型不支持该端口");
  if (port.kind !== ref.portKind) throw new Error("连接端口类型不一致");
  return { node, port };
}

function isReferenceSource(node: BoardNode): boolean {
  return node.kind === "asset" || node.kind === "reference-group" || node.kind === "result";
}

function dedupeReferenceTypes(types: MediaReferenceType[]): MediaReferenceType[] {
  return types.filter((type, index) => types.indexOf(type) === index);
}

function getReferenceSourceMediaTypes(source: BoardNode): MediaReferenceType[] {
  if (source.kind === "reference-group") return dedupeReferenceTypes(source.references.map(reference => reference.type));
  if (source.kind === "asset" || source.kind === "result") return [source.asset.type];
  return [];
}

function getGenerateAcceptedReferenceTypes(node: BoardNode & { kind: "image-generate" | "video-generate"; model: string }): MediaReferenceType[] {
  if (node.kind === "video-generate") return getVideoModelCapabilities(node.model).referenceMediaTypes;
  return getModelCapability(node.model, "image").referenceMediaTypes;
}

function acceptsReferenceTypes(
  node: BoardNode & { kind: "image-generate" | "video-generate"; model: string },
  referenceTypes: MediaReferenceType[],
): boolean {
  if (referenceTypes.length === 0) return false;
  const acceptedTypes = getGenerateAcceptedReferenceTypes(node);
  return referenceTypes.every(type => acceptedTypes.includes(type));
}

function findCompatibleGenerateModel(
  kind: "image-generate" | "video-generate",
  referenceTypes: MediaReferenceType[],
): string | null {
  if (referenceTypes.length === 0) return null;
  const modelKind = kind === "image-generate" ? "image" : "video";
  const capability = getModelCapabilities(modelKind).find(item =>
    item.supportsReferences &&
    !item.value.includes("<") &&
    referenceTypes.every(type => item.referenceMediaTypes.includes(type))
  );
  return capability?.value ?? null;
}

export function resolveBoardConnectionNodesWithCompatibleModel(
  nodes: BoardNode[],
  from: BoardPortRef,
  to: BoardPortRef,
): BoardNode[] {
  if (
    from.portId !== BOARD_PORT_IDS.assetOut ||
    from.portKind !== "asset" ||
    to.portId !== BOARD_PORT_IDS.referenceIn ||
    to.portKind !== "asset"
  ) {
    return nodes;
  }

  const source = findNode(nodes, from.nodeId);
  const target = findNode(nodes, to.nodeId);
  if (!isGenerateNode(target)) return nodes;

  const referenceTypes = getReferenceSourceMediaTypes(source);
  if (acceptsReferenceTypes(target, referenceTypes)) return nodes;

  const compatibleModel = findCompatibleGenerateModel(target.kind, referenceTypes);
  if (!compatibleModel) return nodes;

  return nodes.map(node =>
    node.id === target.id && isGenerateNode(node)
      ? { ...node, model: compatibleModel }
      : node,
  );
}

function isAcceptedGenerateReferenceSource(source: BoardNode, target: BoardNode): boolean {
  if (target.kind === "runninghub-app") {
    if (source.kind === "reference-group") return source.references.length > 0;
    return source.kind === "asset" || source.kind === "result";
  }
  if (!isGenerateNode(target)) return false;
  if (source.kind === "reference-group") {
    if (source.references.length === 0) return false;
    if (target.kind === "image-generate") return source.references.every(reference => reference.type === "image");
    const acceptedTypes = getVideoModelCapabilities(target.model).referenceMediaTypes;
    return source.references.every(reference => acceptedTypes.includes(reference.type));
  }
  if (source.kind !== "asset" && source.kind !== "result") return false;
  if (target.kind === "image-generate") return source.asset.type === "image";
  return getVideoModelCapabilities(target.model).referenceMediaTypes.includes(source.asset.type);
}

export function resolveBoardConnectionKind(nodes: BoardNode[], from: BoardPortRef, to: BoardPortRef): BoardEdgeKind {
  const sourceOptions: BoardNodePortOptions = {};
  const targetOptions: BoardNodePortOptions = {};
  if (from.portId === BOARD_PORT_IDS.resultOut) sourceOptions.hasResultConnection = true;
  if (to.portId === BOARD_PORT_IDS.resultOut) targetOptions.hasResultConnection = true;
  const source = findPort(nodes, from, sourceOptions);
  const target = findPort(nodes, to, targetOptions);
  if (source.port.direction !== "output" || target.port.direction !== "input") {
    throw new Error("连接方向不正确");
  }
  if (source.node.id === target.node.id) throw new Error("不能连接同一个节点");

  if (
    source.node.kind === "prompt" &&
    isExecutableNode(target.node) &&
    source.port.id === BOARD_PORT_IDS.promptOut &&
    target.port.id === BOARD_PORT_IDS.promptIn
  ) {
    return "prompt";
  }

  if (
    isAcceptedGenerateReferenceSource(source.node, target.node) &&
    isExecutableNode(target.node) &&
    source.port.id === BOARD_PORT_IDS.assetOut &&
    target.port.id === BOARD_PORT_IDS.referenceIn
  ) {
    return "reference";
  }

  if (
    source.node.kind === "asset" &&
    target.node.kind === "reference-group" &&
    source.port.id === BOARD_PORT_IDS.assetOut &&
    target.port.id === BOARD_PORT_IDS.assetIn
  ) {
    return "reference";
  }

  if (
    isExecutableNode(source.node) &&
    (target.node.kind === "asset" || target.node.kind === "result") &&
    source.port.id === BOARD_PORT_IDS.resultOut &&
    target.port.id === BOARD_PORT_IDS.assetIn
  ) {
    return "result";
  }

  if (
    isReferenceSource(source.node) &&
    target.node.kind === "agent" &&
    source.port.id === BOARD_PORT_IDS.assetOut &&
    target.port.id === BOARD_PORT_IDS.agentContextIn
  ) {
    return "agent-context";
  }

  throw new Error("端口类型不兼容：媒体可连参考组、Agent 或支持该类型的生成参考，Prompt 可连生成，生成结果可连资产。");
}

export function isValidBoardConnection(nodes: BoardNode[], from: BoardPortRef, to: BoardPortRef): boolean {
  try {
    resolveBoardConnectionKind(resolveBoardConnectionNodesWithCompatibleModel(nodes, from, to), from, to);
    return true;
  } catch {
    return false;
  }
}

export function filterValidBoardEdges(nodes: BoardNode[], edges: BoardEdge[]): BoardEdge[] {
  return dedupeBoardEdgesByEndpoints(edges.filter(edge => isValidBoardConnection(nodes, edge.from, edge.to)));
}
