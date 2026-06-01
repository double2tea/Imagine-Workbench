import type { AiProvider } from "./model-catalog";

export interface ProviderCredentials {
  apiKey: string;
  baseUrl: string;
}

export interface ProviderConfig {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  videoBaseUrl: string;
}

export interface ReferenceImage {
  dataUri: string;
}

export interface GenerateImageInput {
  prompt: string;
  model: string;
  aspectRatio: string;
  imageSize: string;
  thinkingLevel?: string;
  referenceImages: ReferenceImage[];
  async: boolean;
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
  resolutionName?: string;
  referenceImages: ReferenceImage[];
}

export interface GenerateVideoResult {
  operationName: string;
  source: string;
}

export interface MediaStatusResult {
  done: boolean;
  mediaType: "image" | "video";
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
  | { type: "image_url"; image_url: { url: string } };

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
