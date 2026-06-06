import type { BoardEdge, BoardNode, BoardReferenceGroupItem } from "@/lib/board/types";

const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const INLINE_TEXT_LIMIT = 240;
const HASH_SAMPLE_CHARS = 4_096;

function fnv1aUpdate(hash: number, text: string): number {
  let next = hash;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, FNV_PRIME);
  }
  return next >>> 0;
}

function hashSampledText(value: string): number {
  if (value.length <= HASH_SAMPLE_CHARS * 2) {
    return fnv1aUpdate(FNV_OFFSET_BASIS, value);
  }
  const head = value.slice(0, HASH_SAMPLE_CHARS);
  const tail = value.slice(-HASH_SAMPLE_CHARS);
  return fnv1aUpdate(fnv1aUpdate(FNV_OFFSET_BASIS, head), tail);
}

/** Compact stable digest for large text (e.g. data URLs, long prompts). */
function fingerprintLargeText(value: string): string {
  if (value.length === 0) return "";
  if (value.length <= INLINE_TEXT_LIMIT) return value;
  return `L${value.length}:H${hashSampledText(value).toString(16)}`;
}

function digestParts(parts: string[]): string {
  let hash = FNV_OFFSET_BASIS;
  for (const part of parts) {
    hash = fnv1aUpdate(hash, part);
    hash = fnv1aUpdate(hash, "\n");
  }
  return hash.toString(16);
}

function serializeReferenceGroupItem(item: BoardReferenceGroupItem): string {
  return `${item.assetId}:${item.type}:${item.role}:${fingerprintLargeText(item.url)}`;
}

function serializeNodeContent(node: BoardNode): string {
  switch (node.kind) {
    case "asset":
      return [
        "asset",
        node.id,
        node.title,
        node.asset.assetId,
        node.asset.type,
        fingerprintLargeText(node.asset.url),
        node.resultSourceNodeId ?? "",
        node.resultStackKey ?? "",
        node.resultAssetIds?.join(",") ?? "",
      ].join("|");
    case "prompt":
      return `prompt|${node.id}|${node.title}|${fingerprintLargeText(node.prompt)}`;
    case "reference-group":
      return `refgroup|${node.id}|${node.title}|${node.references.map(serializeReferenceGroupItem).join(",")}`;
    case "image-generate":
      return [
        "image-gen",
        node.id,
        node.title,
        node.model,
        node.status,
        fingerprintLargeText(node.prompt),
        node.aspectRatio,
        node.imageResolution,
        node.customImageResolution,
          node.imageQuality ?? "",
          node.thinkingLevel ?? "",
          node.variantCount,
          node.resultAssetId ?? "",
          node.resultAssetIds?.join(",") ?? "",
          node.resultStackKey ?? "",
          fingerprintLargeText(node.errorMessage ?? ""),
      ].join("|");
    case "video-generate":
      return [
        "video-gen",
        node.id,
        node.title,
        node.model,
        node.status,
        fingerprintLargeText(node.prompt),
        node.aspectRatio,
        node.videoDuration ?? "",
          node.videoPreset ?? "",
          node.videoReferenceMode ?? "",
          node.videoResolution ?? "",
          node.variantCount,
          node.resultAssetId ?? "",
          node.resultAssetIds?.join(",") ?? "",
          node.resultStackKey ?? "",
          fingerprintLargeText(node.errorMessage ?? ""),
      ].join("|");
    case "runninghub-app":
      return [
        "runninghub-app",
        node.id,
        node.title,
        node.targetType,
        node.outputType,
        node.targetId,
        node.status,
        fingerprintLargeText(node.prompt),
        fingerprintLargeText(node.accessPassword ?? ""),
        node.bindings.map(binding => [
          binding.id,
          binding.nodeId,
          binding.fieldName,
          binding.label ?? "",
          binding.source,
          binding.deliveryMode,
          binding.valueType ?? "",
          binding.enabled === false ? "off" : "on",
          binding.required === true ? "required" : "",
          binding.referenceIndex ?? "",
          binding.referenceType ?? "",
          fingerprintLargeText(binding.value),
        ].join(":")).join(","),
        node.resultAssetId ?? "",
        node.resultAssetIds?.join(",") ?? "",
        node.resultStackKey ?? "",
        fingerprintLargeText(node.errorMessage ?? ""),
      ].join("|");
    case "agent":
      return `agent|${node.id}|${node.title}|${fingerprintLargeText(node.instruction)}`;
    case "note":
      return `note|${node.id}|${node.title}|${fingerprintLargeText(node.body)}`;
    case "result":
      return [
        "result",
        node.id,
        node.title,
        node.sourceNodeId,
        node.resultStackKey,
        node.activeAssetId,
        node.resultAssetIds.join(","),
        node.asset.assetId,
        node.asset.type,
        fingerprintLargeText(node.asset.url),
      ].join("|");
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function serializeEdge(edge: BoardEdge, order: number): string {
  return `${edge.id}|${order}|${edge.kind}|${edge.from.nodeId}|${edge.from.portId}|${edge.to.nodeId}|${edge.to.portId}`;
}

/** Stable digest for graph-derived node data; ignores position, size, and viewport. */
export function buildBoardGraphContentKey(nodes: BoardNode[], edges: BoardEdge[]): string {
  const nodeLines = [...nodes]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(serializeNodeContent);
  const edgeLines = edges.map((edge, index) => serializeEdge(edge, index)).sort();
  const nodeDigest = digestParts(nodeLines);
  const edgeDigest = digestParts(edgeLines);
  return `n${nodes.length}:e${edges.length}:nh${nodeDigest}:eh${edgeDigest}`;
}

export function buildGalleryReferenceFingerprint(
  items: Array<{ id: string; status: string; type: string; url: string }>,
): string {
  const lines = items
    .filter(item => item.type === "image" || item.type === "video" || item.type === "audio")
    .map(item => `${item.id}\t${item.status}\t${fingerprintLargeText(item.url)}`)
    .sort();
  return `n${lines.length}:h${digestParts(lines)}`;
}

export function buildGalleryTaskFingerprint(
  items: Array<{ id: string; progress: number; sourceBoardNodeId?: string; status: string }>,
): string {
  const lines = items
    .filter(item => item.sourceBoardNodeId && (item.status === "pending" || item.status === "processing"))
    .map(item => `${item.sourceBoardNodeId}\t${item.id}\t${item.status}\t${item.progress}`)
    .sort();
  return `n${lines.length}:h${digestParts(lines)}`;
}
