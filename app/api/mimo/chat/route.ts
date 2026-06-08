import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authHeaders, openAiCompatibleUrl, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

const mimoChatBodySchema = z.object({
  model: z.string().trim().min(1),
  messages: z.array(z.unknown()).min(1),
  stream: z.boolean().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  try {
    const body = mimoChatBodySchema.parse(await req.json());
    const config = resolveProviderConfig(req, "mimo");
    const upstream = await fetch(openAiCompatibleUrl(config.baseUrl, "/v1/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(config),
      },
      body: JSON.stringify(body),
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
    const message = err instanceof Error ? err.message : "Failed to proxy MiMo chat request";
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("MiMo chat route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function responseHeaders(upstream: Response, stream: boolean): Headers {
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? (stream ? "text/event-stream" : "application/json"));
  headers.set("Cache-Control", "no-store");
  return headers;
}
