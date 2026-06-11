"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  Check,
  Compass,
  Crop,
  Download,
  Eraser,
  Expand,
  Frame,
  Maximize2,
  Mic2,
  Paintbrush,
  RefreshCw,
  ScanSearch,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";

export type OperationTone = "accent" | "neutral" | "danger" | "media" | "success";

export interface WorkbenchOperationMeta {
  Icon: LucideIcon;
  label: string;
  title: string;
  tone: OperationTone;
}

export const IMAGE_EDIT_OPERATION_ORDER: readonly ImageEditFeature[] = ["redraw", "erase", "outpaint", "cutout"];

export const IMAGE_EDIT_OPERATION_META: Record<ImageEditFeature, WorkbenchOperationMeta> = {
  redraw: {
    Icon: WandSparkles,
    label: "重绘",
    title: "绘制蒙版并重绘局部",
    tone: "accent",
  },
  erase: {
    Icon: Eraser,
    label: "擦除",
    title: "绘制蒙版并擦除区域",
    tone: "accent",
  },
  outpaint: {
    Icon: Expand,
    label: "扩图",
    title: "扩展画面边界",
    tone: "accent",
  },
  cutout: {
    Icon: Scissors,
    label: "抠图",
    title: "移除背景并保留主体",
    tone: "accent",
  },
};

export const WORKBENCH_OPERATION_META = {
  analyze: { Icon: Sparkles, label: "分析", title: "分析媒体", tone: "accent" },
  apply: { Icon: Check, label: "应用", title: "应用编辑", tone: "success" },
  brush: { Icon: Paintbrush, label: "遮罩", title: "绘制遮罩", tone: "accent" },
  compare: { Icon: ScanSearch, label: "对比", title: "对比参考图", tone: "accent" },
  crop: { Icon: Crop, label: "裁切", title: "裁切画面", tone: "accent" },
  delete: { Icon: Trash2, label: "删除", title: "删除", tone: "danger" },
  download: { Icon: Download, label: "下载", title: "下载", tone: "neutral" },
  frame: { Icon: Frame, label: "截帧", title: "截取当前帧", tone: "media" },
  fullscreen: { Icon: Maximize2, label: "预览", title: "全屏预览", tone: "neutral" },
  imageToVideo: { Icon: Video, label: "生视频", title: "以此图生成视频", tone: "media" },
  localEdit: { Icon: Frame, label: "局部编辑", title: "局部编辑", tone: "accent" },
  panorama: { Icon: Compass, label: "360", title: "360 全景查看", tone: "media" },
  reset: { Icon: RefreshCw, label: "重置", title: "重置", tone: "neutral" },
  reuse: { Icon: SlidersHorizontal, label: "复用", title: "复用任务参数", tone: "neutral" },
  text: { Icon: Type, label: "文字", title: "放置文字", tone: "accent" },
  voice: { Icon: Mic2, label: "音色", title: "保存为克隆音色", tone: "media" },
} satisfies Record<string, WorkbenchOperationMeta>;

export type WorkbenchOperationKey = keyof typeof WORKBENCH_OPERATION_META;

export function operationToneClassName(tone: OperationTone): string {
  return `imagine-operation-tone-${tone}`;
}

export function imageEditOperationMeta(operation: ImageEditFeature): WorkbenchOperationMeta {
  return IMAGE_EDIT_OPERATION_META[operation];
}

export function ImageEditOperationIcon({
  className = "h-3.5 w-3.5",
  operation,
}: {
  className?: string;
  operation: ImageEditFeature;
}) {
  const Icon = IMAGE_EDIT_OPERATION_META[operation].Icon;
  return <Icon className={className} />;
}

export function WorkbenchOperationIcon({
  className = "h-3.5 w-3.5",
  operation,
}: {
  className?: string;
  operation: WorkbenchOperationKey;
}) {
  const Icon = WORKBENCH_OPERATION_META[operation].Icon;
  return <Icon className={className} />;
}

export function OperationSection({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="imagine-operation-section-label">{label}</span>
      {children}
    </div>
  );
}

export function OperationControlGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`imagine-operation-control-group ${className}`}>{children}</div>;
}

export function OperationSegmentButton({
  active,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      className={`imagine-operation-segment ${className}`}
      data-active={active}
    >
      {children}
    </button>
  );
}

export function OperationActionButton({
  children,
  className = "",
  size = "default",
  tone = "neutral",
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: "default" | "compact";
  tone?: OperationTone;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      {...props}
      data-size={size}
      className={`imagine-operation-action imagine-motion-interactive imagine-operation-action--${variant} ${operationToneClassName(tone)} ${className}`}
    >
      {children}
    </button>
  );
}

export interface WorkbenchActionDescriptor {
  active?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  icon: ReactNode;
  id: string;
  label?: string;
  onClick: () => void;
  title: string;
  tone?: OperationTone;
}

export function workbenchCardActionClassName(tone: OperationTone = "neutral", className = ""): string {
  return `imagine-card-action min-w-0 cursor-pointer gap-0.5 px-1.5 py-1 text-xs ${operationToneClassName(tone)} ${className}`;
}

export function WorkbenchActionButton({
  action,
  className = "",
}: {
  action: WorkbenchActionDescriptor;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      data-active={action.active}
      onClick={action.onClick}
      className={workbenchCardActionClassName(action.tone ?? "neutral", `imagine-motion-interactive ${className}`)}
      title={action.title}
      aria-label={action.ariaLabel ?? action.title}
    >
      {action.icon}
      {action.label ? <span className="text-[9px] font-bold">{action.label}</span> : null}
    </button>
  );
}

export function WorkbenchActionStrip({
  actions,
  children,
  className = "",
}: {
  actions?: WorkbenchActionDescriptor[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`imagine-card-actions imagine-floating-card-actions flex flex-wrap items-center justify-center gap-1 rounded-xl border border-transparent bg-transparent p-1 shadow-none ${className}`}>
      {actions?.map(action => <WorkbenchActionButton key={action.id} action={action} />)}
      {children}
    </div>
  );
}

export type WorkbenchPopoverSurface = "floating" | "panel";

export function WorkbenchPopoverMenu({
  align = "left",
  children,
  className = "",
  surface = "floating",
}: {
  align?: "left" | "right";
  children: ReactNode;
  className?: string;
  surface?: WorkbenchPopoverSurface;
}) {
  const surfaceClassName = surface === "panel"
    ? "border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-text)]"
    : "border-white/12 bg-slate-950/94 text-slate-100 backdrop-blur";

  return (
    <div
      className={`imagine-motion-surface-reveal absolute bottom-full ${align === "right" ? "right-0" : "left-0"} ${surfaceClassName} mb-1 grid min-w-24 gap-1 rounded-lg border p-1 text-xs shadow-xl ${className}`}
    >
      {children}
    </div>
  );
}

export function WorkbenchPopoverMenuItem({
  children,
  icon,
  iconClassName = "",
  onClick,
  surface = "floating",
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  iconClassName?: string;
  onClick: () => void;
  surface?: WorkbenchPopoverSurface;
  title?: string;
}) {
  const itemClassName = surface === "panel" ? "hover:bg-[var(--iw-panel-soft)]" : "hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`imagine-motion-interactive flex h-8 items-center gap-2 rounded-md px-2 text-left ${itemClassName}`}
      title={title}
    >
      <span className={`inline-flex h-3.5 w-3.5 items-center justify-center ${iconClassName}`}>{icon}</span>
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}
