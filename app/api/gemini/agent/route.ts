import { NextRequest, NextResponse } from "next/server";
import { createChatCompletionText, createChatCompletionWithTools, parseJsonObjectText } from "@/lib/providers/chat";
import { DEFAULT_CHAT_MODEL, DEFAULT_VISION_CHAT_MODEL, parseProviderModel } from "@/lib/providers/model-catalog";
import type { ChatMessageInput, ToolCall } from "@/lib/providers/types";
import { isRecord, optionalText, resolveProviderConfig } from "@/lib/providers/utils";
import { SKILL_REGISTRY } from "./skills";
import { executeToolCall, getAgentTools } from "./tools";

interface AgentBody {
  messages?: unknown;
  gallerySummary?: unknown;
  agentReferenceId?: unknown;
  agentReferences?: unknown;
  model?: unknown;
}

interface GalleryItem {
  id: string;
  type: string;
  prompt: string;
  aspectRatio: string;
  url?: string;
}

interface AgentReference {
  id: string;
  url: string;
}

interface AgentAction {
  type: "none" | "optimize_prompt" | "generate_image" | "edit_image" | "generate_video";
  params?: {
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    referenceImageId?: string;
  };
}

interface AgentResponsePayload {
  thought: string;
  text: string;
  activeSkills: string[];
  recommendedAction: AgentAction;
  suggestedFollowUps: string[];
}

const MAX_TOOL_ROUNDS = 3;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AgentBody;
    const messages = readMessages(body.messages);
    const gallerySummary = readGallery(body.gallerySummary);
    const agentReferences = readReferences(body.agentReferences);
    const agentReferenceId = optionalText(body.agentReferenceId);
    const latestUserMessage = [...messages].reverse().find(message => message.role === "user");
    const latestUserMsg = typeof latestUserMessage?.content === "string" ? latestUserMessage.content : "";
    const normalizedAgentRefs = [...agentReferences];
    if (normalizedAgentRefs.length === 0 && agentReferenceId) {
      const match = gallerySummary.find(item => item.id === agentReferenceId);
      normalizedAgentRefs.push({ id: agentReferenceId, url: match?.url ?? "" });
    }
    const hasImageReference = normalizedAgentRefs.some(item => item.url.length > 0);
    const modelValue = hasImageReference
      ? DEFAULT_VISION_CHAT_MODEL
      : optionalText(body.model) ?? req.headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);

    const activeSkillsList = await routeSkills(config, parsed.model, messages, latestUserMsg);
    if (latestUserMsg.length > 50 && !activeSkillsList.includes("CreativePlanner")) {
      activeSkillsList.push("CreativePlanner");
    }

    const activatedSkills = SKILL_REGISTRY.filter(skill => activeSkillsList.includes(skill.name));
    const galleryContext =
      gallerySummary.length > 0
        ? gallerySummary
            .map(
              item =>
                `- ID: "${item.id}", Type: ${item.type}, AspectRatio: ${item.aspectRatio}, Brief Prompt: "${item.prompt.slice(0, 60)}..."`,
            )
            .join("\n")
        : "No items generated in this session yet.";

    const referenceMsg =
      normalizedAgentRefs.length > 0
        ? `\n[CRITICAL USER REFERENCES]\n${normalizedAgentRefs
            .map(
              (item, idx) =>
                `- Reference [${idx + 1}]: ID "${item.id}". Use this ID for referenceImageId when recommending edit_image or generate_video.`,
            )
            .join("\n")}`
        : "";

    const skillsDetailText = activatedSkills
      .map((skill, idx) => {
        return `### Skill [${idx + 1}]: ${skill.name} (${skill.category.toUpperCase()})
- Description: ${skill.description}
- Examples:
${skill.examples.map(example => `  * ${example}`).join("\n")}`;
      })
      .join("\n\n");

    const systemInstruction =
      "You are the senior Creative Agent of the Imagine Workbench.\n" +
      "Collaborate with the user on visual creative projects and recommend exactly one workstation action when useful.\n" +
      "You have access to tools. Use them to query model capabilities before recommending a model — never guess model IDs.\n" +
      "After gathering necessary information, return ONLY valid JSON matching this shape:\n" +
      "{\"thought\":\"...\",\"text\":\"Chinese user-facing reply\",\"activeSkills\":[\"...\"],\"recommendedAction\":{\"type\":\"none|optimize_prompt|generate_image|edit_image|generate_video\",\"params\":{\"prompt\":\"...\",\"model\":\"...\",\"aspectRatio\":\"...\",\"referenceImageId\":\"...\"}},\"suggestedFollowUps\":[\"...\",\"...\"]}.\n\n" +
      `Currently Generated Workspace Assets:\n${galleryContext}\n${referenceMsg}\n\n` +
      `Active Skills:\n${skillsDetailText}`;

    const tools = getAgentTools();
    const responsePayload = await runAgentLoop(
      config,
      parsed.model,
      systemInstruction,
      buildAgentMessages(messages, normalizedAgentRefs),
      tools,
    );

    const response = normalizeAgentResponse(responsePayload, activeSkillsList);
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent interaction failure:", err);
    return NextResponse.json(
      {
        thought: "Agent provider request failed.",
        text: `抱歉，Agent 调用第三方服务失败：${message}`,
        activeSkills: ["PromptEngineer"],
        recommendedAction: { type: "none" },
        suggestedFollowUps: ["检查 API Key 和 Base URL", "切换到传统创作模式"],
      },
      { status: 500 },
    );
  }
}

async function runAgentLoop(
  config: ReturnType<typeof resolveProviderConfig>,
  model: string,
  systemInstruction: string,
  userMessages: ChatMessageInput[],
  tools: ReturnType<typeof getAgentTools>,
): Promise<unknown> {
  const conversation: ChatMessageInput[] = [
    { role: "system", content: systemInstruction },
    ...userMessages,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await createChatCompletionWithTools(config, model, conversation, tools, 0.75);
    const choice = completion.choices?.[0];
    if (!choice) throw new Error("Chat completion returned no choices");

    const toolCalls = choice.message.tool_calls;
    if (choice.finish_reason === "tool_calls" && toolCalls && toolCalls.length > 0) {
      conversation.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        const result = executeToolCall(tc.function.name, tc.function.arguments);
        conversation.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
      continue;
    }

    const content = readContent(choice.message.content);
    return parseJsonObjectText(content);
  }

  // Max rounds reached — force a final text-only completion
  const final = await createChatCompletionText(config, model, conversation, 0.75);
  return parseJsonObjectText(final);
}

function readContent(value: string | null): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error("Agent returned empty response");
}

function buildAgentMessages(messages: ChatMessageInput[], references: AgentReference[]): ChatMessageInput[] {
  const imageParts = references
    .filter(reference => reference.url.length > 0)
    .map(reference => ({ type: "image_url" as const, image_url: { url: reference.url } }));
  if (imageParts.length === 0) return messages;

  return messages.map((message, index) => {
    if (index !== messages.length - 1 || message.role !== "user" || typeof message.content !== "string") {
      return message;
    }
    return {
      role: message.role,
      content: [{ type: "text", text: message.content }, ...imageParts],
    };
  });
}

async function routeSkills(
  config: ReturnType<typeof resolveProviderConfig>,
  model: string,
  messages: ChatMessageInput[],
  latestUserMsg: string,
): Promise<string[]> {
  const registryText = SKILL_REGISTRY.map(
    skill => `- ${skill.name}: ${skill.description} (Category: ${skill.category}, Trigger: ${skill.whenToUse})`,
  ).join("\n");
  try {
    const text = await createChatCompletionText(
      config,
      model,
      [
        {
          role: "system",
          content:
            "Select the 2 to 4 most relevant skill names from the registry. Return ONLY a raw JSON string array.",
        },
        {
          role: "user",
          content: `Available Skills:\n${registryText}\n\nConversation History:\n${messages
            .slice(-4)
            .map(message => `${message.role}: ${message.content}`)
            .join("\n")}\n\nLatest Request: "${latestUserMsg}"`,
        },
      ],
      0.1,
    );
    const parsed = parseJsonObjectOrArrayText(text);
    const validNames = new Set(SKILL_REGISTRY.map(skill => skill.name));
    if (Array.isArray(parsed)) {
      const names = parsed.filter((name): name is string => typeof name === "string" && validNames.has(name));
      if (names.length > 0) return names;
    }
  } catch (err) {
    console.warn("Skill Router failed, using default fallback skills:", err);
  }
  return ["PromptEngineer", "ImageGenerator"];
}

function readMessages(value: unknown): ChatMessageInput[] {
  if (!Array.isArray(value)) throw new Error("Messages array is required");
  return value.map(item => {
    if (!isRecord(item)) throw new Error("Invalid message item");
    const role = item.role;
    const content = item.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      throw new Error("Invalid message item");
    }
    return { role, content };
  });
}

function readGallery(value: unknown): GalleryItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(item => ({
    id: typeof item.id === "string" ? item.id : "",
    type: typeof item.type === "string" ? item.type : "",
    prompt: typeof item.prompt === "string" ? item.prompt : "",
    aspectRatio: typeof item.aspectRatio === "string" ? item.aspectRatio : "",
    url: typeof item.url === "string" ? item.url : undefined,
  }));
}

function readReferences(value: unknown): AgentReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap(item => {
    if (typeof item.id === "string" && typeof item.url === "string") {
      return [{ id: item.id, url: item.url }];
    }
    return [];
  });
}

function normalizeAgentResponse(value: unknown, activeSkills: string[]): AgentResponsePayload {
  if (!isRecord(value)) throw new Error("Agent response must be a JSON object");
  return {
    thought: typeof value.thought === "string" ? value.thought : "已分析当前创作上下文。",
    text: typeof value.text === "string" ? value.text : "我已整理好下一步建议。",
    activeSkills: Array.isArray(value.activeSkills)
      ? value.activeSkills.filter((skill): skill is string => typeof skill === "string")
      : activeSkills,
    recommendedAction: normalizeAction(value.recommendedAction),
    suggestedFollowUps: Array.isArray(value.suggestedFollowUps)
      ? value.suggestedFollowUps.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizeAction(value: unknown): AgentAction {
  if (!isRecord(value)) return { type: "none" };
  const type = value.type;
  if (
    type !== "optimize_prompt" &&
    type !== "generate_image" &&
    type !== "edit_image" &&
    type !== "generate_video" &&
    type !== "none"
  ) {
    return { type: "none" };
  }

  const params = isRecord(value.params) ? value.params : {};
  return {
    type,
    params: {
      prompt: typeof params.prompt === "string" ? params.prompt : undefined,
      model: typeof params.model === "string" ? params.model : undefined,
      aspectRatio: typeof params.aspectRatio === "string" ? params.aspectRatio : undefined,
      referenceImageId: typeof params.referenceImageId === "string" ? params.referenceImageId : undefined,
    },
  };
}

function parseJsonObjectOrArrayText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return JSON.parse(trimmed);
  }
  return parseJsonObjectText(trimmed);
}
