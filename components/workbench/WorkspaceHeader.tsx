"use client";

import Link from "next/link";
import { FolderHeart, Github, Grid2X2, Mail, Moon, Plug, Settings, Sun, Trash2 } from "lucide-react";
import WorkspaceTopBarBrand from "@/components/workbench/WorkspaceTopBarBrand";
import WorkspaceTopBar, {
  workspaceTopBarButtonClass,
  workspaceTopBarIconButtonClass,
} from "@/components/workbench/WorkspaceTopBar";
import { useThemeMode, type ThemeMode } from "@/lib/theme-mode";

export type { ThemeMode };

interface WorkspaceHeaderProps {
  onClearProject: () => void;
  onOpenAssetLibrary: () => void;
  onOpenSettings: () => void;
  onRunResolveCheck: () => void;
  resolveCheckStatus: "idle" | "running";
  showResolveCheck: boolean;
}

export default function WorkspaceHeader({
  onClearProject,
  onOpenAssetLibrary,
  onOpenSettings,
  onRunResolveCheck,
  resolveCheckStatus,
  showResolveCheck,
}: WorkspaceHeaderProps) {
  const { themeMode, toggleThemeMode } = useThemeMode();

  return (
    <WorkspaceTopBar
      sticky
      start={
        <WorkspaceTopBarBrand subtitle="智能图像、视频与音频创作工作台" />
      }
      end={
        <div className="z-10 flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link href="/board" className={workspaceTopBarButtonClass}>
            <Grid2X2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">画板</span>
          </Link>

          <button type="button" onClick={onOpenAssetLibrary} className={`${workspaceTopBarButtonClass} cursor-pointer`}>
            <FolderHeart className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">素材库</span>
          </button>

          {showResolveCheck ? (
            <button
              type="button"
              onClick={onRunResolveCheck}
              disabled={resolveCheckStatus === "running"}
              className={`${workspaceTopBarButtonClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
              title="通过 Resolve 插件执行连接检查"
            >
              <Plug className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{resolveCheckStatus === "running" ? "等待达芬奇" : "达芬奇"}</span>
            </button>
          ) : null}

          <button onClick={onOpenSettings} className={`${workspaceTopBarButtonClass} cursor-pointer`}>
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">设置</span>
          </button>

          <a
            href="https://github.com/double2tea/Imagine-Workbench"
            target="_blank"
            rel="noreferrer"
            className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
            title="GitHub: Imagine Workbench"
            aria-label="打开项目 GitHub"
          >
            <Github className="h-3.5 w-3.5" />
          </a>

          <a
            href="mailto:double_tea@foxmail.com"
            className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
            title="联系作者: double_tea@foxmail.com"
            aria-label="给作者发送邮件"
          >
            <Mail className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={toggleThemeMode}
            aria-pressed={themeMode === "dark"}
            className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
            title={themeMode === "light" ? "切换深色模式" : "切换浅色模式"}
          >
            {themeMode === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClearProject}
            className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
            data-action="danger"
            title="清空本地资产"
            aria-label="清空本地资产"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    />
  );
}
