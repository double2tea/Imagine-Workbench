import type { LucideIcon } from "lucide-react";
import {
  Bot,
  AudioLines,
  FileText,
  ImagePlus,
  Layers,
  LayoutGrid,
  MessageSquareText,
  Workflow,
  Video,
} from "lucide-react";
import {
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_MULTI_GRID_NODE_SIZE,
  DEFAULT_NOTE_NODE_SIZE,
  DEFAULT_PROMPT_NODE_SIZE,
  DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  DEFAULT_RUNNINGHUB_APP_NODE_SIZE,
} from "@/lib/board/defaults";
import type { BoardSize } from "@/lib/board/types";

export type BoardInsertKind =
  | "prompt"
  | "reference-group"
  | "multi-grid"
  | "image-generate"
  | "video-generate"
  | "audio-operation"
  | "runninghub-app"
  | "agent"
  | "note";

export type BoardInsertGroupLabel = "开始" | "生成" | "组织";

export interface BoardInsertCatalogItem {
  icon: LucideIcon;
  iconClassName: string;
  iconSurfaceClassName: string;
  kind: BoardInsertKind;
  label: string;
  size: BoardSize;
}

export const BOARD_INSERT_CATALOG: BoardInsertCatalogItem[] = [
  {
    icon: MessageSquareText,
    iconClassName: "text-teal-300",
    iconSurfaceClassName: "bg-teal-500/10 border-teal-400/20",
    kind: "prompt",
    label: "提示",
    size: DEFAULT_PROMPT_NODE_SIZE,
  },
  {
    icon: Layers,
    iconClassName: "text-cyan-300",
    iconSurfaceClassName: "bg-cyan-500/10 border-cyan-400/20",
    kind: "reference-group",
    label: "参考组",
    size: DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  },
  {
    icon: LayoutGrid,
    iconClassName: "text-emerald-300",
    iconSurfaceClassName: "bg-emerald-500/10 border-emerald-400/20",
    kind: "multi-grid",
    label: "多宫格",
    size: DEFAULT_MULTI_GRID_NODE_SIZE,
  },
  {
    icon: ImagePlus,
    iconClassName: "text-blue-300",
    iconSurfaceClassName: "bg-blue-500/10 border-blue-400/20",
    kind: "image-generate",
    label: "图片",
    size: DEFAULT_GENERATE_NODE_SIZE,
  },
  {
    icon: Video,
    iconClassName: "text-violet-300",
    iconSurfaceClassName: "bg-violet-500/10 border-violet-400/20",
    kind: "video-generate",
    label: "视频",
    size: DEFAULT_GENERATE_NODE_SIZE,
  },
  {
    icon: AudioLines,
    iconClassName: "text-cyan-300",
    iconSurfaceClassName: "bg-cyan-500/10 border-cyan-400/20",
    kind: "audio-operation",
    label: "音频",
    size: DEFAULT_GENERATE_NODE_SIZE,
  },
  {
    icon: Workflow,
    iconClassName: "text-emerald-300",
    iconSurfaceClassName: "bg-emerald-500/10 border-emerald-400/20",
    kind: "runninghub-app",
    label: "RH 应用",
    size: DEFAULT_RUNNINGHUB_APP_NODE_SIZE,
  },
  {
    icon: Bot,
    iconClassName: "text-purple-300",
    iconSurfaceClassName: "bg-purple-500/10 border-purple-400/20",
    kind: "agent",
    label: "智能体",
    size: DEFAULT_AGENT_NODE_SIZE,
  },
  {
    icon: FileText,
    iconClassName: "text-amber-300",
    iconSurfaceClassName: "bg-amber-500/10 border-amber-400/20",
    kind: "note",
    label: "笔记",
    size: DEFAULT_NOTE_NODE_SIZE,
  },
];

export const BOARD_INSERT_GROUP_LABELS: readonly BoardInsertGroupLabel[] = ["开始", "生成", "组织"];

export function boardInsertGroupLabel(kind: BoardInsertKind): BoardInsertGroupLabel {
  switch (kind) {
    case "prompt":
    case "reference-group":
      return "开始";
    case "image-generate":
    case "video-generate":
    case "audio-operation":
    case "runninghub-app":
      return "生成";
    case "agent":
    case "multi-grid":
    case "note":
      return "组织";
  }
}

export function isBoardInsertKind(value: string): value is BoardInsertKind {
  return BOARD_INSERT_CATALOG.some(item => item.kind === value);
}

const LAST_INSERT_KEY = "imagine_board_last_insert";

export function readLastBoardInsertKind(): BoardInsertKind {
  if (typeof window === "undefined") return "prompt";
  const stored = window.localStorage.getItem(LAST_INSERT_KEY);
  return stored && isBoardInsertKind(stored)
    ? stored
    : "prompt";
}

export function writeLastBoardInsertKind(kind: BoardInsertKind): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_INSERT_KEY, kind);
}
