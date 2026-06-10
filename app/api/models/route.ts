import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import type { AiProvider } from "@/lib/providers/model-catalog";
import { isProviderKey } from "@/lib/providers/registry";
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
    console.error("Model list request failed:", err);
    const response = apiErrorResponse(err, "Failed to list models");
    return NextResponse.json(response.body, { status: response.status });
  }
}

function readProvider(req: NextRequest): AiProvider {
  const raw = req.nextUrl.searchParams.get("provider") ?? req.headers.get("x-ai-provider");
  if (!raw) return "12ai";
  if (isProviderKey(raw)) return raw;
  throw badRequest("provider must be a valid provider key", "invalid_provider");
}

function readKind(req: NextRequest): ModelKindFilter {
  const kind = req.nextUrl.searchParams.get("kind");
  if (!kind) return "chat";
  if (kind === "chat" || kind === "image" || kind === "video" || kind === "audio" || kind === "all") return kind;
  throw badRequest("kind must be one of all, chat, image, video, or audio", "invalid_model_kind");
}
