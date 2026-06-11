import { NextResponse } from "next/server";
import { apiErrorResponse, badRequest } from "./errors";
import type { AiProvider } from "../providers/model-catalog";
import { parseProviderModel } from "../providers/model-catalog";
import { isProviderKey, PROVIDER_KEYS } from "../providers/registry";
import { listProviderModels, listStaticProviderModels, type ModelKindFilter } from "../providers/models";
import { resolveProviderConfig } from "../providers/utils";
import { assertOpenAiCompatibleGatewayAccess } from "./openai-auth";

interface OpenAiModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export async function GET(req: Request) {
  try {
    const provider = readProvider(req);
    const kind = readKind(req);
    const gatewayKey = assertOpenAiCompatibleGatewayAccess(req);
    const models = provider === "all"
      ? listAllKnownProviderModels(kind)
      : await listSingleProviderModels(req, provider, kind, gatewayKey);
    return NextResponse.json({
      object: "list",
      data: models.map(model => ({
        id: model.value,
        object: "model",
        created: 0,
        owned_by: readModelProvider(model.value) ?? "workbench",
      } satisfies OpenAiModel)),
    });
  } catch (err) {
    const response = apiErrorResponse(err, "Failed to list models");
    return NextResponse.json(response.body, { status: response.status });
  }
}

function readProvider(req: Request): AiProvider | "all" {
  const url = new URL(req.url);
  const raw = url.searchParams.get("provider") ?? req.headers.get("x-ai-provider");
  if (!raw || raw === "all") return "all";
  if (isProviderKey(raw)) return raw;
  throw badRequest("provider must be all or a valid provider key", "invalid_provider");
}

function readKind(req: Request): ModelKindFilter {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (!kind) return "chat";
  if (kind === "chat" || kind === "image" || kind === "video" || kind === "audio" || kind === "all") return kind;
  throw badRequest("kind must be one of all, chat, image, video, or audio", "invalid_model_kind");
}

function readModelProvider(model: string): string | undefined {
  try {
    return parseProviderModel(model, "12ai").provider;
  } catch {
    return undefined;
  }
}

async function listSingleProviderModels(
  req: Request,
  provider: AiProvider,
  kind: ModelKindFilter,
  gatewayKey: string | undefined,
) {
  const config = resolveProviderConfig(req, provider, { ignoredBearerToken: gatewayKey });
  return listProviderModels(config, kind);
}

function listAllKnownProviderModels(kind: ModelKindFilter) {
  return PROVIDER_KEYS.flatMap(provider => listStaticProviderModels(provider, kind));
}
