import { NextRequest, NextResponse } from "next/server";
import { createChatCompletionText } from "@/lib/providers/chat";
import { DEFAULT_CHAT_MODEL, parseProviderModel } from "@/lib/providers/model-catalog";
import { optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface OptimizeBody {
  prompt?: unknown;
  model?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as OptimizeBody;
    const modelValue = optionalText(body.model) ?? req.headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);
    const prompt = requireText(body.prompt, "Prompt");

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
    console.error("Error in prompt optimization:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
