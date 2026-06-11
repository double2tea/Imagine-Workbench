import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ProviderTestState } from "@/components/settings/provider-settings-types";
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
  formatProviderModel,
  tryParseProviderModel,
  type AiProvider,
  type ModelOption,
} from "@/lib/providers/model-catalog";
import { getProviderMeta, isKnownProvider, isProviderKey, PROVIDER_KEYS, type CustomProviderDefinition } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";
import { API_ROUTES } from "@/lib/api/routes";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";

type ModelCategory = "chat" | "image" | "video" | "audio";
type NoticeType = "error" | "info" | "success";
type FetchedModelOptions = Record<AiProvider, Record<ModelCategory, ModelOption[]>>;

interface UseProviderSettingsParams {
  isResolveIntegrationEnabled?: boolean;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
}

function defaultProviderCredentials(providerKeys: readonly AiProvider[]): Record<AiProvider, ProviderCredentials> {
  const record = {} as Record<AiProvider, ProviderCredentials>;
  for (const provider of providerKeys) record[provider] = { apiKey: "", baseUrl: "" };
  return record;
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
  const parsed = tryParseProviderModel(option.value, "12ai");
  if (!parsed) return "chat";
  const model = parsed.model.toLowerCase();
  if (model.includes("audio") || model.includes("tts") || model.includes("voice") || model.includes("speech") || model.includes("asr")) return "audio";
  if (model.includes("video") || model.includes("veo") || model.includes("omni_flash")) return "video";
  if (model.includes("image") || model.includes("imagen") || model.includes("imagine")) return "image";
  return "chat";
}

function isSelectableImageModel(option: ModelOption): boolean {
  return tryParseProviderModel(option.value, "12ai")?.async === false;
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
    throw new Error(await readFetchError(res, "Resolve 插件共享配置同步失败"));
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
      pushWorkspaceNotice("error", toErrorMessage(error, "Resolve 插件共享配置同步失败"));
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
      pushWorkspaceNotice("error", toErrorMessage(error, "Resolve 插件共享配置同步失败"));
    });
  }, [isResolveIntegrationEnabled, pushWorkspaceNotice]);

  const handleSaveCredential = useCallback((provider: AiProvider, field: keyof ProviderCredentials, value: string) => {
    setProviderCredentials(prev => {
      const current = prev[provider] ?? { apiKey: "", baseUrl: "" };
      const nextCredentials = { ...current, [field]: value.trim() };
      const next = { ...prev, [provider]: nextCredentials };
      try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(next)); } catch { /* storage unavailable */ }
      syncResolveProviderCredentialIfEnabled(provider, nextCredentials, getProviderLabel(provider));
      return next;
    });
  }, [getProviderLabel, setProviderCredentials, syncResolveProviderCredentialIfEnabled]);

  const clearProviderCredentials = useCallback((provider: AiProvider) => {
    setProviderCredentials(prev => {
      const next = { ...prev, [provider]: { apiKey: "", baseUrl: "" } };
      try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(next)); } catch { /* storage unavailable */ }
      syncResolveProviderCredentialIfEnabled(provider, next[provider]);
      return next;
    });
  }, [setProviderCredentials, syncResolveProviderCredentialIfEnabled]);

  const handleSelectProvider = (provider: AiProvider) => {
    setSelectedProvider(provider);
    try { localStorage.setItem("imagine_ai_provider", provider); } catch { /* storage unavailable */ }
  };

  const addCustomProvider = useCallback((label: string, baseUrl: string): boolean => {
    const cleanLabel = label.trim();
    if (!cleanLabel || !baseUrl.trim()) {
      const message = "请输入服务商名称和 Base URL";
      pushWorkspaceNotice("error", message);
      return false;
    }
    let cleanBaseUrl: string;
    try {
      cleanBaseUrl = normalizeCustomProviderBaseUrl(baseUrl);
    } catch (error) {
      pushWorkspaceNotice("error", error instanceof Error ? error.message : "Base URL 格式无效");
      return false;
    }
    const key = createCustomProviderKey(cleanLabel, providerKeys);
    const nextProvider = { key, label: cleanLabel, baseUrl: cleanBaseUrl };
    setCustomProviders(prev => {
      const next = [...prev, nextProvider];
      try { localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
    setProviderCredentials(prev => {
      const next = { ...prev, [key]: { apiKey: "", baseUrl: cleanBaseUrl } };
      try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(next)); } catch { /* storage unavailable */ }
      syncResolveProviderCredentialIfEnabled(key, next[key], cleanLabel);
      return next;
    });
    setChatModelOptions(prev => ({ ...prev, [key]: [] }));
    setImageModelOptions(prev => ({ ...prev, [key]: [] }));
    setVideoModelOptions(prev => ({ ...prev, [key]: [] }));
    setAudioModelOptions(prev => ({ ...prev, [key]: [] }));
    setFetchedModelOptions(prev => ({
      ...prev,
      [key]: { chat: [], image: [], video: [], audio: [] },
    }));
    setSelectedProvider(key);
    try { localStorage.setItem("imagine_ai_provider", key); } catch { /* storage unavailable */ }
    pushWorkspaceNotice("success", `已添加 ${cleanLabel}`);
    return true;
  }, [providerKeys, pushWorkspaceNotice, syncResolveProviderCredentialIfEnabled]);

  const deleteCustomProvider = useCallback((provider: AiProvider) => {
    if (isKnownProvider(provider)) return;
    const customProvider = customProviderByKey.get(provider);
    if (!customProvider) return;
    const selectedChatProvider = tryParseProviderModel(selectedChatModel, selectedProvider)?.provider;
    setCustomProviders(prev => {
      const next = prev.filter(item => item.key !== provider);
      try { localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
    setProviderCredentials(prev => {
      const next = { ...prev };
      delete next[provider];
      try { localStorage.setItem("imagine_provider_credentials", JSON.stringify(next)); } catch { /* storage unavailable */ }
      syncResolveProviderCredentialIfEnabled(provider, { apiKey: "", baseUrl: "" });
      return next;
    });
    if (selectedChatProvider === provider) {
      setSelectedChatModel(DEFAULT_CHAT_MODEL);
      try { localStorage.setItem("imagine_chat_model", DEFAULT_CHAT_MODEL); } catch { /* storage unavailable */ }
    }
    removeProviderModelOptions(provider, "chat", setChatModelOptions);
    removeProviderModelOptions(provider, "image", setImageModelOptions);
    removeProviderModelOptions(provider, "video", setVideoModelOptions);
    removeProviderModelOptions(provider, "audio", setAudioModelOptions);
    setFetchedModelOptions(prev => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
    if (selectedProvider === provider) {
      setSelectedProvider("12ai");
      try { localStorage.setItem("imagine_ai_provider", "12ai"); } catch { /* storage unavailable */ }
    }
    pushWorkspaceNotice("success", `已删除 ${customProvider.label}`);
  }, [customProviderByKey, pushWorkspaceNotice, selectedChatModel, selectedProvider, syncResolveProviderCredentialIfEnabled]);

  const handleSelectChatModel = (model: string) => {
    setSelectedChatModel(model);
    try { localStorage.setItem("imagine_chat_model", model); } catch { /* storage unavailable */ }
    const parsed = tryParseProviderModel(model, selectedProvider);
    if (!parsed) return;
    if (parsed.provider !== selectedProvider) {
      setSelectedProvider(parsed.provider);
      try { localStorage.setItem("imagine_ai_provider", parsed.provider); } catch { /* storage unavailable */ }
    }
  };

  const saveModelOptions = (
    category: ModelCategory,
    setter: Dispatch<SetStateAction<Record<AiProvider, ModelOption[]>>>,
    options: Record<AiProvider, ModelOption[]>,
  ) => {
    setter(options);
    try { localStorage.setItem(modelOptionsStorageKey(category), JSON.stringify(options)); } catch { /* storage unavailable */ }
  };

  const addManualModels = (category: ModelCategory, rawInput: string) => {
    const modelNames = parseManualModelNames(rawInput);
    if (modelNames.length === 0) {
      const message = "请输入至少一个模型名称";
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
      return;
    }

    const byProvider = groupManualModels(selectedProvider, modelNames, getProviderLabel(selectedProvider), providerKeys);
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

    const message = `已添加 ${countManualModels(byProvider)} 个${modelCategoryLabel(category)}模型`;
    setModelListMessage(message);
    pushWorkspaceNotice("success", message);
  };

  const addFetchedModels = (category: ModelCategory, values: string[]) => {
    const valueSet = new Set(values);
    const selectedModels = (fetchedModelOptions[selectedProvider]?.[category] ?? []).filter(option => valueSet.has(option.value));
    if (selectedModels.length === 0) {
      const message = "请选择要添加的模型";
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

    const message = `已添加 ${selectedModels.length} 个${modelCategoryLabel(category)}模型`;
    setModelListMessage(message);
    pushWorkspaceNotice("success", message);
  };

  const refreshProviderModels = async () => {
    setIsLoadingModels(true);
    setModelListMessage("");
    try {
      const headers = buildProviderHeaders(selectedProvider);
      const res = await fetch(`/api/models?provider=${selectedProvider}&kind=all`, { headers });
      if (!res.ok) {
        throw new Error(await readFetchError(res, "模型列表获取失败"));
      }
      const data: unknown = await res.json();
      const models = typeof data === "object" && data !== null && "models" in data
        ? (data as Record<string, unknown>).models
        : [];
      const fetched: ModelOption[] = Array.isArray(models) ? models.filter(isModelOption) : [];
      if (fetched.length === 0) {
        throw new Error("服务商没有返回可用模型");
      }

      const fetchedChat = fetched.filter(option => classifyModelOption(option) === "chat").filter(isSelectableChatModel);
      const fetchedImage = fetched.filter(option => classifyModelOption(option) === "image").filter(isSelectableImageModel);
      const fetchedVideo = fetched.filter(option => classifyModelOption(option) === "video");
      const fetchedAudio = fetched.filter(option => classifyModelOption(option) === "audio");

      setFetchedModelOptions(prev => ({
        ...prev,
        [selectedProvider]: {
          chat: fetchedChat,
          image: fetchedImage,
          video: fetchedVideo,
          audio: fetchedAudio,
        },
      }));

      setModelListMessage(`已获取 ${fetched.length} 个模型：Chat ${fetchedChat.length} / Image ${fetchedImage.length} / Video ${fetchedVideo.length} / Audio ${fetchedAudio.length}，请选择后添加`);
    } catch (err) {
      const message = toErrorMessage(err, "模型列表获取失败");
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const testProviderConnection = async (provider: AiProvider) => {
    setProviderTest({ provider, status: "testing", message: "测试中..." });
    try {
      const res = await fetch(`/api/models?provider=${provider}`, {
        headers: buildProviderHeaders(provider),
      });
      if (!res.ok) {
        throw new Error(await readFetchError(res, `${getProviderLabel(provider)} 连接测试失败`));
      }
      setProviderTest({ provider, status: "success", message: `${getProviderLabel(provider)} 连接正常` });
    } catch (err) {
      setProviderTest({
        provider,
        status: "error",
        message: toErrorMessage(err, `${getProviderLabel(provider)} 连接测试失败`),
      });
    }
  };

  useEffect(() => {
    const restoreSettings = setTimeout(() => {
      setHasRestoredSettings(false);
      const storedCreds = localStorage.getItem("imagine_provider_credentials");
      const storedCustomProviders = localStorage.getItem(CUSTOM_PROVIDERS_STORAGE_KEY);
      const restoredCustomProviders = storedCustomProviders
        ? readStoredCustomProviders(storedCustomProviders)
        : [];
      const restoredProviderKeys = [...PROVIDER_KEYS, ...restoredCustomProviders.map(provider => provider.key)];
      setCustomProviders(restoredCustomProviders);
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

      const storedProvider = localStorage.getItem("imagine_ai_provider");
      if (storedProvider && restoredProviderKeys.includes(storedProvider)) setSelectedProvider(storedProvider);

      const restoreModelOptions = (
        key: string,
        setter: Dispatch<SetStateAction<Record<AiProvider, ModelOption[]>>>,
        defaults: Record<AiProvider, ModelOption[]>,
        filterFn?: (option: ModelOption) => boolean,
      ): Record<AiProvider, ModelOption[]> => {
        const stored = localStorage.getItem(key);
        const base = ensureProviderOptions(defaults, restoredProviderKeys);
        if (!stored) {
          setter(base);
          return base;
        }
        try {
          const parsed = JSON.parse(stored) as unknown;
          const restored = Array.isArray(parsed)
            ? restoreFlatModelOptions(base, parsed, restoredProviderKeys, filterFn)
            : mergeRecordModelOptions(base, parsed, restoredProviderKeys, filterFn);
          setter(restored);
          return restored;
        } catch (err) {
          console.warn(`Failed to restore model list (${key}):`, err);
          return base;
        }
      };

      const restoredChatOptions = restoreModelOptions("imagine_chat_model_options", setChatModelOptions, CHAT_MODEL_OPTIONS, isSelectableChatModel);
      restoreModelOptions("imagine_image_model_options", setImageModelOptions, IMAGE_MODEL_OPTIONS, isSelectableImageModel);
      restoreModelOptions("imagine_video_model_options", setVideoModelOptions, VIDEO_MODEL_OPTIONS);
      restoreModelOptions("imagine_audio_model_options", setAudioModelOptions, AUDIO_MODEL_OPTIONS);

      const storedChatModel = localStorage.getItem("imagine_chat_model");
      setFetchedModelOptions(emptyFetchedModelOptions(restoredProviderKeys));

      if (storedChatModel === "12ai:gemini-3.1-flash" || (storedChatModel && !hasChatModel(storedChatModel, restoredChatOptions, restoredProviderKeys))) {
        try { localStorage.setItem("imagine_chat_model", DEFAULT_CHAT_MODEL); } catch { /* storage unavailable */ }
      } else if (storedChatModel) {
        setSelectedChatModel(storedChatModel);
      }
      setHasRestoredSettings(true);
    }, 0);

    return () => clearTimeout(restoreSettings);
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
    customProviders,
    deleteCustomProvider,
    handleSaveCredential,
    handleSelectChatModel,
    handleSelectProvider,
    fetchedModelOptions,
    imageModelOptions,
    isLoadingModels,
    modelListMessage,
    providerCredentials,
    providerKeys,
    providerTest,
    refreshProviderModels,
    selectedChatModel,
    selectedProvider,
    testProviderConnection,
    videoModelOptions,
  };
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
  fallbackProvider: AiProvider,
  modelNames: string[],
  providerLabel: string,
  providerKeys: readonly AiProvider[],
): Record<AiProvider, ModelOption[]> {
  const grouped = emptyProviderOptions(providerKeys);
  for (const modelName of modelNames) {
    const value = formatProviderModel(fallbackProvider, modelName);
    grouped[fallbackProvider].push({
      value,
      label: `${providerLabel} ${modelName}`,
    });
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
): void {
  setter(prev => {
    const next = { ...prev };
    delete next[provider];
    try { localStorage.setItem(modelOptionsStorageKey(category), JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });
}
