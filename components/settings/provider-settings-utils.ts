import { getProviderCredentialMeta, getProviderMeta, type AiProvider, type ProviderCredentialScope } from "@/lib/providers/registry";
import { t } from "@/lib/i18n";

export function providerEndpointInfo(provider: AiProvider, scope: ProviderCredentialScope = "default"): string[] | undefined {
  if (scope !== "default") return getProviderCredentialMeta(provider, scope).endpointInfo;
  const meta = getProviderMeta(provider);
  if (meta.endpointInfo) return meta.endpointInfo;
  if (
    !meta.hasEditableBaseUrl &&
    meta.defaultVideoBaseUrl &&
    meta.defaultVideoBaseUrl !== meta.defaultBaseUrl
  ) {
    return [`Chat/Image: ${meta.defaultBaseUrl}`, `Video: ${meta.defaultVideoBaseUrl}`];
  }
  if (!meta.supportsImage && !meta.supportsVideo && !meta.supportsAudio && meta.supportsChat) {
    return [`Chat: ${meta.defaultBaseUrl}/v1`];
  }
  return undefined;
}

export function providerClearLabel(provider: AiProvider, scope: ProviderCredentialScope = "default"): string {
  return getProviderCredentialMeta(provider, scope).hasEditableBaseUrl
    ? t("settings.providers.clearKeyBaseUrl")
    : t("settings.providers.clearKey");
}
