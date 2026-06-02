import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { RefreshCw, Sparkles, Video as VideoIcon } from "lucide-react";
import ReferenceImagePicker, { type ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { type DraggedReferenceAsset, hasDraggedReferenceAsset } from "@/components/reference/referenceDrag";
import type { ModelOption, ParameterOption, VideoModelCapabilities, VideoReferenceMode } from "@/lib/providers/model-catalog";

interface ModelOptionGroup {
  provider: string;
  label: string;
  options: ModelOption[];
}

interface VideoGenerationPanelProps {
  atDropdownNode: ReactNode;
  capabilities: VideoModelCapabilities;
  clearReferenceLabel: string;
  isOptimizing: boolean;
  isSubmitting: boolean;
  modelGroups: ModelOptionGroup[];
  durationOptions: ParameterOption[];
  presetOptions: ParameterOption[];
  prompt: string;
  promptPlaceholder: string;
  referenceHelp: string;
  referenceImages: ReferenceImageRef[];
  referenceLabel: string;
  referenceLimit: number;
  referenceMode: VideoReferenceMode;
  resolutionOptions: ParameterOption[];
  selectedDuration: string;
  selectedModel: string;
  selectedPreset: string;
  selectedResolution: string;
  selectedSize: string;
  submitCount: number;
  onClearReferences: () => void;
  onGenerate: () => void;
  onOptimizePrompt: () => void;
  onPromptChange: (value: string) => void;
  onPromptDropAsset: (event: DragEvent<HTMLTextAreaElement>) => void;
  onReferenceDropAsset: (asset: DraggedReferenceAsset) => void;
  onReferenceDropFiles: (files: File[]) => void;
  onReferenceRemove: (id: string) => void;
  onReferenceRoleChange: (id: string, role: ReferenceImageRef["role"]) => void;
  onReferenceUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectDuration: (value: string) => void;
  onSelectResolution: (value: string) => void;
  onSelectModel: (value: string) => void;
  onSelectPreset: (value: string) => void;
  onSelectSize: (value: string) => void;
}

export default function VideoGenerationPanel({
  atDropdownNode,
  capabilities,
  clearReferenceLabel,
  isOptimizing,
  isSubmitting,
  modelGroups,
  durationOptions,
  presetOptions,
  prompt,
  promptPlaceholder,
  referenceHelp,
  referenceImages,
  referenceLabel,
  referenceLimit,
  referenceMode,
  resolutionOptions,
  selectedDuration,
  selectedModel,
  selectedPreset,
  selectedResolution,
  selectedSize,
  submitCount,
  onClearReferences,
  onGenerate,
  onOptimizePrompt,
  onPromptChange,
  onPromptDropAsset,
  onReferenceDropAsset,
  onReferenceDropFiles,
  onReferenceRemove,
  onReferenceRoleChange,
  onReferenceUpload,
  onSelectDuration,
  onSelectResolution,
  onSelectModel,
  onSelectPreset,
  onSelectSize,
}: VideoGenerationPanelProps) {
  const extraControlCount =
    Number(resolutionOptions.length > 0) + Number(durationOptions.length > 0) + Number(presetOptions.length > 0);
  const controlGridClass =
    extraControlCount >= 3
      ? "sm:grid-cols-2 xl:grid-cols-3"
      : extraControlCount === 2
        ? "sm:grid-cols-2"
        : extraControlCount === 1
          ? "sm:grid-cols-3"
          : "sm:grid-cols-2";

  return (
    <div className="flex flex-col gap-3.5 animate-fade-in">
      <div>
<<<<<<< HEAD
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
=======
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--iw-muted)]">
>>>>>>> 610fbc0 (feat(uiux): U-PR3 Typography Unification, Spacing Audit, and State/Label Consistency Across Surfaces (design doc /tmp/grok-design-doc-b94818e8.md plan e62945a8))
            <VideoIcon className="h-3.5 w-3.5 text-violet-300" />
            视频场景运动描述 <span className="hidden text-slate-500 sm:inline">(Video Motion Prompt)</span>
          </label>
          <button
            onClick={onOptimizePrompt}
            disabled={isOptimizing || !prompt.trim()}
            className={`flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${
              isOptimizing || !prompt.trim()
                ? "bg-slate-900/70 text-slate-600 border-slate-800 cursor-not-allowed"
                : "bg-violet-500/12 text-violet-200 border-violet-400/25 hover:bg-violet-500/18 cursor-pointer"
            }`}
          >
            {isOptimizing ? (
              <RefreshCw className="h-3 w-3 animate-spin text-purple-400" />
            ) : (
              <Sparkles className="h-3 w-3 text-violet-300" />
            )}
            <span className="sm:hidden">润色</span>
            <span className="hidden sm:inline">提示词动态润色</span>
          </button>
        </div>

        <div className="imagine-field-shell relative rounded-lg border border-slate-800 bg-slate-950/55 p-3 transition focus-within:border-violet-400/35 focus-within:bg-slate-950/75">
          {atDropdownNode}
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onDragOver={(event) => {
              if (!hasDraggedReferenceAsset(event.dataTransfer)) return;
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={onPromptDropAsset}
            placeholder={promptPlaceholder}
            className="w-full h-24 resize-none border-0 bg-transparent text-sm leading-6 text-slate-100 placeholder-slate-500 outline-0 ring-0 focus:ring-0"
          />
          <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500">
            <span className="hidden sm:inline">拖入资产到此处插入 @图片N | 拖入下方只作为参考图</span>
            <span className="sm:hidden">@ 可引用作品</span>
            <span>{prompt.length} 字符</span>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${controlGridClass}`}>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">视频生成模型</label>
          <select
            value={selectedModel}
            onChange={(event) => onSelectModel(event.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-violet-400/35 focus:outline-none cursor-pointer"
          >
            {modelGroups.map(group => (
              <optgroup key={group.provider} label={group.label}>
                {group.options.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">画面比例</label>
          <select
            value={selectedSize}
            onChange={(event) => onSelectSize(event.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-violet-400/35 focus:outline-none cursor-pointer"
          >
            {capabilities.sizes.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {resolutionOptions.length > 0 && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">分辨率</label>
            <select
              value={selectedResolution}
              onChange={(event) => onSelectResolution(event.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-violet-400/35 focus:outline-none cursor-pointer"
            >
              {resolutionOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}

        {durationOptions.length > 0 && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">秒数</label>
            <select
              value={selectedDuration}
              onChange={(event) => onSelectDuration(event.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-violet-400/35 focus:outline-none cursor-pointer"
            >
              {durationOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}

        {presetOptions.length > 0 && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">Preset</label>
            <select
              value={selectedPreset}
              onChange={(event) => onSelectPreset(event.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-violet-400/35 focus:outline-none cursor-pointer"
            >
              {presetOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <ReferenceImagePicker
        addLabel="添加参考"
        browseClassName="font-medium text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline cursor-pointer"
        clearLabel={clearReferenceLabel}
        emptyHelp={`支持 JPG / PNG / WEBP | 最多 ${referenceLimit} 张 | ${referenceHelp}`}
        emptyLabel={`添加${referenceLabel}`}
        label={`${referenceLabel} ${referenceImages.length > 0 ? `(${Math.min(referenceImages.length, referenceLimit)}/${referenceLimit})` : ""}`}
        maxCount={referenceLimit}
        references={referenceImages}
        roleMode={referenceMode === "firstLast"}
        uploadLabel="浏览上传"
        onClear={onClearReferences}
        onDropAsset={onReferenceDropAsset}
        onDropFiles={onReferenceDropFiles}
        onRemove={onReferenceRemove}
        onRoleChange={onReferenceRoleChange}
        onUpload={onReferenceUpload}
      />

      <button
        onClick={onGenerate}
        disabled={!prompt.trim()}
        className={`imagine-primary-action mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold transition duration-200 ${
          !prompt.trim()
            ? "bg-slate-900/70 text-slate-600 border border-slate-800 cursor-not-allowed"
            : "bg-violet-600 hover:bg-violet-500 text-white active:scale-95 shadow-lg shadow-violet-950/30 cursor-pointer"
        }`}
      >
        {isSubmitting ? (
          <RefreshCw className="h-4 w-4 animate-spin text-white" />
        ) : (
          <VideoIcon className="h-4 w-4 text-white hover:scale-110 transition" />
        )}
        {isSubmitting ? (
          `提交中 (${submitCount})，可继续排队`
        ) : (
          <>
            <span className="sm:hidden">生成视频</span>
            <span className="hidden sm:inline">一键渲染合成动态视频 (Render Video)</span>
          </>
        )}
      </button>
    </div>
  );
}
