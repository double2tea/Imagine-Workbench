import type { AiProvider } from "@/lib/providers/registry";
import { getProviderMeta } from "@/lib/providers/registry";

export function providerEndpointInfo(provider: AiProvider): string[] | undefined {
  const meta = getProviderMeta(provider);
  if (
    !meta.hasEditableBaseUrl &&
    meta.defaultVideoBaseUrl &&
    meta.defaultVideoBaseUrl !== meta.defaultBaseUrl
  ) {
    return [`Chat/Image: ${meta.defaultBaseUrl}`, `Video: ${meta.defaultVideoBaseUrl}`];
  }
  if (!meta.supportsImage && !meta.supportsVideo && meta.supportsChat) {
    return [`Chat: ${meta.defaultBaseUrl}/v1`];
  }
  return undefined;
}

export function providerClearLabel(provider: AiProvider): string {
  return getProviderMeta(provider).hasEditableBaseUrl ? "清除 Key/Base URL" : "清除 Key";
}