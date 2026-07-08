import { t } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ProviderCredentialStatus, ProviderTestState } from "@/components/settings/provider-settings-types";
import {
  createCustomProviderKey,
  CUSTOM_PROVIDERS_STORAGE_KEY,
  isCustomProviderDefinition,
  normalizeCustomProviderBaseUrl,
  normalizeCustomProviderDefinition,
} from "@/lib/providers/custom-providers";
import {
  AUDIO_MODEL_OPTIONS,
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  IMAGE_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  tryParseProviderModel,
  type AiProvider,
  type ModelOption,
} from "@/lib/providers/model-catalog";
import { dynamicProviderModelOption, isSelectableModelOptionForKind } from "@/lib/providers/model-gating";
import { getProviderMeta, isKnownProvider, isProviderKey, PROVIDER_KEYS, type CustomProviderDefinition } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";
import { API_ROUTES } from "@/lib/api/routes";
import { browserByokFetch } from "@/lib/browser-byok-fetch";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";
import {
  deleteTeamSecret,
  deleteTeamSetting,
  fetchTeamSecrets,
  fetchTeamSettings,
  fetchWorkspaceStorageRuntimeStatus,
  readTeamCsrfToken,
  saveTeamSecret,
  saveTeamSetting,
  TeamStorageClientError,
} from "@/lib/storage/team-client";

type ModelCategory = "chat" | "image" | "video" | "audio";
type NoticeType = "error" | "info" | "success";
type FetchedModelOptions = Record<AiProvider, Record<ModelCategory, ModelOption[]>>;
type ProviderCredentialStorageTarget = "indexeddb" | "postgres";

interface UseProviderSettingsParams {
  isResolveIntegrationEnabled?: boolean;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
}

function defaultProviderCredentials(providerKeys: readonly AiProvider[]): Record<AiProvider, ProviderCredentials> {
  const record = {} as Record<AiProvider, ProviderCredentials>;
  for (const provider of providerKeys) record[provider] = emptyProviderCredentials();
  return record;
}

function emptyProviderCredentials(): ProviderCredentials {
  return { apiKey: "", baseUrl: "", audioApiKey: "", audioBaseUrl: "" };
}

function providerSettingSaveErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof TeamStorageClientError &&
    (error.code === "team_setting_version_conflict" || error.code === "team_setting_version_required")
  ) {
    return t("common.notices.providerSettingConflict");
  }
  return toErrorMessage(error, fallback);
}

function isModelOption(value: unknown): value is ModelOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "label" in value &&
    typeof value.value === "string" &&
    typeof value.label === "string"
  );
}

function mergeModelOptions(base: ModelOption[], incoming: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return [...incoming, ...base].filter(option => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function mergeProviderModelOptions(
  base: Record<AiProvider, ModelOption[]>,
  incoming: ModelOption[],
  providerKeys: readonly AiProvider[],
): Record<AiProvider, ModelOption[]> {
  const result = { ...base };
  for (const provider of providerKeys) {
    result[provider] = mergeModelOptions(
      base[provider] ?? [],
      incoming.filter(option => tryParseProviderModel(option.value, "12ai")?.provider === provider),
    );
  }
  return result;
}

function mergeRecordModelOptions(
  base: Record<AiProvider, ModelOption[]>,
  incoming: unknown,
  providerKeys: readonly AiProvider[],
  filterFn?: (option: ModelOption) => boolean,
): Record<AiProvider, ModelOption[]> {
  if (typeof incoming !== "object" || incoming === null) return base;
  const record = incoming as Record<string, unknown>;
  const result = { ...base };
  for (const provider of providerKeys) {
    if (Array.isArray(record[provider])) {
      const options = filterFn
        ? (record[provider] as unknown[]).filter(isModelOption).filter(filterFn)
        : (record[provider] as unknown[]).filter(isModelOption);
      if (options.length > 0) result[provider] = mergeModelOptions(base[provider] ?? [], options);
    }
  }
  return result;
}

function classifyModelOption(option: ModelOption): ModelCategory {
  if (isSelectableModelOptionForKind(option, "audio")) return "audio";
  if (isSelectableModelOptionForKind(option, "video")) return "video";
  if (isSelectableModelOptionForKind(option, "image")) return "image";
  return "chat";
}

function isSelectableImageModel(option: ModelOption): boolean {
  return isSelectableModelOptionForKind(option, "image");
}

function isSelectableChatModel(option: ModelOption): boolean {
  const parsed = tryParseProviderModel(option.value, "12ai");
  if (!parsed) return false;
  if (parsed.provider !== "12ai") return true;
  return parsed.model !== "gemini-3.1-flash" && !parsed.model.toLowerCase().includes("deepseek");
}

function hasChatModel(value: string, options: Record<AiProvider, ModelOption[]>, providerKeys: readonly AiProvider[]): boolean {
  return providerKeys.some(provider => (options[provider] ?? []).some(option => option.value === value));
}

type ApiKeyCredentialField = "apiKey" | "audioApiKey";
type BaseUrlCredentialField = "baseUrl" | "audioBaseUrl";

function providerApiKeySecretKey(provider: AiProvider, field: ApiKeyCredentialField = "apiKey"): string {
  return `provider:${provider}:${field}`;
}

function providerBaseUrlSettingKey(provider: AiProvider, field: BaseUrlCredentialField = "baseUrl"): string {
  return `provider:${provider}:${field}`;
}

const PROVIDER_SELECTED_SETTING_KEY = "provider:selected";
const PROVIDER_CHAT_MODEL_SETTING_KEY = "provider:chatModel";
const PROVIDER_CUSTOM_PROVIDERS_SETTING_KEY = "provider:customProviders";

function providerModelOptionsSettingKey(category: ModelCategory): string {
  return `provider:modelOptions:${category}`;
}

function providerFromApiKeySecretKey(key: string): { provider: AiProvider; field: ApiKeyCredentialField } | null {
  const prefix = "provider:";
  for (const field of ["apiKey", "audioApiKey"] as const) {
    const suffix = `:${field}`;
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const provider = key.slice(prefix.length, -suffix.length);
    return isProviderKey(provider) ? { provider, field } : null;
  }
  return null;
}

function providerFromBaseUrlSettingKey(key: string): { provider: AiProvider; field: BaseUrlCredentialField } | null {
  const prefix = "provider:";
  for (const field of ["baseUrl", "audioBaseUrl"] as const) {
    const suffix = `:${field}`;
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const provider = key.slice(prefix.length, -suffix.length);
    return isProviderKey(provider) ? { provider, field } : null;
  }
  return null;
}

function defaultProviderCredentialStatus(providerKeys: readonly AiProvider[]): Record<AiProvider, ProviderCredentialStatus> {
  const record = {} as Record<AiProvider, ProviderCredentialStatus>;
  for (const provider of providerKeys) record[provider] = { apiKeyConfigured: false, audioApiKeyConfigured: false };
  return record;
}

async function syncResolveProviderCredential(
  provider: AiProvider,
  credentials: ProviderCredentials,
  providerLabel?: string,
): Promise<void> {
  const res = await fetch(API_ROUTES.resolve.providerCredentials, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      apiKey: credentials.apiKey,
      baseUrl: credentials.baseUrl,
      providerLabel,
    }),
  });
  if (!res.ok) {
    throw new Error(await readFetchError(res, t("common.notices.resolvePluginSyncFailed")));
  }
}

function syncStoredResolveCredentials(
  credentials: Record<AiProvider, ProviderCredentials>,
  providerKeys: readonly AiProvider[],
  getLabel: (provider: AiProvider) => string,
  pushWorkspaceNotice: (type: NoticeType, message: string) => void,
): void {
  for (const provider of providerKeys) {
    const item = credentials[provider];
    if (!item?.apiKey && !item?.baseUrl) continue;
    void syncResolveProviderCredential(provider, item, getLabel(provider)).catch(error => {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.resolvePluginSyncFailed")));
    });
  }
}

export function useProviderSettings({
  isResolveIntegrationEnabled = false,
  pushWorkspaceNotice,
}: UseProviderSettingsParams) {
  const [customProviders, setCustomProviders] = useState<CustomProviderDefinition[]>([]);
  const providerKeys = useMemo(
    () => [...PROVIDER_KEYS, ...customProviders.map(provider => provider.key)],
    [customProviders],
  );
  const customProviderByKey = useMemo(
    () => new Map(customProviders.map(provider => [provider.key, provider])),
    [customProviders],
  );
  const [providerCredentials, setProviderCredentials] = useState<Record<AiProvider, ProviderCredentials>>(
    defaultProviderCredentials(PROVIDER_KEYS),
  );
  const [providerCredentialStatus, setProviderCredentialStatus] = useState<Record<AiProvider, ProviderCredentialStatus>>(
    defaultProviderCredentialStatus(PROVIDER_KEYS),
  );
  const [credentialStorageTarget, setCredentialStorageTarget] = useState<ProviderCredentialStorageTarget>("indexeddb");
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>("12ai");
  const [selectedChatModel, setSelectedChatModel] = useState(DEFAULT_CHAT_MODEL);
  const [chatModelOptions, setChatModelOptions] = useState<Record<AiProvider, ModelOption[]>>(CHAT_MODEL_OPTIONS);
  const [imageModelOptions, setImageModelOptions] = useState<Record<AiProvider, ModelOption[]>>(IMAGE_MODEL_OPTIONS);
  const [videoModelOptions, setVideoModelOptions] = useState<Record<AiProvider, ModelOption[]>>(VIDEO_MODEL_OPTIONS);
  const [audioModelOptions, setAudioModelOptions] = useState<Record<AiProvider, ModelOption[]>>(AUDIO_MODEL_OPTIONS);
  const [fetchedModelOptions, setFetchedModelOptions] = useState<FetchedModelOptions>(emptyFetchedModelOptions(PROVIDER_KEYS));
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelListMessage, setModelListMessage] = useState("");
  const [providerTest, setProviderTest] = useState<ProviderTestState>({
    provider: "12ai",
    status: "idle",
    message: "",
  });
  const [hasRestoredSettings, setHasRestoredSettings] = useState(false);
  const hasSyncedResolveCredentialsRef = useRef(false);
  const teamSettingVersionsRef = useRef(new Map<string, string>());

  const getProviderLabel = useCallback((provider: AiProvider): string => (
    customProviderByKey.get(provider)?.label ?? getProviderMeta(provider).label
  ), [customProviderByKey]);

  const buildProviderHeaders = useCallback((target?: string) => {
    const provider =
      target && isProviderKey(target)
        ? target
        : target
          ? tryParseProviderModel(target, selectedProvider)?.provider ?? selectedProvider
          : selectedProvider;
    const chatModelHeader = target && !isProviderKey(target) ? target : selectedChatModel;
    const headers: Record<string, string> = {
      "x-ai-provider": provider,
      "x-ai-chat-model": chatModelHeader,
    };
    const creds = providerCredentials[provider];
    if (creds?.apiKey) headers["x-ai-api-key"] = creds.apiKey;
    if (creds?.baseUrl) headers["x-ai-base-url"] = creds.baseUrl;
    if (creds?.audioApiKey) headers["x-ai-audio-api-key"] = creds.audioApiKey;
    if (creds?.audioBaseUrl) headers["x-ai-audio-base-url"] = creds.audioBaseUrl;
    const customProvider = customProviderByKey.get(provider);
    if (customProvider) {
      headers["x-ai-provider-label"] = customProvider.label;
    }
    return headers;
  }, [customProviderByKey, providerCredentials, selectedChatModel, selectedProvider]);

  const syncResolveProviderCredentialIfEnabled = useCallback((
    provider: AiProvider,
    credentials: ProviderCredentials,
    providerLabel?: string,
  ): void => {
    if (!isResolveIntegrationEnabled) return;
    void syncResolveProviderCredential(provider, credentials, providerLabel).catch(error => {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.resolvePluginSyncFailed")));
    });
  }, [isResolveIntegrationEnabled, pushWorkspaceNotice]);

  const saveTeamProviderSetting = useCallback((key: string, value: string): void => {
    if (credentialStorageTarget !== "postgres") return;
    const csrfToken = readTeamCsrfToken();
    if (!csrfToken) {
      pushWorkspaceNotice("error", t("common.notices.providerCredentialCsrfMissing"));
      return;
    }
    const expectedUpdatedAt = teamSettingVersionsRef.current.get(key);
    void (value
      ? saveTeamSetting({ expectedUpdatedAt, group: "provider", key, value }, csrfToken)
        .then(result => {
          teamSettingVersionsRef.current.set(key, result.setting.updatedAt);
        })
      : deleteTeamSetting(key, csrfToken, expectedUpdatedAt)
        .then(() => {
          teamSettingVersionsRef.current.delete(key);
        })
      ).catch(error => {
      pushWorkspaceNotice("error", providerSettingSaveErrorMessage(error, t("common.notices.providerCredentialSaveFailed")));
    });
  }, [credentialStorageTarget, pushWorkspaceNotice]);

  const handleSaveCredential = useCallback((provider: AiProvider, field: keyof ProviderCredentials, value: string) => {
    setProviderCredentials(prev => {
      const current = prev[provider] ?? emptyProviderCredentials();
      const nextCredentials = { ...current, [field]: value.trim() };
      const next = { ...prev, [provider]: nextCredentials };
      if (credentialStorageTarget !== "postgres") {
        try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(next)); } catch { /* storage unavailable */ }
        if (field === "apiKey" || field === "baseUrl") {
          syncResolveProviderCredentialIfEnabled(provider, nextCredentials, getProviderLabel(provider));
        }
      }
      return next;
    });
  }, [credentialStorageTarget, getProviderLabel, setProviderCredentials, syncResolveProviderCredentialIfEnabled]);

  const commitProviderCredential = useCallback((provider: AiProvider, field: keyof ProviderCredentials) => {
    if (credentialStorageTarget !== "postgres") return;
    const csrfToken = readTeamCsrfToken();
    if (!csrfToken) {
      pushWorkspaceNotice("error", t("common.notices.providerCredentialCsrfMissing"));
      return;
    }
    if (field === "baseUrl" || field === "audioBaseUrl") {
      const baseUrl = providerCredentials[provider]?.[field]?.trim() ?? "";
      const key = providerBaseUrlSettingKey(provider, field);
      const expectedUpdatedAt = teamSettingVersionsRef.current.get(key);
      void (baseUrl || (field === "baseUrl" && customProviderByKey.has(provider))
        ? saveTeamSetting({ expectedUpdatedAt, group: "provider", key, value: baseUrl }, csrfToken)
          .then(result => {
            teamSettingVersionsRef.current.set(key, result.setting.updatedAt);
          })
        : deleteTeamSetting(key, csrfToken, expectedUpdatedAt)
          .then(() => {
            teamSettingVersionsRef.current.delete(key);
          })
      ).catch(error => {
        pushWorkspaceNotice("error", providerSettingSaveErrorMessage(error, t("common.notices.providerCredentialSaveFailed")));
      });
      return;
    }
    const apiKey = providerCredentials[provider]?.[field]?.trim() ?? "";
    const key = providerApiKeySecretKey(provider, field);
    void (apiKey
      ? saveTeamSecret({ group: "provider", key, value: apiKey }, csrfToken)
      : deleteTeamSecret(key, csrfToken)
    ).then(() => {
      setProviderCredentialStatus(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          [field === "audioApiKey" ? "audioApiKeyConfigured" : "apiKeyConfigured"]: Boolean(apiKey),
        },
      }));
    }).catch(error => {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.providerCredentialSaveFailed")));
    });
  }, [credentialStorageTarget, customProviderByKey, providerCredentials, pushWorkspaceNotice]);

  const clearProviderCredentials = useCallback((provider: AiProvider) => {
    setProviderCredentials(prev => {
      const next = { ...prev, [provider]: emptyProviderCredentials() };
      if (credentialStorageTarget !== "postgres") {
        try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(next)); } catch { /* storage unavailable */ }
        syncResolveProviderCredentialIfEnabled(provider, next[provider]);
      }
      return next;
    });
    if (credentialStorageTarget !== "postgres") return;
    const csrfToken = readTeamCsrfToken();
    if (!csrfToken) {
      pushWorkspaceNotice("error", t("common.notices.providerCredentialCsrfMissing"));
      return;
    }
    const baseUrlSettingKey = providerBaseUrlSettingKey(provider);
    const audioBaseUrlSettingKey = providerBaseUrlSettingKey(provider, "audioBaseUrl");
    const expectedBaseUrlUpdatedAt = teamSettingVersionsRef.current.get(baseUrlSettingKey);
    const expectedAudioBaseUrlUpdatedAt = teamSettingVersionsRef.current.get(audioBaseUrlSettingKey);
    void Promise.all([
      deleteTeamSecret(providerApiKeySecretKey(provider), csrfToken),
      deleteTeamSecret(providerApiKeySecretKey(provider, "audioApiKey"), csrfToken),
      customProviderByKey.has(provider)
        ? saveTeamSetting({ expectedUpdatedAt: expectedBaseUrlUpdatedAt, group: "provider", key: baseUrlSettingKey, value: "" }, csrfToken)
          .then(result => {
            teamSettingVersionsRef.current.set(baseUrlSettingKey, result.setting.updatedAt);
          })
        : deleteTeamSetting(baseUrlSettingKey, csrfToken, expectedBaseUrlUpdatedAt)
          .then(() => {
            teamSettingVersionsRef.current.delete(baseUrlSettingKey);
          }),
      deleteTeamSetting(audioBaseUrlSettingKey, csrfToken, expectedAudioBaseUrlUpdatedAt)
        .then(() => {
          teamSettingVersionsRef.current.delete(audioBaseUrlSettingKey);
        }),
    ])
      .then(() => {
        setProviderCredentialStatus(prev => ({
          ...prev,
          [provider]: { apiKeyConfigured: false, audioApiKeyConfigured: false },
        }));
      })
      .catch(error => {
        pushWorkspaceNotice("error", providerSettingSaveErrorMessage(error, t("common.notices.providerCredentialClearFailed")));
      });
  }, [credentialStorageTarget, customProviderByKey, pushWorkspaceNotice, setProviderCredentials, syncResolveProviderCredentialIfEnabled]);

  const handleSelectProvider = (provider: AiProvider) => {
    setSelectedProvider(provider);
    if (credentialStorageTarget === "postgres") {
      saveTeamProviderSetting(PROVIDER_SELECTED_SETTING_KEY, provider);
    } else {
      try { localStorage.setItem("imagine_ai_provider", provider); } catch { /* storage unavailable */ }
    }
  };

  const addCustomProvider = useCallback((label: string, baseUrl: string): boolean => {
    const cleanLabel = label.trim();
    if (!cleanLabel || !baseUrl.trim()) {
      pushWorkspaceNotice("error", t("common.notices.enterProviderNameAndUrl"));
      return false;
    }
    let cleanBaseUrl: string;
    try {
      cleanBaseUrl = normalizeCustomProviderBaseUrl(baseUrl);
    } catch (error) {
      pushWorkspaceNotice("error", error instanceof Error ? error.message : t("common.notices.baseUrlFormatInvalid"));
      return false;
    }
    const key = createCustomProviderKey(cleanLabel, providerKeys);
    const nextProvider = { key, label: cleanLabel, baseUrl: cleanBaseUrl };
    setCustomProviders(prev => {
      const next = [...prev, nextProvider];
      if (credentialStorageTarget === "postgres") {
        saveTeamProviderSetting(PROVIDER_CUSTOM_PROVIDERS_SETTING_KEY, JSON.stringify(next));
      } else {
        try { localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      }
      return next;
    });
    setProviderCredentials(prev => {
      const next = { ...prev, [key]: { ...emptyProviderCredentials(), baseUrl: cleanBaseUrl } };
      if (credentialStorageTarget !== "postgres") {
        try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(next)); } catch { /* storage unavailable */ }
        syncResolveProviderCredentialIfEnabled(key, next[key], cleanLabel);
      }
      return next;
    });
    setProviderCredentialStatus(prev => ({ ...prev, [key]: { apiKeyConfigured: false, audioApiKeyConfigured: false } }));
    setChatModelOptions(prev => ({ ...prev, [key]: [] }));
    setImageModelOptions(prev => ({ ...prev, [key]: [] }));
    setVideoModelOptions(prev => ({ ...prev, [key]: [] }));
    setAudioModelOptions(prev => ({ ...prev, [key]: [] }));
    setFetchedModelOptions(prev => ({
      ...prev,
      [key]: { chat: [], image: [], video: [], audio: [] },
    }));
    setSelectedProvider(key);
    if (credentialStorageTarget === "postgres") {
      saveTeamProviderSetting(PROVIDER_SELECTED_SETTING_KEY, key);
    } else {
      try { localStorage.setItem("imagine_ai_provider", key); } catch { /* storage unavailable */ }
    }
    pushWorkspaceNotice("success", t("common.notices.providerAdded", { name: cleanLabel }));
    return true;
  }, [credentialStorageTarget, providerKeys, pushWorkspaceNotice, saveTeamProviderSetting, syncResolveProviderCredentialIfEnabled]);

  const deleteCustomProvider = useCallback((provider: AiProvider) => {
    if (isKnownProvider(provider)) return;
    const customProvider = customProviderByKey.get(provider);
    if (!customProvider) return;
    const selectedChatProvider = tryParseProviderModel(selectedChatModel, selectedProvider)?.provider;
    setCustomProviders(prev => {
      const next = prev.filter(item => item.key !== provider);
      if (credentialStorageTarget === "postgres") {
        saveTeamProviderSetting(PROVIDER_CUSTOM_PROVIDERS_SETTING_KEY, JSON.stringify(next));
        saveTeamProviderSetting(providerBaseUrlSettingKey(provider), "");
      } else {
        try { localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      }
      return next;
    });
    setProviderCredentials(prev => {
      const next = { ...prev };
      delete next[provider];
      if (credentialStorageTarget !== "postgres") {
        try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(next)); } catch { /* storage unavailable */ }
        syncResolveProviderCredentialIfEnabled(provider, { apiKey: "", baseUrl: "" });
      }
      return next;
    });
    setProviderCredentialStatus(prev => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
    if (selectedChatProvider === provider) {
      setSelectedChatModel(DEFAULT_CHAT_MODEL);
      if (credentialStorageTarget === "postgres") {
        saveTeamProviderSetting(PROVIDER_CHAT_MODEL_SETTING_KEY, DEFAULT_CHAT_MODEL);
      } else {
        try { localStorage.setItem("imagine_chat_model", DEFAULT_CHAT_MODEL); } catch { /* storage unavailable */ }
      }
    }
    removeProviderModelOptions(provider, "chat", setChatModelOptions, saveTeamProviderSetting, credentialStorageTarget);
    removeProviderModelOptions(provider, "image", setImageModelOptions, saveTeamProviderSetting, credentialStorageTarget);
    removeProviderModelOptions(provider, "video", setVideoModelOptions, saveTeamProviderSetting, credentialStorageTarget);
    removeProviderModelOptions(provider, "audio", setAudioModelOptions, saveTeamProviderSetting, credentialStorageTarget);
    setFetchedModelOptions(prev => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
    if (selectedProvider === provider) {
      setSelectedProvider("12ai");
      if (credentialStorageTarget === "postgres") {
        saveTeamProviderSetting(PROVIDER_SELECTED_SETTING_KEY, "12ai");
      } else {
        try { localStorage.setItem("imagine_ai_provider", "12ai"); } catch { /* storage unavailable */ }
      }
    }
    pushWorkspaceNotice("success", t("common.notices.providerDeleted", { name: customProvider.label }));
  }, [credentialStorageTarget, customProviderByKey, pushWorkspaceNotice, saveTeamProviderSetting, selectedChatModel, selectedProvider, syncResolveProviderCredentialIfEnabled]);

  const handleSelectChatModel = (model: string) => {
    setSelectedChatModel(model);
    if (credentialStorageTarget === "postgres") {
      saveTeamProviderSetting(PROVIDER_CHAT_MODEL_SETTING_KEY, model);
    } else {
      try { localStorage.setItem("imagine_chat_model", model); } catch { /* storage unavailable */ }
    }
    const parsed = tryParseProviderModel(model, selectedProvider);
    if (!parsed) return;
    if (parsed.provider !== selectedProvider) {
      setSelectedProvider(parsed.provider);
      if (credentialStorageTarget === "postgres") {
        saveTeamProviderSetting(PROVIDER_SELECTED_SETTING_KEY, parsed.provider);
      } else {
        try { localStorage.setItem("imagine_ai_provider", parsed.provider); } catch { /* storage unavailable */ }
      }
    }
  };

  const saveModelOptions = (
    category: ModelCategory,
    setter: Dispatch<SetStateAction<Record<AiProvider, ModelOption[]>>>,
    options: Record<AiProvider, ModelOption[]>,
  ) => {
    setter(options);
    if (credentialStorageTarget === "postgres") {
      saveTeamProviderSetting(providerModelOptionsSettingKey(category), JSON.stringify(options));
    } else {
      try { localStorage.setItem(modelOptionsStorageKey(category), JSON.stringify(options)); } catch { /* storage unavailable */ }
    }
  };

  const addManualModels = (category: ModelCategory, rawInput: string) => {
    const modelNames = parseManualModelNames(rawInput);
    if (modelNames.length === 0) {
      const message = t("common.notices.enterAtLeastOneModelName");
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
      return;
    }

    const byProvider = groupManualModels(category, selectedProvider, modelNames, getProviderLabel(selectedProvider), providerKeys);
    const manualCount = countManualModels(byProvider);
    if (manualCount === 0) {
      const message = t("common.notices.noAddableModels", { category: modelCategoryLabel(category) });
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
      return;
    }
    if (category === "chat") {
      const next = mergeManualModelGroups(chatModelOptions, byProvider);
      saveModelOptions(category, setChatModelOptions, next);
    } else if (category === "image") {
      const next = mergeManualModelGroups(imageModelOptions, byProvider);
      saveModelOptions(category, setImageModelOptions, next);
    } else if (category === "video") {
      const next = mergeManualModelGroups(videoModelOptions, byProvider);
      saveModelOptions(category, setVideoModelOptions, next);
    } else {
      const next = mergeManualModelGroups(audioModelOptions, byProvider);
      saveModelOptions(category, setAudioModelOptions, next);
    }

    const message = t("common.notices.addedModels", { count: manualCount, category: modelCategoryLabel(category) });
    setModelListMessage(message);
    pushWorkspaceNotice("success", message);
  };

  const addFetchedModels = (category: ModelCategory, values: string[]) => {
    const valueSet = new Set(values);
    const selectedModels = (fetchedModelOptions[selectedProvider]?.[category] ?? []).filter(option => valueSet.has(option.value));
    if (selectedModels.length === 0) {
      const message = t("common.notices.selectModelsToAdd");
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
      return;
    }

    if (category === "chat") {
      const next = { ...chatModelOptions, [selectedProvider]: mergeModelOptions(chatModelOptions[selectedProvider] ?? [], selectedModels) };
      saveModelOptions(category, setChatModelOptions, next);
    } else if (category === "image") {
      const next = { ...imageModelOptions, [selectedProvider]: mergeModelOptions(imageModelOptions[selectedProvider] ?? [], selectedModels) };
      saveModelOptions(category, setImageModelOptions, next);
    } else if (category === "video") {
      const next = { ...videoModelOptions, [selectedProvider]: mergeModelOptions(videoModelOptions[selectedProvider] ?? [], selectedModels) };
      saveModelOptions(category, setVideoModelOptions, next);
    } else {
      const next = { ...audioModelOptions, [selectedProvider]: mergeModelOptions(audioModelOptions[selectedProvider] ?? [], selectedModels) };
      saveModelOptions(category, setAudioModelOptions, next);
    }

    const message = t("common.notices.addedModels", { count: selectedModels.length, category: modelCategoryLabel(category) });
    setModelListMessage(message);
    pushWorkspaceNotice("success", message);
  };

  const refreshProviderModels = async (kind: ModelCategory = "chat") => {
    setIsLoadingModels(true);
    setModelListMessage("");
    try {
      const headers = buildProviderHeaders(selectedProvider);
      const res = await browserByokFetch(`/api/models?provider=${selectedProvider}&kind=${kind}`, { headers });
      if (!res.ok) {
        throw new Error(await readFetchError(res, t("common.notices.modelListFetchFailed")));
      }
      const data: unknown = await res.json();
      const models = typeof data === "object" && data !== null && "models" in data
        ? (data as Record<string, unknown>).models
        : [];
      const fetched: ModelOption[] = Array.isArray(models) ? models.filter(isModelOption) : [];
      if (fetched.length === 0) {
        throw new Error(t("common.notices.modelListEmpty"));
      }

      const fetchedChat = fetched.filter(option => classifyModelOption(option) === "chat").filter(isSelectableChatModel);
      const fetchedImage = fetched.filter(option => classifyModelOption(option) === "image");
      const fetchedVideo = fetched.filter(option => classifyModelOption(option) === "video");
      const fetchedAudio = fetched.filter(option => classifyModelOption(option) === "audio");

      setFetchedModelOptions(prev => ({
        ...prev,
        [selectedProvider]: {
          ...(prev[selectedProvider] ?? { chat: [], image: [], video: [], audio: [] }),
          chat: kind === "chat" ? fetchedChat : (prev[selectedProvider]?.chat ?? []),
          image: kind === "image" ? fetchedImage : (prev[selectedProvider]?.image ?? []),
          video: kind === "video" ? fetchedVideo : (prev[selectedProvider]?.video ?? []),
          audio: kind === "audio" ? fetchedAudio : (prev[selectedProvider]?.audio ?? []),
        },
      }));

      setModelListMessage(t("common.notices.modelListFetched", { count: fetched.length, chat: fetchedChat.length, image: fetchedImage.length, video: fetchedVideo.length, audio: fetchedAudio.length }));
    } catch (err) {
      const message = toErrorMessage(err, t("common.notices.modelListFetchFailed"));
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const testProviderConnection = async (provider: AiProvider) => {
    setProviderTest({ provider, status: "testing", message: t("common.notices.testingConnection") });
    try {
      const res = await browserByokFetch(`/api/models?provider=${provider}`, {
        headers: buildProviderHeaders(provider),
      });
      if (!res.ok) {
        throw new Error(await readFetchError(res, t("common.notices.providerConnectionTestFailed", { providerLabel: getProviderLabel(provider) })));
      }
      setProviderTest({ provider, status: "success", message: t("common.notices.providerConnectionOk", { providerLabel: getProviderLabel(provider) }) });
    } catch (err) {
      setProviderTest({
        provider,
        status: "error",
        message: toErrorMessage(err, t("common.notices.providerConnectionTestFailed", { providerLabel: getProviderLabel(provider) })),
      });
    }
  };

  useEffect(() => {
    let isActive = true;
    const restoreSettings = setTimeout(() => {
      void (async () => {
        setHasRestoredSettings(false);
        const runtimeStatus = await fetchWorkspaceStorageRuntimeStatus();
        const storageTarget = runtimeStatus.targetKind === "postgres" ? "postgres" : "indexeddb";
        if (!isActive) return;
        setCredentialStorageTarget(storageTarget);

        let teamSettingsByKey = new Map<string, string>();
        let restoredCustomProviders: CustomProviderDefinition[] = [];
        if (storageTarget === "postgres") {
          try {
            const teamSettings = await fetchTeamSettings({ groups: ["provider"] });
            if (!isActive) return;
            teamSettingVersionsRef.current = new Map(teamSettings.settings.map(setting => [setting.key, setting.updatedAt]));
            teamSettingsByKey = new Map(teamSettings.settings.map(setting => [setting.key, setting.value]));
            restoredCustomProviders = readStoredCustomProviders(teamSettingsByKey.get(PROVIDER_CUSTOM_PROVIDERS_SETTING_KEY) ?? "");
          } catch {
            teamSettingVersionsRef.current = new Map();
            // Non-secret provider settings are admin-scoped. Non-admin sessions keep defaults without localStorage fallback.
          }
        } else {
          teamSettingVersionsRef.current = new Map();
          const storedCustomProviders = localStorage.getItem(CUSTOM_PROVIDERS_STORAGE_KEY);
          restoredCustomProviders = storedCustomProviders
            ? readStoredCustomProviders(storedCustomProviders)
            : [];
        }
        const restoredProviderKeys = [...PROVIDER_KEYS, ...restoredCustomProviders.map(provider => provider.key)];
        setCustomProviders(restoredCustomProviders);

        const restoredCredentialStatus = defaultProviderCredentialStatus(restoredProviderKeys);
        if (storageTarget === "postgres") {
          const merged = defaultProviderCredentials(restoredProviderKeys);
          for (const provider of restoredCustomProviders) {
            merged[provider.key].baseUrl = provider.baseUrl;
          }
          for (const [key, value] of teamSettingsByKey) {
            const credential = providerFromBaseUrlSettingKey(key);
            if (credential && restoredProviderKeys.includes(credential.provider)) {
              merged[credential.provider][credential.field] = value;
            }
          }
          setProviderCredentials(merged);
          try {
            const secretStatuses = await fetchTeamSecrets({ groups: ["provider"] });
            if (!isActive) return;
            for (const secret of secretStatuses.secrets) {
              const credential = providerFromApiKeySecretKey(secret.key);
              if (credential) {
                restoredCredentialStatus[credential.provider] = {
                  ...restoredCredentialStatus[credential.provider],
                  [credential.field === "audioApiKey" ? "audioApiKeyConfigured" : "apiKeyConfigured"]: true,
                };
              }
            }
          } catch {
            // Secret visibility is role-gated; unauthenticated/non-admin sessions simply have no status to show.
          }
          setProviderCredentialStatus(restoredCredentialStatus);
        } else {
          const storedCreds = localStorage.getItem("imagine_provider_credentials");
          if (storedCreds) {
            try {
              const parsed = JSON.parse(storedCreds) as Record<string, Partial<ProviderCredentials> | undefined>;
              const merged = defaultProviderCredentials(restoredProviderKeys);
              for (const provider of restoredCustomProviders) {
                merged[provider.key].baseUrl = provider.baseUrl;
              }
              for (const provider of restoredProviderKeys) {
                if (typeof parsed[provider]?.apiKey === "string") merged[provider].apiKey = parsed[provider].apiKey;
                if (typeof parsed[provider]?.baseUrl === "string") merged[provider].baseUrl = parsed[provider].baseUrl;
                if (typeof parsed[provider]?.audioApiKey === "string") merged[provider].audioApiKey = parsed[provider].audioApiKey;
                if (typeof parsed[provider]?.audioBaseUrl === "string") merged[provider].audioBaseUrl = parsed[provider].audioBaseUrl;
              }
              setProviderCredentials(merged);
            } catch { /* ignore corrupt data */ }
          } else {
            const defaults = defaultProviderCredentials(restoredProviderKeys);
            for (const provider of restoredCustomProviders) {
              defaults[provider.key].baseUrl = provider.baseUrl;
            }
            const legacy12AiKey = localStorage.getItem("imagine_12ai_api_key") ?? localStorage.getItem("imagine_custom_api_key");
            const legacyGrokKey = localStorage.getItem("imagine_grok2api_api_key");
            const legacyGrokBaseUrl = localStorage.getItem("imagine_grok2api_base_url") ?? localStorage.getItem("imagine_custom_api_base_url");
            if (legacy12AiKey || legacyGrokKey || legacyGrokBaseUrl) {
              const migrated = defaults;
              if (legacy12AiKey) migrated["12ai"] = { ...migrated["12ai"], apiKey: legacy12AiKey };
              if (legacyGrokKey) migrated["grok2api"] = { ...migrated["grok2api"], apiKey: legacyGrokKey };
              if (legacyGrokBaseUrl) migrated["grok2api"] = { ...migrated["grok2api"], baseUrl: legacyGrokBaseUrl };
              setProviderCredentials(migrated);
              localStorage.removeItem("imagine_12ai_api_key");
              localStorage.removeItem("imagine_custom_api_key");
              localStorage.removeItem("imagine_grok2api_api_key");
              localStorage.removeItem("imagine_grok2api_base_url");
              localStorage.removeItem("imagine_custom_api_base_url");
              try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(migrated)); } catch { /* storage unavailable */ }
            } else {
              setProviderCredentials(defaults);
            }
          }
          setProviderCredentialStatus(restoredCredentialStatus);
        }

        const storedProvider = storageTarget === "postgres"
          ? teamSettingsByKey.get(PROVIDER_SELECTED_SETTING_KEY) ?? null
          : localStorage.getItem("imagine_ai_provider");
        if (storedProvider && restoredProviderKeys.includes(storedProvider)) setSelectedProvider(storedProvider);

        const restoreModelOptions = (
          settingKey: string,
          key: string,
          setter: Dispatch<SetStateAction<Record<AiProvider, ModelOption[]>>>,
          defaults: Record<AiProvider, ModelOption[]>,
          filterFn?: (option: ModelOption) => boolean,
        ): Record<AiProvider, ModelOption[]> => {
          const stored = storageTarget === "postgres" ? teamSettingsByKey.get(settingKey) ?? null : localStorage.getItem(key);
          const restored = restoreProviderModelOptionsFromStored(stored, defaults, restoredProviderKeys, filterFn, key);
          setter(restored);
          return restored;
        };

        const restoredChatOptions = restoreModelOptions(providerModelOptionsSettingKey("chat"), "imagine_chat_model_options", setChatModelOptions, CHAT_MODEL_OPTIONS, isSelectableChatModel);
        restoreModelOptions(providerModelOptionsSettingKey("image"), "imagine_image_model_options", setImageModelOptions, IMAGE_MODEL_OPTIONS, isSelectableImageModel);
        restoreModelOptions(providerModelOptionsSettingKey("video"), "imagine_video_model_options", setVideoModelOptions, VIDEO_MODEL_OPTIONS, option => isSelectableModelOptionForKind(option, "video"));
        restoreModelOptions(providerModelOptionsSettingKey("audio"), "imagine_audio_model_options", setAudioModelOptions, AUDIO_MODEL_OPTIONS, option => isSelectableModelOptionForKind(option, "audio"));

        const storedChatModel = storageTarget === "postgres"
          ? teamSettingsByKey.get(PROVIDER_CHAT_MODEL_SETTING_KEY) ?? null
          : localStorage.getItem("imagine_chat_model");
        setFetchedModelOptions(emptyFetchedModelOptions(restoredProviderKeys));

        if (storedChatModel === "12ai:gemini-3.1-flash" || (storedChatModel && !hasChatModel(storedChatModel, restoredChatOptions, restoredProviderKeys))) {
          if (storageTarget !== "postgres") {
            try { localStorage.setItem("imagine_chat_model", DEFAULT_CHAT_MODEL); } catch { /* storage unavailable */ }
          }
        } else if (storedChatModel) {
          setSelectedChatModel(storedChatModel);
        }
        setHasRestoredSettings(true);
      })().catch(error => {
        if (!isActive) return;
        pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.providerSettingsRestoreFailed")));
        setHasRestoredSettings(true);
      });
    }, 0);

    return () => {
      isActive = false;
      clearTimeout(restoreSettings);
    };
  }, [pushWorkspaceNotice, setAudioModelOptions, setChatModelOptions, setImageModelOptions, setProviderCredentials, setSelectedChatModel, setSelectedProvider, setVideoModelOptions]);

  useEffect(() => {
    if (!isResolveIntegrationEnabled) {
      hasSyncedResolveCredentialsRef.current = false;
      return;
    }
    if (!hasRestoredSettings || hasSyncedResolveCredentialsRef.current) return;
    hasSyncedResolveCredentialsRef.current = true;
    syncStoredResolveCredentials(providerCredentials, providerKeys, getProviderLabel, pushWorkspaceNotice);
  }, [getProviderLabel, hasRestoredSettings, isResolveIntegrationEnabled, providerCredentials, providerKeys, pushWorkspaceNotice]);

  return {
    addFetchedModels,
    addManualModels,
    audioModelOptions,
    buildProviderHeaders,
    chatModelOptions,
    clearProviderCredentials,
    addCustomProvider,
    commitProviderCredential,
    customProviders,
    deleteCustomProvider,
    handleSaveCredential,
    handleSelectChatModel,
    handleSelectProvider,
    fetchedModelOptions,
    hasRestoredSettings,
    imageModelOptions,
    isLoadingModels,
    modelListMessage,
    providerCredentials,
    providerCredentialStatus,
    providerKeys,
    providerTest,
    refreshProviderModels,
    selectedChatModel,
    selectedProvider,
    testProviderConnection,
    videoModelOptions,
  };
}

export function restoreProviderModelOptionsFromStored(
  stored: string | null,
  defaults: Record<AiProvider, ModelOption[]>,
  providerKeys: readonly AiProvider[],
  filterFn?: (option: ModelOption) => boolean,
  warningLabel?: string,
): Record<AiProvider, ModelOption[]> {
  const base = ensureProviderOptions(defaults, providerKeys);
  if (!stored) return base;
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed)
      ? restoreFlatModelOptions(base, parsed, providerKeys, filterFn)
      : mergeRecordModelOptions(base, parsed, providerKeys, filterFn);
  } catch (err) {
    if (warningLabel) console.warn(`Failed to restore model list (${warningLabel}):`, err);
    return base;
  }
}

function restoreFlatModelOptions(
  defaults: Record<AiProvider, ModelOption[]>,
  parsed: unknown[],
  providerKeys: readonly AiProvider[],
  filterFn?: (option: ModelOption) => boolean,
): Record<AiProvider, ModelOption[]> {
  const flat = filterFn
    ? parsed.filter(isModelOption).filter(filterFn)
    : parsed.filter(isModelOption);
  return flat.length > 0 ? mergeProviderModelOptions(defaults, flat, providerKeys) : defaults;
}

function modelOptionsStorageKey(category: ModelCategory): string {
  if (category === "chat") return "imagine_chat_model_options";
  if (category === "image") return "imagine_image_model_options";
  if (category === "audio") return "imagine_audio_model_options";
  return "imagine_video_model_options";
}

function modelCategoryLabel(category: ModelCategory): string {
  if (category === "chat") return "Chat";
  if (category === "image") return "Image";
  if (category === "audio") return "Audio";
  return "Video";
}

function parseManualModelNames(rawInput: string): string[] {
  const seen = new Set<string>();
  return rawInput
    .split(/[\n,]+/)
    .map(stripModelPrefix)
    .filter(item => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function groupManualModels(
  category: ModelCategory,
  fallbackProvider: AiProvider,
  modelNames: string[],
  providerLabel: string,
  providerKeys: readonly AiProvider[],
): Record<AiProvider, ModelOption[]> {
  const grouped = emptyProviderOptions(providerKeys);
  for (const modelName of modelNames) {
    const option = dynamicProviderModelOption(fallbackProvider, modelName, category, providerLabel);
    if (option) grouped[fallbackProvider].push(option);
  }
  return grouped;
}

function stripModelPrefix(modelName: string): string {
  const trimmed = modelName.trim();
  const separator = trimmed.indexOf(":");
  if (separator === -1) return trimmed;
  return trimmed.slice(separator + 1).trim();
}

function emptyProviderOptions(providerKeys: readonly AiProvider[]): Record<AiProvider, ModelOption[]> {
  const record = {} as Record<AiProvider, ModelOption[]>;
  for (const provider of providerKeys) record[provider] = [];
  return record;
}

function mergeManualModelGroups(
  current: Record<AiProvider, ModelOption[]>,
  incoming: Record<AiProvider, ModelOption[]>,
): Record<AiProvider, ModelOption[]> {
  const next = { ...current };
  for (const provider of Object.keys(incoming)) {
    next[provider] = mergeModelOptions(current[provider] ?? [], incoming[provider] ?? []);
  }
  return next;
}

function countManualModels(groups: Record<AiProvider, ModelOption[]>): number {
  return Object.values(groups).reduce((count, options) => count + options.length, 0);
}

function emptyFetchedModelOptions(providerKeys: readonly AiProvider[]): FetchedModelOptions {
  const record = {} as FetchedModelOptions;
  for (const provider of providerKeys) {
    record[provider] = {
      chat: [],
      image: [],
      video: [],
      audio: [],
    };
  }
  return record;
}

function ensureProviderOptions(
  defaults: Record<AiProvider, ModelOption[]>,
  providerKeys: readonly AiProvider[],
): Record<AiProvider, ModelOption[]> {
  const next = { ...defaults };
  for (const provider of providerKeys) {
    next[provider] = next[provider] ?? [];
  }
  return next;
}

function readStoredCustomProviders(raw: string): CustomProviderDefinition[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter(isCustomProviderDefinition)
      .map(normalizeCustomProviderDefinition)
      .filter(provider => {
        if (seen.has(provider.key)) return false;
        seen.add(provider.key);
        return true;
      });
  } catch {
    return [];
  }
}

function removeProviderModelOptions(
  provider: AiProvider,
  category: ModelCategory,
  setter: Dispatch<SetStateAction<Record<AiProvider, ModelOption[]>>>,
  saveTeamProviderSetting: (key: string, value: string) => void,
  storageTarget: ProviderCredentialStorageTarget,
): void {
  setter(prev => {
    const next = { ...prev };
    delete next[provider];
    if (storageTarget === "postgres") {
      saveTeamProviderSetting(providerModelOptionsSettingKey(category), JSON.stringify(next));
    } else {
      try { localStorage.setItem(modelOptionsStorageKey(category), JSON.stringify(next)); } catch { /* storage unavailable */ }
    }
    return next;
  });
}
