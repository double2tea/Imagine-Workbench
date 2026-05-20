import { NextRequest, NextResponse } from "next/server";
import type { AiProvider } from "@/lib/providers/model-catalog";
import { isKnownProvider } from "@/lib/providers/registry";
import { listProviderModels, type ModelKindFilter } from "@/lib/providers/models";
import { resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const provider = readProvider(req);
    const kind = readKind(req);
    const config = resolveProviderConfig(req, provider);
    const models = await listProviderModels(config, kind);
    return NextResponse.json({ models, kind, source: "provider" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list models";
    console.error("Model list request failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readProvider(req: NextRequest): AiProvider {
  const raw = req.nextUrl.searchParams.get("provider") ?? req.headers.get("x-ai-provider");
  if (raw && isKnownProvider(raw)) return raw;
  return "12ai";
}

function readKind(req: NextRequest): ModelKindFilter {
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind === "image" || kind === "video" || kind === "all") return kind;
  return "chat";
}
