import { postChatCompletions } from "@/lib/api/chat-completions-core";
import { resolveOpenAiCompatibleProviderConfigForRequest } from "@/lib/api/openai-provider-config";

export async function POST(req: Request): Promise<Response> {
  return postChatCompletions(req, {
    isV1: true,
    resolveConfig: (provider, ignoredBearerToken) => resolveOpenAiCompatibleProviderConfigForRequest(
      req,
      provider,
      ignoredBearerToken,
    ),
  });
}
