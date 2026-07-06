import { AudioLines, RefreshCw, Sparkles, Video as VideoIcon } from "lucide-react";
import ModelPriceBadge from "@/components/creation/ModelPriceBadge";
import { useTranslations } from "@/lib/i18n";
import type { ModelPriceOptions } from "@/lib/providers/pricing";

export type CreatorGenerateMode = "image" | "video" | "audio";

interface CreatorGenerateButtonProps {
  mode: CreatorGenerateMode;
  disabled: boolean;
  disabledHint?: string;
  isSubmitting: boolean;
  priceProvider?: string;
  priceModelId?: string;
  priceOptions?: ModelPriceOptions;
  submitCount: number;
  label?: string;
  onGenerate: () => void;
}

export default function CreatorGenerateButton({
  mode,
  disabled,
  disabledHint,
  isSubmitting,
  priceProvider,
  priceModelId,
  priceOptions,
  submitCount,
  label,
  onGenerate,
}: CreatorGenerateButtonProps) {
  const { t } = useTranslations("creation");
  const isImage = mode === "image";
  const isAudio = mode === "audio";
  const showPrice = !isSubmitting && priceProvider && priceModelId;
  const defaultLabel = isImage ? t("generateButton.defaultLabel.image") : isAudio ? t("generateButton.defaultLabel.audio") : t("generateButton.defaultLabel.video");
  const submittingLabel = t("generateButton.submittingLabel", { count: submitCount });

  const showDisabledHint = disabled && !isSubmitting && disabledHint;

  return (
    <div className="flex flex-col gap-1.5">
      {showDisabledHint ? (
        <p className="iw-type-label text-center leading-4 text-[var(--iw-faint)]">{disabledHint}</p>
      ) : null}
      <button
      type="button"
      onClick={onGenerate}
      disabled={disabled}
      data-mode={mode}
      data-tone="accent"
      className={`imagine-primary-action imagine-creator-generate-btn flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold transition duration-200 ${
        disabled ? "cursor-not-allowed" : "cursor-pointer active:scale-[0.98]"
      }`}
    >
      {isSubmitting ? (
        <RefreshCw className="h-4 w-4 animate-spin text-current" />
      ) : isImage ? (
        <Sparkles className="h-4 w-4 text-current" />
      ) : isAudio ? (
        <AudioLines className="h-4 w-4 text-current" />
      ) : (
        <VideoIcon className="h-4 w-4 text-current" />
      )}
      <span className="truncate">{isSubmitting ? submittingLabel : (label ?? defaultLabel)}</span>
      {showPrice && (
        <ModelPriceBadge
          provider={priceProvider!}
          modelId={priceModelId!}
          options={priceOptions}
        />
      )}
    </button>
    </div>
  );
}
