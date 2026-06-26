import { Settings, X } from "lucide-react";
import { useLocale, useTranslations } from "@/lib/i18n";
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
import {
  fetchTeamStorageHealth,
  fetchWorkspaceStorageRuntimeStatus,
  runTeamStorageMigrations,
  type TeamStorageHealth,
} from "@/lib/storage/team-client";
import type { PublicLocalStorageRuntimeStatus } from "@/lib/storage/local-public-runtime";

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
  selectedDefaultAudioModel: string;
  selectedDefaultImageModel: string;
  selectedDefaultVideoModel: string;
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
  onSelectDefaultAudioModel: (value: string) => void;
  onSelectDefaultImageModel: (value: string) => void;
  onSelectDefaultVideoModel: (value: string) => void;
  onSelectImageEditFeatureModel: (feature: ImageEditFeature, model: string) => void;
  onSelectProvider: (value: AiProvider) => void;
  onToggleResolveIntegration?: (enabled: boolean) => void;
  onDeleteCustomProvider: (provider: AiProvider) => void;
  refreshProviderModels: () => void;
  testProviderConnection: (provider: AiProvider) => void;
}

type SettingsTab = "connections" | "feature-models" | "data";

function formatSettingsError(error: unknown, t: (key: string) => string): string {
  return error instanceof Error && error.message.trim() ? error.message : t("modal.dataSummaryError");
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
  selectedDefaultAudioModel,
  selectedDefaultImageModel,
  selectedDefaultVideoModel,
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
  onSelectDefaultAudioModel,
  onSelectDefaultImageModel,
  onSelectDefaultVideoModel,
  onSelectImageEditFeatureModel,
  onSelectProvider,
  onToggleResolveIntegration,
  onDeleteCustomProvider,
  refreshProviderModels,
  testProviderConnection,
}: SettingsModalProps) {
  const { t, locale } = useTranslations("settings");
  const { setLocale } = useLocale();
  const [tab, setTab] = useState<SettingsTab>("connections");
  const [dataSummary, setDataSummary] = useState<WorkspaceDataSummary | null>(null);
  const [dataSummaryError, setDataSummaryError] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<PublicLocalStorageRuntimeStatus | null>(null);
  const [storageStatusError, setStorageStatusError] = useState<string | null>(null);
  const [teamHealth, setTeamHealth] = useState<TeamStorageHealth | null>(null);
  const [teamHealthError, setTeamHealthError] = useState<string | null>(null);
  const [teamMigrationBusy, setTeamMigrationBusy] = useState(false);
  const [teamSetupToken, setTeamSetupToken] = useState("");
  const tabs: Array<{ key: SettingsTab; label: string }> = [
    { key: "connections", label: t("tabs.connections") },
    { key: "feature-models", label: t("tabs.featureModels") },
    { key: "data", label: t("tabs.data") },
  ];
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
      setDataSummaryError(formatSettingsError(error, t));
    }
  }, []);

  const refreshStorageStatus = useCallback(async () => {
    try {
      setStorageStatusError(null);
      setTeamHealthError(null);
      const status = await fetchWorkspaceStorageRuntimeStatus();
      setStorageStatus(status);
      if (status.mode === "postgres") {
        setTeamHealth(await fetchTeamStorageHealth());
      } else {
        setTeamHealth(null);
      }
    } catch (error) {
      setStorageStatus(null);
      setTeamHealth(null);
      setStorageStatusError(formatSettingsError(error, t));
    }
  }, [t]);

  const runTeamMigrations = useCallback(async () => {
    setTeamMigrationBusy(true);
    try {
      setTeamHealthError(null);
      await runTeamStorageMigrations(teamSetupToken);
      setTeamSetupToken("");
      await refreshStorageStatus();
    } catch (error) {
      setTeamHealthError(formatSettingsError(error, t));
    } finally {
      setTeamMigrationBusy(false);
    }
  }, [refreshStorageStatus, t, teamSetupToken]);

  useEffect(() => {
    if (!open || tab !== "data") return;
    const refreshTimer = window.setTimeout(() => {
      void refreshDataSummary();
      void refreshStorageStatus();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [open, refreshDataSummary, refreshStorageStatus, tab]);

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
                {t("modal.title")}
              </h3>
              <button type="button" onClick={onClose} className="imagine-settings-close-btn" aria-label={t("modal.closeAriaLabel")}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="imagine-settings-tabs flex shrink-0 overflow-x-auto px-4 sm:px-6">
              {tabs.map(item => (
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
                  selectedDefaultAudioModel={selectedDefaultAudioModel}
                  selectedDefaultImageModel={selectedDefaultImageModel}
                  selectedDefaultVideoModel={selectedDefaultVideoModel}
                  selectedProvider={selectedProvider}
                  videoModelGroups={videoModelGroups}
                  onAddCustomProvider={onAddCustomProvider}
                  onAddFetchedModels={onAddFetchedModels}
                  onAddManualModels={onAddManualModels}
                  onClearCredentials={onClearCredentials}
                  onSaveCredential={onSaveCredential}
                  onSelectChatModel={onSelectChatModel}
                  onSelectDefaultAudioModel={onSelectDefaultAudioModel}
                  onSelectDefaultImageModel={onSelectDefaultImageModel}
                  onSelectDefaultVideoModel={onSelectDefaultVideoModel}
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
                  storageStatus={storageStatus}
                  storageStatusError={storageStatusError}
                  teamHealth={teamHealth}
                  teamHealthError={teamHealthError}
                  teamMigrationBusy={teamMigrationBusy}
                  teamSetupToken={teamSetupToken}
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
                  onRefreshStorageStatus={refreshStorageStatus}
                  onRepairAssetSources={onRepairAssetSources}
                  onResetBoards={onResetBoards}
                  onRunTeamMigrations={runTeamMigrations}
                  onTeamSetupTokenChange={setTeamSetupToken}
                />
              )}
            </div>

            <div className="imagine-settings-footer sm:px-6 sm:py-4">
              <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-[var(--iw-border)] p-2 text-[10px] text-[var(--iw-muted)]">
                <span>{t("appearance.language")}</span>
                <select
                  value={locale}
                  onChange={event => setLocale(event.target.value === "en" ? "en" : "zh")}
                  className="imagine-select h-7 px-1.5 py-0 text-[11px]"
                  aria-label={t("appearance.language")}
                >
                  <option value="zh">{t("appearance.languageOptions.zh")}</option>
                  <option value="en">{t("appearance.languageOptions.en")}</option>
                </select>
              </div>
              <button type="button" onClick={onClose} className="imagine-settings-save-button">
                {t("modal.saveAndClose")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
