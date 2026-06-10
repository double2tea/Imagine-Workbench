import { ApiError } from "./errors";

const OPENAI_COMPAT_API_KEY_ENV = "OPENAI_COMPAT_API_KEY";

export function assertOpenAiCompatibleGatewayAccess(req: Request): string | undefined {
  const gatewayKey = process.env[OPENAI_COMPAT_API_KEY_ENV]?.trim();
  if (!gatewayKey) return undefined;

  const providedKey = readBearerToken(req.headers.get("authorization"));
  if (providedKey === gatewayKey) return gatewayKey;

  throw new ApiError(401, "unauthorized", "OPENAI-compatible gateway API key is required");
}

function readBearerToken(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return undefined;
  return trimmed.slice(7).trim() || undefined;
}
