import { AudioLines, RefreshCw, Sparkles, Video as VideoIcon } from "lucide-react";
import ModelPriceBadge from "@/components/creation/ModelPriceBadge";
import type { ModelPriceOptions } from "@/lib/providers/pricing";

export type CreatorGenerateMode = "image" | "video" | "audio";

interface CreatorGenerateButtonProps {
  mode: CreatorGenerateMode;
  disabled: boolean;
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
  isSubmitting,
  priceProvider,
  priceModelId,
  priceOptions,
  submitCount,
  label,
  onGenerate,
}: CreatorGenerateButtonProps) {
  const isImage = mode === "image";
  const isAudio = mode === "audio";
  const showPrice = !isSubmitting && priceProvider && priceModelId;
  const defaultLabel = isImage ? "生成图片" : isAudio ? "生成音频" : "生成视频";
  const submittingLabel = `提交中 (${submitCount})，可继续排队`;

  return (
    <button
      type="button"
      onClick={onGenerate}
      disabled={disabled}
      data-mode={mode}
      data-tone="accent"
      className={`imagine-primary-action imagine-creator-generate-btn flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold text-white transition duration-200 ${
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
  );
}
