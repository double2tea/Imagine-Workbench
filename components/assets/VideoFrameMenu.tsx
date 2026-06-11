import { Clock3, ImageDown, SkipBack, SkipForward, type LucideIcon } from "lucide-react";
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
  variant?: "compact" | "full";
}

export default function VideoFrameMenu({
  align = "left",
  buttonClassName = "",
  isOpen,
  onSelect,
  onToggle,
  variant = "compact",
}: VideoFrameMenuProps) {
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
        <div
          className={`absolute bottom-full ${align === "right" ? "right-0" : "left-0"} mb-1 grid min-w-24 gap-1 rounded-lg border border-white/12 bg-slate-950/94 p-1 text-xs text-slate-100 shadow-xl backdrop-blur`}
        >
          {frameCaptureActions.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.mode}
                type="button"
                onClick={() => onSelect(action.mode)}
                className="flex h-8 items-center gap-2 rounded-md px-2 text-left transition hover:bg-white/10"
              >
                <Icon className="h-3.5 w-3.5 text-cyan-200" />
                <span className="whitespace-nowrap">{getVideoFrameCaptureLabel(action.mode)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
