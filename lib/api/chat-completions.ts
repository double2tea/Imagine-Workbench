import { postChatCompletions } from "@/lib/api/chat-completions-core";
import { resolveProviderConfigForRequest } from "@/lib/providers/team-config";

export async function POST(req: Request): Promise<Response> {
  const isV1 = new URL(req.url).pathname.startsWith("/v1/");
  return postChatCompletions(req, {
    isV1,
    resolveConfig: (provider, ignoredBearerToken) => resolveProviderConfigForRequest(req, provider, {
      allowAnonymousProviderCredentials: isV1,
      ignoredBearerToken,
    }),
  });
}
