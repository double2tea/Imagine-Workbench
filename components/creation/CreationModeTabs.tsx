import { AudioLines, Image as ImageIcon, Video as VideoIcon } from "lucide-react";

export type CreationMode = "image" | "video" | "audio";

interface CreationModeTabsProps {
  value: CreationMode;
  onChange: (value: CreationMode) => void;
}

export default function CreationModeTabs({ value, onChange }: CreationModeTabsProps) {
  return (
    <div className="imagine-tabbar flex min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
      <button
        type="button"
        onClick={() => onChange("image")}
        data-active={value === "image"}
        className={`imagine-tab-button flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-all duration-200 select-none cursor-pointer ${
          value === "image"
            ? "bg-blue-500/14 text-blue-200"
            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`}
      >
        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">智能绘图</span> <span className="hidden text-slate-500 sm:inline">Image Studio</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("video")}
        data-active={value === "video"}
        className={`imagine-tab-button flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-all duration-200 select-none cursor-pointer ${
          value === "video"
            ? "bg-violet-500/14 text-violet-200"
            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`}
      >
        <VideoIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">视频合成</span> <span className="hidden text-slate-500 sm:inline">Video Studio</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("audio")}
        data-active={value === "audio"}
        className={`imagine-tab-button flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-all duration-200 select-none cursor-pointer ${
          value === "audio"
            ? "bg-cyan-500/14 text-cyan-200"
            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`}
      >
        <AudioLines className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">音频创作</span> <span className="hidden text-slate-500 sm:inline">Audio Studio</span>
      </button>
    </div>
  );
}
