import { Image as ImageIcon, Video as VideoIcon } from "lucide-react";

export type CreationMode = "image" | "video";

interface CreationModeTabsProps {
  value: CreationMode;
  onChange: (value: CreationMode) => void;
}

export default function CreationModeTabs({ value, onChange }: CreationModeTabsProps) {
  return (
    <div className="imagine-tabbar flex rounded-lg border border-slate-800 bg-slate-950/60 p-1">
      <button
        type="button"
        onClick={() => onChange("image")}
        data-active={value === "image"}
        className={`imagine-tab-button flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold select-none cursor-pointer transition-all duration-200 ${
          value === "image"
            ? "bg-blue-500/14 text-blue-200"
            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        智能绘图 <span className="hidden sm:inline text-slate-500">Image Studio</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("video")}
        data-active={value === "video"}
        className={`imagine-tab-button flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold select-none cursor-pointer transition-all duration-200 ${
          value === "video"
            ? "bg-violet-500/14 text-violet-200"
            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`}
      >
        <VideoIcon className="h-3.5 w-3.5" />
        视频合成 <span className="hidden sm:inline text-slate-500">Video Studio</span>
      </button>
    </div>
  );
}
