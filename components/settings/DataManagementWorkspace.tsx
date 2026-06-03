import { Download, FileArchive, FileInput, HardDrive, RefreshCw, Shield, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { formatBytes, type LocalStorageCleanupKind, type WorkspaceCleanupKind, type WorkspaceDataSummary } from "@/lib/data-management";

interface DataManagementWorkspaceProps {
  hasCurrentBoard: boolean;
  summary: WorkspaceDataSummary | null;
  onCleanupAssets: (kind: WorkspaceCleanupKind) => Promise<void>;
  onClearAssets: () => Promise<void>;
  onClearLocalStorage: (kind: LocalStorageCleanupKind) => Promise<void>;
  onDuplicateCurrentBoard?: () => Promise<void>;
  onExportCurrentBoard?: (includeCredentials: boolean) => Promise<void>;
  onExportWorkspace: (includeCredentials: boolean) => Promise<void>;
  onImportLocalAssets: (files: File[]) => Promise<void>;
  onImportWorkspace: (file: File, includeCredentials: boolean) => Promise<void>;
  onRefreshSummary: () => Promise<void>;
  onResetBoards: () => Promise<void>;
}

interface StatCardProps {
  label: string;
  primary: string;
  secondary: string;
}

function StatCard({ label, primary, secondary }: StatCardProps) {
  return (
    <div className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--iw-faint)]">{label}</p>
      <p className="mt-2 font-mono text-lg font-semibold text-[var(--iw-text)]">{primary}</p>
      <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">{secondary}</p>
    </div>
  );
}

export default function DataManagementWorkspace({
  hasCurrentBoard,
  summary,
  onCleanupAssets,
  onClearAssets,
  onClearLocalStorage,
  onDuplicateCurrentBoard,
  onExportCurrentBoard,
  onExportWorkspace,
  onImportLocalAssets,
  onImportWorkspace,
  onRefreshSummary,
  onResetBoards,
}: DataManagementWorkspaceProps) {
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const localAssetInputRef = useRef<HTMLInputElement | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [includeCredentials, setIncludeCredentials] = useState(false);

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
  const quota = summary?.browserStorage?.quota;
  const usage = summary?.browserStorage?.usage;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
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
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={event => handleLocalAssetChange(event.target.files)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--iw-text)]">数据中心</p>
          <p className="mt-1 text-[11px] text-[var(--iw-muted)]">
            资产、画板、设置与本地缓存
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAction("刷新统计中", onRefreshSummary)}
          className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      {busyLabel ? (
        <div className="rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 font-mono text-[11px] text-indigo-200">
          {busyLabel}...
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="资产"
          primary={assetSummary ? String(assetSummary.total) : "--"}
          secondary={assetSummary ? `${assetSummary.image} 图 / ${assetSummary.video} 视频 · ${formatBytes(assetSummary.estimatedBytes)}` : "等待统计"}
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
          secondary={quota !== undefined ? `配额 ${formatBytes(quota)}` : "浏览器未返回配额"}
        />
      </div>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
              <FileArchive className="h-3.5 w-3.5 text-blue-300" />
              备份与恢复
            </p>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--iw-muted)]">
              <input
                type="checkbox"
                checked={includeCredentials}
                onChange={event => setIncludeCredentials(event.target.checked)}
              />
              包含 provider 密钥
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAction("导出完整备份中", () => onExportWorkspace(includeCredentials))}
              className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
            >
              <Download className="h-3.5 w-3.5" />
              完整备份
            </button>
            {hasCurrentBoard && onExportCurrentBoard ? (
              <button
                type="button"
                onClick={() => void runAction("导出当前画板中", () => onExportCurrentBoard(includeCredentials))}
                className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
              >
                <HardDrive className="h-3.5 w-3.5" />
                当前画板
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
            >
              <Upload className="h-3.5 w-3.5" />
              恢复备份
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
          <FileInput className="h-3.5 w-3.5 text-emerald-300" />
          导入与高级清理
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => localAssetInputRef.current?.click()}
            className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
          >
            导入图片/视频
          </button>
          <button
            type="button"
            onClick={() => void runAction("清理失败任务中", () => onCleanupAssets("failed"))}
            className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
          >
            清失败 {assetSummary?.failed ?? 0}
          </button>
          <button
            type="button"
            onClick={() => void runAction("清理过期任务中", () => onCleanupAssets("stale-processing"))}
            className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
          >
            清过期 {assetSummary?.staleProcessing ?? 0}
          </button>
          <button
            type="button"
            onClick={() => void runAction("清理坏记录中", () => onCleanupAssets("broken-complete"))}
            className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
          >
            清坏记录 {assetSummary?.brokenComplete ?? 0}
          </button>
          <button
            type="button"
            onClick={() => void runAction("清理孤立资产中", () => onCleanupAssets("orphaned"))}
            className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
          >
            清孤立资产 {assetSummary?.orphaned ?? 0}
          </button>
          {hasCurrentBoard && onDuplicateCurrentBoard ? (
            <button
              type="button"
              onClick={() => void runAction("复制画板中", onDuplicateCurrentBoard)}
              className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
            >
              复制当前画板
            </button>
          ) : null}
        </div>
        {assetSummary && assetSummary.largest.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[var(--iw-border)] p-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--iw-faint)]">大文件</p>
            <ul className="mt-2 space-y-1">
              {assetSummary.largest.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-[11px] text-[var(--iw-muted)]">
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 font-mono">{formatBytes(item.bytes)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-red-500/20 bg-red-950/10 p-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-red-200">
          <Shield className="h-3.5 w-3.5" />
          危险区
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void runAction("清空资产中", onClearAssets)} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold">
            <Trash2 className="mr-1 inline h-3.5 w-3.5" />
            清空资产
          </button>
          <button type="button" onClick={() => void runAction("重置画板中", onResetBoards)} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold">
            重置画板
          </button>
          <button type="button" onClick={() => void runAction("清 Agent 中", () => onClearLocalStorage("agent"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold">
            清 Agent
          </button>
          <button type="button" onClick={() => void runAction("清模型缓存中", () => onClearLocalStorage("model-cache"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold">
            清模型缓存
          </button>
          <button type="button" onClick={() => void runAction("清密钥中", () => onClearLocalStorage("provider-credentials"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold">
            清密钥
          </button>
          <button type="button" onClick={() => void runAction("清偏好中", () => onClearLocalStorage("ui-preferences"))} className="imagine-danger-action h-9 rounded-lg px-3 text-[11px] font-semibold">
            清 UI 偏好
          </button>
        </div>
      </section>
    </div>
  );
}
