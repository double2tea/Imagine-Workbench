import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/errors";
import { getSendableAgentMediaReferences, parseAgentAudioDataUrl } from "@/lib/agent-chat-model";
import { createChatCompletionText } from "@/lib/providers/chat";
import { DEFAULT_CHAT_MODEL, parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { resolveProviderConfigForRequest } from "@/lib/providers/team-config";
import type { ChatContentPart, ChatMessageInput } from "@/lib/providers/types";
import { getMediaReferenceType, type MediaReferenceType } from "@/lib/media-references";

export const runtime = "nodejs";

const mediaReferenceTypeSchema = z.enum(["image", "video", "audio"]);

const promptTextBodySchema = z.object({
  locale: z.enum(["zh", "en"]).optional().default("zh"),
  model: z.string().optional(),
  prompt: z.string().trim().min(1, "Prompt is required"),
  references: z.array(z.object({
    id: z.string().trim().min(1),
    type: mediaReferenceTypeSchema.optional(),
    url: z.string().trim().min(1),
  })).optional().default([]),
});

type PromptTextBody = z.infer<typeof promptTextBodySchema>;

function createMediaContentPart(reference: { type?: MediaReferenceType; url: string }): ChatContentPart | null {
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

function buildPromptTextMessages(body: PromptTextBody): ChatMessageInput[] {
  const outputLanguage = body.locale === "zh" ? "Simplified Chinese" : "English";
  const mediaParts = getSendableAgentMediaReferences(body.references)
    .map(createMediaContentPart)
    .filter((part): part is ChatContentPart => part !== null);
  const userContent: string | ChatContentPart[] = mediaParts.length > 0
    ? [{ type: "text", text: body.prompt }, ...mediaParts]
    : body.prompt;

  return [
    {
      role: "system",
      content: [
        "You generate plain text for an Imagine Workbench board Note.",
        "Use the user's prompt as the task instruction and use attached media only as reference context.",
        `If the user does not specify an output language, write in ${outputLanguage}.`,
        "Return only the final note body. Do not return JSON, markdown fences, tool actions, or explanations about your process.",
      ].join("\n"),
    },
    { role: "user", content: userContent },
  ];
}

export async function POST(req: NextRequest) {
  try {
    const body = promptTextBodySchema.parse(await req.json());
    const modelValue = body.model ?? req.headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = await resolveProviderConfigForRequest(req, parsed.provider);
    const text = (await createChatCompletionText(
      config,
      parsed.model,
      buildPromptTextMessages(body),
      0.75,
    )).trim();
    if (!text) {
      return NextResponse.json({ error: "Prompt text generation returned no content", code: "empty_generation" }, { status: 502 });
    }
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid prompt text request", code: "invalid_request", details: err.issues }, { status: 400 });
    }
    if (err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: err.message, code: "invalid_provider_model" }, { status: 400 });
    }
    const response = apiErrorResponse(err, "Failed to generate prompt text");
    if (response.status >= 500) console.error("Board prompt text route error:", err);
    return NextResponse.json(response.body, { status: response.status });
  }
}
