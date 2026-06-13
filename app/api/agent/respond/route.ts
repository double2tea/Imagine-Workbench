import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import type { AgentSurface } from "@/lib/agent-context";
import { AGENT_BOARD_ACTION_TYPES, AGENT_WORKBENCH_ACTION_TYPES } from "@/lib/agent-actions";
import { ChatJsonParseError, createChatCompletionText, createChatCompletionWithTools, parseJsonObjectText } from "@/lib/providers/chat";
import {
  getSendableAgentMediaReferences,
  parseAgentAudioDataUrl,
  type AgentReferenceInput,
} from "@/lib/agent-chat-model";
import { getMediaReferenceType, mediaReferenceLabel } from "@/lib/media-references";
import {
  DEFAULT_CHAT_MODEL,
  getListedModelCapabilities,
  parseProviderModel,
  ProviderModelParseError,
} from "@/lib/providers/model-catalog";
import type { ChatContentPart, ChatMessageInput } from "@/lib/providers/types";
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

const audioOperationModeSchema = z.enum(["tts", "voice_design", "voice_clone", "music", "sfx", "asr"]);
const asrLanguageSchema = z.enum(["auto", "zh", "en"]);

const boardContextSchema = z.object({
  boardId: z.string(),
  title: z.string(),
  selectedNodeId: z.string().nullable(),
  selectedEdgeId: z.string().nullable(),
  nodes: z.array(z.object({
    id: z.string(),
    kind: z.enum(["asset", "prompt", "reference-group", "group", "image-generate", "video-generate", "audio-operation", "runninghub-app", "agent", "note", "result"]),
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
        type: z.enum(["image", "video", "audio"]).optional(),
        url: z.string(),
      }),
    )
    .optional()
    .default([]),
  agentReferenceId: z.string().optional(),
  model: z.string().optional(),
});

const agentActionSchema = z.object({
  type: z.enum(AGENT_WORKBENCH_ACTION_TYPES),
  params: z
    .object({
      prompt: z.string().optional(),
      model: z.string().optional(),
      aspectRatio: z.string().optional(),
      referenceImageId: z.string().optional(),
      imageResolution: z.string().optional(),
      imageQuality: z.string().optional(),
      thinkingLevel: z.string().optional(),
      videoResolution: z.string().optional(),
      videoDuration: z.string().optional(),
      videoPreset: z.string().optional(),
      videoReferenceMode: z.enum(["reference", "firstLast"]).optional(),
      audioFormat: z.string().optional(),
      audioMode: audioOperationModeSchema.optional(),
      audioStylePrompt: z.string().optional(),
      asrLanguage: asrLanguageSchema.optional(),
      voiceCloneConsentAccepted: z.boolean().optional(),
      voiceProfileId: z.string().optional(),
    })
    .optional(),
});

const agentBoardPatchPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const agentBoardPatchPortRefSchema = z.object({
  nodeId: z.string(),
  portId: z.string(),
  portKind: z.enum(["asset", "prompt", "result", "agent"]),
});

const agentBoardPatchCreateNodeSchema = z.object({
  op: z.literal("create_node"),
  tempId: z.string(),
  kind: z.enum(["prompt", "note", "image-generate", "video-generate", "audio-operation", "agent"]),
  title: z.string().optional(),
  position: agentBoardPatchPointSchema.optional(),
  prompt: z.string().optional(),
  body: z.string().optional(),
  instruction: z.string().optional(),
  model: z.string().optional(),
  aspectRatio: z.string().optional(),
  imageResolution: z.string().optional(),
  imageQuality: z.string().optional(),
  thinkingLevel: z.string().optional(),
  videoResolution: z.string().optional(),
  videoDuration: z.string().optional(),
  videoPreset: z.string().optional(),
  videoReferenceMode: z.enum(["reference", "firstLast"]).optional(),
  audioFormat: z.string().optional(),
  audioMode: audioOperationModeSchema.optional(),
  audioStylePrompt: z.string().optional(),
  asrLanguage: asrLanguageSchema.optional(),
  voiceCloneConsentAccepted: z.boolean().optional(),
  voiceProfileId: z.string().optional(),
  run: z.boolean().optional(),
});

const agentBoardPatchUpdateNodeSchema = z.object({
  op: z.literal("update_node"),
  nodeId: z.string(),
  prompt: z.string().optional(),
  body: z.string().optional(),
  instruction: z.string().optional(),
  model: z.string().optional(),
  aspectRatio: z.string().optional(),
  imageResolution: z.string().optional(),
  imageQuality: z.string().optional(),
  thinkingLevel: z.string().optional(),
  videoResolution: z.string().optional(),
  videoDuration: z.string().optional(),
  videoPreset: z.string().optional(),
  videoReferenceMode: z.enum(["reference", "firstLast"]).optional(),
  audioFormat: z.string().optional(),
  audioMode: audioOperationModeSchema.optional(),
  audioStylePrompt: z.string().optional(),
  asrLanguage: asrLanguageSchema.optional(),
  voiceCloneConsentAccepted: z.boolean().optional(),
  voiceProfileId: z.string().optional(),
});

const agentBoardPatchConnectPortsSchema = z.object({
  op: z.literal("connect_ports"),
  from: agentBoardPatchPortRefSchema,
  to: agentBoardPatchPortRefSchema,
});

const agentBoardPatchSchema = z.object({
  title: z.string().optional(),
  run: z.boolean().optional(),
  shots: z.array(z.object({
    id: z.string().optional(),
    scene: z.string().optional(),
    shot: z.string().optional(),
    beat: z.string().optional(),
    imagePrompt: z.string().optional(),
    videoPrompt: z.string().optional(),
    run: z.boolean().optional(),
  })).optional(),
  operations: z.array(z.discriminatedUnion("op", [
    agentBoardPatchCreateNodeSchema,
    agentBoardPatchUpdateNodeSchema,
    agentBoardPatchConnectPortsSchema,
  ])),
});

const agentBoardActionSchema = z.object({
  type: z.enum(AGENT_BOARD_ACTION_TYPES),
  params: z
    .object({
      nodeId: z.string().optional(),
      prompt: z.string().optional(),
      model: z.string().optional(),
      aspectRatio: z.string().optional(),
      referenceImageId: z.string().optional(),
      imageResolution: z.string().optional(),
      imageQuality: z.string().optional(),
      thinkingLevel: z.string().optional(),
      videoResolution: z.string().optional(),
      videoDuration: z.string().optional(),
      videoPreset: z.string().optional(),
      videoReferenceMode: z.enum(["reference", "firstLast"]).optional(),
      audioFormat: z.string().optional(),
      audioMode: audioOperationModeSchema.optional(),
      audioStylePrompt: z.string().optional(),
      asrLanguage: asrLanguageSchema.optional(),
      voiceCloneConsentAccepted: z.boolean().optional(),
      voiceProfileId: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      instruction: z.string().optional(),
      boardPatch: agentBoardPatchSchema.optional(),
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

const VALID_MODEL_IDS = new Set(getListedModelCapabilities().map(c => c.value));

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
const AGENT_CHAT_RESPONSE_OPTIONS = { responseFormat: { type: "json_object" as const } };

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

    const sendableAgentRefs = getSendableAgentMediaReferences(
      agentReferences,
      agentReferenceId,
      undefined,
    );
    const modelValue = body.model ?? req.headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);

    const referenceMsg =
      sendableAgentRefs.length > 0
        ? `\n[USER REFERENCES]\n${sendableAgentRefs
            .map((item, idx) => `- Ref [${idx + 1}]: ${mediaReferenceLabel(getMediaReferenceType(item))} ID "${item.id}"`)
            .join("\n")}\n`
        : "";
    const contextSummary = formatAgentRuntimeSummary(surface, body.boardContext, galleryItems, sendableAgentRefs);
    const boardMsg = surface === "board"
      ? "\n## Board Surface\n" +
        "The user is operating a spatial board. Read board details progressively: call get_board_context(summary) for broad board questions and get_connected_context for selected-node work.\n" +
        "For board mutations, prefer boardAction over recommendedAction. Do not invent a general DAG or ComfyUI workflow.\n" +
        "Allowed boardAction.type values: none, create_board_image_flow, create_board_video_flow, create_board_audio_flow, create_board_note, update_board_node, apply_board_patch, continue_image_to_video.\n" +
        "create_board_image_flow/create_board_video_flow/create_board_audio_flow should include params.prompt except ASR transcription, and may include params.model, params.aspectRatio, params.referenceImageId, params.run. Audio actions may include params.audioMode, params.audioFormat, params.audioStylePrompt, params.voiceProfileId, params.voiceCloneConsentAccepted, params.asrLanguage.\n" +
        "For audio board planning, only use audio-operation functions returned by query_models({kind:\"audio\"}). MiMo currently supports tts, voice_design, voice_clone, and asr; RunningHub audio belongs to RunningHub AI App / Workflow nodes, not audio-operation nodes.\n" +
        "Use update_board_node when the user asks to revise the selected/current board node or a specific node. Include params.nodeId when known; otherwise omit it to target the current selection. Use params.prompt for Prompt and generation nodes, params.body for Note nodes, and params.instruction for Agent nodes. If no target can be resolved, return boardAction.type none and ask the user to select a node.\n" +
        "Use apply_board_patch for multi-shot storyboard plans. Put the plan in params.boardPatch.operations. Allowed operations are create_node, update_node, connect_ports. Use tempId for created nodes and refer to it from later connect_ports operations. Keep patches to 36 operations or fewer; split larger scripts into follow-ups. Default params.boardPatch.run to false unless the user explicitly asks to run generation.\n" +
        "Use continue_image_to_video only when the target is an existing image asset or completed image generation result. Include params.nodeId when known, plus params.prompt and a video params.model.\n"
      : "\n## Workbench Surface\nUse recommendedAction for normal workstation actions. Keep boardAction.type as none.\n";

    const systemInstruction =
      "You are the senior Creative Agent of the Imagine Workbench.\n" +
      "Collaborate with the user on visual creative projects and recommend exactly one executable action when useful.\n\n" +
      "## Context Policy\n" +
      "Use progressive disclosure. Start from the user's latest message and the Runtime Summary. Do not assume full gallery, board, model, or skill details.\n" +
      "When the user asks what you can do or which tools you have, call get_agent_capabilities and answer without recommending an executable action unless they explicitly ask you to do one.\n" +
      "Before selecting a model or explaining model parameters, call query_models for the relevant kind. Use only returned model IDs.\n" +
      "Only call get_gallery_assets when prior generated assets matter. Only call board context tools when the board structure matters.\n\n" +
      "## Tools\n" +
      "Use tool calls to inspect Agent capabilities, skills, model capabilities, gallery assets, board context, and templates.\n" +
      "- Call get_agent_capabilities for Agent/tool/capability questions.\n" +
      "- Call get_skill_info before activating a skill whose details matter.\n" +
      "- Call query_models before recommending a generation model.\n" +
      "- Call get_gallery_assets when the user references previous assets.\n\n" +
      "## Audio Planning\n" +
      "For script or video-production requests, plan audio as first-class media only through supported audio functions returned by query_models({kind:\"audio\"}). Narration/dialogue uses audioMode tts, described custom voices use voice_design with audioStylePrompt, authorized reference-voice work uses voice_clone with an audio reference, and transcription uses asr with an audio reference. Do not invent music/SFX/RunningHub audio-operation capabilities.\n\n" +
      "- On board surface, call get_board_context or get_connected_context before returning boardAction.\n" +
      "- Call get_prompt_blueprint with screenplay-draft, script-analysis, shot-breakdown, or storyboard-board-patch when the user asks for script/storyboard workflow planning.\n" +
      "- Call get_prompt_templates when the user asks for reusable prompt templates.\n\n" +
      boardMsg +
      "\n" +
      "## Runtime Summary\n" +
      `${contextSummary}\n\n` +
      "## Output\n" +
      "Return ONLY valid JSON:\n" +
      '{"thought":"...","text":"Chinese user-facing reply","activeSkills":["..."],"recommendedAction":{"type":"none|optimize_prompt|generate_image|edit_image|generate_video|generate_audio","params":{"prompt":"...","model":"...","aspectRatio":"...","referenceImageId":"...","imageResolution":"...","imageQuality":"...","thinkingLevel":"...","videoResolution":"...","videoDuration":"...","videoPreset":"...","videoReferenceMode":"reference|firstLast","audioMode":"tts|voice_design|voice_clone|music|sfx|asr","audioFormat":"wav","audioStylePrompt":"...","voiceProfileId":"...","voiceCloneConsentAccepted":true}},"boardAction":{"type":"none|create_board_image_flow|create_board_video_flow|create_board_audio_flow|create_board_note|update_board_node|apply_board_patch|continue_image_to_video","params":{"nodeId":"...","prompt":"...","model":"...","aspectRatio":"...","referenceImageId":"...","imageResolution":"...","imageQuality":"...","thinkingLevel":"...","videoResolution":"...","videoDuration":"...","videoPreset":"...","videoReferenceMode":"reference|firstLast","audioMode":"tts|voice_design|voice_clone|music|sfx|asr","audioFormat":"wav","audioStylePrompt":"...","voiceProfileId":"...","voiceCloneConsentAccepted":true,"title":"...","body":"...","instruction":"...","boardPatch":{"title":"...","run":false,"shots":[{"id":"S1","scene":"...","shot":"...","beat":"...","imagePrompt":"...","videoPrompt":"...","run":false}],"operations":[{"op":"create_node","tempId":"shot1_prompt","kind":"prompt","title":"S1 Prompt","prompt":"...","position":{"x":120,"y":160}},{"op":"create_node","tempId":"shot1_audio","kind":"audio-operation","title":"S1 Audio","prompt":"...","model":"...","audioMode":"tts","audioFormat":"wav","run":false,"position":{"x":520,"y":160}},{"op":"connect_ports","from":{"nodeId":"shot1_prompt","portId":"prompt-out","portKind":"prompt"},"to":{"nodeId":"shot1_audio","portId":"prompt-in","portKind":"prompt"}}]},"run":true}},"suggestedFollowUps":["...","..."]}\n\n' +
      referenceMsg;

    const tools = getAgentTools();
    const toolCtx: ToolContext = { boardContext: body.boardContext, galleryItems };
    const { payload, toolCalls } = await runAgentLoop(
      config,
      parsed.model,
      systemInstruction,
      buildAgentMessages(messages, sendableAgentRefs),
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

    if (parsedResponse.activeSkills.length === 0 && hasExecutableAgentAction(parsedResponse.recommendedAction, parsedResponse.boardAction)) {
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

    if (err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message }, { status: 400 });
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

function hasExecutableAgentAction(
  recommendedAction: z.infer<typeof agentActionSchema>,
  boardAction: z.infer<typeof agentBoardActionSchema>,
): boolean {
  return recommendedAction.type !== "none" || boardAction.type !== "none";
}

function formatAgentRuntimeSummary(
  surface: AgentSurface,
  boardContext: z.infer<typeof boardContextSchema> | undefined,
  galleryItems: Array<{ type: string }>,
  references: AgentReferenceInput[],
): string {
  const galleryCounts = countValues(galleryItems.map(item => item.type));
  const referenceCounts = countValues(references.map(reference => getMediaReferenceType(reference)));
  const boardSummary = boardContext
    ? {
        boardId: boardContext.boardId,
        edgeCount: boardContext.edges.length,
        nodeCount: boardContext.nodes.length,
        nodeKinds: countValues(boardContext.nodes.map(node => node.kind)),
        selectedEdgeId: boardContext.selectedEdgeId,
        selectedNodeId: boardContext.selectedNodeId,
        title: boardContext.title,
      }
    : null;

  return JSON.stringify({
    surface,
    board: boardSummary,
    gallery: {
      count: galleryItems.length,
      types: galleryCounts,
    },
    userReferences: {
      count: references.length,
      types: referenceCounts,
    },
  });
}

function countValues(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
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
    const completion = await createChatCompletionWithTools(
      config,
      model,
      conversation,
      tools,
      0.75,
      AGENT_CHAT_RESPONSE_OPTIONS,
    );
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

    return { payload: parseAgentPayloadText(readContent(choice.message.content)), toolCalls: toolCallLog };
  }

  const final = await createChatCompletionText(config, model, conversation, 0.75, AGENT_CHAT_RESPONSE_OPTIONS);
  return { payload: parseAgentPayloadText(final), toolCalls: toolCallLog };
}

function parseAgentPayloadText(text: string): unknown {
  try {
    return parseJsonObjectText(text);
  } catch (error) {
    if (!(error instanceof ChatJsonParseError)) throw error;
    if (error.kind !== "missing") throw error;
    const fallbackText = text.trim();
    return {
      thought: "Provider returned plain text instead of Agent JSON.",
      text: fallbackText || "我收到了模型回复，但它没有返回可执行的 Agent JSON。",
      activeSkills: [],
      recommendedAction: { type: "none" },
      boardAction: { type: "none" },
      suggestedFollowUps: [],
    };
  }
}

function readContent(value: string | null): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error("Agent returned empty response");
}

function buildAgentMessages(
  messages: ChatMessageInput[],
  references: AgentReferenceInput[],
): ChatMessageInput[] {
  const mediaParts = references
    .filter(ref => ref.url.length > 0)
    .map(createAgentMediaContentPart)
    .filter((part): part is ChatContentPart => part !== null);
  if (mediaParts.length === 0) return messages;

  return messages.map((message, index) => {
    if (index !== messages.length - 1 || message.role !== "user" || typeof message.content !== "string") {
      return message;
    }
    return {
      role: message.role,
      content: [{ type: "text", text: message.content }, ...mediaParts],
    };
  });
}

function createAgentMediaContentPart(reference: AgentReferenceInput): ChatContentPart | null {
  const type = getMediaReferenceType(reference);
  if (type === "image") {
    return { type: "image_url", image_url: { url: reference.url } };
  }
  if (type === "video") {
    return { type: "video_url", video_url: { url: reference.url } };
  }

  const audio = parseAgentAudioDataUrl(reference.url);
  return audio ? { type: "input_audio", input_audio: audio } : null;
}
