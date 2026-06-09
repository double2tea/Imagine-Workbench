import type { AiProvider, AudioOperationMode, AudioOutputKind, VideoReferenceMode } from "./model-catalog";
import type { MediaReferenceType } from "@/lib/media-references";

export interface ProviderCredentials {
  apiKey: string;
  baseUrl: string;
}

export interface ProviderConfig {
  provider: AiProvider;
  providerLabel?: string;
  apiKey: string;
  baseUrl: string;
  videoBaseUrl: string;
}

export interface ReferenceImage {
  dataUri: string;
}

export interface ReferenceMedia extends ReferenceImage {
  type: MediaReferenceType;
}

export type RunningHubTaskBindingSource = "literal" | "prompt" | "reference" | "randomSeed";
export type RunningHubTaskBindingDelivery = "raw" | "url" | "fileName";
export type RunningHubTaskBindingValueType = "text" | "number" | "boolean" | "image" | "video" | "audio" | "raw";

export interface RunningHubTaskNodeBinding {
  nodeId: string;
  fieldName: string;
  label?: string;
  source: RunningHubTaskBindingSource;
  value?: string;
  valueType?: RunningHubTaskBindingValueType;
  enabled?: boolean;
  required?: boolean;
  referenceIndex?: number;
  referenceType?: MediaReferenceType;
  deliveryMode: RunningHubTaskBindingDelivery;
}

export interface GenerateImageInput {
  prompt: string;
  model: string;
  aspectRatio: string;
  imageResolution: string;
  imageQuality?: string;
  thinkingLevel?: string;
  referenceImages: ReferenceImage[];
  async: boolean;
  runningHubAccessPassword?: string;
  runningHubNodeInfoList?: RunningHubTaskNodeBinding[];
}

export interface GenerateImageResult {
  imageUrl?: string;
  operationName?: string;
  source: string;
}

export interface GenerateVideoInput {
  prompt: string;
  model: string;
  aspectRatio: string;
  durationSeconds?: string;
  preset?: string;
  referenceMode?: VideoReferenceMode;
  resolutionName?: string;
  referenceMedia: ReferenceMedia[];
  runningHubAccessPassword?: string;
  runningHubNodeInfoList?: RunningHubTaskNodeBinding[];
}

export interface GenerateVideoResult {
  operationName: string;
  source: string;
}

export interface GenerateAudioInput {
  prompt: string;
  model: string;
  referenceMedia: ReferenceMedia[];
  runningHubAccessPassword?: string;
  runningHubNodeInfoList?: RunningHubTaskNodeBinding[];
}

export interface GenerateAudioResult {
  operationName: string;
  source: string;
}

export interface GenerateAudioOperationInput extends GenerateAudioInput {
  asrLanguage?: MimoAsrLanguage;
  mode: AudioOperationMode;
  format?: string;
  stylePrompt?: string;
  voice?: string;
  voiceProfileId?: string;
  voiceCloneConsentAccepted?: boolean;
  optimizeTextPreview?: boolean;
}

export interface DirectAudioOperationResult {
  type: "direct";
  outputKind: Extract<AudioOutputKind, "audio">;
  audioBase64: string;
  format: string;
  model: string;
  mimeType: string;
  sampleRateHz?: number;
  source: string;
}

export interface AsyncAudioOperationResult extends GenerateAudioResult {
  type: "async";
  outputKind: Extract<AudioOutputKind, "audio">;
}

export interface TranscriptAudioOperationResult {
  type: "direct";
  outputKind: Extract<AudioOutputKind, "transcript">;
  model: string;
  source: string;
  transcript: string;
}

export type GenerateAudioOperationResult = DirectAudioOperationResult | AsyncAudioOperationResult | TranscriptAudioOperationResult;

export type MimoTtsFormat = "wav" | "pcm16";

export interface MimoTtsInput {
  text: string;
  stylePrompt?: string;
  voice?: string;
  format?: MimoTtsFormat;
  optimizeTextPreview?: boolean;
}

export interface MimoTtsResult {
  audioBase64: string;
  format: MimoTtsFormat;
  model: string;
  mimeType: string;
  sampleRateHz?: number;
}

export type MimoAsrLanguage = "auto" | "zh" | "en";

export interface MimoAsrInput {
  audio: string;
  language?: MimoAsrLanguage;
}

export interface MimoAsrResult {
  model: string;
  transcript: string;
}

export type ProviderMediaType = "image" | "video" | "audio";

export interface MediaStatusResult {
  done: boolean;
  mediaType: ProviderMediaType;
  progress: number;
  status: string;
  url?: string;
  errorMessage?: string;
}

export type ChatRole = "system" | "developer" | "user" | "assistant" | "tool";

export interface ChatMessageInput {
  role: ChatRole;
  content: string | ChatContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: "stop" | "tool_calls" | "length";
}

export interface ChatCompletionWithToolsResponse {
  choices: ChatCompletionChoice[];
}
