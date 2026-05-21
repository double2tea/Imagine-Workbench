import { Moon, Settings, Sparkles, Sun, Trash2 } from "lucide-react";

export type ThemeMode = "light" | "dark";

interface WorkspaceHeaderProps {
  themeMode: ThemeMode;
  onClearProject: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
}

export default function WorkspaceHeader({
  themeMode,
  onClearProject,
  onOpenSettings,
  onToggleTheme,
}: WorkspaceHeaderProps) {
  return (
    <header className="imagine-app-header sticky top-0 z-40 bg-[#07080b]/86 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3 sm:px-6 flex items-center justify-between gap-3 select-none">
      <div className="flex min-w-0 items-center gap-3 z-10">
        <div className="imagine-brand-mark relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-500/12 shadow-sm">
          <Sparkles className="h-4.5 w-4.5 text-blue-200" />
        </div>
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-white">
            <span className="truncate">Imagine Workbench</span>
            <span className="shrink-0 rounded border border-blue-400/20 bg-blue-400/10 px-1.5 py-0.5 text-[9px] font-mono font-normal tracking-widest text-blue-300">v1.2 PRO</span>
          </h1>
          <p className="truncate text-[11px] font-medium text-slate-400">智能图像与视频生成工作台</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 z-10">
        <button
          onClick={onOpenSettings}
          className="imagine-header-button flex h-9 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 cursor-pointer"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">设置</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-pressed={themeMode === "dark"}
          className="imagine-header-button imagine-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-slate-400 transition hover:border-blue-500/40 hover:bg-blue-950/30 hover:text-blue-300 cursor-pointer"
          title={themeMode === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {themeMode === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onClearProject}
          className="imagine-header-button imagine-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-slate-400 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-300 cursor-pointer"
          title="清空当前项目"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
