import { CUSTOM_PROVIDERS_STORAGE_KEY } from "@/lib/providers/custom-providers";

const MODEL_CACHE_KEYS = [
  "imagine_chat_model_options",
  "imagine_image_model_options",
  "imagine_video_model_options",
  "imagine_audio_model_options",
  "imagine_default_audio_model",
  "imagine_default_image_model",
  "imagine_default_video_model",
  "imagine_image_edit_feature_models",
] as const;

const PROVIDER_SETTING_KEYS = [
  "imagine_ai_provider",
  "imagine_chat_model",
  CUSTOM_PROVIDERS_STORAGE_KEY,
] as const;

const PROVIDER_CREDENTIAL_KEYS = [
  "imagine_provider_credentials",
  "imagine_runninghub_saved_targets",
  "imagine_12ai_api_key",
  "imagine_custom_api_key",
  "imagine_grok2api_api_key",
  "imagine_grok2api_base_url",
  "imagine_custom_api_base_url",
] as const;

const AGENT_STORAGE_KEYS = [
  "imagine_agent_chat",
  "imagine_auto_execute",
] as const;

const UI_PREFERENCE_KEYS = [
  "imagine_theme_mode",
  "imagine_language",
  "imagine_agent_orb_position",
  "imagine_board_last_insert",
  "imagine_board_handles_hint_seen",
  "imagine_board_side_collapsed",
  "imagine_board_side_tab",
  "imagine_custom_prompt_templates",
  "imagine_resolve_integration_enabled",
  "imagine_show_price",
] as const;

const MANAGED_EXACT_KEYS = [
  ...MODEL_CACHE_KEYS,
  ...PROVIDER_SETTING_KEYS,
  ...PROVIDER_CREDENTIAL_KEYS,
  ...AGENT_STORAGE_KEYS,
  ...UI_PREFERENCE_KEYS,
] as const;

const AGENT_PREFIX_KEYS = ["imagine_agent_chat:"] as const;
const UI_PREFERENCE_PREFIX_KEYS = ["imagine_board_viewed_generated_asset_ids:"] as const;
const MANAGED_PREFIX_KEYS = [
  ...AGENT_PREFIX_KEYS,
  ...UI_PREFERENCE_PREFIX_KEYS,
] as const;

export type WorkspaceCleanupKind =
  | "failed"
  | "stale-processing"
  | "broken-complete"
  | "orphaned";

export type LocalStorageCleanupKind =
  | "agent"
  | "model-cache"
  | "provider-settings"
  | "provider-credentials"
  | "ui-preferences";

export type LocalStorageMigrationPolicy = "required" | "optional" | "local-only";

export interface LocalStorageInventoryEntry {
  bytes: number;
  includeCredentialsRequired: boolean;
  key: string;
  kind: LocalStorageCleanupKind;
  migrationPolicy: LocalStorageMigrationPolicy;
}

export function buildManagedLocalStorageInventory(entries: Record<string, string>): LocalStorageInventoryEntry[] {
  return Object.entries(entries)
    .filter(([key]) => isManagedLocalStorageKey(key))
    .map(([key, value]) => ({
      bytes: textByteSize(key) + textByteSize(value),
      includeCredentialsRequired: isProviderCredentialKey(key),
      key,
      kind: classifyLocalStorageKey(key),
      migrationPolicy: localStorageMigrationPolicy(key),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function readManagedLocalStorageEntries(
  storage: Pick<Storage, "getItem" | "key" | "length">,
  includeCredentials: boolean,
): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const key of MANAGED_EXACT_KEYS) {
    if (!includeCredentials && isProviderCredentialKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (!MANAGED_PREFIX_KEYS.some(prefix => key.startsWith(prefix))) continue;
    const value = storage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

export function isManagedLocalStorageKey(key: string): boolean {
  return MANAGED_EXACT_KEYS.some(item => item === key) || MANAGED_PREFIX_KEYS.some(prefix => key.startsWith(prefix));
}

export function isAgentStorageKey(key: string): boolean {
  return AGENT_STORAGE_KEYS.some(item => item === key) || AGENT_PREFIX_KEYS.some(prefix => key.startsWith(prefix));
}

export function isModelCacheKey(key: string): boolean {
  return MODEL_CACHE_KEYS.some(item => item === key);
}

export function isProviderSettingKey(key: string): boolean {
  return PROVIDER_SETTING_KEYS.some(item => item === key);
}

export function isProviderCredentialKey(key: string): boolean {
  return PROVIDER_CREDENTIAL_KEYS.some(item => item === key);
}

export function isUiPreferenceKey(key: string): boolean {
  return UI_PREFERENCE_KEYS.some(item => item === key) || UI_PREFERENCE_PREFIX_KEYS.some(prefix => key.startsWith(prefix));
}

export function localStorageMigrationPolicy(key: string): LocalStorageMigrationPolicy {
  if (isProviderCredentialKey(key)) return "optional";
  if (isAgentStorageKey(key)) return "optional";
  if (key === "imagine_resolve_integration_enabled") return "local-only";
  if (UI_PREFERENCE_PREFIX_KEYS.some(prefix => key.startsWith(prefix))) return "local-only";
  return "required";
}

export function classifyLocalStorageKey(key: string): LocalStorageCleanupKind {
  if (isAgentStorageKey(key)) return "agent";
  if (isModelCacheKey(key)) return "model-cache";
  if (isProviderSettingKey(key)) return "provider-settings";
  if (isProviderCredentialKey(key)) return "provider-credentials";
  if (isUiPreferenceKey(key)) return "ui-preferences";
  throw new Error(`Unsupported managed localStorage key: ${key}`);
}

function textByteSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
