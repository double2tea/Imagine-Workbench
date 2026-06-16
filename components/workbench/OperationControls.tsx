"use client";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import {
  Box,
  Check,
  Compass,
  Crop,
  Download,
  Eraser,
  FolderHeart,
  Frame,
  Maximize2,
  Mic2,
  Paintbrush,
  RotateCcw,
  ScanSearch,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  SquarePen,
  Sun,
  Trash2,
  Type,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { imageEditFeatureLabel, type ImageEditFeature } from "@/lib/image-quick-edit-targets";
import { useTranslations } from "@/lib/i18n";

export type OperationTone = "accent" | "neutral" | "danger" | "media" | "success";

export interface WorkbenchOperationMeta {
  Icon: LucideIcon;
  label: string;
  title: string;
  tone: OperationTone;
}

export const IMAGE_EDIT_OPERATION_ORDER: readonly ImageEditFeature[] = ["redraw", "erase", "outpaint", "cutout", "angle", "lighting"];

export const IMAGE_EDIT_OPERATION_META: Record<ImageEditFeature, WorkbenchOperationMeta> = {
  redraw: {
    Icon: WandSparkles,
    label: imageEditFeatureLabel("redraw"),
    title: "Draw mask and repaint area",
    tone: "accent",
  },
  erase: {
    Icon: Eraser,
    label: imageEditFeatureLabel("erase"),
    title: "Draw mask and erase area",
    tone: "accent",
  },
  outpaint: {
    Icon: SquareDashed,
    label: imageEditFeatureLabel("outpaint"),
    title: "Extend canvas boundary",
    tone: "accent",
  },
  cutout: {
    Icon: Scissors,
    label: imageEditFeatureLabel("cutout"),
    title: "Remove background, keep subject",
    tone: "accent",
  },
  angle: {
    Icon: Box,
    label: imageEditFeatureLabel("angle"),
    title: "Adjust camera angle",
    tone: "accent",
  },
  lighting: {
    Icon: Sun,
    label: imageEditFeatureLabel("lighting"),
    title: "Adjust lighting",
    tone: "accent",
  },
};

export const WORKBENCH_OPERATION_META = {
  analyze: { Icon: Sparkles, label: "Analyze", title: "Analyze media", tone: "accent" },
  apply: { Icon: Check, label: "Apply", title: "Apply edit", tone: "success" },
  brush: { Icon: Paintbrush, label: "Mask", title: "Draw mask", tone: "accent" },
  compare: { Icon: ScanSearch, label: "Compare", title: "Compare reference", tone: "accent" },
  crop: { Icon: Crop, label: "Crop", title: "Crop frame", tone: "accent" },
  delete: { Icon: Trash2, label: "Delete", title: "Delete", tone: "danger" },
  download: { Icon: Download, label: "Download", title: "Download", tone: "neutral" },
  frame: { Icon: Frame, label: "Frame", title: "Capture current frame", tone: "media" },
  fullscreen: { Icon: Maximize2, label: "Preview", title: "Fullscreen preview", tone: "neutral" },
  imageToVideo: { Icon: Video, label: "To video", title: "Generate video from this image", tone: "media" },
  library: { Icon: FolderHeart, label: "Library", title: "Save to asset library", tone: "media" },
  localEdit: { Icon: SquarePen, label: "Local edit", title: "Open local editor", tone: "accent" },
  panorama: { Icon: Compass, label: "360", title: "360 panorama view", tone: "media" },
  reset: { Icon: RotateCcw, label: "Reset", title: "Reset", tone: "neutral" },
  reuse: { Icon: SlidersHorizontal, label: "Reuse", title: "Reuse task params", tone: "neutral" },
  text: { Icon: Type, label: "Text", title: "Place text", tone: "accent" },
  voice: { Icon: Mic2, label: "Voice", title: "Save as cloned voice", tone: "media" },
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
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
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
      data-action-id={action.id}
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
export type WorkbenchPopoverPlacement = "above" | "below";

export function WorkbenchPopoverMenu({
  align = "left",
  children,
  className = "",
  placement = "above",
  surface = "floating",
}: {
  align?: "left" | "right";
  children: ReactNode;
  className?: string;
  placement?: WorkbenchPopoverPlacement;
  surface?: WorkbenchPopoverSurface;
}) {
  const surfaceClassName = surface === "panel"
    ? "border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-text)]"
    : "border-white/12 bg-slate-950/94 text-slate-100 backdrop-blur";
  const placementClassName = placement === "below" ? "top-full mt-1" : "bottom-full mb-1";

  return (
    <div
      className={`imagine-motion-surface-reveal absolute z-40 ${placementClassName} ${align === "right" ? "right-0" : "left-0"} ${surfaceClassName} grid min-w-24 gap-1 rounded-lg border p-1 text-xs shadow-xl ${className}`}
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
