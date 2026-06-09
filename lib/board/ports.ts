import type { BoardEdge, BoardEdgeKind, BoardNode, BoardPortDefinition, BoardPortRef } from "./types";
import { dedupeBoardEdgesByEndpoints } from "./edge-dedupe";
import type { MediaReferenceType } from "@/lib/media-references";
import {
  getAudioModelCapabilities,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getModelCapabilities,
  getModelCapability,
  getVideoModelCapabilities,
} from "../providers/model-catalog";

export const BOARD_PORT_IDS = {
  agentContextIn: "agent-context-in",
  assetIn: "asset-in",
  assetOut: "asset-out",
  noteIn: "note-in",
  promptIn: "prompt-in",
  promptOut: "prompt-out",
  referenceIn: "reference-in",
  resultOut: "result-out",
} as const;

const DEFAULT_CUSTOM_IMAGE_RESOLUTION = "2560x1440";

interface BoardNodePortOptions {
  hasResultConnection?: boolean;
}

function isGenerateNode(node: BoardNode): node is BoardNode & { kind: "image-generate" | "video-generate" | "audio-operation"; model: string } {
  return node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation";
}

function isExecutableNode(node: BoardNode): boolean {
  return isGenerateNode(node) || node.kind === "runninghub-app";
}

export function boardNodeSupportsReferenceInput(node: BoardNode): boolean {
  if (node.kind === "runninghub-app") return true;
  if (!isGenerateNode(node)) return false;
  try {
    const kind = node.kind === "image-generate" ? "image" : node.kind === "audio-operation" ? "audio" : "video";
    if (getModelCapability(node.model, kind).supportsReferences) {
      return true;
    }
  } catch {
    return hasCompatibleReferenceModel(node.kind);
  }
  return hasCompatibleReferenceModel(node.kind);
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
  if (node.kind === "multi-grid") {
    return [{ id: BOARD_PORT_IDS.assetIn, label: "图片输入", kind: "asset", direction: "input" }];
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
  if (node.kind === "note") {
    return [{ id: BOARD_PORT_IDS.noteIn, label: "结果输入", kind: "result", direction: "input" }];
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

function getGenerateAcceptedReferenceTypes(node: BoardNode & { kind: "image-generate" | "video-generate" | "audio-operation"; model: string }): MediaReferenceType[] {
  if (node.kind === "audio-operation") return getAudioModelCapabilities(node.model).referenceMediaTypes;
  if (node.kind === "video-generate") return getVideoModelCapabilities(node.model).referenceMediaTypes;
  return getModelCapability(node.model, "image").referenceMediaTypes;
}

function isAutoSelectableCapability(item: ReturnType<typeof getModelCapabilities>[number]): boolean {
  return item.supportsReferences && !item.supportsAsync && !item.value.includes("<");
}

function hasCompatibleReferenceModel(kind: "image-generate" | "video-generate" | "audio-operation"): boolean {
  const modelKind = kind === "image-generate" ? "image" : kind === "audio-operation" ? "audio" : "video";
  return getModelCapabilities(modelKind).some(isAutoSelectableCapability);
}

function acceptsReferenceTypes(
  node: BoardNode & { kind: "image-generate" | "video-generate" | "audio-operation"; model: string },
  referenceTypes: MediaReferenceType[],
): boolean {
  if (referenceTypes.length === 0) return false;
  try {
    const acceptedTypes = getGenerateAcceptedReferenceTypes(node);
    return referenceTypes.every(type => acceptedTypes.includes(type));
  } catch {
    return false;
  }
}

function findCompatibleGenerateModel(
  kind: "image-generate" | "video-generate" | "audio-operation",
  referenceTypes: MediaReferenceType[],
): string | null {
  if (referenceTypes.length === 0) return null;
  const modelKind = kind === "image-generate" ? "image" : kind === "audio-operation" ? "audio" : "video";
  const capability = getModelCapabilities(modelKind).find(item =>
    isAutoSelectableCapability(item) &&
    referenceTypes.every(type => item.referenceMediaTypes.includes(type))
  );
  return capability?.value ?? null;
}

function firstOptionValue(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
}

function patchGenerateNodeForModel(
  node: BoardNode & { kind: "image-generate" | "video-generate" | "audio-operation"; model: string },
  model: string,
): BoardNode {
  if (node.kind === "image-generate") {
    const capabilities = getImageModelCapabilities(model);
    const aspectRatio = capabilities.aspectRatios.some(option => option.value === node.aspectRatio)
      ? node.aspectRatio
      : firstOptionValue(capabilities.aspectRatios, "1:1");
    const resolutionOptions = getImageResolutionOptions(model, aspectRatio);
    const resolutionSource = resolutionOptions.length > 0 ? resolutionOptions : capabilities.resolutions;
    return {
      ...node,
      aspectRatio,
      customImageResolution: node.customImageResolution || DEFAULT_CUSTOM_IMAGE_RESOLUTION,
      imageQuality: capabilities.qualities.some(option => option.value === node.imageQuality)
        ? node.imageQuality
        : capabilities.qualities[0]?.value,
      imageResolution: resolutionSource.some(option => option.value === node.imageResolution)
        ? node.imageResolution
        : firstOptionValue(resolutionSource, "1K"),
      model,
      thinkingLevel: capabilities.thinkingLevels.some(option => option.value === node.thinkingLevel)
        ? node.thinkingLevel
        : capabilities.thinkingLevels[0]?.value,
    };
  }

  if (node.kind === "audio-operation") {
    const capabilities = getAudioModelCapabilities(model);
    return {
      ...node,
      audioFormat: capabilities.formats.some(option => option.value === node.audioFormat)
        ? node.audioFormat
        : capabilities.formats[0]?.value ?? "wav",
      audioMode: capabilities.modes.includes(node.audioMode)
        ? node.audioMode
        : capabilities.defaultMode,
      model,
    };
  }

  const capabilities = getVideoModelCapabilities(model);
  return {
    ...node,
    aspectRatio: capabilities.sizes.some(option => option.value === node.aspectRatio)
      ? node.aspectRatio
      : firstOptionValue(capabilities.sizes, "auto"),
    model,
    videoDuration: capabilities.durations.some(option => option.value === node.videoDuration)
      ? node.videoDuration
      : capabilities.durations[0]?.value,
    videoPreset: capabilities.presets.some(option => option.value === node.videoPreset)
      ? node.videoPreset
      : capabilities.presets[0]?.value,
    videoReferenceMode: node.videoReferenceMode && capabilities.referenceModes.includes(node.videoReferenceMode)
      ? node.videoReferenceMode
      : capabilities.referenceMode === "none"
        ? undefined
        : capabilities.referenceMode,
    videoResolution: capabilities.resolutions.some(option => option.value === node.videoResolution)
      ? node.videoResolution
      : capabilities.resolutions[0]?.value,
  };
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
      ? patchGenerateNodeForModel(node, compatibleModel)
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
    const acceptedTypes = target.kind === "audio-operation"
      ? getAudioModelCapabilities(target.model).referenceMediaTypes
      : getVideoModelCapabilities(target.model).referenceMediaTypes;
    return source.references.every(reference => acceptedTypes.includes(reference.type));
  }
  if (source.kind !== "asset" && source.kind !== "result") return false;
  if (target.kind === "image-generate") return source.asset.type === "image";
  if (target.kind === "audio-operation") return getAudioModelCapabilities(target.model).referenceMediaTypes.includes(source.asset.type);
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
    isExecutableNode(source.node) &&
    target.node.kind === "note" &&
    source.port.id === BOARD_PORT_IDS.resultOut &&
    target.port.id === BOARD_PORT_IDS.noteIn
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

  throw new Error("端口类型不兼容：媒体可连参考组、多宫格、Agent 或支持该类型的生成参考，Prompt 可连生成，生成结果可连资产或笔记。");
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
