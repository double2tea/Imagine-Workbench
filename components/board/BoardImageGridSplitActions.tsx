import { LayoutGrid } from "lucide-react";
import type { BoardMediaAction } from "@/components/board/BoardMediaActionBar";
import { operationToneClassName } from "@/components/workbench/OperationControls";
import { BOARD_IMAGE_GRID_SPLIT_PRESETS, type BoardImageGridSplitMode } from "@/lib/board/image-grid-split";

export function createBoardImageGridSplitActions(
  t: (key: string, values?: Record<string, string | number>) => string,
  onSplit: (mode: BoardImageGridSplitMode) => void,
): BoardMediaAction[] {
  return [
    {
      id: "split-grid",
      icon: <LayoutGrid className="h-3.5 w-3.5" />,
      title: t("mediaNode.splitGridMenu"),
      toneClassName: operationToneClassName("media"),
      menuItems: [
        {
          id: "split-auto",
          icon: <span className="text-[10px] font-bold leading-none">Auto</span>,
          label: t("mediaNode.splitGridAuto"),
          onClick: () => onSplit("auto"),
        },
        ...BOARD_IMAGE_GRID_SPLIT_PRESETS.map(preset => ({
          id: `split-${preset}`,
          icon: <span className="text-[10px] font-bold leading-none">{preset}x</span>,
          label: t("mediaNode.splitGridPreset", { size: preset }),
          onClick: () => onSplit(preset),
        })),
      ],
    },
  ];
}
