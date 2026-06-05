import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ProviderTestState } from "@/components/settings/provider-settings-types";
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
import { getProviderMeta, isKnownProvider, PROVIDER_KEYS } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";

type ModelCategory = "chat" | "image" | "video" | "audio";
type NoticeType = "error" | "info" | "success";
type FetchedModelOptions = Record<AiProvider, Record<ModelCategory, ModelOption[]>>;

interface UseProviderSettingsParams {
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
}

function defaultProviderCredentials(): Record<AiProvider, ProviderCredentials> {
  const record = {} as Record<AiProvider, ProviderCredentials>;
  for (const provider of PROVIDER_KEYS) record[provider] = { apiKey: "", baseUrl: "" };
  return record;
}

function getStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

async function readFetchError(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    return getStringField(data, "error") ?? getStringField(data, "message") ?? `${fallback} (HTTP ${response.status})`;
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
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
): Record<AiProvider, ModelOption[]> {
  const result = { ...base };
  for (const provider of PROVIDER_KEYS) {
    result[provider] = mergeModelOptions(
      base[provider],
      incoming.filter(option => tryParseProviderModel(option.value, "12ai")?.provider === provider),
    );
  }
  return result;
}

function mergeRecordModelOptions(
  base: Record<AiProvider, ModelOption[]>,
  incoming: unknown,
  filterFn?: (option: ModelOption) => boolean,
): Record<AiProvider, ModelOption[]> {
  if (typeof incoming !== "object" || incoming === null) return base;
  const record = incoming as Record<string, unknown>;
  const result = { ...base };
  for (const provider of PROVIDER_KEYS) {
    if (Array.isArray(record[provider])) {
      const options = filterFn
        ? (record[provider] as unknown[]).filter(isModelOption).filter(filterFn)
        : (record[provider] as unknown[]).filter(isModelOption);
      if (options.length > 0) result[provider] = mergeModelOptions(base[provider], options);
    }
  }
  return result;
}

function classifyModelOption(option: ModelOption): ModelCategory {
  const parsed = tryParseProviderModel(option.value, "12ai");
  if (!parsed) return "chat";
  const model = parsed.model.toLowerCase();
  if (model.includes("audio") || model.includes("tts") || model.includes("voice") || model.includes("speech")) return "audio";
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

function hasChatModel(value: string, options: Record<AiProvider, ModelOption[]>): boolean {
  return PROVIDER_KEYS.some(provider => options[provider].some(option => option.value === value));
}

function getProviderLabel(provider: AiProvider): string {
  return getProviderMeta(provider).label;
}

export function useProviderSettings({ pushWorkspaceNotice }: UseProviderSettingsParams) {
  const [providerCredentials, setProviderCredentials] = useState<Record<AiProvider, ProviderCredentials>>(defaultProviderCredentials);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>("12ai");
  const [selectedChatModel, setSelectedChatModel] = useState(DEFAULT_CHAT_MODEL);
  const [chatModelOptions, setChatModelOptions] = useState<Record<AiProvider, ModelOption[]>>(CHAT_MODEL_OPTIONS);
  const [imageModelOptions, setImageModelOptions] = useState<Record<AiProvider, ModelOption[]>>(IMAGE_MODEL_OPTIONS);
  const [videoModelOptions, setVideoModelOptions] = useState<Record<AiProvider, ModelOption[]>>(VIDEO_MODEL_OPTIONS);
  const [audioModelOptions, setAudioModelOptions] = useState<Record<AiProvider, ModelOption[]>>(AUDIO_MODEL_OPTIONS);
  const [fetchedModelOptions, setFetchedModelOptions] = useState<FetchedModelOptions>(emptyFetchedModelOptions);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelListMessage, setModelListMessage] = useState("");
  const [providerTest, setProviderTest] = useState<ProviderTestState>({
    provider: "12ai",
    status: "idle",
    message: "",
  });

  const buildProviderHeaders = useCallback((target?: string) => {
    const provider =
      target && isKnownProvider(target)
        ? target
        : target
          ? tryParseProviderModel(target, selectedProvider)?.provider ?? selectedProvider
          : selectedProvider;
    const chatModelHeader = target && !isKnownProvider(target) ? target : selectedChatModel;
    const headers: Record<string, string> = {
      "x-ai-provider": provider,
      "x-ai-chat-model": chatModelHeader,
    };
    const creds = providerCredentials[provider];
    if (creds?.apiKey) headers["x-ai-api-key"] = creds.apiKey;
    if (creds?.baseUrl) headers["x-ai-base-url"] = creds.baseUrl;
    return headers;
  }, [providerCredentials, selectedChatModel, selectedProvider]);

  const handleSaveCredential = useCallback((provider: AiProvider, field: keyof ProviderCredentials, value: string) => {
    setProviderCredentials(prev => {
      const next = { ...prev, [provider]: { ...prev[provider], [field]: value } };
      localStorage.setItem("imagine_provider_credentials", JSON.stringify(next));
      return next;
    });
  }, [setProviderCredentials]);

  const clearProviderCredentials = useCallback((provider: AiProvider) => {
    setProviderCredentials(prev => {
      const next = { ...prev, [provider]: { apiKey: "", baseUrl: "" } };
      localStorage.setItem("imagine_provider_credentials", JSON.stringify(next));
      return next;
    });
  }, [setProviderCredentials]);

  const handleSelectProvider = (provider: AiProvider) => {
    setSelectedProvider(provider);
    localStorage.setItem("imagine_ai_provider", provider);
  };

  const handleSelectChatModel = (model: string) => {
    setSelectedChatModel(model);
    localStorage.setItem("imagine_chat_model", model);
    const parsed = tryParseProviderModel(model, selectedProvider);
    if (!parsed) return;
    if (parsed.provider !== selectedProvider) {
      setSelectedProvider(parsed.provider);
      localStorage.setItem("imagine_ai_provider", parsed.provider);
    }
  };

  const saveModelOptions = (
    category: ModelCategory,
    setter: Dispatch<SetStateAction<Record<AiProvider, ModelOption[]>>>,
    options: Record<AiProvider, ModelOption[]>,
  ) => {
    setter(options);
    localStorage.setItem(modelOptionsStorageKey(category), JSON.stringify(options));
  };

  const addManualModels = (category: ModelCategory, rawInput: string) => {
    const modelNames = parseManualModelNames(rawInput);
    if (modelNames.length === 0) {
      const message = "请输入至少一个模型名称";
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
      return;
    }

    const byProvider = groupManualModels(selectedProvider, modelNames);
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
    const selectedModels = fetchedModelOptions[selectedProvider][category].filter(option => valueSet.has(option.value));
    if (selectedModels.length === 0) {
      const message = "请选择要添加的模型";
      setModelListMessage(message);
      pushWorkspaceNotice("error", message);
      return;
    }

    if (category === "chat") {
      const next = { ...chatModelOptions, [selectedProvider]: mergeModelOptions(chatModelOptions[selectedProvider], selectedModels) };
      saveModelOptions(category, setChatModelOptions, next);
    } else if (category === "image") {
      const next = { ...imageModelOptions, [selectedProvider]: mergeModelOptions(imageModelOptions[selectedProvider], selectedModels) };
      saveModelOptions(category, setImageModelOptions, next);
    } else if (category === "video") {
      const next = { ...videoModelOptions, [selectedProvider]: mergeModelOptions(videoModelOptions[selectedProvider], selectedModels) };
      saveModelOptions(category, setVideoModelOptions, next);
    } else {
      const next = { ...audioModelOptions, [selectedProvider]: mergeModelOptions(audioModelOptions[selectedProvider], selectedModels) };
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
      const storedCreds = localStorage.getItem("imagine_provider_credentials");
      if (storedCreds) {
        try {
          const parsed = JSON.parse(storedCreds);
          const merged = defaultProviderCredentials();
          for (const provider of PROVIDER_KEYS) {
            if (parsed[provider]?.apiKey) merged[provider].apiKey = parsed[provider].apiKey;
            if (parsed[provider]?.baseUrl) merged[provider].baseUrl = parsed[provider].baseUrl;
          }
          setProviderCredentials(merged);
        } catch { /* ignore corrupt data */ }
      } else {
        const legacy12AiKey = localStorage.getItem("imagine_12ai_api_key") ?? localStorage.getItem("imagine_custom_api_key");
        const legacyGrokKey = localStorage.getItem("imagine_grok2api_api_key");
        const legacyGrokBaseUrl = localStorage.getItem("imagine_grok2api_base_url") ?? localStorage.getItem("imagine_custom_api_base_url");
        if (legacy12AiKey || legacyGrokKey || legacyGrokBaseUrl) {
          const migrated = defaultProviderCredentials();
          if (legacy12AiKey) migrated["12ai"] = { ...migrated["12ai"], apiKey: legacy12AiKey };
          if (legacyGrokKey) migrated["grok2api"] = { ...migrated["grok2api"], apiKey: legacyGrokKey };
          if (legacyGrokBaseUrl) migrated["grok2api"] = { ...migrated["grok2api"], baseUrl: legacyGrokBaseUrl };
          setProviderCredentials(migrated);
          localStorage.removeItem("imagine_12ai_api_key");
          localStorage.removeItem("imagine_custom_api_key");
          localStorage.removeItem("imagine_grok2api_api_key");
          localStorage.removeItem("imagine_grok2api_base_url");
          localStorage.removeItem("imagine_custom_api_base_url");
          localStorage.setItem("imagine_provider_credentials", JSON.stringify(migrated));
        }
      }

      const storedProvider = localStorage.getItem("imagine_ai_provider");
      if (storedProvider && isKnownProvider(storedProvider)) setSelectedProvider(storedProvider);

      const restoreModelOptions = (
        key: string,
        setter: Dispatch<SetStateAction<Record<AiProvider, ModelOption[]>>>,
        defaults: Record<AiProvider, ModelOption[]>,
        filterFn?: (option: ModelOption) => boolean,
      ): Record<AiProvider, ModelOption[]> => {
        const stored = localStorage.getItem(key);
        if (!stored) return defaults;
        try {
          const parsed = JSON.parse(stored) as unknown;
          const restored = Array.isArray(parsed)
            ? restoreFlatModelOptions(defaults, parsed, filterFn)
            : mergeRecordModelOptions(defaults, parsed, filterFn);
          setter(restored);
          return restored;
        } catch (err) {
          console.warn(`Failed to restore model list (${key}):`, err);
          return defaults;
        }
      };

      const restoredChatOptions = restoreModelOptions("imagine_chat_model_options", setChatModelOptions, CHAT_MODEL_OPTIONS, isSelectableChatModel);
      restoreModelOptions("imagine_image_model_options", setImageModelOptions, IMAGE_MODEL_OPTIONS, isSelectableImageModel);
      restoreModelOptions("imagine_video_model_options", setVideoModelOptions, VIDEO_MODEL_OPTIONS);
      restoreModelOptions("imagine_audio_model_options", setAudioModelOptions, AUDIO_MODEL_OPTIONS);

      const storedChatModel = localStorage.getItem("imagine_chat_model");
      if (storedChatModel === "12ai:gemini-3.1-flash" || (storedChatModel && !hasChatModel(storedChatModel, restoredChatOptions))) {
        localStorage.setItem("imagine_chat_model", DEFAULT_CHAT_MODEL);
      } else if (storedChatModel) {
        setSelectedChatModel(storedChatModel);
      }
    }, 0);

    return () => clearTimeout(restoreSettings);
  }, [setAudioModelOptions, setChatModelOptions, setImageModelOptions, setProviderCredentials, setSelectedChatModel, setSelectedProvider, setVideoModelOptions]);

  return {
    addFetchedModels,
    addManualModels,
    audioModelOptions,
    buildProviderHeaders,
    chatModelOptions,
    clearProviderCredentials,
    handleSaveCredential,
    handleSelectChatModel,
    handleSelectProvider,
    fetchedModelOptions,
    imageModelOptions,
    isLoadingModels,
    modelListMessage,
    providerCredentials,
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
  filterFn?: (option: ModelOption) => boolean,
): Record<AiProvider, ModelOption[]> {
  const flat = filterFn
    ? parsed.filter(isModelOption).filter(filterFn)
    : parsed.filter(isModelOption);
  return flat.length > 0 ? mergeProviderModelOptions(defaults, flat) : defaults;
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

function groupManualModels(fallbackProvider: AiProvider, modelNames: string[]): Record<AiProvider, ModelOption[]> {
  const grouped = emptyProviderOptions();
  for (const modelName of modelNames) {
    const value = formatProviderModel(fallbackProvider, modelName);
    grouped[fallbackProvider].push({
      value,
      label: `${getProviderLabel(fallbackProvider)} ${modelName}`,
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

function emptyProviderOptions(): Record<AiProvider, ModelOption[]> {
  const record = {} as Record<AiProvider, ModelOption[]>;
  for (const provider of PROVIDER_KEYS) record[provider] = [];
  return record;
}

function mergeManualModelGroups(
  current: Record<AiProvider, ModelOption[]>,
  incoming: Record<AiProvider, ModelOption[]>,
): Record<AiProvider, ModelOption[]> {
  const next = { ...current };
  for (const provider of PROVIDER_KEYS) {
    next[provider] = mergeModelOptions(current[provider], incoming[provider]);
  }
  return next;
}

function countManualModels(groups: Record<AiProvider, ModelOption[]>): number {
  return PROVIDER_KEYS.reduce((count, provider) => count + groups[provider].length, 0);
}

function emptyFetchedModelOptions(): FetchedModelOptions {
  const record = {} as FetchedModelOptions;
  for (const provider of PROVIDER_KEYS) {
    record[provider] = {
      chat: [],
      image: [],
      video: [],
      audio: [],
    };
  }
  return record;
}
