import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  FileArchive,
  FileInput,
  HardDrive,
  ListChecks,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm, type ConfirmRequest } from "@/components/confirm/ConfirmProvider";
import { usePriceDisplaySetting } from "@/hooks/usePriceDisplaySetting";
import {
  formatBytes,
  formatWorkspaceSafetySnapshotReason,
  type LocalStorageCleanupKind,
  type WorkspaceCleanupKind,
  type WorkspaceDataSummary,
} from "@/lib/data-management";
import { getClearWorkspaceAssetsMessage } from "@/lib/workspace-messages";

interface DataManagementWorkspaceProps {
  hasCurrentBoard: boolean;
  summary: WorkspaceDataSummary | null;
  summaryError: string | null;
  onCleanupAssets: (kind: WorkspaceCleanupKind) => Promise<void>;
  onClearAssets: () => Promise<void>;
  onClearLocalStorage: (kind: LocalStorageCleanupKind) => Promise<void>;
  onDownloadSafetySnapshot: () => Promise<void>;
  onDuplicateCurrentBoard?: () => Promise<void>;
  onExportCurrentBoard?: (includeCredentials: boolean) => Promise<void>;
  onExportWorkspace: (includeCredentials: boolean) => Promise<void>;
  onImportLocalAssets: (files: File[]) => Promise<void>;
  onImportWorkspace: (file: File, includeCredentials: boolean) => Promise<void>;
  onRefreshSummary: () => Promise<void>;
  onRepairAssetSources: () => Promise<void>;
  onResetBoards: () => Promise<void>;
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

interface StatCardProps {
  label: string;
  primary: string;
  secondary: string;
}

interface HealthAction {
  busyLabel: string;
  confirmRequest: ConfirmRequest;
  label: string;
  run: () => Promise<void>;
}

interface HealthIssueGroup {
  action?: HealthAction;
  count: number;
  details: string[];
  key: string;
  title: string;
  tone: "critical" | "attention" | "neutral";
}

function StatCard({ label, primary, secondary }: StatCardProps) {
  return (
    <div className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
      <p className="text-[10px] font-semibold uppercase text-[var(--iw-faint)]">{label}</p>
      <p className="mt-2 font-mono text-lg font-semibold text-[var(--iw-text)]">{primary}</p>
      <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">{secondary}</p>
    </div>
  );
}

function healthCopy(status: WorkspaceDataSummary["integrity"]["status"] | undefined, t: TranslateFn): {
  label: string;
  detail: string;
  className: string;
  tone: WorkspaceDataSummary["integrity"]["status"];
} {
  if (status === "healthy") {
    return {
      label: t("dataManagement.healthStatus.healthy"),
      detail: t("dataManagement.healthStatus.healthyDetail"),
      className: "imagine-tone-surface",
      tone: "healthy",
    };
  }
  if (status === "critical") {
    return {
      label: t("dataManagement.healthStatus.critical"),
      detail: t("dataManagement.healthStatus.criticalDetail"),
      className: "imagine-tone-surface",
      tone: "critical",
    };
  }
  return {
    label: t("dataManagement.healthStatus.attention"),
    detail: t("dataManagement.healthStatus.attentionDetail"),
    className: "imagine-tone-surface",
    tone: "attention",
  };
}

function issueToneClassName(tone: HealthIssueGroup["tone"]): string {
  if (tone === "critical" || tone === "attention") return "imagine-tone-surface";
  return "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]";
}

const CLEANUP_LABEL_BY_KIND: Record<WorkspaceCleanupKind, string> = {
  failed: "dataManagement.cleanupLabels.failed",
  "stale-processing": "dataManagement.cleanupLabels.staleProcessing",
  "broken-complete": "dataManagement.cleanupLabels.brokenComplete",
  orphaned: "dataManagement.cleanupLabels.orphaned",
};

const LOCAL_STORAGE_LABEL_BY_KIND: Record<LocalStorageCleanupKind, string> = {
  agent: "dataManagement.localStorageLabels.agent",
  "model-cache": "dataManagement.localStorageLabels.modelCache",
  "provider-credentials": "dataManagement.localStorageLabels.providerCredentials",
  "ui-preferences": "dataManagement.localStorageLabels.uiPreferences",
};

function buildRepairSourcesConfirmRequest(t: TranslateFn): ConfirmRequest {
  return {
    message: t("dataManagement.repairSourcesMessage"),
    confirmLabel: t("dataManagement.repairSourcesConfirmLabel"),
  };
}

function buildResetBoardsConfirmRequest(t: TranslateFn): ConfirmRequest {
  return {
    message: t("dataManagement.resetBoardsMessage"),
    tone: "danger",
    confirmLabel: t("dataManagement.resetBoardsConfirmLabel"),
  };
}

function buildCleanupConfirmRequest(kind: WorkspaceCleanupKind, t: TranslateFn): ConfirmRequest {
  return {
    message: t("dataManagement.cleanupConfirmTemplate", { label: t(CLEANUP_LABEL_BY_KIND[kind]) }),
    tone: "danger",
    confirmLabel: t("dataManagement.cleanupConfirmLabel"),
  };
}

function buildLocalStorageConfirmRequest(kind: LocalStorageCleanupKind, t: TranslateFn): ConfirmRequest {
  return {
    message: t("dataManagement.cleanupConfirmTemplate", { label: t(LOCAL_STORAGE_LABEL_BY_KIND[kind]) }),
    tone: "danger",
    confirmLabel: t("dataManagement.cleanupConfirmLabel"),
  };
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "--";
  return `${Math.round(value * 100)}%`;
}

function DetailList({ details, t }: { details: string[]; t: TranslateFn }) {
  if (details.length === 0) {
    return <p className="mt-2 text-[11px] text-[var(--iw-muted)]">{t("dataManagement.noDetails")}</p>;
  }
  return (
    <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-md border border-[var(--iw-border)] bg-black/10 p-2">
      {details.slice(0, 80).map(detail => (
        <li key={detail} className="break-all font-mono text-[10px] leading-4 text-[var(--iw-muted)]">
          {detail}
        </li>
      ))}
      {details.length > 80 ? (
        <li className="font-mono text-[10px] leading-4 text-[var(--iw-faint)]">
          {t("dataManagement.moreDetailsHidden", { count: details.length - 80 })}
        </li>
      ) : null}
    </ul>
  );
}

export default function DataManagementWorkspace({
  hasCurrentBoard,
  summary,
  summaryError,
  onCleanupAssets,
  onClearAssets,
  onClearLocalStorage,
  onDownloadSafetySnapshot,
  onDuplicateCurrentBoard,
  onExportCurrentBoard,
  onExportWorkspace,
  onImportLocalAssets,
  onImportWorkspace,
  onRefreshSummary,
  onRepairAssetSources,
  onResetBoards,
}: DataManagementWorkspaceProps) {
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const localAssetInputRef = useRef<HTMLInputElement | null>(null);
  const confirmAction = useConfirm();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showPrice, setShowPrice] = usePriceDisplaySetting();
  const { t } = useTranslations("settings");

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusyLabel(label);
    try {
      await action();
      await onRefreshSummary();
    } finally {
      setBusyLabel(null);
    }
  };

  const runConfirmedAction = async (
    label: string,
    request: ConfirmRequest,
    action: () => Promise<void>,
  ) => {
    if (!(await confirmAction(request))) return;
    await runAction(label, action);
  };

  const handleBackupFileChange = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    void runAction(t("dataManagement.restoreBackupBusy"), () => onImportWorkspace(file, includeCredentials));
    if (backupInputRef.current) backupInputRef.current.value = "";
  };

  const handleLocalAssetChange = (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    void runAction(t("dataManagement.importMediaBusy"), () => onImportLocalAssets(files));
    if (localAssetInputRef.current) localAssetInputRef.current.value = "";
  };

  const assetSummary = summary?.assets;
  const boardSummary = summary?.boards;
  const storageSummary = summary?.localStorage;
  const integrity = summary?.integrity;
  const quota = summary?.browserStorage?.quota;
  const usage = summary?.browserStorage?.usage;
  const usageRatio = quota && usage !== undefined ? Math.min(1, usage / quota) : undefined;
  const assetStores = assetSummary?.stores;
  const latestSafetySnapshot = summary?.safety.latestSnapshot ?? null;
  const health = healthCopy(integrity?.status, t);
  const actionDisabled = busyLabel !== null;

  const issueGroups = useMemo<HealthIssueGroup[]>(() => {
    if (!integrity) return [];
    return [
      {
        key: "missing-references",
        title: t("dataManagement.issueGroups.missingReferences"),
        count: integrity.missingBoardReferences.length,
        tone: "critical",
        details: integrity.missingBoardReferences.map(reference =>
          `${reference.boardTitle} (${reference.boardId}) / ${reference.nodeKind}:${reference.nodeId} / ${reference.field} -> ${reference.assetId}`,
        ),
      },
      {
        key: "broken-complete",
        title: t("dataManagement.issueGroups.brokenComplete"),
        count: integrity.brokenCompleteAssetIds.length,
        tone: "critical",
        action: {
          label: t("dataManagement.issueGroups.cleanBrokenRecords"),
          busyLabel: t("dataManagement.issueGroups.cleanBrokenRecordsBusy"),
          confirmRequest: buildCleanupConfirmRequest("broken-complete", t),
          run: () => onCleanupAssets("broken-complete"),
        },
        details: integrity.brokenCompleteAssetIds,
      },
      {
        key: "stale-source-links",
        title: t("dataManagement.issueGroups.staleSourceLinks"),
        count: integrity.staleAssetSourceLinks.length,
        tone: "attention",
        action: {
          label: t("dataManagement.issueGroups.repairSources"),
          busyLabel: t("dataManagement.issueGroups.repairSourcesBusy"),
          confirmRequest: buildRepairSourcesConfirmRequest(t),
          run: onRepairAssetSources,
        },
        details: integrity.staleAssetSourceLinks.map(link =>
          `${link.assetId} / board:${link.boardId || "workspace"} / source:${link.sourceBoardNodeId} / ${link.status}`,
        ),
      },
      {
        key: "stale-processing",
        title: t("dataManagement.issueGroups.staleProcessing"),
        count: integrity.staleProcessingAssetIds.length,
        tone: "attention",
        action: {
          label: t("dataManagement.issueGroups.cleanStale"),
          busyLabel: t("dataManagement.issueGroups.cleanStaleBusy"),
          confirmRequest: buildCleanupConfirmRequest("stale-processing", t),
          run: () => onCleanupAssets("stale-processing"),
        },
        details: integrity.staleProcessingAssetIds,
      },
      {
        key: "failed-assets",
        title: t("dataManagement.issueGroups.failedAssets"),
        count: integrity.failedAssetIds.length,
        tone: "attention",
        action: {
          label: t("dataManagement.issueGroups.cleanFailed"),
          busyLabel: t("dataManagement.issueGroups.cleanFailedBusy"),
          confirmRequest: buildCleanupConfirmRequest("failed", t),
          run: () => onCleanupAssets("failed"),
        },
        details: integrity.failedAssetIds,
      },
    ];
  }, [integrity, onCleanupAssets, onRepairAssetSources, t]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(current => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <input
        ref={backupInputRef}
        type="file"
        accept=".zip,application/zip"
        name="workspace-backup-import"
        aria-label={t("dataManagement.importBackupAriaLabel")}
        className="hidden"
        onChange={event => handleBackupFileChange(event.target.files)}
      />
      <input
        ref={localAssetInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        name="workspace-local-asset-import"
        aria-label={t("dataManagement.importLocalAssetAriaLabel")}
        className="hidden"
        onChange={event => handleLocalAssetChange(event.target.files)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--iw-text)]">{t("dataManagement.title")}</p>
          <p className="mt-1 text-[11px] text-[var(--iw-muted)]">
            {t("dataManagement.description")}
          </p>
        </div>
        <button
          type="button"
          disabled={actionDisabled}
          onClick={() => void runAction(t("dataManagement.refreshingStatsLabel"), onRefreshSummary)}
          className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("dataManagement.refreshButton")}
        </button>
      </div>

      {busyLabel ? (
        <div className="imagine-tone-surface rounded-lg border px-3 py-2 font-mono text-[11px]" data-tone="info">
          {busyLabel}...
        </div>
      ) : null}
      {summaryError ? (
        <div className="imagine-tone-surface rounded-lg border px-3 py-2 text-[11px] leading-5" data-tone="danger">
          {t("dataManagement.dataStatsError", { error: summaryError })}
        </div>
      ) : null}

      <section className={["imagine-data-health rounded-lg border p-3", health.className].join(" ")} data-tone={health.tone}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {integrity?.status === "healthy" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <div>
              <p className="text-xs font-semibold">{t("dataManagement.dataStatusLabel")}：{health.label}</p>
              <p className="mt-1 text-[11px] leading-5 opacity-85">{health.detail}</p>
            </div>
          </div>
          <div className="font-mono text-sm font-semibold">
            {integrity ? t("dataManagement.issueCount", { count: integrity.issueCount }) : "--"}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("dataManagement.statCards.assets")}
          primary={assetSummary ? String(assetSummary.total) : "--"}
          secondary={assetSummary
            ? t("dataManagement.assetsDetailTemplate", { image: assetSummary.image, video: assetSummary.video, audio: assetSummary.audio, transcript: assetSummary.transcript })
            : t("dataManagement.statCards.waitingStats")}
        />
        <StatCard
          label={t("dataManagement.statCards.boards")}
          primary={boardSummary ? String(boardSummary.total) : "--"}
          secondary={boardSummary ? t("dataManagement.boardsDetailTemplate", { nodes: boardSummary.nodes, bytes: formatBytes(boardSummary.estimatedBytes) }) : t("dataManagement.statCards.waitingStats")}
        />
        <StatCard
          label={t("dataManagement.statCards.localSettings")}
          primary={storageSummary ? String(storageSummary.agentKeys + storageSummary.modelCacheKeys + storageSummary.uiPreferenceKeys + storageSummary.credentialKeys) : "--"}
          secondary={storageSummary ? t("dataManagement.localSettingsDetailTemplate", { agentKeys: storageSummary.agentKeys, modelCacheKeys: storageSummary.modelCacheKeys, credentialKeys: storageSummary.credentialKeys }) : t("dataManagement.statCards.waitingStats")}
        />
        <StatCard
          label={t("dataManagement.statCards.browserStorage")}
          primary={usage !== undefined ? formatBytes(usage) : "--"}
          secondary={quota !== undefined ? t("dataManagement.browserStorageDetailTemplate", { quota: formatBytes(quota), percent: formatPercent(usageRatio) }) : t("dataManagement.statCards.browserNoQuota")}
        />
      </div>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
            <ListChecks className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />
            {t("dataManagement.integrityDiagnosis")}
          </p>
          <p className="font-mono text-[11px] text-[var(--iw-muted)]">
            {integrity ? t("dataManagement.issueCount", { count: integrity.issueCount }) : t("dataManagement.statCards.waitingStats")}
          </p>
        </div>
        <div className="mt-3 grid gap-2">
          {issueGroups.map(group => {
            const expanded = expandedGroups[group.key] === true;
            const action = group.action;
            return (
              <div
                key={group.key}
                className={["imagine-data-issue rounded-lg border px-3 py-2", issueToneClassName(group.tone)].join(" ")}
                data-tone={group.tone}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex min-w-0 items-center gap-2 text-left"
                    aria-expanded={expanded}
                  >
                    <ChevronDown className={["h-3.5 w-3.5 shrink-0 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
                    <span className="truncate text-[11px] font-semibold">{group.title}</span>
                    <span className="font-mono text-[11px] opacity-80">{group.count}</span>
                  </button>
                  {action && group.count > 0 ? (
                    <button
                      type="button"
                      disabled={actionDisabled}
                      onClick={() => void runConfirmedAction(action.busyLabel, action.confirmRequest, action.run)}
                      className="imagine-secondary-action h-7 rounded-md border border-[var(--iw-border)] px-2 text-[10px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  ) : null}
                </div>
                {expanded ? <DetailList details={group.details} t={t} /> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
              <Database className="imagine-tone-icon h-3.5 w-3.5" data-tone="accent" />
              {t("dataManagement.storageStructure")}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
              {t("dataManagement.storageStructureDescription")}
            </p>
          </div>
          <p className="font-mono text-[11px] text-[var(--iw-muted)]">
            {assetSummary ? formatBytes(assetSummary.estimatedBytes) : "--"} {t("dataManagement.metadataEstimate")}
          </p>
        </div>
        {usageRatio !== undefined ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--iw-border)]">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(4, usageRatio * 100)}%` }} />
          </div>
        ) : null}
        {assetStores ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {[
              [t("dataManagement.storageSlots.meta"), assetStores.metaRecords],
              [t("dataManagement.storageSlots.hash"), assetStores.sharedBlobRecords],
              [t("dataManagement.storageSlots.preview"), assetStores.previewRecords],
              [t("dataManagement.storageSlots.legacyBlob"), assetStores.legacyBlobRecords],
              [t("dataManagement.storageSlots.legacyAssets"), assetStores.legacyAssetRecords],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[var(--iw-border)] px-2 py-2">
                <p className="text-[10px] uppercase text-[var(--iw-faint)]">{label}</p>
                <p className="mt-1 font-mono text-sm text-[var(--iw-text)]">{value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
              <FileArchive className="imagine-tone-icon h-3.5 w-3.5" data-tone="accent" />
              {t("dataManagement.backupAndSafety")}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
              {t("dataManagement.backupSourcePrefix", { origin: summary?.safety.origin || "--" })}；{t("dataManagement.backupLastSnapshotPrefix", { snapshot: latestSafetySnapshot
                ? `${formatWorkspaceSafetySnapshotReason(latestSafetySnapshot.reason)} · ${new Date(latestSafetySnapshot.createdAt).toLocaleString()} · ${formatBytes(latestSafetySnapshot.sizeBytes)}`
                : t("dataManagement.backupNone")
              })}
            </p>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--iw-muted)]">
              <input
                type="checkbox"
                checked={includeCredentials}
                onChange={event => setIncludeCredentials(event.target.checked)}
              />
              {t("dataManagement.exportImportCredentialsLabel")}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void runAction(t("dataManagement.fullBackupBusy"), () => onExportWorkspace(includeCredentials))}
              className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {t("dataManagement.fullBackupButton")}
            </button>
            {hasCurrentBoard && onExportCurrentBoard ? (
              <button
                type="button"
                disabled={actionDisabled}
                onClick={() => void runAction(t("dataManagement.currentBoardBusy"), () => onExportCurrentBoard(includeCredentials))}
                className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
              >
                <HardDrive className="h-3.5 w-3.5" />
                {t("dataManagement.currentBoardButton")}
              </button>
            ) : null}
            {latestSafetySnapshot ? (
              <button
                type="button"
                disabled={actionDisabled}
                onClick={() => void runAction(t("dataManagement.lastSnapshotBusy"), onDownloadSafetySnapshot)}
                className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" />
                {t("dataManagement.lastSnapshotButton")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => backupInputRef.current?.click()}
              className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {t("dataManagement.restoreBackupButton")}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
              <Wrench className="imagine-tone-icon h-3.5 w-3.5" data-tone="warning" />
              {t("dataManagement.maintenanceActions")}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
              {t("dataManagement.maintenanceActionsDescription")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-[var(--iw-muted)]">
            {t("dataManagement.showPriceLabel")}
            <span className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={showPrice}
                onChange={event => setShowPrice(event.target.checked)}
              />
              <span className="h-5 w-9 rounded-full bg-[var(--iw-border)] after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-amber-500 peer-checked:after:translate-x-full" />
            </span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => localAssetInputRef.current?.click()}
            className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
          >
            <FileInput className="h-3.5 w-3.5" />
            {t("dataManagement.importMediaButton")}
          </button>
          {hasCurrentBoard && onDuplicateCurrentBoard ? (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void runAction(t("dataManagement.duplicateBoardBusy"), onDuplicateCurrentBoard)}
              className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
            >
              {t("dataManagement.duplicateBoardButton")}
            </button>
          ) : null}
          {assetSummary && assetSummary.orphaned > 0 ? (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void runConfirmedAction(t("dataManagement.cleanOrphanedBusy"), buildCleanupConfirmRequest("orphaned", t), () => onCleanupAssets("orphaned"))}
              className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
            >
              {t("dataManagement.cleanOrphanedButton", { count: assetSummary.orphaned })}
            </button>
          ) : null}
        </div>
        {assetSummary && assetSummary.largest.length > 0 ? (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase text-[var(--iw-faint)]">{t("dataManagement.largeRecordCandidates")}</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {assetSummary.largest.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--iw-border)] px-2 py-1 text-[11px] text-[var(--iw-muted)]">
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 font-mono">{formatBytes(item.bytes)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="imagine-data-danger-zone imagine-tone-surface rounded-lg border p-3" data-tone="danger">
        <p className="flex items-center gap-2 text-xs font-semibold">
          <Shield className="h-3.5 w-3.5" />
          {t("dataManagement.dangerZone")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={actionDisabled} onClick={() => void runConfirmedAction(t("dataManagement.clearAssetsBusy"), { message: getClearWorkspaceAssetsMessage(t), tone: "danger", confirmLabel: t("dataManagement.clearAssetsButton") }, onClearAssets)} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            <Trash2 className="mr-1 inline h-3.5 w-3.5" />
            {t("dataManagement.clearAssetsButton")}
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runConfirmedAction(t("dataManagement.resetBoardsBusy"), buildResetBoardsConfirmRequest(t), onResetBoards)} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            {t("dataManagement.resetBoardsButton")}
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runConfirmedAction(t("dataManagement.clearAgentBusy"), buildLocalStorageConfirmRequest("agent", t), () => onClearLocalStorage("agent"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            {t("dataManagement.clearAgentButton")}
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runConfirmedAction(t("dataManagement.clearModelCacheBusy"), buildLocalStorageConfirmRequest("model-cache", t), () => onClearLocalStorage("model-cache"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            {t("dataManagement.clearModelCacheButton")}
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runConfirmedAction(t("dataManagement.clearCredentialsBusy"), buildLocalStorageConfirmRequest("provider-credentials", t), () => onClearLocalStorage("provider-credentials"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            {t("dataManagement.clearCredentialsButton")}
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runConfirmedAction(t("dataManagement.clearUiPrefsBusy"), buildLocalStorageConfirmRequest("ui-preferences", t), () => onClearLocalStorage("ui-preferences"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            {t("dataManagement.clearUiPrefsButton")}
          </button>
        </div>
      </section>
    </div>
  );
}
