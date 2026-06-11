import { AudioLines, RefreshCw, Sparkles, Video as VideoIcon } from "lucide-react";
import ModelPriceBadge from "@/components/creation/ModelPriceBadge";

export type CreatorGenerateMode = "image" | "video" | "audio";

interface CreatorGenerateButtonProps {
  mode: CreatorGenerateMode;
  disabled: boolean;
  isSubmitting: boolean;
  priceProvider?: string;
  priceModelId?: string;
  priceDuration?: string;
  priceResolution?: string;
  priceImageQuality?: string;
  priceReferenceTypes?: Array<"image" | "video" | "audio">;
  priceThinkingLevel?: string;
  priceVideoReferenceMode?: "reference" | "firstLast" | "none";
  priceVideoResolution?: string;
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
  priceDuration,
  priceResolution,
  priceImageQuality,
  priceReferenceTypes,
  priceThinkingLevel,
  priceVideoReferenceMode,
  priceVideoResolution,
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
      className={`imagine-primary-action imagine-creator-generate-btn flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold transition duration-200 ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : isImage
            ? "bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98] shadow-lg shadow-blue-950/30 cursor-pointer"
            : isAudio
              ? "bg-cyan-600 text-white hover:bg-cyan-500 active:scale-[0.98] shadow-lg shadow-cyan-950/30 cursor-pointer"
              : "bg-violet-600 text-white hover:bg-violet-500 active:scale-[0.98] shadow-lg shadow-violet-950/30 cursor-pointer"
      }`}
    >
      {isSubmitting ? (
        <RefreshCw className="h-4 w-4 animate-spin text-white" />
      ) : isImage ? (
        <Sparkles className="h-4 w-4 text-white" />
      ) : isAudio ? (
        <AudioLines className="h-4 w-4 text-white" />
      ) : (
        <VideoIcon className="h-4 w-4 text-white" />
      )}
      <span className="truncate">{isSubmitting ? submittingLabel : (label ?? defaultLabel)}</span>
      {showPrice && (
        <ModelPriceBadge
          provider={priceProvider!}
          modelId={priceModelId!}
          duration={priceDuration}
          resolution={priceResolution}
          imageQuality={priceImageQuality}
          referenceTypes={priceReferenceTypes}
          thinkingLevel={priceThinkingLevel}
          videoReferenceMode={priceVideoReferenceMode}
          videoResolution={priceVideoResolution}
        />
      )}
    </button>
  );
}
