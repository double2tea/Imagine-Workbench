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
import { usePriceDisplaySetting } from "@/hooks/usePriceDisplaySetting";
import {
  formatBytes,
  formatWorkspaceSafetySnapshotReason,
  type LocalStorageCleanupKind,
  type WorkspaceCleanupKind,
  type WorkspaceDataSummary,
} from "@/lib/data-management";

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

interface StatCardProps {
  label: string;
  primary: string;
  secondary: string;
}

interface HealthAction {
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

function healthCopy(status: WorkspaceDataSummary["integrity"]["status"] | undefined): {
  label: string;
  detail: string;
  className: string;
  tone: WorkspaceDataSummary["integrity"]["status"];
} {
  if (status === "healthy") {
    return {
      label: "健康",
      detail: "没有发现需要处理的数据问题",
      className: "imagine-tone-surface",
      tone: "healthy",
    };
  }
  if (status === "critical") {
    return {
      label: "需修复",
      detail: "发现缺失引用或坏记录，建议先备份再处理",
      className: "imagine-tone-surface",
      tone: "critical",
    };
  }
  return {
    label: "需关注",
    detail: "有可清理或可修复项目，当前数据仍可继续使用",
    className: "imagine-tone-surface",
    tone: "attention",
  };
}

function issueToneClassName(tone: HealthIssueGroup["tone"]): string {
  if (tone === "critical" || tone === "attention") return "imagine-tone-surface";
  return "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]";
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "--";
  return `${Math.round(value * 100)}%`;
}

function DetailList({ details }: { details: string[] }) {
  if (details.length === 0) {
    return <p className="mt-2 text-[11px] text-[var(--iw-muted)]">暂无明细</p>;
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
          还有 {details.length - 80} 条未显示
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
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showPrice, setShowPrice] = usePriceDisplaySetting();

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusyLabel(label);
    try {
      await action();
      await onRefreshSummary();
    } finally {
      setBusyLabel(null);
    }
  };

  const handleBackupFileChange = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    void runAction("恢复备份中", () => onImportWorkspace(file, includeCredentials));
    if (backupInputRef.current) backupInputRef.current.value = "";
  };

  const handleLocalAssetChange = (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    void runAction("导入媒体中", () => onImportLocalAssets(files));
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
  const health = healthCopy(integrity?.status);
  const actionDisabled = busyLabel !== null;

  const issueGroups = useMemo<HealthIssueGroup[]>(() => {
    if (!integrity) return [];
    return [
      {
        key: "missing-references",
        title: "画板缺失资产引用",
        count: integrity.missingBoardReferences.length,
        tone: "critical",
        details: integrity.missingBoardReferences.map(reference =>
          `${reference.boardTitle} (${reference.boardId}) / ${reference.nodeKind}:${reference.nodeId} / ${reference.field} -> ${reference.assetId}`,
        ),
      },
      {
        key: "broken-complete",
        title: "完成但缺少媒体内容",
        count: integrity.brokenCompleteAssetIds.length,
        tone: "critical",
        action: { label: "清坏记录", run: () => onCleanupAssets("broken-complete") },
        details: integrity.brokenCompleteAssetIds,
      },
      {
        key: "stale-source-links",
        title: "过期来源节点链接",
        count: integrity.staleAssetSourceLinks.length,
        tone: "attention",
        action: { label: "修复来源", run: onRepairAssetSources },
        details: integrity.staleAssetSourceLinks.map(link =>
          `${link.assetId} / board:${link.boardId || "workspace"} / source:${link.sourceBoardNodeId} / ${link.status}`,
        ),
      },
      {
        key: "stale-processing",
        title: "过期进行中任务",
        count: integrity.staleProcessingAssetIds.length,
        tone: "attention",
        action: { label: "清过期", run: () => onCleanupAssets("stale-processing") },
        details: integrity.staleProcessingAssetIds,
      },
      {
        key: "failed-assets",
        title: "失败记录",
        count: integrity.failedAssetIds.length,
        tone: "attention",
        action: { label: "清失败", run: () => onCleanupAssets("failed") },
        details: integrity.failedAssetIds,
      },
    ];
  }, [integrity, onCleanupAssets, onRepairAssetSources]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(current => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <input
        ref={backupInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={event => handleBackupFileChange(event.target.files)}
      />
      <input
        ref={localAssetInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={event => handleLocalAssetChange(event.target.files)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--iw-text)]">数据健康中心</p>
          <p className="mt-1 text-[11px] text-[var(--iw-muted)]">
            本地资产、画板引用、备份、安全快照与维护动作
          </p>
        </div>
        <button
          type="button"
          disabled={actionDisabled}
          onClick={() => void runAction("刷新统计中", onRefreshSummary)}
          className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      {busyLabel ? (
        <div className="imagine-tone-surface rounded-lg border px-3 py-2 font-mono text-[11px]" data-tone="info">
          {busyLabel}...
        </div>
      ) : null}
      {summaryError ? (
        <div className="imagine-tone-surface rounded-lg border px-3 py-2 text-[11px] leading-5" data-tone="danger">
          数据统计读取失败：{summaryError}
        </div>
      ) : null}

      <section className={["imagine-data-health rounded-lg border p-3", health.className].join(" ")} data-tone={health.tone}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {integrity?.status === "healthy" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <div>
              <p className="text-xs font-semibold">数据状态：{health.label}</p>
              <p className="mt-1 text-[11px] leading-5 opacity-85">{health.detail}</p>
            </div>
          </div>
          <div className="font-mono text-sm font-semibold">
            {integrity ? `${integrity.issueCount} issues` : "--"}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="资产"
          primary={assetSummary ? String(assetSummary.total) : "--"}
          secondary={assetSummary
            ? `${assetSummary.image} 图 / ${assetSummary.video} 视频 / ${assetSummary.audio} 音频 / ${assetSummary.transcript} 文本`
            : "等待统计"}
        />
        <StatCard
          label="画板"
          primary={boardSummary ? String(boardSummary.total) : "--"}
          secondary={boardSummary ? `${boardSummary.nodes} 节点 · ${formatBytes(boardSummary.estimatedBytes)}` : "等待统计"}
        />
        <StatCard
          label="本地设置"
          primary={storageSummary ? String(storageSummary.agentKeys + storageSummary.modelCacheKeys + storageSummary.uiPreferenceKeys + storageSummary.credentialKeys) : "--"}
          secondary={storageSummary ? `${storageSummary.agentKeys} Agent / ${storageSummary.modelCacheKeys} 模型 / ${storageSummary.credentialKeys} 密钥` : "等待统计"}
        />
        <StatCard
          label="浏览器空间"
          primary={usage !== undefined ? formatBytes(usage) : "--"}
          secondary={quota !== undefined ? `配额 ${formatBytes(quota)} · ${formatPercent(usageRatio)}` : "浏览器未返回配额"}
        />
      </div>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
            <ListChecks className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />
            完整性诊断
          </p>
          <p className="font-mono text-[11px] text-[var(--iw-muted)]">
            {integrity ? `${integrity.issueCount} total` : "waiting"}
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
                      onClick={() => void runAction(`${action.label}中`, action.run)}
                      className="imagine-secondary-action h-7 rounded-md border border-[var(--iw-border)] px-2 text-[10px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  ) : null}
                </div>
                {expanded ? <DetailList details={group.details} /> : null}
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
              存储结构
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
              资产 meta、共享 payload、预览缓存与旧格式迁移状态
            </p>
          </div>
          <p className="font-mono text-[11px] text-[var(--iw-muted)]">
            {assetSummary ? formatBytes(assetSummary.estimatedBytes) : "--"} metadata estimate
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
              ["meta", assetStores.metaRecords],
              ["hash", assetStores.sharedBlobRecords],
              ["preview", assetStores.previewRecords],
              ["legacy blob", assetStores.legacyBlobRecords],
              ["legacy assets", assetStores.legacyAssetRecords],
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
              备份与安全
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
              来源 {summary?.safety.origin || "--"}；最后安全快照 {latestSafetySnapshot
                ? `${formatWorkspaceSafetySnapshotReason(latestSafetySnapshot.reason)} · ${new Date(latestSafetySnapshot.createdAt).toLocaleString()} · ${formatBytes(latestSafetySnapshot.sizeBytes)}`
                : "无"}
            </p>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--iw-muted)]">
              <input
                type="checkbox"
                checked={includeCredentials}
                onChange={event => setIncludeCredentials(event.target.checked)}
              />
              导出/导入 provider 密钥
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void runAction("导出完整备份中", () => onExportWorkspace(includeCredentials))}
              className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              完整备份
            </button>
            {hasCurrentBoard && onExportCurrentBoard ? (
              <button
                type="button"
                disabled={actionDisabled}
                onClick={() => void runAction("导出当前画板中", () => onExportCurrentBoard(includeCredentials))}
                className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
              >
                <HardDrive className="h-3.5 w-3.5" />
                当前画板
              </button>
            ) : null}
            {latestSafetySnapshot ? (
              <button
                type="button"
                disabled={actionDisabled}
                onClick={() => void runAction("下载安全快照中", onDownloadSafetySnapshot)}
                className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" />
                最后快照
              </button>
            ) : null}
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => backupInputRef.current?.click()}
              className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              恢复备份
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
              <Wrench className="imagine-tone-icon h-3.5 w-3.5" data-tone="warning" />
              维护动作
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
              导入媒体、复制画板、价格显示与常用清理入口
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-[var(--iw-muted)]">
            显示价格
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
            导入媒体
          </button>
          {hasCurrentBoard && onDuplicateCurrentBoard ? (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void runAction("复制画板中", onDuplicateCurrentBoard)}
              className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
            >
              复制当前画板
            </button>
          ) : null}
          {assetSummary && assetSummary.orphaned > 0 ? (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void runAction("清孤立中", () => onCleanupAssets("orphaned"))}
              className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)] disabled:opacity-50"
            >
              清孤立资产 ({assetSummary.orphaned})
            </button>
          ) : null}
        </div>
        {assetSummary && assetSummary.largest.length > 0 ? (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase text-[var(--iw-faint)]">大记录候选</p>
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
          危险区
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={actionDisabled} onClick={() => void runAction("清空资产中", onClearAssets)} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            <Trash2 className="mr-1 inline h-3.5 w-3.5" />
            清空资产
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runAction("重置画板中", onResetBoards)} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            重置画板
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runAction("清 Agent 中", () => onClearLocalStorage("agent"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            清 Agent
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runAction("清模型缓存中", () => onClearLocalStorage("model-cache"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            清模型缓存
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runAction("清密钥中", () => onClearLocalStorage("provider-credentials"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            清密钥
          </button>
          <button type="button" disabled={actionDisabled} onClick={() => void runAction("清偏好中", () => onClearLocalStorage("ui-preferences"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50">
            清 UI 偏好
          </button>
        </div>
      </section>
    </div>
  );
}
