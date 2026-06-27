import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireApiText } from "@/lib/api/errors";
import { createChatCompletionText } from "@/lib/providers/chat";
import { DEFAULT_CHAT_MODEL, parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { resolveProviderConfigForRequest } from "@/lib/providers/team-config";
import { optionalText } from "@/lib/providers/utils";

export const runtime = "nodejs";

interface OptimizeBody {
  prompt?: unknown;
  model?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as OptimizeBody;
    const prompt = requireApiText(body.prompt, "Prompt");
    const modelValue = optionalText(body.model) ?? req.headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = await resolveProviderConfigForRequest(req, parsed.provider);

    const optimized = await createChatCompletionText(
      config,
      parsed.model,
      [
        {
          role: "system",
          content:
            "You are an expert prompt engineer for AI image and video models. Expand short prompts into a concise, high-fidelity English visual prompt. Include subject, style, lighting, camera language, composition, and color palette. Do not use generic hype words like photorealistic, ultra realistic, hyperdetailed, or 8K. Return only the rewritten prompt.",
        },
        { role: "user", content: `Prompt to expand: "${prompt}"` },
      ],
      0.85,
    );

    return NextResponse.json({ optimized });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to optimize prompt";
    if (err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message, code: "invalid_provider_model" }, { status: 400 });
    }
    const response = apiErrorResponse(err, "Failed to optimize prompt");
    if (response.status >= 500) console.error("Error in prompt optimization:", err);
    return NextResponse.json(response.body, { status: response.status });
  }
}
