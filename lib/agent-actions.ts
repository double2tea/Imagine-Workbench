import type { AudioOperationMode } from "@/lib/providers/model-catalog";

export const AGENT_WORKBENCH_ACTION_TYPES = [
  "none",
  "optimize_prompt",
  "generate_image",
  "edit_image",
  "generate_video",
  "generate_audio",
] as const;

export const AGENT_BOARD_ACTION_TYPES = [
  "none",
  "create_board_image_flow",
  "create_board_video_flow",
  "create_board_audio_flow",
  "create_board_note",
  "update_board_node",
  "apply_board_patch",
  "continue_image_to_video",
] as const;

export const AGENT_BOARD_PATCH_MAX_OPERATIONS = 36;

export type AgentWorkbenchActionType = (typeof AGENT_WORKBENCH_ACTION_TYPES)[number];
export type AgentBoardActionType = (typeof AGENT_BOARD_ACTION_TYPES)[number];
export type AgentToolActionType = AgentWorkbenchActionType | AgentBoardActionType;

export type AgentBoardPatchNodeKind = "prompt" | "note" | "image-generate" | "video-generate" | "audio-operation" | "agent";
export type AgentBoardPatchPortKind = "asset" | "prompt" | "result" | "agent";
export type AgentVideoReferenceMode = "reference" | "firstLast";

export interface AgentBoardPatchPoint {
  x: number;
  y: number;
}

export interface AgentBoardPatchPortRef {
  nodeId: string;
  portId: string;
  portKind: AgentBoardPatchPortKind;
}

export interface AgentStoryboardShot {
  id?: string;
  scene?: string;
  shot?: string;
  beat?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  run?: boolean;
}

export interface AgentBoardPatchCreateNodeOperation {
  op: "create_node";
  tempId: string;
  kind: AgentBoardPatchNodeKind;
  title?: string;
  position?: AgentBoardPatchPoint;
  prompt?: string;
  body?: string;
  instruction?: string;
  model?: string;
  aspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  thinkingLevel?: string;
  videoResolution?: string;
  videoDuration?: string;
  videoPreset?: string;
  videoReferenceMode?: AgentVideoReferenceMode;
  audioFormat?: string;
  audioMode?: AudioOperationMode;
  audioStylePrompt?: string;
  voiceCloneConsentAccepted?: boolean;
  voiceProfileId?: string;
  run?: boolean;
}

export interface AgentBoardPatchUpdateNodeOperation {
  op: "update_node";
  nodeId: string;
  prompt?: string;
  body?: string;
  instruction?: string;
  model?: string;
  aspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  thinkingLevel?: string;
  videoResolution?: string;
  videoDuration?: string;
  videoPreset?: string;
  videoReferenceMode?: AgentVideoReferenceMode;
  audioFormat?: string;
  audioMode?: AudioOperationMode;
  audioStylePrompt?: string;
  voiceCloneConsentAccepted?: boolean;
  voiceProfileId?: string;
}

export interface AgentBoardPatchConnectPortsOperation {
  op: "connect_ports";
  from: AgentBoardPatchPortRef;
  to: AgentBoardPatchPortRef;
}

export type AgentBoardPatchOperation =
  | AgentBoardPatchCreateNodeOperation
  | AgentBoardPatchUpdateNodeOperation
  | AgentBoardPatchConnectPortsOperation;

export interface AgentBoardPatch {
  title?: string;
  run?: boolean;
  shots?: AgentStoryboardShot[];
  operations: AgentBoardPatchOperation[];
}

export interface AgentGenerationParams {
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  referenceImageId?: string;
  imageResolution?: string;
  imageQuality?: string;
  thinkingLevel?: string;
  videoResolution?: string;
  videoDuration?: string;
  videoPreset?: string;
  videoReferenceMode?: AgentVideoReferenceMode;
  audioFormat?: string;
  audioMode?: AudioOperationMode;
  audioStylePrompt?: string;
  voiceCloneConsentAccepted?: boolean;
  voiceProfileId?: string;
  title?: string;
  body?: string;
  instruction?: string;
  nodeId?: string;
  boardPatch?: AgentBoardPatch;
  run?: boolean;
}

export interface AgentWorkbenchAction {
  type: AgentWorkbenchActionType;
  params?: AgentGenerationParams;
}

export interface AgentBoardAction {
  type: AgentBoardActionType;
  params?: AgentGenerationParams;
}

export type AgentToolAction = AgentWorkbenchAction | AgentBoardAction;
