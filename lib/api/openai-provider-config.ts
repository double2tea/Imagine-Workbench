import type { AiProvider } from "@/lib/providers/model-catalog";
import type { ProviderConfig } from "@/lib/providers/types";
import { badRequest } from "@/lib/api/errors";
import { readProviderRequestApiKey, resolveProviderConfig } from "@/lib/providers/utils";

export function resolveOpenAiCompatibleProviderConfigForRequest(
  req: Request,
  provider: AiProvider,
  ignoredBearerToken: string | undefined,
): ProviderConfig {
  const requestBaseUrl = req.headers.get("x-ai-base-url")?.trim();
  const requestApiKey = readProviderRequestApiKey(req, { ignoredBearerToken });
  if (requestBaseUrl && !requestApiKey) {
    throw badRequest(
      "x-ai-base-url requires x-ai-api-key or a provider Authorization bearer token",
      "provider_base_url_requires_request_api_key",
    );
  }
  return resolveProviderConfig(req, provider, { ignoredBearerToken });
}
