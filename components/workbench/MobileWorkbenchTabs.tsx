import { Image as ImageIcon, Sparkles } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

export type MobileWorkbenchPanel = "create" | "gallery";

interface MobileWorkbenchTabsProps {
  activePanel: MobileWorkbenchPanel;
  galleryCount: number;
  inFlightCount: number;
  onChange: (panel: MobileWorkbenchPanel) => void;
}

export default function MobileWorkbenchTabs({
  activePanel,
  galleryCount,
  inFlightCount,
  onChange,
}: MobileWorkbenchTabsProps) {
  const { t } = useTranslations("common");
  return (
    <div className="imagine-mobile-workbench-tabs flex gap-1 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-1 lg:hidden">
      <button
        type="button"
        data-active={activePanel === "create"}
        onClick={() => onChange("create")}
        className="imagine-mobile-workbench-tab flex flex-1 items-center justify-center gap-1.5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>{t("gallery.createTab")}</span>
      </button>
      <button
        type="button"
        data-active={activePanel === "gallery"}
        onClick={() => onChange("gallery")}
        className="imagine-mobile-workbench-tab flex flex-1 items-center justify-center gap-1.5"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        <span>{t("gallery.mobileTitle")}</span>
        <span className="font-mono text-[10px] opacity-75">{galleryCount}</span>
        {inFlightCount > 0 && (
          <span className="imagine-mobile-workbench-tab-badge font-mono text-[9px]">{inFlightCount}</span>
        )}
      </button>
    </div>
  );
}