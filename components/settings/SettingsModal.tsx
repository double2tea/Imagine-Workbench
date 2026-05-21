import { Info, RefreshCw, Settings, X } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { StorageItem } from "@/lib/db";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";
import { PROVIDER_KEYS, getProviderMeta } from "@/lib/providers/registry";

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

interface ProviderCredentials {
  apiKey: string;
  baseUrl: string;
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
  isLoadingModels: boolean;
  modelListMessage: string;
  open: boolean;
  providerCredentials: Record<AiProvider, ProviderCredentials>;
  providerTest: ProviderTestState;
  selectedChatModel: string;
  selectedProvider: AiProvider;
  onClearCredentials: (provider: AiProvider) => void;
  onClose: () => void;
  onResetData: () => void;
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

function providerEndpointInfo(provider: AiProvider): string[] | undefined {
  if (provider === "12ai") {
    return ["Chat/Image: https://cdn.12ai.org", "Veo: https://new.12ai.org"];
  }
  if (provider === "xstx") {
    return ["Chat: https://api.xstx.info/v1"];
  }
  return undefined;
}

function providerHasEditableBaseUrl(provider: AiProvider): boolean {
  return provider !== "12ai";
}

function providerPlaceholder(provider: AiProvider): string {
  if (provider === "12ai") return "sk_your_12ai_key";
  if (provider === "grok2api") return "your_grok2api_key";
  return `sk_your_${provider}_key`;
}

function providerBaseUrlPlaceholder(provider: AiProvider): string {
  return getProviderMeta(provider).defaultBaseUrl;
}

function providerClearLabel(provider: AiProvider): string {
  if (provider === "12ai") return "清除 Key";
  return "清除 Key/Base URL";
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
  isLoadingModels,
  modelListMessage,
  open,
  providerCredentials,
  providerTest,
  selectedChatModel,
  selectedProvider,
  onClearCredentials,
  onClose,
  onResetData,
  onSaveCredential,
  onSelectChatModel,
  onSelectProvider,
  refreshProviderModels,
  testProviderConnection,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>("providers");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-850 px-6 py-4">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Settings className="h-5 w-5 text-amber-500" />
                设置
              </h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-slate-850 px-6">
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-xs font-semibold transition border-b-2 -mb-[1px] ${
                    tab === t.key
                      ? "text-amber-400 border-amber-400"
                      : "text-slate-500 border-transparent hover:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-6 flex flex-col gap-4 font-sans text-xs">
              {tab === "providers" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PROVIDER_KEYS.map(provider => {
                    const creds = providerCredentials[provider];
                    const meta = getProviderMeta(provider);
                    return (
                      <ProviderCredentialCard
                        key={provider}
                        apiKey={creds.apiKey}
                        apiPlaceholder={providerPlaceholder(provider)}
                        baseUrl={creds.baseUrl}
                        baseUrlPlaceholder={providerBaseUrlPlaceholder(provider)}
                        clearLabel={providerClearLabel(provider)}
                        endpoints={providerEndpointInfo(provider)}
                        provider={provider}
                        providerTest={providerTest}
                        showBaseUrl={providerHasEditableBaseUrl(provider)}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1.5">模型列表服务商</label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => onSelectProvider(e.target.value as AiProvider)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-300 focus:outline-none focus:border-slate-700 font-mono transition"
                    >
                      {PROVIDER_KEYS.map(provider => (
                        <option key={provider} value={provider}>{getProviderMeta(provider).label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-semibold text-slate-300">Agent / 优化模型</label>
                      <button
                        type="button"
                        onClick={refreshProviderModels}
                        disabled={isLoadingModels}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition ${
                          isLoadingModels
                            ? "border-slate-800 bg-slate-950 text-slate-600 cursor-not-allowed"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 cursor-pointer"
                        }`}
                      >
                        <RefreshCw className={`h-3 w-3 ${isLoadingModels ? "animate-spin" : ""}`} />
                        获取模型
                      </button>
                    </div>
                    <select
                      value={selectedChatModel}
                      onChange={(e) => onSelectChatModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-slate-300 focus:outline-none focus:border-slate-700 font-mono transition"
                    >
                      {chatModelGroups.map(group => (
                        <optgroup key={group.provider} label={group.label}>
                          {group.options.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {modelListMessage && (
                      <p className="mt-1.5 text-[10px] text-slate-500 font-mono">{modelListMessage}</p>
                    )}
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

            <div className="border-t border-slate-850 bg-slate-900/50 px-6 py-4 text-right">
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-800 hover:bg-slate-750 text-slate-350 font-semibold px-4 py-2 rounded-lg text-xs cursor-pointer transition"
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
