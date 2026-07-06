import { useTranslations } from "@/lib/i18n";

interface FloatingCompareButtonProps {
  selectedCount: number;
  show: boolean;
  onOpen: () => void;
}

export default function FloatingCompareButton({ selectedCount, show, onOpen }: FloatingCompareButtonProps) {
  const { t } = useTranslations("common");
  if (!show) return null;

  return (
    <div className="imagine-floating-compare fixed top-20 right-6 z-30">
      <button
        onClick={onOpen}
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--iw-tone-warning-border)] bg-[color-mix(in_srgb,var(--iw-tone-warning-bg)_88%,transparent)] px-4 py-2.5 text-xs font-semibold text-[var(--iw-tone-warning-text)] transition hover:brightness-105"
      >
        <span>{t("compare.selected", { count: selectedCount })}</span>
      </button>
    </div>
  );
}
