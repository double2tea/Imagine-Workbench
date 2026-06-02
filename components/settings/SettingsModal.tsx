import { Info, Settings, X } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { StorageItem } from "@/lib/db";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";
import { ConnectionSettingsWorkspace } from "@/components/settings/ConnectionSettingsWorkspace";
import type { ProviderTestState } from "@/components/settings/provider-settings-types";
import type { ProviderCredentials } from "@/lib/providers/types";

export type { ProviderTestState };

interface ModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

type ModelCategory = "chat" | "image" | "video";
type FetchedModelOptions = Record<AiProvider, Record<ModelCategory, ModelOption[]>>;

interface SettingsModalProps {
  assetFailedCount: number;
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

type SettingsTab = "connections" | "system";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "connections", label: "连接" },
  { key: "system", label: "系统" },
];

export default function SettingsModal({
  assetFailedCount,
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
  const [tab, setTab] = useState<SettingsTab>("connections");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="imagine-settings-overlay fixed inset-0 z-50 flex items-stretch justify-end p-0 sm:items-center sm:justify-center sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="imagine-settings-panel flex max-h-[100dvh] min-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
          >
            <div className="imagine-settings-header flex shrink-0 items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
              <h3 className="imagine-settings-title flex items-center gap-2">
                <Settings className="h-5 w-5 text-amber-500" />
                设置
              </h3>
              <button type="button" onClick={onClose} className="imagine-settings-close-btn">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="imagine-settings-tabs flex shrink-0 overflow-x-auto px-4 sm:px-6">
              {TABS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  data-active={tab === item.key ? "true" : "false"}
                  className="imagine-settings-tab"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 font-sans text-xs sm:p-6">
              {tab === "connections" && (
                <ConnectionSettingsWorkspace
                  chatModelGroups={chatModelGroups}
                  fetchedModelOptions={fetchedModelOptions}
                  imageModelGroups={imageModelGroups}
                  isLoadingModels={isLoadingModels}
                  modelListMessage={modelListMessage}
                  providerCredentials={providerCredentials}
                  providerTest={providerTest}
                  selectedChatModel={selectedChatModel}
                  selectedProvider={selectedProvider}
                  videoModelGroups={videoModelGroups}
                  onAddFetchedModels={onAddFetchedModels}
                  onAddManualModels={onAddManualModels}
                  onClearCredentials={onClearCredentials}
                  onSaveCredential={onSaveCredential}
                  onSelectChatModel={onSelectChatModel}
                  onSelectProvider={onSelectProvider}
                  refreshProviderModels={refreshProviderModels}
                  testProviderConnection={testProviderConnection}
                />
              )}

              {tab === "system" && (
                <div className="flex max-w-xl flex-col gap-4">
                  <div>
                    <label className="imagine-settings-label">Web 异步任务轮询</label>
                    <p className="font-mono text-[10px] text-[var(--iw-muted)]">
                      自动侦测间隔 4 秒，指数退避保护
                    </p>
                  </div>

                  <div className="imagine-settings-info-panel">
                    <div className="flex items-center justify-between">
                      <span className="imagine-settings-info-title">
                        <Info className="h-3.5 w-3.5 text-[var(--iw-faint)]" />
                        本地项目库概要
                      </span>
                      <button
                        type="button"
                        onClick={onResetData}
                        className="text-[10px] text-red-400 underline transition hover:text-red-300"
                      >
                        安全复位数据
                      </button>
                    </div>
                    <ul className="imagine-settings-info-list">
                      <li>类型: 浏览器本地离线存储</li>
                      <li>合成图片数量: {assetStatusCounts.image} 张</li>
                      <li>合成视频: {assetStatusCounts.video} 个</li>
                      <li>失败任务数量: {assetFailedCount} 个</li>
                      <li>
                        失败任务会保留重试快照，可能包含上传参考图；重试成功、删除失败项或复位数据后清除。
                      </li>
                    </ul>
                  </div>

                  <p className="text-[10px] leading-relaxed text-[var(--iw-faint)]">
                    Imagine Workbench 通过统一 provider adapter 接入服务商。图片、视频与 Agent
                    对话共用密钥与 Base URL 规则；新增服务商只需在 registry.ts 添加配置。
                  </p>
                </div>
              )}
            </div>

            <div className="imagine-settings-footer sm:px-6 sm:py-4">
              <button type="button" onClick={onClose} className="imagine-settings-save-button">
                保存并关闭
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}