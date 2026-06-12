import { Clock3, ImageDown, SkipBack, SkipForward, type LucideIcon } from "lucide-react";
import { WorkbenchPopoverMenu, WorkbenchPopoverMenuItem, type WorkbenchPopoverPlacement, type WorkbenchPopoverSurface } from "@/components/workbench/OperationControls";
import { getVideoFrameCaptureLabel, type VideoFrameCaptureMode } from "@/lib/video-frame";

const frameCaptureActions: Array<{
  icon: LucideIcon;
  mode: VideoFrameCaptureMode;
}> = [
  { icon: SkipBack, mode: "first" },
  { icon: Clock3, mode: "current" },
  { icon: SkipForward, mode: "last" },
];

interface VideoFrameMenuProps {
  align?: "left" | "right";
  buttonClassName?: string;
  isOpen: boolean;
  onSelect: (mode: VideoFrameCaptureMode) => void;
  onToggle: () => void;
  placement?: WorkbenchPopoverPlacement;
  surface?: WorkbenchPopoverSurface;
  variant?: "compact" | "full";
}

export default function VideoFrameMenu({
  align = "left",
  buttonClassName = "",
  isOpen,
  onSelect,
  onToggle,
  placement = "above",
  surface = "floating",
  variant = "compact",
}: VideoFrameMenuProps) {
  const iconClassName = surface === "panel" ? "text-[var(--iw-accent)]" : "text-cyan-200";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={buttonClassName}
        title="截取视频帧"
        aria-label="截取视频帧"
        aria-expanded={isOpen}
      >
        <ImageDown className={variant === "full" ? "h-4.5 w-4.5" : "h-3 w-3"} />
        {variant === "full" ? <span className="text-xs font-semibold">截帧</span> : <span className="text-[9px] font-bold">截帧</span>}
      </button>
      {isOpen && (
        <WorkbenchPopoverMenu align={align} placement={placement} surface={surface}>
          {frameCaptureActions.map(action => {
            const Icon = action.icon;
            return (
              <WorkbenchPopoverMenuItem
                key={action.mode}
                onClick={() => onSelect(action.mode)}
                icon={<Icon className="h-3.5 w-3.5" />}
                iconClassName={iconClassName}
                surface={surface}
              >
                {getVideoFrameCaptureLabel(action.mode)}
              </WorkbenchPopoverMenuItem>
            );
          })}
        </WorkbenchPopoverMenu>
      )}
    </div>
  );
}
