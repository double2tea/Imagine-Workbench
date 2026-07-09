"use client";

import { AudioLines, Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

export type CreationMode = "image" | "video" | "audio";

interface CreationModeTabsProps {
  value: CreationMode;
  onChange: (value: CreationMode) => void;
  /** Distinguishes mobile vs desktop tablists so button ids stay unique in the DOM. */
  instance?: "desktop" | "mobile";
}

export default function CreationModeTabs({
  value,
  onChange,
  instance = "desktop",
}: CreationModeTabsProps) {
  const { t } = useTranslations("creation");
  const tabs: Array<{ Icon: typeof ImageIcon; label: string; value: CreationMode }> = [
    { Icon: ImageIcon, label: t("tabs.image"), value: "image" },
    { Icon: VideoIcon, label: t("tabs.video"), value: "video" },
    { Icon: AudioLines, label: t("tabs.audio"), value: "audio" },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("tabs.ariaLabel")}
      className="imagine-creation-mode-tabs imagine-tabbar flex min-w-0 border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-1"
    >
      {tabs.map(({ Icon, label, value: tabValue }) => (
        <button
          key={tabValue}
          type="button"
          role="tab"
          id={`creation-tab-${instance}-${tabValue}`}
          aria-controls={`creation-panel-${instance}-${tabValue}`}
          aria-selected={value === tabValue}
          onClick={() => onChange(tabValue)}
          data-active={value === tabValue}
          data-mode={tabValue}
          className="imagine-tab-button flex min-w-0 flex-1 cursor-pointer select-none items-center justify-center gap-2 py-2 text-xs font-semibold"
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}
