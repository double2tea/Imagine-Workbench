export type BoardNodeKind = "asset" | "prompt" | "reference-group" | "image-generate" | "video-generate" | "runninghub-app" | "agent" | "note";
export type BoardAssetType = "image" | "video" | "audio";
export type BoardEdgeKind = "reference" | "prompt" | "result" | "agent-context";
export type BoardPortKind = "asset" | "prompt" | "result" | "agent";
export type BoardPortDirection = "input" | "output";
export type BoardGenerationStatus = "idle" | "processing" | "complete" | "failed";
export type BoardGenerateVariantCount = 1 | 2 | 4;
export type BoardReferenceRole = "general" | "start" | "end";
export type BoardVideoReferenceMode = "reference" | "firstLast";
export type BoardRunningHubTargetType = "ai-app" | "workflow";
export type BoardRunningHubOutputType = "image" | "video";
export type BoardRunningHubBindingSource = "literal" | "prompt" | "reference" | "randomSeed";
export type BoardRunningHubBindingDelivery = "raw" | "url" | "fileName";
export type BoardRunningHubBindingValueType = "text" | "number" | "boolean" | "image" | "video" | "audio" | "raw";

export interface BoardRunningHubBindingOption {
  label: string;
  value: string;
  description?: string;
}

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardSize {
  width: number;
  height: number;
}

export interface BoardViewport extends BoardPoint {
  zoom: number;
}

export interface BoardConfig {
  showGrid: boolean;
  showMiniMap: boolean;
  /** Snap node drag and placement to {@link BOARD_SNAP_GRID}. */
  snapToGrid: boolean;
}

export interface BoardSummary {
  id: string;
  title: string;
  nodeCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface BoardAssetReference {
  assetId: string;
  type: BoardAssetType;
  url: string;
  prompt: string;
  model: string;
}

export interface BoardNodeBase {
  id: string;
  position: BoardPoint;
  size: BoardSize;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardAssetNode extends BoardNodeBase {
  kind: "asset";
  asset: BoardAssetReference;
}

export interface BoardPromptNode extends BoardNodeBase {
  kind: "prompt";
  prompt: string;
}

export interface BoardReferenceGroupItem {
  assetId: string;
  model: string;
  prompt: string;
  role: BoardReferenceRole;
  type: BoardAssetType;
  url: string;
}

export interface BoardReferenceGroupNode extends BoardNodeBase {
  kind: "reference-group";
  references: BoardReferenceGroupItem[];
}

export interface BoardImageGenerateNode extends BoardNodeBase {
  kind: "image-generate";
  prompt: string;
  model: string;
  aspectRatio: string;
  customImageResolution: string;
  imageQuality?: string;
  imageResolution: string;
  thinkingLevel?: string;
  variantCount: BoardGenerateVariantCount;
  status: BoardGenerationStatus;
  resultAssetId?: string;
  resultAssetIds?: string[];
  resultStackKey?: string;
  errorMessage?: string;
}

export interface BoardVideoGenerateNode extends BoardNodeBase {
  kind: "video-generate";
  prompt: string;
  model: string;
  aspectRatio: string;
  videoDuration?: string;
  videoPreset?: string;
  videoReferenceMode?: BoardVideoReferenceMode;
  videoResolution?: string;
  variantCount: BoardGenerateVariantCount;
  status: BoardGenerationStatus;
  resultAssetId?: string;
  resultAssetIds?: string[];
  resultStackKey?: string;
  errorMessage?: string;
}

export interface BoardRunningHubNodeInfoBinding {
  id: string;
  nodeId: string;
  nodeName?: string;
  fieldName: string;
  fieldData?: string;
  description?: string;
  descriptionEn?: string;
  label?: string;
  source: BoardRunningHubBindingSource;
  value: string;
  valueType?: BoardRunningHubBindingValueType;
  options?: BoardRunningHubBindingOption[];
  enabled?: boolean;
  required?: boolean;
  referenceIndex?: number;
  referenceType?: BoardAssetType;
  deliveryMode: BoardRunningHubBindingDelivery;
}

export interface BoardRunningHubAppNode extends BoardNodeBase {
  kind: "runninghub-app";
  targetType: BoardRunningHubTargetType;
  outputType: BoardRunningHubOutputType;
  targetId: string;
  accessPassword?: string;
  prompt: string;
  bindings: BoardRunningHubNodeInfoBinding[];
  status: BoardGenerationStatus;
  resultAssetId?: string;
  resultAssetIds?: string[];
  resultStackKey?: string;
  errorMessage?: string;
}

export interface BoardRunningHubAppSchemaResult {
  webappId: string;
  name?: string;
  bindings: BoardRunningHubNodeInfoBinding[];
}

export interface BoardAgentNode extends BoardNodeBase {
  kind: "agent";
  instruction: string;
}

export interface BoardNoteNode extends BoardNodeBase {
  kind: "note";
  body: string;
}

export type BoardNode =
  | BoardAssetNode
  | BoardPromptNode
  | BoardReferenceGroupNode
  | BoardImageGenerateNode
  | BoardVideoGenerateNode
  | BoardRunningHubAppNode
  | BoardAgentNode
  | BoardNoteNode;

export type BoardGenerateNode = BoardImageGenerateNode | BoardVideoGenerateNode;
export type BoardExecutableNode = BoardGenerateNode | BoardRunningHubAppNode;

export type BoardGenerateNodeUpdate = Partial<{
  aspectRatio: string;
  customImageResolution: string;
  errorMessage: string;
  imageQuality: string;
  imageResolution: string;
  model: string;
  prompt: string;
  resultAssetId: string;
  resultAssetIds: string[];
  resultStackKey: string;
  status: BoardGenerationStatus;
  thinkingLevel: string;
  variantCount: BoardGenerateVariantCount;
  videoDuration: string;
  videoPreset: string;
  videoReferenceMode: BoardVideoReferenceMode;
  videoResolution: string;
}>;

export type BoardRunningHubAppNodeUpdate = Partial<{
  accessPassword: string;
  bindings: BoardRunningHubNodeInfoBinding[];
  errorMessage: string;
  outputType: BoardRunningHubOutputType;
  prompt: string;
  resultAssetId: string;
  resultAssetIds: string[];
  resultStackKey: string;
  status: BoardGenerationStatus;
  targetId: string;
  targetType: BoardRunningHubTargetType;
}>;

export interface BoardPortRef {
  nodeId: string;
  portId: string;
  portKind: BoardPortKind;
}

export interface BoardEdge {
  id: string;
  kind: BoardEdgeKind;
  from: BoardPortRef;
  to: BoardPortRef;
  createdAt: string;
}

export interface BoardDocument {
  id: string;
  title: string;
  config: BoardConfig;
  nodes: BoardNode[];
  edges: BoardEdge[];
  viewport: BoardViewport;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetNodeInput {
  asset: BoardAssetReference;
  position?: BoardPoint;
  size?: BoardSize;
  title?: string;
}

export interface CreateNoteNodeInput {
  body?: string;
  position?: BoardPoint;
  size?: BoardSize;
  title?: string;
}

export interface CreatePromptNodeInput {
  prompt?: string;
  position?: BoardPoint;
  size?: BoardSize;
  title?: string;
}

export interface CreateReferenceGroupNodeInput {
  position?: BoardPoint;
  references?: BoardReferenceGroupItem[];
  size?: BoardSize;
  title?: string;
}

export interface CreateGenerateNodeInput {
  kind: "image-generate" | "video-generate";
  prompt?: string;
  model: string;
  aspectRatio: string;
  customImageResolution?: string;
  imageQuality?: string;
  imageResolution?: string;
  thinkingLevel?: string;
  variantCount?: BoardGenerateVariantCount;
  videoDuration?: string;
  videoPreset?: string;
  videoReferenceMode?: BoardVideoReferenceMode;
  videoResolution?: string;
  position?: BoardPoint;
  size?: BoardSize;
  title?: string;
}

export interface CreateAgentNodeInput {
  instruction?: string;
  position?: BoardPoint;
  size?: BoardSize;
  title?: string;
}

export interface CreateRunningHubAppNodeInput {
  accessPassword?: string;
  bindings?: BoardRunningHubNodeInfoBinding[];
  outputType?: BoardRunningHubOutputType;
  position?: BoardPoint;
  prompt?: string;
  size?: BoardSize;
  targetId?: string;
  targetType?: BoardRunningHubTargetType;
  title?: string;
}

export interface BoardPortDefinition {
  id: string;
  label: string;
  kind: BoardPortKind;
  direction: BoardPortDirection;
}
