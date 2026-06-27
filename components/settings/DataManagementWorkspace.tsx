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
  UserPlus,
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
import type { PublicLocalStorageRuntimeStatus } from "@/lib/storage/local-public-runtime";
import type { TeamSessionContext, TeamStorageHealth } from "@/lib/storage/team-client";
import type { ManageableTeamRole, PublicTeamMember } from "@/lib/storage/team-member-types";
import { getClearWorkspaceAssetsMessage } from "@/lib/workspace-messages";

interface DataManagementWorkspaceProps {
  hasCurrentBoard: boolean;
  summary: WorkspaceDataSummary | null;
  summaryError: string | null;
  storageStatus: PublicLocalStorageRuntimeStatus | null;
  storageStatusError: string | null;
  teamHealth: TeamStorageHealth | null;
  teamHealthError: string | null;
  teamMigrationBusy: boolean;
  teamSetupToken: string;
  teamSession: TeamSessionContext | null;
  teamSessionBusy: boolean;
  teamSessionError: string | null;
  teamMembers: PublicTeamMember[];
  teamMembersBusy: boolean;
  teamMembersError: string | null;
  teamMemberEmail: string;
  teamMemberPassword: string;
  teamMemberRole: ManageableTeamRole;
  teamLoginEmail: string;
  teamLoginPassword: string;
  teamBootstrapEmail: string;
  teamBootstrapPassword: string;
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
  onRefreshStorageStatus: () => Promise<void>;
  onRepairAssetSources: () => Promise<void>;
  onResetBoards: () => Promise<void>;
  onRunTeamMigrations: () => Promise<void>;
  onRefreshTeamMembers: () => Promise<void>;
  onCreateTeamMember: () => Promise<void>;
  onDeleteTeamMember: (userId: string) => Promise<void>;
  onTeamMemberEmailChange: (value: string) => void;
  onTeamMemberPasswordChange: (value: string) => void;
  onTeamMemberRoleChange: (value: ManageableTeamRole) => void;
  onUpdateTeamMemberRole: (userId: string, role: ManageableTeamRole) => Promise<void>;
  onRefreshTeamSession: () => Promise<void>;
  onTeamBootstrap: () => Promise<void>;
  onTeamBootstrapEmailChange: (value: string) => void;
  onTeamBootstrapPasswordChange: (value: string) => void;
  onTeamLogin: () => Promise<void>;
  onTeamLoginEmailChange: (value: string) => void;
  onTeamLoginPasswordChange: (value: string) => void;
  onTeamLogout: () => Promise<void>;
  onTeamSetupTokenChange: (value: string) => void;
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
  "provider-settings": "dataManagement.localStorageLabels.providerSettings",
  "provider-credentials": "dataManagement.localStorageLabels.providerCredentials",
  "ui-preferences": "dataManagement.localStorageLabels.uiPreferences",
};

const MANAGEABLE_TEAM_ROLES: ManageableTeamRole[] = ["admin", "editor", "viewer"];

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

function buildTeamMemberDeleteConfirmRequest(email: string, t: TranslateFn): ConfirmRequest {
  return {
    message: t("dataManagement.teamMemberDeleteConfirm", { email }),
    tone: "danger",
    confirmLabel: t("dataManagement.teamMemberDelete"),
  };
}

function teamRoleLabel(role: PublicTeamMember["role"], t: TranslateFn): string {
  if (role === "owner") return t("dataManagement.teamMemberRoleOwner");
  if (role === "admin") return t("dataManagement.teamMemberRoleAdmin");
  if (role === "editor") return t("dataManagement.teamMemberRoleEditor");
  return t("dataManagement.teamMemberRoleViewer");
}

function isManageableTeamRole(value: string): value is ManageableTeamRole {
  return value === "admin" || value === "editor" || value === "viewer";
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "--";
  return `${Math.round(value * 100)}%`;
}

function formatStorageMode(status: PublicLocalStorageRuntimeStatus | null, t: TranslateFn): string {
  if (!status) return "--";
  if (status.mode === "postgres") return t("dataManagement.storageModePostgres");
  return t("dataManagement.storageModeBrowser");
}

function formatTeamMigrationSummary(teamHealth: TeamStorageHealth | null, t: TranslateFn): string {
  const migrationStatus = teamHealth?.migrationStatus;
  if (!migrationStatus) return t("dataManagement.teamStorageNoMigrationStatus");
  if (migrationStatus.unsupportedNewerSchema) {
    return t("dataManagement.teamStorageNewerSchema", {
      current: migrationStatus.currentSchemaVersion ?? "--",
      required: migrationStatus.requiredSchemaVersion,
    });
  }
  if (migrationStatus.pendingMigrationIds.length > 0) {
    return t("dataManagement.teamStoragePendingMigrations", {
      count: migrationStatus.pendingMigrationIds.length,
    });
  }
  return t("dataManagement.teamStorageUpToDate", {
    version: migrationStatus.currentSchemaVersion ?? migrationStatus.requiredSchemaVersion,
  });
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
  storageStatus,
  storageStatusError,
  teamHealth,
  teamHealthError,
  teamMigrationBusy,
  teamSetupToken,
  teamSession,
  teamSessionBusy,
  teamSessionError,
  teamMembers,
  teamMembersBusy,
  teamMembersError,
  teamMemberEmail,
  teamMemberPassword,
  teamMemberRole,
  teamLoginEmail,
  teamLoginPassword,
  teamBootstrapEmail,
  teamBootstrapPassword,
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
  onRefreshStorageStatus,
  onRepairAssetSources,
  onResetBoards,
  onRunTeamMigrations,
  onRefreshTeamMembers,
  onCreateTeamMember,
  onDeleteTeamMember,
  onTeamMemberEmailChange,
  onTeamMemberPasswordChange,
  onTeamMemberRoleChange,
  onUpdateTeamMemberRole,
  onRefreshTeamSession,
  onTeamBootstrap,
  onTeamBootstrapEmailChange,
  onTeamBootstrapPasswordChange,
  onTeamLogin,
  onTeamLoginEmailChange,
  onTeamLoginPasswordChange,
  onTeamLogout,
  onTeamSetupTokenChange,
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
  const teamStorageSummary = summary?.teamStorage;
  const latestSafetySnapshot = summary?.safety.latestSnapshot ?? null;
  const health = healthCopy(integrity?.status, t);
  const actionDisabled = busyLabel !== null || teamMigrationBusy || teamSessionBusy || teamMembersBusy;
  const isTeamStorageMode = storageStatus?.mode === "postgres";
  const hasPendingTeamMigrations = (teamHealth?.migrationStatus?.pendingMigrationIds.length ?? 0) > 0;
  const canManageTeamMembers = teamSession?.role === "owner" || teamSession?.role === "admin";
  const storageSlotItems: Array<[string, number]> | null = assetStores
    ? isTeamStorageMode && teamStorageSummary
      ? [
          [t("dataManagement.storageSlots.meta"), assetStores.metaRecords],
          [t("dataManagement.storageSlots.payloads"), teamStorageSummary.payloadRefs],
          [t("dataManagement.storageSlots.library"), teamStorageSummary.assetLibraryRecords],
          [t("dataManagement.storageSlots.tasks"), teamStorageSummary.generationTasks],
          [t("dataManagement.storageSlots.settings"), teamStorageSummary.settings + teamStorageSummary.secretSettings],
        ]
      : [
          [t("dataManagement.storageSlots.meta"), assetStores.metaRecords],
          [t("dataManagement.storageSlots.hash"), assetStores.sharedBlobRecords],
          [t("dataManagement.storageSlots.preview"), assetStores.previewRecords],
          [t("dataManagement.storageSlots.legacyBlob"), assetStores.legacyBlobRecords],
          [t("dataManagement.storageSlots.legacyAssets"), assetStores.legacyAssetRecords],
        ]
    : null;

  const issueGroups = useMemo<HealthIssueGroup[]>(() => {
    if (!integrity) return [];
    const mediaConsistency = teamStorageSummary?.mediaConsistency;
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
        action: isTeamStorageMode ? undefined : {
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
        action: isTeamStorageMode ? undefined : {
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
        action: isTeamStorageMode ? undefined : {
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
        action: isTeamStorageMode ? undefined : {
          label: t("dataManagement.issueGroups.cleanFailed"),
          busyLabel: t("dataManagement.issueGroups.cleanFailedBusy"),
          confirmRequest: buildCleanupConfirmRequest("failed", t),
          run: () => onCleanupAssets("failed"),
        },
        details: integrity.failedAssetIds,
      },
      ...(isTeamStorageMode && mediaConsistency ? [
        {
          key: "team-missing-media-files",
          title: t("dataManagement.issueGroups.teamMissingMediaFiles"),
          count: mediaConsistency.missingPayloadFiles + mediaConsistency.missingPreviewFiles,
          tone: "critical" as const,
          details: [
            t("dataManagement.issueGroups.teamMissingPayloadFiles", { count: mediaConsistency.missingPayloadFiles }),
            t("dataManagement.issueGroups.teamMissingPreviewFiles", { count: mediaConsistency.missingPreviewFiles }),
          ],
        },
        {
          key: "team-orphaned-media-files",
          title: t("dataManagement.issueGroups.teamOrphanedMediaFiles"),
          count: mediaConsistency.orphanedPayloadFiles + mediaConsistency.orphanedPreviewFiles + mediaConsistency.tmpFiles + mediaConsistency.trashFiles,
          tone: "attention" as const,
          details: [
            t("dataManagement.issueGroups.teamOrphanedPayloadFiles", { count: mediaConsistency.orphanedPayloadFiles }),
            t("dataManagement.issueGroups.teamOrphanedPreviewFiles", { count: mediaConsistency.orphanedPreviewFiles }),
            t("dataManagement.issueGroups.teamTmpFiles", { count: mediaConsistency.tmpFiles }),
            t("dataManagement.issueGroups.teamTrashFiles", { count: mediaConsistency.trashFiles }),
          ],
        },
      ] : []),
    ];
  }, [integrity, isTeamStorageMode, onCleanupAssets, onRepairAssetSources, t, teamStorageSummary]);

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
          onClick={() => void runAction(t("dataManagement.refreshingStatsLabel"), onRefreshStorageStatus)}
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
      {storageStatusError ? (
        <div className="imagine-tone-surface rounded-lg border px-3 py-2 text-[11px] leading-5" data-tone="danger">
          {t("dataManagement.storageStatusError", { error: storageStatusError })}
        </div>
      ) : null}

      <section className={["imagine-data-health rounded-lg border p-3", health.className].join(" ")} data-tone={health.tone}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {integrity?.status === "healthy" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <div>
              <p className="text-xs font-semibold">{t("dataManagement.dataStatusTemplate", { label: health.label })}</p>
              <p className="mt-1 text-[11px] leading-5 opacity-85">{health.detail}</p>
            </div>
          </div>
          <div className="font-mono text-sm font-semibold">
            {integrity ? t("dataManagement.issueCount", { count: integrity.issueCount }) : "--"}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
              <Database className="imagine-tone-icon h-3.5 w-3.5" data-tone={isTeamStorageMode ? "accent" : "success"} />
              {t("dataManagement.storageTarget")}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
              {storageStatus
                ? t("dataManagement.storageTargetSummary", {
                    mode: formatStorageMode(storageStatus, t),
                    target: storageStatus.targetKind,
                  })
                : t("dataManagement.storageTargetWaiting")}
            </p>
          </div>
          <div className="rounded-md border border-[var(--iw-border)] px-2 py-1 font-mono text-[11px] text-[var(--iw-muted)]">
            {storageStatus?.enabled ? t("dataManagement.storageEnabled") : t("dataManagement.storageBrowserDefault")}
          </div>
        </div>

        {isTeamStorageMode ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-md border border-[var(--iw-border)] p-2">
              <p className="text-[10px] font-semibold uppercase text-[var(--iw-faint)]">{t("dataManagement.teamStorageHealth")}</p>
              <p className="mt-2 text-[11px] leading-5 text-[var(--iw-muted)]">
                {teamHealthError
                  ? t("dataManagement.teamStorageHealthError", { error: teamHealthError })
                  : teamHealth?.reachable
                    ? t("dataManagement.teamStorageReachable")
                    : t("dataManagement.teamStorageChecking")}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-[var(--iw-border)] px-2 py-1">
                  <p className="text-[10px] text-[var(--iw-faint)]">{t("dataManagement.teamStorageDatabase")}</p>
                  <p className="font-mono text-[11px] text-[var(--iw-text)]">
                    {teamHealth?.databaseConfigured ? t("dataManagement.configured") : "--"}
                  </p>
                </div>
                <div className="rounded-md border border-[var(--iw-border)] px-2 py-1">
                  <p className="text-[10px] text-[var(--iw-faint)]">{t("dataManagement.teamStorageMedia")}</p>
                  <p className="font-mono text-[11px] text-[var(--iw-text)]">
                    {teamHealth?.mediaDirectoryConfigured ? t("dataManagement.configured") : "--"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-[var(--iw-border)] p-2">
              <p className="text-[10px] font-semibold uppercase text-[var(--iw-faint)]">{t("dataManagement.teamStorageMigrations")}</p>
              <p className="mt-2 text-[11px] leading-5 text-[var(--iw-muted)]">
                {formatTeamMigrationSummary(teamHealth, t)}
              </p>
              {teamHealth?.migrationStatus?.pendingMigrationIds.length ? (
                <p className="mt-1 break-all font-mono text-[10px] text-[var(--iw-faint)]">
                  {teamHealth.migrationStatus.pendingMigrationIds.join(", ")}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={teamSetupToken}
                  onChange={event => onTeamSetupTokenChange(event.target.value)}
                  placeholder={t("dataManagement.teamSetupTokenPlaceholder")}
                  className="h-9 min-w-56 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-[11px] text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]"
                />
                <button
                  type="button"
                  disabled={actionDisabled || !hasPendingTeamMigrations || !teamSetupToken.trim()}
                  onClick={() => void runAction(t("dataManagement.teamMigrationBusy"), onRunTeamMigrations)}
                  className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                >
                  {teamMigrationBusy ? t("dataManagement.teamMigrationBusy") : t("dataManagement.teamRunMigrations")}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-[var(--iw-border)] p-2 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-[10px] font-semibold uppercase text-[var(--iw-faint)]">
                    <Shield className="imagine-tone-icon h-3.5 w-3.5" data-tone={teamSession ? "success" : "warning"} />
                    {t("dataManagement.teamSession")}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--iw-muted)]">
                    {teamSessionError
                      ? t("dataManagement.teamSessionError", { error: teamSessionError })
                      : teamSession
                        ? t("dataManagement.teamSessionSignedIn", { email: teamSession.email, role: teamSession.role })
                        : t("dataManagement.teamSessionSignedOut")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={actionDisabled}
                  onClick={() => void runAction(t("dataManagement.teamSessionRefreshing"), onRefreshTeamSession)}
                  className="imagine-secondary-action h-8 rounded-md border border-[var(--iw-border)] px-2 text-[10px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                >
                  {t("dataManagement.teamSessionRefresh")}
                </button>
              </div>
              {teamSession ? (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-md border border-[var(--iw-border)] px-2 py-1">
                      <p className="text-[10px] text-[var(--iw-faint)]">{t("dataManagement.teamSessionWorkspace")}</p>
                      <p className="font-mono text-[11px] text-[var(--iw-text)]">{teamSession.workspaceId}</p>
                    </div>
                    <button
                      type="button"
                      disabled={actionDisabled}
                      onClick={() => void runAction(t("dataManagement.teamLogoutBusy"), onTeamLogout)}
                      className="imagine-secondary-action h-8 rounded-md border border-[var(--iw-border)] px-2 text-[10px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                    >
                      {t("dataManagement.teamLogout")}
                    </button>
                  </div>

                  {canManageTeamMembers ? (
                    <div className="rounded-md border border-[var(--iw-border)] p-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase text-[var(--iw-faint)]">
                            <UserPlus className="imagine-tone-icon h-3.5 w-3.5" data-tone="accent" />
                            {t("dataManagement.teamMembers")}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
                            {teamMembersError
                              ? t("dataManagement.teamMembersError", { error: teamMembersError })
                              : t("dataManagement.teamMembersCount", { count: teamMembers.length })}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={actionDisabled}
                          onClick={() => void runAction(t("dataManagement.teamMembersRefreshing"), onRefreshTeamMembers)}
                          className="imagine-secondary-action h-8 rounded-md border border-[var(--iw-border)] px-2 text-[10px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                        >
                          {t("dataManagement.teamMembersRefresh")}
                        </button>
                      </div>

                      {teamMembersError ? (
                        <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] leading-5 text-rose-200">
                          {t("dataManagement.teamMembersError", { error: teamMembersError })}
                        </div>
                      ) : null}

                      {teamMembers.length > 0 ? (
                        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                          {teamMembers.map(member => {
                            const locked = member.role === "owner" || member.userId === teamSession.userId;
                            return (
                              <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--iw-border)] px-2 py-1.5">
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-semibold text-[var(--iw-text)]">{member.email}</p>
                                  <p className="font-mono text-[10px] text-[var(--iw-faint)]">{member.userId}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {locked || !isManageableTeamRole(member.role) ? (
                                    <span className="rounded-md border border-[var(--iw-border)] px-2 py-1 text-[10px] text-[var(--iw-muted)]">
                                      {teamRoleLabel(member.role, t)}
                                    </span>
                                  ) : (
                                    <select
                                      value={member.role}
                                      disabled={actionDisabled}
                                      onChange={event => {
                                        const nextRole = event.target.value;
                                        if (!isManageableTeamRole(nextRole) || nextRole === member.role) return;
                                        void runAction(t("dataManagement.teamMemberUpdateBusy"), () => onUpdateTeamMemberRole(member.userId, nextRole));
                                      }}
                                      className="imagine-select h-8 px-2 py-0 text-[10px]"
                                      aria-label={t("dataManagement.teamMemberRoleAriaLabel", { email: member.email })}
                                    >
                                      {MANAGEABLE_TEAM_ROLES.map(role => (
                                        <option key={role} value={role}>{teamRoleLabel(role, t)}</option>
                                      ))}
                                    </select>
                                  )}
                                  {!locked ? (
                                    <button
                                      type="button"
                                      disabled={actionDisabled}
                                      onClick={() => void runConfirmedAction(
                                        t("dataManagement.teamMemberDeleteBusy"),
                                        buildTeamMemberDeleteConfirmRequest(member.email, t),
                                        () => onDeleteTeamMember(member.userId),
                                      )}
                                      className="imagine-danger-action flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-50"
                                      aria-label={t("dataManagement.teamMemberDeleteAriaLabel", { email: member.email })}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-2 rounded-md border border-[var(--iw-border)] px-2 py-1.5 text-[11px] text-[var(--iw-muted)]">
                          {t("dataManagement.teamMembersEmpty")}
                        </p>
                      )}

                      <form
                        className="mt-3 border-t border-[var(--iw-border)] pt-3"
                        onSubmit={event => {
                          event.preventDefault();
                          void runAction(t("dataManagement.teamMemberCreateBusy"), onCreateTeamMember);
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="email"
                            value={teamMemberEmail}
                            onChange={event => onTeamMemberEmailChange(event.target.value)}
                            placeholder={t("dataManagement.teamMemberEmailPlaceholder")}
                            className="h-9 min-w-56 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-[11px] text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]"
                          />
                          <input
                            type="password"
                            value={teamMemberPassword}
                            onChange={event => onTeamMemberPasswordChange(event.target.value)}
                            placeholder={t("dataManagement.teamMemberPasswordPlaceholder")}
                            className="h-9 min-w-56 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-[11px] text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]"
                          />
                          <select
                            value={teamMemberRole}
                            onChange={event => {
                              if (isManageableTeamRole(event.target.value)) onTeamMemberRoleChange(event.target.value);
                            }}
                            className="imagine-select h-9 px-2 py-0 text-[11px]"
                            aria-label={t("dataManagement.teamMemberNewRoleAriaLabel")}
                          >
                            {MANAGEABLE_TEAM_ROLES.map(role => (
                              <option key={role} value={role}>{teamRoleLabel(role, t)}</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            disabled={actionDisabled || !teamMemberEmail.trim() || teamMemberPassword.length < 12}
                            className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                          >
                            {t("dataManagement.teamMemberCreate")}
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={event => {
                      event.preventDefault();
                      void runAction(t("dataManagement.teamLoginBusy"), onTeamLogin);
                    }}
                  >
                    <input
                      type="email"
                      value={teamLoginEmail}
                      onChange={event => onTeamLoginEmailChange(event.target.value)}
                      placeholder={t("dataManagement.teamLoginEmailPlaceholder")}
                      className="h-9 min-w-56 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-[11px] text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]"
                    />
                    <input
                      type="password"
                      value={teamLoginPassword}
                      onChange={event => onTeamLoginPasswordChange(event.target.value)}
                      placeholder={t("dataManagement.teamLoginPasswordPlaceholder")}
                      className="h-9 min-w-56 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-[11px] text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]"
                    />
                    <button
                      type="submit"
                      disabled={actionDisabled || !teamLoginEmail.trim() || !teamLoginPassword}
                      className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                    >
                      {t("dataManagement.teamLogin")}
                    </button>
                  </form>
                  <form
                    className="border-t border-[var(--iw-border)] pt-3"
                    onSubmit={event => {
                      event.preventDefault();
                      void runAction(t("dataManagement.teamBootstrapBusy"), onTeamBootstrap);
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase text-[var(--iw-faint)]">
                      {t("dataManagement.teamBootstrapOwner")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="email"
                        value={teamBootstrapEmail}
                        onChange={event => onTeamBootstrapEmailChange(event.target.value)}
                        placeholder={t("dataManagement.teamBootstrapEmailPlaceholder")}
                        className="h-9 min-w-56 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-[11px] text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]"
                      />
                      <input
                        type="password"
                        value={teamBootstrapPassword}
                        onChange={event => onTeamBootstrapPasswordChange(event.target.value)}
                        placeholder={t("dataManagement.teamBootstrapPasswordPlaceholder")}
                        className="h-9 min-w-56 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-[11px] text-[var(--iw-text)] outline-none focus:border-[var(--iw-accent)]"
                      />
                      <button
                        type="submit"
                        disabled={
                          actionDisabled ||
                          !teamSetupToken.trim() ||
                          !teamBootstrapEmail.trim() ||
                          teamBootstrapPassword.length < 12
                        }
                        className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                      >
                        {t("dataManagement.teamBootstrap")}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] leading-5 text-[var(--iw-faint)]">
                      {t("dataManagement.teamBootstrapSetupTokenHint")}
                    </p>
                  </form>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-[var(--iw-border)] px-3 py-2 text-[11px] leading-5 text-[var(--iw-muted)]">
            {t("dataManagement.browserStorageModeDetail")}
          </p>
        )}
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
          label={isTeamStorageMode ? t("dataManagement.statCards.teamSettings") : t("dataManagement.statCards.localSettings")}
          primary={isTeamStorageMode
            ? teamStorageSummary ? String(teamStorageSummary.settings + teamStorageSummary.secretSettings) : "--"
            : storageSummary ? String(storageSummary.agentKeys + storageSummary.modelCacheKeys + storageSummary.providerSettingKeys + storageSummary.uiPreferenceKeys + storageSummary.credentialKeys) : "--"}
          secondary={isTeamStorageMode
            ? teamStorageSummary
              ? t("dataManagement.teamSettingsDetailTemplate", {
                  promptTemplates: teamStorageSummary.promptTemplates,
                  providerTargets: teamStorageSummary.providerTargets,
                  secretSettings: teamStorageSummary.secretSettings,
                  settings: teamStorageSummary.settings,
                  voiceProfiles: teamStorageSummary.voiceProfiles,
                })
              : t("dataManagement.statCards.waitingStats")
            : storageSummary ? t("dataManagement.localSettingsDetailTemplate", {
                agentKeys: storageSummary.agentKeys,
                modelCacheKeys: storageSummary.modelCacheKeys,
                providerSettingKeys: storageSummary.providerSettingKeys,
                credentialKeys: storageSummary.credentialKeys,
              }) : t("dataManagement.statCards.waitingStats")}
        />
        <StatCard
          label={isTeamStorageMode ? t("dataManagement.statCards.teamMedia") : t("dataManagement.statCards.browserStorage")}
          primary={isTeamStorageMode
            ? teamStorageSummary ? formatBytes(teamStorageSummary.payloadBytes) : "--"
            : usage !== undefined ? formatBytes(usage) : "--"}
          secondary={isTeamStorageMode
            ? teamStorageSummary
              ? t("dataManagement.teamMediaDetailTemplate", {
                  missing: teamStorageSummary.mediaConsistency.missingPayloadFiles + teamStorageSummary.mediaConsistency.missingPreviewFiles,
                  library: teamStorageSummary.assetLibraryRecords,
                  payloads: teamStorageSummary.payloadRefs,
                  stale: teamStorageSummary.mediaConsistency.orphanedPayloadFiles +
                    teamStorageSummary.mediaConsistency.orphanedPreviewFiles +
                    teamStorageSummary.mediaConsistency.tmpFiles +
                    teamStorageSummary.mediaConsistency.trashFiles,
                  tasks: teamStorageSummary.generationTasks,
                })
              : t("dataManagement.statCards.waitingStats")
            : quota !== undefined ? t("dataManagement.browserStorageDetailTemplate", { quota: formatBytes(quota), percent: formatPercent(usageRatio) }) : t("dataManagement.statCards.browserNoQuota")}
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
              {isTeamStorageMode
                ? t("dataManagement.teamStorageStructureDescription")
                : t("dataManagement.storageStructureDescription")}
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
        {storageSlotItems ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {storageSlotItems.map(([label, value]) => (
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
              {t("dataManagement.backupSummaryTemplate", {
                origin: summary?.safety.origin || "--",
                snapshot: latestSafetySnapshot
                  ? `${formatWorkspaceSafetySnapshotReason(latestSafetySnapshot.reason)} · ${new Date(latestSafetySnapshot.createdAt).toLocaleString()} · ${formatBytes(latestSafetySnapshot.sizeBytes)}`
                  : t("dataManagement.backupNone"),
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
