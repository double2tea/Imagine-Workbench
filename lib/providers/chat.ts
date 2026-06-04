import type { ChatCompletionWithToolsResponse, ChatMessageInput, ProviderConfig, ToolDefinition } from "./types";
import { runningHubLlmBaseUrl } from "./runninghub";
import { postJson, requireText } from "./utils";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

export async function createChatCompletionText(
  config: ProviderConfig,
  model: string,
  messages: ChatMessageInput[],
  temperature: number,
): Promise<string> {
  const response = await postJson<ChatCompletionResponse>(chatCompletionsUrl(config), config, {
    model,
    messages,
    temperature,
    stream: false,
    ...runningHubChatDefaults(config),
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return requireText(content, "Chat completion content");
  }
  if (Array.isArray(content)) {
    return requireText(
      content
        .map(part => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
        .join(""),
      "Chat completion content",
    );
  }
  throw new Error("Chat completion response did not include text content");
}

export async function createChatCompletionWithTools(
  config: ProviderConfig,
  model: string,
  messages: ChatMessageInput[],
  tools: ToolDefinition[],
  temperature: number,
): Promise<ChatCompletionWithToolsResponse> {
  return postJson<ChatCompletionWithToolsResponse>(chatCompletionsUrl(config), config, {
    model,
    messages,
    tools,
    tool_choice: "auto",
    temperature,
    stream: false,
    ...runningHubChatDefaults(config),
  });
}

function chatCompletionsUrl(config: ProviderConfig): string {
  const baseUrl = config.provider === "runninghub" ? runningHubLlmBaseUrl(config.baseUrl) : config.baseUrl;
  return `${baseUrl}/v1/chat/completions`;
}

function runningHubChatDefaults(config: ProviderConfig): Record<string, unknown> {
  return config.provider === "runninghub" ? { reasoning_effort: "none" } : {};
}

export function parseJsonObjectText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error("Chat completion did not return valid JSON");
}
