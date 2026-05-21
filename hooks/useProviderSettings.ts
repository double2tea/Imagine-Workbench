import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ProviderTestState } from "@/components/settings/SettingsModal";
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  IMAGE_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  parseProviderModel,
  type AiProvider,
  type ModelOption,
} from "@/lib/providers/model-catalog";
import { getProviderMeta, isKnownProvider, PROVIDER_KEYS } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";

type ModelCategory = "chat" | "image" | "video";
type NoticeType = "error" | "info" | "success";

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
      incoming.filter(option => parseProviderModel(option.value, "12ai").provider === provider),
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
  const parsed = parseProviderModel(option.value, "12ai");
  const model = parsed.model.toLowerCase();
  if (model.includes("video") || model.includes("veo")) return "video";
  if (model.includes("image") || model.includes("imagen") || model.includes("imagine")) return "image";
  return "chat";
}

function isSelectableImageModel(option: ModelOption): boolean {
  return !parseProviderModel(option.value, "12ai").async;
}

function isSelectableChatModel(option: ModelOption): boolean {
  return option.value !== "12ai:gemini-3.1-flash" && !option.value.toLowerCase().includes("deepseek");
}

function hasBuiltInChatModel(value: string): boolean {
  return PROVIDER_KEYS.some(provider => CHAT_MODEL_OPTIONS[provider].some(option => option.value === value));
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
          ? parseProviderModel(target, selectedProvider).provider
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

      if (fetchedChat.length > 0) {
        const nextChatOptions = mergeModelOptions(chatModelOptions[selectedProvider], fetchedChat);
        const nextChatOptionsByProvider = { ...chatModelOptions, [selectedProvider]: nextChatOptions };
        setChatModelOptions(nextChatOptionsByProvider);
        localStorage.setItem("imagine_chat_model_options", JSON.stringify(nextChatOptionsByProvider));
        if (!fetchedChat.some(option => option.value === selectedChatModel)) {
          handleSelectChatModel(fetchedChat[0].value);
        }
      }
      if (fetchedImage.length > 0) {
        const nextImageOptions = mergeModelOptions(imageModelOptions[selectedProvider], fetchedImage);
        const nextImageOptionsByProvider = { ...imageModelOptions, [selectedProvider]: nextImageOptions };
        setImageModelOptions(nextImageOptionsByProvider);
        localStorage.setItem("imagine_image_model_options", JSON.stringify(nextImageOptionsByProvider));
      }
      if (fetchedVideo.length > 0) {
        const nextVideoOptions = mergeModelOptions(videoModelOptions[selectedProvider], fetchedVideo);
        const nextVideoOptionsByProvider = { ...videoModelOptions, [selectedProvider]: nextVideoOptions };
        setVideoModelOptions(nextVideoOptionsByProvider);
        localStorage.setItem("imagine_video_model_options", JSON.stringify(nextVideoOptionsByProvider));
      }

      setModelListMessage(`已获取 ${fetched.length} 个模型：Chat ${fetchedChat.length} / Image ${fetchedImage.length} / Video ${fetchedVideo.length}`);
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

      const storedChatModel = localStorage.getItem("imagine_chat_model");
      if (storedChatModel === "12ai:gemini-3.1-flash" || (storedChatModel && !hasBuiltInChatModel(storedChatModel))) {
        localStorage.setItem("imagine_chat_model", DEFAULT_CHAT_MODEL);
      } else if (storedChatModel) {
        setSelectedChatModel(storedChatModel);
      }

      const restoreModelOptions = (
        key: string,
        setter: Dispatch<SetStateAction<Record<AiProvider, ModelOption[]>>>,
        defaults: Record<AiProvider, ModelOption[]>,
        filterFn?: (option: ModelOption) => boolean,
      ) => {
        const stored = localStorage.getItem(key);
        if (!stored) return;
        try {
          const parsed = JSON.parse(stored) as unknown;
          if (Array.isArray(parsed)) {
            const flat = filterFn
              ? parsed.filter(isModelOption).filter(filterFn)
              : parsed.filter(isModelOption);
            if (flat.length > 0) setter(mergeProviderModelOptions(defaults, flat));
          } else {
            setter(prev => mergeRecordModelOptions(prev, parsed, filterFn));
          }
        } catch (err) {
          console.warn(`Failed to restore model list (${key}):`, err);
        }
      };

      restoreModelOptions("imagine_chat_model_options", setChatModelOptions, CHAT_MODEL_OPTIONS, isSelectableChatModel);
      restoreModelOptions("imagine_image_model_options", setImageModelOptions, IMAGE_MODEL_OPTIONS, isSelectableImageModel);
      restoreModelOptions("imagine_video_model_options", setVideoModelOptions, VIDEO_MODEL_OPTIONS);
    }, 0);

    return () => clearTimeout(restoreSettings);
  }, [setChatModelOptions, setImageModelOptions, setProviderCredentials, setSelectedChatModel, setSelectedProvider, setVideoModelOptions]);

  return {
    buildProviderHeaders,
    chatModelOptions,
    clearProviderCredentials,
    handleSaveCredential,
    handleSelectChatModel,
    handleSelectProvider,
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
