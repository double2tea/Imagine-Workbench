import { NextResponse } from "next/server";
import { z } from "zod";
import { providerChatCompletionsUrl, providerChatRequestDefaults } from "../providers/chat";
import { parseProviderModel, ProviderModelParseError } from "../providers/model-catalog";
import { resolveProviderConfigForRequest } from "../providers/team-config";
import { authHeaders } from "../providers/utils";
import { apiErrorResponse } from "./errors";
import { assertOpenAiCompatibleGatewayAccess } from "./openai-auth";

const chatCompletionsBodySchema = z.object({
  model: z.string().trim().min(1),
  messages: z.array(z.unknown()).min(1),
  stream: z.boolean().optional(),
}).passthrough();

export async function POST(req: Request) {
  try {
    const gatewayKey = isV1Request(req) ? assertOpenAiCompatibleGatewayAccess(req) : undefined;
    const body = chatCompletionsBodySchema.parse(await req.json());
    const parsed = parseProviderModel(body.model, "12ai");
    const config = await resolveProviderConfigForRequest(req, parsed.provider, { ignoredBearerToken: gatewayKey });
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

function isV1Request(req: Request): boolean {
  return new URL(req.url).pathname.startsWith("/v1/");
}

function responseHeaders(upstream: Response, stream: boolean): Headers {
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? (stream ? "text/event-stream" : "application/json"));
  headers.set("Cache-Control", "no-store");
  return headers;
}
