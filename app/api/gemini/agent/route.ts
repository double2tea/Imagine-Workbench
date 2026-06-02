import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import type { AgentSurface } from "@/lib/agent-context";
import { createChatCompletionText, createChatCompletionWithTools, parseJsonObjectText } from "@/lib/providers/chat";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_VISION_CHAT_MODEL,
  MODEL_CAPABILITIES,
  parseProviderModel,
} from "@/lib/providers/model-catalog";
import type { ChatMessageInput } from "@/lib/providers/types";
import { resolveProviderConfig } from "@/lib/providers/utils";
import { SKILL_REGISTRY } from "./skills";
import { executeToolCall, getAgentTools, type ToolContext } from "./tools";

export const runtime = "edge";

// -- Zod schemas --

const agentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const boardPortRefSchema = z.object({
  nodeId: z.string(),
  portId: z.string(),
  portKind: z.enum(["asset", "prompt", "result", "agent"]),
});

const boardContextSchema = z.object({
  boardId: z.string(),
  title: z.string(),
  selectedNodeId: z.string().nullable(),
  selectedEdgeId: z.string().nullable(),
  nodes: z.array(z.object({
    id: z.string(),
    kind: z.enum(["asset", "prompt", "reference-group", "image-generate", "video-generate", "agent", "note"]),
    title: z.string(),
    prompt: z.string().optional(),
    model: z.string().optional(),
    aspectRatio: z.string().optional(),
    status: z.string().optional(),
    resultAssetId: z.string().optional(),
    assetId: z.string().optional(),
    assetType: z.string().optional(),
    body: z.string().optional(),
    instruction: z.string().optional(),
  })),
  edges: z.array(z.object({
    id: z.string(),
    kind: z.enum(["reference", "prompt", "result", "agent-context"]),
    from: boardPortRefSchema,
    to: boardPortRefSchema,
  })),
});

const agentBodySchema = z.object({
  messages: z.array(agentMessageSchema).min(1),
  surface: z.enum(["workbench", "board"]).optional().default("workbench"),
  boardContext: boardContextSchema.optional(),
  gallerySummary: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        prompt: z.string(),
        aspectRatio: z.string(),
      }),
    )
    .optional()
    .default([]),
  agentReferences: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
      }),
    )
    .optional()
    .default([]),
  agentReferenceId: z.string().optional(),
  model: z.string().optional(),
});

const agentActionSchema = z.object({
  type: z.enum(["none", "optimize_prompt", "generate_image", "edit_image", "generate_video"]),
  params: z
    .object({
      prompt: z.string().optional(),
      model: z.string().optional(),
      aspectRatio: z.string().optional(),
      referenceImageId: z.string().optional(),
    })
    .optional(),
});

const agentBoardActionSchema = z.object({
  type: z.enum(["none", "create_board_image_flow", "create_board_video_flow", "create_board_note"]),
  params: z
    .object({
      prompt: z.string().optional(),
      model: z.string().optional(),
      aspectRatio: z.string().optional(),
      referenceImageId: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      run: z.boolean().optional(),
    })
    .optional(),
});

const agentResponseSchema = z.object({
  thought: z.string().default("已分析当前创作上下文。"),
  text: z.string().default("我已整理好下一步建议。"),
  activeSkills: z.array(z.string()).default([]),
  recommendedAction: agentActionSchema.default({ type: "none" }),
  boardAction: agentBoardActionSchema.default({ type: "none" }),
  suggestedFollowUps: z.array(z.string()).default([]),
});

// -- Model ID validation --

const VALID_MODEL_IDS = new Set(MODEL_CAPABILITIES.map(c => c.value));

function validateActionModel(
  action: { type: string; params?: { model?: string; aspectRatio?: string } },
): void {
  const model = action.params?.model;
  if (model && !VALID_MODEL_IDS.has(model)) {
    delete action.params!.model;
    console.warn(`Agent recommended unknown model "${model}", removed from action params`);
  }
}

function validateActiveSkills(skills: string[]): string[] {
  const valid = new Set(SKILL_REGISTRY.map(s => s.name));
  return skills.filter(s => valid.has(s));
}

const MAX_TOOL_ROUNDS = 3;

interface AgentToolCallSummary {
  name: string;
  args: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const body = agentBodySchema.parse(raw);

    const messages: ChatMessageInput[] = body.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
    const galleryItems = body.gallerySummary;
    const agentReferences = body.agentReferences;
    const agentReferenceId = body.agentReferenceId;
    const surface: AgentSurface = body.surface;

    const latestUserMessage = [...messages].reverse().find(m => m.role === "user");
    const latestUserMsg =
      typeof latestUserMessage?.content === "string" ? latestUserMessage.content : "";

    const normalizedAgentRefs = [...agentReferences];
    if (normalizedAgentRefs.length === 0 && agentReferenceId) {
      normalizedAgentRefs.push({ id: agentReferenceId, url: "" });
    }

    const hasImageReference = normalizedAgentRefs.some(item => item.url.length > 0);
    const modelValue = hasImageReference
      ? DEFAULT_VISION_CHAT_MODEL
      : body.model ?? req.headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);

    const skillsText = SKILL_REGISTRY.map(
      skill => `- ${skill.name} (${skill.category}): ${skill.whenToUse}`,
    ).join("\n");
    const modelsText = MODEL_CAPABILITIES.map(
      model =>
        `- ${model.value}: kind=${model.kind}, provider=${model.provider}, references=${model.supportsReferences}, async=${model.supportsAsync}, sizes=[${model.sizes
          .map(option => option.value)
          .join(", ")}], ratios=[${model.aspectRatios
          .map(option => option.value)
          .join(", ")}], videoReferenceMode=${model.videoReferenceMode}, maxReferenceImages=${model.maxReferenceImages}`,
    ).join("\n");
    const galleryText =
      galleryItems.length > 0
        ? galleryItems
            .slice(0, 20)
            .map(item => `- ${item.id}: type=${item.type}, aspectRatio=${item.aspectRatio}, prompt="${item.prompt.slice(0, 80)}"`)
            .join("\n")
        : "No generated assets yet.";
    const referenceMsg =
      normalizedAgentRefs.length > 0
        ? `\n[USER REFERENCES]\n${normalizedAgentRefs
            .map((item, idx) => `- Ref [${idx + 1}]: ID "${item.id}"`)
            .join("\n")}\n`
        : "";
    const boardMsg = surface === "board"
      ? "\n## Board Surface\n" +
        "The user is operating a spatial board. Use get_board_context / get_connected_context before recommending board changes.\n" +
        "For board mutations, prefer boardAction over recommendedAction. Do not invent a general DAG or ComfyUI workflow.\n" +
        "Allowed boardAction.type values: none, create_board_image_flow, create_board_video_flow, create_board_note.\n" +
        "create_board_image_flow/create_board_video_flow should include params.prompt and may include params.model, params.aspectRatio, params.referenceImageId, params.run.\n"
      : "\n## Workbench Surface\nUse recommendedAction for normal workstation actions. Keep boardAction.type as none.\n";

    const systemInstruction =
      "You are the senior Creative Agent of the Imagine Workbench.\n" +
      "Collaborate with the user on visual creative projects and recommend exactly one executable action when useful.\n\n" +
      "## Tools\n" +
      "Use tool calls to inspect skills, model capabilities, and gallery assets before recommending an action.\n" +
      "- Call get_skill_info before activating a skill whose details matter.\n" +
      "- Call query_models before recommending a generation model.\n" +
      "- Call get_gallery_assets when the user references previous assets.\n\n" +
      "- On board surface, call get_board_context or get_connected_context before returning boardAction.\n" +
      "- Call get_prompt_templates when the user asks for reusable prompt templates.\n\n" +
      "## Skill Registry\n" +
      `${skillsText}\n\n` +
      boardMsg +
      "\n" +
      "## Model Catalog\n" +
      "Use only these model IDs when recommending a workstation action. Do not guess model IDs.\n" +
      `${modelsText}\n\n` +
      "## Current Gallery Assets\n" +
      `${galleryText}\n\n` +
      "## Output\n" +
      "Return ONLY valid JSON:\n" +
      '{"thought":"...","text":"Chinese user-facing reply","activeSkills":["..."],"recommendedAction":{"type":"none|optimize_prompt|generate_image|edit_image|generate_video","params":{"prompt":"...","model":"...","aspectRatio":"...","referenceImageId":"..."}},"boardAction":{"type":"none|create_board_image_flow|create_board_video_flow|create_board_note","params":{"prompt":"...","model":"...","aspectRatio":"...","referenceImageId":"...","title":"...","body":"...","run":true}},"suggestedFollowUps":["...","..."]}\n\n' +
      referenceMsg;

    const tools = getAgentTools();
    const toolCtx: ToolContext = { boardContext: body.boardContext, galleryItems };
    const { payload, toolCalls } = await runAgentLoop(
      config,
      parsed.model,
      systemInstruction,
      buildAgentMessages(messages, normalizedAgentRefs),
      tools,
      toolCtx,
    );

    const parsedResponse = agentResponseSchema.parse(payload);
    validateActionModel(parsedResponse.recommendedAction);
    validateActionModel(parsedResponse.boardAction);
    if (surface === "board") {
      parsedResponse.recommendedAction = { type: "none" };
    } else {
      parsedResponse.boardAction = { type: "none" };
    }
    parsedResponse.activeSkills = validateActiveSkills(parsedResponse.activeSkills);

    if (parsedResponse.activeSkills.length === 0) {
      parsedResponse.activeSkills = surface === "board"
        ? ["BoardContextRetriever", "BoardComposer"]
        : ["PromptEngineer", "ImageGenerator"];
    }

    return NextResponse.json({ ...parsedResponse, toolCalls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent interaction failure:", err);

    if (err instanceof z.ZodError) {
      console.error("Zod validation error:", JSON.stringify(err.issues, null, 2));
      return NextResponse.json({ error: "Invalid agent request", details: err.issues }, { status: 400 });
    }

    return NextResponse.json({
      thought: "Agent provider request failed.",
      text: `抱歉，Agent 调用第三方服务失败：${message}`,
      activeSkills: ["PromptEngineer"],
      recommendedAction: { type: "none" as const },
      suggestedFollowUps: ["检查 API Key 和 Base URL", "切换到传统创作模式"],
    });
  }
}

async function runAgentLoop(
  config: ReturnType<typeof resolveProviderConfig>,
  model: string,
  systemInstruction: string,
  userMessages: ChatMessageInput[],
  tools: ReturnType<typeof getAgentTools>,
  toolCtx: ToolContext,
): Promise<{ payload: unknown; toolCalls: AgentToolCallSummary[] }> {
  const conversation: ChatMessageInput[] = [
    { role: "system", content: systemInstruction },
    ...userMessages,
  ];
  const toolCallLog: AgentToolCallSummary[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await createChatCompletionWithTools(config, model, conversation, tools, 0.75);
    const choice = completion.choices?.[0];
    if (!choice) throw new Error("Chat completion returned no choices");

    const requestedCalls = choice.message.tool_calls;
    if (choice.finish_reason === "tool_calls" && requestedCalls && requestedCalls.length > 0) {
      conversation.push({ role: "assistant", content: null, tool_calls: requestedCalls });
      for (const toolCall of requestedCalls) {
        const result = executeToolCall(toolCall.function.name, toolCall.function.arguments, toolCtx);
        conversation.push({ role: "tool", tool_call_id: toolCall.id, content: result });
        toolCallLog.push({
          name: toolCall.function.name,
          args: JSON.parse(toolCall.function.arguments),
        });
      }
      continue;
    }

    return { payload: parseJsonObjectText(readContent(choice.message.content)), toolCalls: toolCallLog };
  }

  const final = await createChatCompletionText(config, model, conversation, 0.75);
  return { payload: parseJsonObjectText(final), toolCalls: toolCallLog };
}

function readContent(value: string | null): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error("Agent returned empty response");
}

function buildAgentMessages(
  messages: ChatMessageInput[],
  references: Array<{ id: string; url: string }>,
): ChatMessageInput[] {
  const imageParts = references
    .filter(ref => ref.url.length > 0)
    .map(ref => ({ type: "image_url" as const, image_url: { url: ref.url } }));
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
