"use client";

import { AudioLines, Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

export type CreationMode = "image" | "video" | "audio";

interface CreationModeTabsProps {
  value: CreationMode;
  onChange: (value: CreationMode) => void;
}

export default function CreationModeTabs({ value, onChange }: CreationModeTabsProps) {
  const { t } = useTranslations("creation");
  const tabs: Array<{ Icon: typeof ImageIcon; label: string; value: CreationMode }> = [
    { Icon: ImageIcon, label: t("tabs.image"), value: "image" },
    { Icon: VideoIcon, label: t("tabs.video"), value: "video" },
    { Icon: AudioLines, label: t("tabs.audio"), value: "audio" },
  ];

  return (
    <div className="imagine-tabbar flex min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
      {tabs.map(({ Icon, label, value: tabValue }) => (
        <button
          key={tabValue}
          type="button"
          onClick={() => onChange(tabValue)}
          data-active={value === tabValue}
          className="imagine-tab-button flex min-w-0 flex-1 cursor-pointer select-none items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold text-slate-400 transition-all duration-200 hover:bg-slate-900 hover:text-slate-200"
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}
