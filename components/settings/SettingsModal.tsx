import { Check, Info, ListPlus, RefreshCw, Settings, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { StorageItem } from "@/lib/db";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";
import { PROVIDER_KEYS, getProviderMeta } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";

export interface ProviderTestState {
  provider: AiProvider;
  status: "idle" | "testing" | "success" | "error";
  message: string;
}

interface ModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

type ModelCategory = "chat" | "image" | "video";
type FetchedModelOptions = Record<AiProvider, Record<ModelCategory, ModelOption[]>>;
interface FetchedSelection {
  scope: string;
  values: string[];
}

interface ProviderCredentialCardProps {
  apiKey: string;
  apiPlaceholder: string;
  baseUrl: string;
  baseUrlPlaceholder: string;
  clearLabel: string;
  endpoints?: string[];
  provider: AiProvider;
  providerTest: ProviderTestState;
  showBaseUrl: boolean;
  title: string;
  onClear: (provider: AiProvider) => void;
  onSaveApiKey: (provider: AiProvider, value: string) => void;
  onSaveBaseUrl: (provider: AiProvider, value: string) => void;
  onTest: (provider: AiProvider) => void;
}

interface SettingsModalProps {
  assetStatusCounts: Record<StorageItem["type"], number>;
  chatModelGroups: ModelGroup[];
  fetchedModelOptions: FetchedModelOptions;
  imageModelGroups: ModelGroup[];
  isLoadingModels: boolean;
  modelListMessage: string;
  open: boolean;
  providerCredentials: Record<AiProvider, ProviderCredentials>;
  providerTest: ProviderTestState;
  selectedChatModel: string;
  selectedProvider: AiProvider;
  videoModelGroups: ModelGroup[];
  onClearCredentials: (provider: AiProvider) => void;
  onClose: () => void;
  onResetData: () => void;
  onAddFetchedModels: (category: ModelCategory, values: string[]) => void;
  onAddManualModels: (category: ModelCategory, value: string) => void;
  onSaveCredential: (provider: AiProvider, field: keyof ProviderCredentials, value: string) => void;
  onSelectChatModel: (value: string) => void;
  onSelectProvider: (value: AiProvider) => void;
  refreshProviderModels: () => void;
  testProviderConnection: (provider: AiProvider) => void;
}

type SettingsTab = "providers" | "models" | "system";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "providers", label: "服务商" },
  { key: "models", label: "模型" },
  { key: "system", label: "系统" },
];

const MODEL_CATEGORY_OPTIONS: { key: ModelCategory; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
];

function providerEndpointInfo(provider: AiProvider): string[] | undefined {
  const meta = getProviderMeta(provider);
  if (provider === "12ai") {
    return [`Chat/Image: ${meta.defaultBaseUrl}`, `Veo: ${meta.defaultVideoBaseUrl}`];
  }
  if (!meta.supportsImage && !meta.supportsVideo) {
    return [`Chat: ${meta.defaultBaseUrl}/v1`];
  }
  return undefined;
}

function providerClearLabel(provider: AiProvider): string {
  return getProviderMeta(provider).hasEditableBaseUrl ? "清除 Key/Base URL" : "清除 Key";
}

function ProviderCredentialCard({
  apiKey,
  apiPlaceholder,
  baseUrl,
  baseUrlPlaceholder,
  clearLabel,
  endpoints,
  provider,
  providerTest,
  showBaseUrl,
  title,
  onClear,
  onSaveApiKey,
  onSaveBaseUrl,
  onTest,
}: ProviderCredentialCardProps) {
  const isTesting = providerTest.status === "testing" && providerTest.provider === provider;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-slate-200">{title}</h4>
        {apiKey && <span className="text-[10px] text-emerald-400">Key 已保存</span>}
      </div>
      <label className="font-semibold text-slate-400 block mb-1.5">API Key</label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => onSaveApiKey(provider, e.target.value)}
        placeholder={apiPlaceholder}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-slate-700 font-mono transition"
      />
      {showBaseUrl && (
        <>
          <label className="font-semibold text-slate-400 block mt-3 mb-1.5">Base URL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => onSaveBaseUrl(provider, e.target.value)}
            placeholder={baseUrlPlaceholder}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-slate-700 font-mono transition"
          />
        </>
      )}
      {endpoints && (
        <div className="mt-3 rounded-lg bg-slate-900/70 border border-slate-800 px-3 py-2 font-mono text-[10px] text-slate-400 leading-relaxed">
          {endpoints.map(endpoint => <div key={endpoint}>{endpoint}</div>)}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onTest(provider)}
          disabled={isTesting}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:text-slate-600"
        >
          <RefreshCw className={`h-3 w-3 ${isTesting ? "animate-spin" : ""}`} />
          测试
        </button>
        <button
          type="button"
          onClick={() => onClear(provider)}
          className="h-8 rounded-lg border border-red-500/20 bg-red-950/20 px-3 text-[10px] font-semibold text-red-300 transition hover:bg-red-950/35"
        >
          {clearLabel}
        </button>
      </div>
      {providerTest.provider === provider && providerTest.message && (
        <p className={`mt-2 font-mono text-[10px] ${providerTest.status === "error" ? "text-red-300" : "text-emerald-300"}`}>
          {providerTest.message}
        </p>
      )}
    </div>
  );
}

export default function SettingsModal({
  assetStatusCounts,
  chatModelGroups,
  fetchedModelOptions,
  imageModelGroups,
  isLoadingModels,
  modelListMessage,
  open,
  providerCredentials,
  providerTest,
  selectedChatModel,
  selectedProvider,
  videoModelGroups,
  onClearCredentials,
  onClose,
  onResetData,
  onAddFetchedModels,
  onAddManualModels,
  onSaveCredential,
  onSelectChatModel,
  onSelectProvider,
  refreshProviderModels,
  testProviderConnection,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>("providers");
  const [modelCategory, setModelCategory] = useState<ModelCategory>("chat");
  const [manualModels, setManualModels] = useState("");
  const [fetchedSelection, setFetchedSelection] = useState<FetchedSelection>({ scope: "", values: [] });

  const submitManualModels = () => {
    onAddManualModels(modelCategory, manualModels);
    setManualModels("");
  };

  const activeModelGroups = modelCategory === "chat"
    ? chatModelGroups
    : modelCategory === "image"
      ? imageModelGroups
      : videoModelGroups;
  const activeModelOptions = useMemo(
    () => activeModelGroups.find(group => group.provider === selectedProvider)?.options ?? [],
    [activeModelGroups, selectedProvider],
  );
  const activeModelValues = useMemo(() => new Set(activeModelOptions.map(option => option.value)), [activeModelOptions]);
  const fetchedOptions = fetchedModelOptions[selectedProvider][modelCategory].filter(option => !activeModelValues.has(option.value));
  const fetchedSelectionScope = `${selectedProvider}:${modelCategory}`;
  const selectedFetchedModels = fetchedSelection.scope === fetchedSelectionScope ? fetchedSelection.values : [];

  const toggleFetchedModel = (value: string) => {
    setFetchedSelection(prev => {
      const values = prev.scope === fetchedSelectionScope ? prev.values : [];
      return {
        scope: fetchedSelectionScope,
        values: values.includes(value)
          ? values.filter(item => item !== value)
          : [...values, value],
      };
    });
  };

  const submitFetchedModels = () => {
    onAddFetchedModels(modelCategory, selectedFetchedModels);
    setFetchedSelection({ scope: fetchedSelectionScope, values: [] });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/80 backdrop-blur-sm p-0 sm:items-center sm:justify-center sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="flex max-h-[100dvh] min-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-850 px-4 py-3 sm:px-6 sm:py-4">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Settings className="h-5 w-5 text-amber-500" />
                设置
              </h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex shrink-0 overflow-x-auto border-b border-slate-850 px-4 sm:px-6">
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 px-4 py-2.5 text-xs font-semibold transition border-b-2 -mb-[1px] ${
                    tab === t.key
                      ? "text-amber-400 border-amber-400"
                      : "text-slate-500 border-transparent hover:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 font-sans text-xs sm:p-6">
              {tab === "providers" && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 sm:gap-4">
                  {PROVIDER_KEYS.map(provider => {
                    const creds = providerCredentials[provider];
                    const meta = getProviderMeta(provider);
                    return (
                      <ProviderCredentialCard
                        key={provider}
                        apiKey={creds.apiKey}
                        apiPlaceholder={meta.apiKeyPlaceholder}
                        baseUrl={creds.baseUrl}
                        baseUrlPlaceholder={meta.defaultBaseUrl}
                        clearLabel={providerClearLabel(provider)}
                        endpoints={providerEndpointInfo(provider)}
                        provider={provider}
                        providerTest={providerTest}
                        showBaseUrl={meta.hasEditableBaseUrl}
                        title={meta.label}
                        onClear={onClearCredentials}
                        onSaveApiKey={(p, v) => onSaveCredential(p, "apiKey", v)}
                        onSaveBaseUrl={(p, v) => onSaveCredential(p, "baseUrl", v)}
                        onTest={testProviderConnection}
                      />
                    );
                  })}
                </div>
              )}

              {tab === "models" && (
                <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[180px_1fr]">
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                      {MODEL_CATEGORY_OPTIONS.map(option => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setModelCategory(option.key)}
                          className={`h-9 text-[10px] font-semibold transition ${
                            modelCategory === option.key
                              ? "bg-amber-500/15 text-amber-300"
                              : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/45 p-2 lg:max-h-64 lg:flex-col lg:gap-1 lg:overflow-y-auto">
                      {PROVIDER_KEYS.map(provider => {
                        const count = activeModelGroups.find(group => group.provider === provider)?.options.length ?? 0;
                        const selected = provider === selectedProvider;
                        return (
                          <button
                            key={provider}
                            type="button"
                            data-active={selected ? "true" : "false"}
                            onClick={() => onSelectProvider(provider)}
                            className={`imagine-settings-provider-button flex h-9 min-w-28 items-center justify-between rounded-lg px-2 text-left transition lg:min-w-0 ${
                              selected
                                ? "bg-slate-800 text-slate-100"
                                : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                            }`}
                          >
                            <span className="font-semibold">{getProviderMeta(provider).label}</span>
                            <span className="font-mono text-[10px] text-slate-500">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col gap-3">
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/45 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {MODEL_CATEGORY_OPTIONS.find(option => option.key === modelCategory)?.label}
                          </div>
                          <div className="truncate text-sm font-semibold text-slate-200">
                            {getProviderMeta(selectedProvider).label} 模型
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={refreshProviderModels}
                          disabled={isLoadingModels}
                          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-semibold transition ${
                            isLoadingModels
                              ? "border-slate-800 bg-slate-950 text-slate-600 cursor-not-allowed"
                              : "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-850 cursor-pointer"
                          }`}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isLoadingModels ? "animate-spin" : ""}`} />
                          获取模型
                        </button>
                      </div>
                      {modelListMessage && (
                        <p className="font-mono text-[10px] text-slate-500">{modelListMessage}</p>
                      )}
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 sm:max-h-56">
                        {activeModelOptions.length === 0 ? (
                          <div className="px-3 py-6 text-center text-[11px] text-slate-600">暂无模型</div>
                        ) : (
                          activeModelOptions.map(option => {
                            const isSelectedChat = modelCategory === "chat" && option.value === selectedChatModel;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  if (modelCategory === "chat") onSelectChatModel(option.value);
                                }}
                                className={`flex min-h-10 w-full items-center justify-between gap-3 border-b border-slate-900 px-3 py-2 text-left last:border-b-0 ${
                                  modelCategory === "chat" ? "hover:bg-slate-900" : "cursor-default"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-semibold text-slate-200">{option.label}</span>
                                  <span className="block break-all font-mono text-[10px] text-slate-500">{option.value}</span>
                                </span>
                                {isSelectedChat && <Check className="h-4 w-4 shrink-0 text-amber-300" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {fetchedOptions.length > 0 && (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-slate-300">获取结果</div>
                          <button
                            type="button"
                            onClick={submitFetchedModels}
                            disabled={selectedFetchedModels.length === 0}
                            className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-850 disabled:cursor-not-allowed disabled:text-slate-600"
                          >
                            <ListPlus className="h-3.5 w-3.5" />
                            添加选中
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 sm:max-h-44">
                          {fetchedOptions.map(option => {
                            const selected = selectedFetchedModels.includes(option.value);
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => toggleFetchedModel(option.value)}
                                className={`flex min-h-10 w-full items-center justify-between gap-3 border-b border-slate-900 px-3 py-2 text-left last:border-b-0 ${
                                  selected ? "bg-amber-500/10" : "hover:bg-slate-900"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-semibold text-slate-200">{option.label}</span>
                                  <span className="block break-all font-mono text-[10px] text-slate-500">{option.value}</span>
                                </span>
                                {selected && <Check className="h-4 w-4 shrink-0 text-amber-300" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                        <textarea
                          value={manualModels}
                          onChange={(e) => setManualModels(e.target.value)}
                          placeholder={`${getProviderMeta(selectedProvider).label}: model-a, model-b`}
                          className="min-h-16 resize-y rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 placeholder-slate-650 focus:border-slate-700 focus:outline-none sm:min-h-20"
                        />
                        <button
                          type="button"
                          onClick={submitManualModels}
                          disabled={!manualModels.trim()}
                          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-850 disabled:cursor-not-allowed disabled:text-slate-600 md:self-start"
                        >
                          <ListPlus className="h-3.5 w-3.5" />
                          添加
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "system" && (
                <>
                  <div>
                    <label className="font-semibold text-slate-400 block mb-1">📡 Web 异步任务轮询间隔</label>
                    <p className="font-mono text-[10px] text-slate-300">自动侦测间隔: 4秒 (指数退避保护算法)</p>
                  </div>

                  <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-850/50">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-450 font-semibold flex items-center gap-1 text-[11px]">
                        <Info className="h-3.5 w-3.5 text-slate-500" />
                        当前本地项目库概要:
                      </span>
                      <button onClick={onResetData} className="text-[10px] text-red-400 hover:text-red-300 underline">
                        安全复位数据
                      </button>
                    </div>
                    <ul className="mt-2 text-[10px] text-slate-500 font-mono flex flex-col gap-1 list-disc pl-3">
                      <li>类型: Browser IndexedDB 离线隔离数据库</li>
                      <li>合成图片数量: {assetStatusCounts.image} 张</li>
                      <li>合成 Veo 视频: {assetStatusCounts.video} 个</li>
                    </ul>
                  </div>

                  <div className="text-[10px] text-slate-500 mt-2 flex items-start gap-1.5 leading-normal">
                    <span>ℹ️</span>
                    <span>
                      Imagine Workbench 通过统一 provider adapter 接入服务商。图片、异步图片、视频与 Agent 对话都走同一组密钥和 Base URL 规则。新增服务商只需在 registry.ts 中添加一行配置。
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-850 bg-slate-900/50 px-4 py-3 text-right sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={onClose}
                className="imagine-settings-save-button bg-slate-800 hover:bg-slate-750 text-slate-350 font-semibold px-4 py-2 rounded-lg text-xs cursor-pointer transition"
              >
                保存并关闭
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
