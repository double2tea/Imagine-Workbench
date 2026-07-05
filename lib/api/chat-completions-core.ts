import { NextResponse } from "next/server";
import { z } from "zod";
import { providerChatCompletionsUrl, providerChatRequestDefaults } from "@/lib/providers/chat";
import { parseProviderModel, ProviderModelParseError, type AiProvider } from "@/lib/providers/model-catalog";
import type { ProviderConfig } from "@/lib/providers/types";
import { authHeaders } from "@/lib/providers/utils";
import { apiErrorResponse } from "@/lib/api/errors";
import { assertOpenAiCompatibleGatewayAccess } from "@/lib/api/openai-auth";

const chatCompletionsBodySchema = z.object({
  model: z.string().trim().min(1),
  messages: z.array(z.unknown()).min(1),
  stream: z.boolean().optional(),
}).passthrough();

export type ChatProviderConfigResolver = (
  provider: AiProvider,
  ignoredBearerToken: string | undefined,
) => ProviderConfig | Promise<ProviderConfig>;

export async function postChatCompletions(
  req: Request,
  options: {
    isV1: boolean;
    resolveConfig: ChatProviderConfigResolver;
  },
): Promise<Response> {
  try {
    const gatewayKey = options.isV1 ? assertOpenAiCompatibleGatewayAccess(req) : undefined;
    const body = chatCompletionsBodySchema.parse(await req.json());
    const parsed = parseProviderModel(body.model, "12ai");
    const config = await options.resolveConfig(parsed.provider, gatewayKey);
    const upstream = await fetch(providerChatCompletionsUrl(config), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(config),
      },
      body: JSON.stringify({
        ...body,
        model: parsed.model,
        ...providerChatRequestDefaults(config),
      }),
    });

    const headers = responseHeaders(upstream, body.stream === true);
    if (body.stream === true) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers,
      });
    }

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to proxy chat completions";
    if (err instanceof z.ZodError || err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const response = apiErrorResponse(err, "Failed to proxy chat completions");
    if (response.status < 500) {
      return NextResponse.json(response.body, { status: response.status });
    }
    console.error("Chat completions route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function responseHeaders(upstream: Response, stream: boolean): Headers {
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? (stream ? "text/event-stream" : "application/json"));
  headers.set("Cache-Control", "no-store");
  return headers;
}
