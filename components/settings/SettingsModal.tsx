import { Settings, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";
import { ConnectionSettingsWorkspace } from "@/components/settings/ConnectionSettingsWorkspace";
import DataManagementWorkspace from "@/components/settings/DataManagementWorkspace";
import { FeatureModelSettingsWorkspace } from "@/components/settings/FeatureModelSettingsWorkspace";
import type { ProviderTestState } from "@/components/settings/provider-settings-types";
import type { ImageEditFeature, ImageEditFeatureModels } from "@/hooks/useImageEditFeatureModels";
import type { ResolveCheckStatus } from "@/hooks/useResolveIntegrationSettings";
import type { CustomProviderDefinition } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";
import { WORKBENCH_OVERLAY_TRANSITION, WORKBENCH_PANEL_TRANSITION } from "@/lib/workbench-motion";
import {
  getWorkspaceDataSummary,
  type LocalStorageCleanupKind,
  type WorkspaceCleanupKind,
  type WorkspaceDataSummary,
} from "@/lib/data-management";

export type { ProviderTestState };

interface ModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

type ModelCategory = "chat" | "image" | "video" | "audio";
type FetchedModelOptions = Record<AiProvider, Record<ModelCategory, ModelOption[]>>;

interface SettingsModalProps {
  audioModelGroups: ModelGroup[];
  chatModelGroups: ModelGroup[];
  fetchedModelOptions: FetchedModelOptions;
  imageModelGroups: ModelGroup[];
  isLoadingModels: boolean;
  modelListMessage: string;
  open: boolean;
  customProviders: CustomProviderDefinition[];
  providerCredentials: Record<AiProvider, ProviderCredentials>;
  providerKeys: AiProvider[];
  providerTest: ProviderTestState;
  resolveCheckStatus?: ResolveCheckStatus;
  resolveIntegrationAvailable?: boolean;
  resolveIntegrationEnabled?: boolean;
  selectedChatModel: string;
  selectedProvider: AiProvider;
  imageEditFeatureModels: ImageEditFeatureModels;
  videoModelGroups: ModelGroup[];
  hasCurrentBoard?: boolean;
  onAddCustomProvider: (label: string, baseUrl: string) => boolean;
  onCleanupAssets: (kind: WorkspaceCleanupKind) => Promise<void>;
  onClearCredentials: (provider: AiProvider) => void;
  onClearLocalStorage: (kind: LocalStorageCleanupKind) => Promise<void>;
  onClose: () => void;
  onClearAssets: () => Promise<void>;
  onDownloadSafetySnapshot: () => Promise<void>;
  onDuplicateCurrentBoard?: () => Promise<void>;
  onExportCurrentBoard?: (includeCredentials: boolean) => Promise<void>;
  onExportWorkspace: (includeCredentials: boolean) => Promise<void>;
  onImportLocalAssets: (files: File[]) => Promise<void>;
  onImportWorkspace: (file: File, includeCredentials: boolean) => Promise<void>;
  onRepairAssetSources: () => Promise<void>;
  onResetBoards: () => Promise<void>;
  onRunResolveCheck?: () => void;
  onAddFetchedModels: (category: ModelCategory, values: string[]) => void;
  onAddManualModels: (category: ModelCategory, value: string) => void;
  onSaveCredential: (provider: AiProvider, field: keyof ProviderCredentials, value: string) => void;
  onSelectChatModel: (value: string) => void;
  onSelectImageEditFeatureModel: (feature: ImageEditFeature, model: string) => void;
  onSelectProvider: (value: AiProvider) => void;
  onToggleResolveIntegration?: (enabled: boolean) => void;
  onDeleteCustomProvider: (provider: AiProvider) => void;
  refreshProviderModels: () => void;
  testProviderConnection: (provider: AiProvider) => void;
}

type SettingsTab = "connections" | "feature-models" | "data";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "connections", label: "连接" },
  { key: "feature-models", label: "功能模型" },
  { key: "data", label: "数据" },
];

function formatSettingsError(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "数据统计读取失败";
}

export default function SettingsModal({
  audioModelGroups,
  chatModelGroups,
  fetchedModelOptions,
  imageModelGroups,
  isLoadingModels,
  modelListMessage,
  open,
  customProviders,
  providerCredentials,
  providerKeys,
  providerTest,
  resolveCheckStatus = "idle",
  resolveIntegrationAvailable = false,
  resolveIntegrationEnabled = false,
  selectedChatModel,
  selectedProvider,
  imageEditFeatureModels,
  videoModelGroups,
  hasCurrentBoard = false,
  onAddCustomProvider,
  onCleanupAssets,
  onClearCredentials,
  onClearLocalStorage,
  onClearAssets,
  onClose,
  onDownloadSafetySnapshot,
  onDuplicateCurrentBoard,
  onExportCurrentBoard,
  onExportWorkspace,
  onImportLocalAssets,
  onImportWorkspace,
  onRepairAssetSources,
  onResetBoards,
  onRunResolveCheck,
  onAddFetchedModels,
  onAddManualModels,
  onSaveCredential,
  onSelectChatModel,
  onSelectImageEditFeatureModel,
  onSelectProvider,
  onToggleResolveIntegration,
  onDeleteCustomProvider,
  refreshProviderModels,
  testProviderConnection,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>("connections");
  const [dataSummary, setDataSummary] = useState<WorkspaceDataSummary | null>(null);
  const [dataSummaryError, setDataSummaryError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const refreshDataSummary = useCallback(async () => {
    try {
      setDataSummaryError(null);
      setDataSummary(await getWorkspaceDataSummary());
    } catch (error) {
      setDataSummary(null);
      setDataSummaryError(formatSettingsError(error));
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== "data") return;
    const refreshTimer = window.setTimeout(() => {
      void refreshDataSummary();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [open, refreshDataSummary, tab]);

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    const getFocusableElements = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];

    const focusTimer = window.setTimeout(() => {
      getFocusableElements()[0]?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        return;
      }

      if (document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      const nextFocusTarget = triggerRef.current;
      triggerRef.current = null;
      if (nextFocusTarget?.isConnected) {
        window.setTimeout(() => {
          if (nextFocusTarget.isConnected) nextFocusTarget.focus();
        }, 0);
      }
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={WORKBENCH_OVERLAY_TRANSITION}
          className="imagine-settings-overlay fixed inset-0 z-50 flex items-stretch justify-end p-0 sm:items-center sm:justify-center sm:p-4"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="imagine-settings-title"
            initial={{ opacity: 0, scale: 0.965, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.965, y: 10 }}
            transition={WORKBENCH_PANEL_TRANSITION}
            className="imagine-settings-panel flex w-full flex-col overflow-hidden sm:rounded-2xl"
          >
            <div className="imagine-settings-header flex shrink-0 items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
              <h3 id="imagine-settings-title" className="imagine-settings-title flex items-center gap-2">
                <Settings className="h-5 w-5 text-amber-500" />
                设置
              </h3>
              <button type="button" onClick={onClose} className="imagine-settings-close-btn" aria-label="关闭设置">
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
                  className="imagine-settings-tab imagine-motion-interactive"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="imagine-settings-content flex min-h-0 flex-1 flex-col overflow-y-auto p-4 font-sans text-xs sm:p-6">
              {tab === "connections" && (
                <ConnectionSettingsWorkspace
                  chatModelGroups={chatModelGroups}
                  audioModelGroups={audioModelGroups}
                  customProviders={customProviders}
                  fetchedModelOptions={fetchedModelOptions}
                  imageModelGroups={imageModelGroups}
                  isLoadingModels={isLoadingModels}
                  modelListMessage={modelListMessage}
                  providerCredentials={providerCredentials}
                  providerKeys={providerKeys}
                  providerTest={providerTest}
                  resolveCheckStatus={resolveCheckStatus}
                  resolveIntegrationAvailable={resolveIntegrationAvailable}
                  resolveIntegrationEnabled={resolveIntegrationEnabled}
                  selectedChatModel={selectedChatModel}
                  selectedProvider={selectedProvider}
                  videoModelGroups={videoModelGroups}
                  onAddCustomProvider={onAddCustomProvider}
                  onAddFetchedModels={onAddFetchedModels}
                  onAddManualModels={onAddManualModels}
                  onClearCredentials={onClearCredentials}
                  onSaveCredential={onSaveCredential}
                  onSelectChatModel={onSelectChatModel}
                  onSelectProvider={onSelectProvider}
                  onDeleteCustomProvider={onDeleteCustomProvider}
                  onRunResolveCheck={onRunResolveCheck}
                  refreshProviderModels={refreshProviderModels}
                  testProviderConnection={testProviderConnection}
                  onToggleResolveIntegration={onToggleResolveIntegration}
                />
              )}

              {tab === "feature-models" && (
                <FeatureModelSettingsWorkspace
                  featureModels={imageEditFeatureModels}
                  imageModelGroups={imageModelGroups}
                  onSelectFeatureModel={onSelectImageEditFeatureModel}
                />
              )}

              {tab === "data" && (
                <DataManagementWorkspace
                  hasCurrentBoard={hasCurrentBoard}
                  summary={dataSummary}
                  summaryError={dataSummaryError}
                  onCleanupAssets={onCleanupAssets}
                  onClearAssets={onClearAssets}
                  onClearLocalStorage={onClearLocalStorage}
                  onDownloadSafetySnapshot={onDownloadSafetySnapshot}
                  onDuplicateCurrentBoard={onDuplicateCurrentBoard}
                  onExportCurrentBoard={onExportCurrentBoard}
                  onExportWorkspace={onExportWorkspace}
                  onImportLocalAssets={onImportLocalAssets}
                  onImportWorkspace={onImportWorkspace}
                  onRefreshSummary={refreshDataSummary}
                  onRepairAssetSources={onRepairAssetSources}
                  onResetBoards={onResetBoards}
                />
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
