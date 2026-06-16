"use client";

import {
  Aperture,
  Camera,
  Check,
  Clapperboard,
  Focus,
  Lightbulb,
  Move3D,
  Palette,
  Settings2,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CINEMATIC_APERTURE_OPTIONS,
  CINEMATIC_CAMERA_OPTIONS,
  CINEMATIC_EFFECT_OPTIONS,
  CINEMATIC_FOCAL_LENGTH_OPTIONS,
  CINEMATIC_LENS_OPTIONS,
  CINEMATIC_LIGHTING_OPTIONS,
  CINEMATIC_MOVEMENT_OPTIONS,
  CINEMATIC_PALETTE_OPTIONS,
  normalizeCinematicProfile,
  type CinematicMediaType,
  type CinematicOption,
  type CinematicProfile,
} from "@/lib/cinematic-controls";

interface CinematicProfileControlsProps {
  accent?: "blue" | "violet";
  className?: string;
  mediaType: CinematicMediaType;
  variant?: "card" | "compact";
  value: CinematicProfile;
  onChange: (value: CinematicProfile) => void;
}

type CinematicField = keyof Omit<CinematicProfile, "enabled">;

interface CinematicSection<T extends string> {
  field: CinematicField;
  icon: ReactNode;
  options: readonly CinematicOption<T>[];
  title: string;
}

interface PreviewTarget {
  field: CinematicField;
  value: string;
}

type CinematicOptionDescriptions = {
  [Field in CinematicField]: Record<CinematicProfile[Field], string>;
};

const optionDescriptions: CinematicOptionDescriptions = {
  camera: {
    auto: "不额外指定拍摄设备，让模型按画面内容自行决定。",
    "arri-alexa-35": "偏现代数字电影机质感，动态范围高，肤色和高光更稳。",
    "arri-alexa-65": "偏大画幅电影感，空间更开阔，主体和背景分离更明显。",
    "sony-venice-2": "偏全画幅数字电影质感，高光过渡柔和，适合写实场景。",
    "red-v-raptor": "偏锐利高解析数字影像，细节和边缘更清晰。",
    "imax-65mm": "强调宏大尺度和清晰细节，适合史诗感、建筑、自然大景。",
    "bolex-16mm": "偏 16mm 胶片手作感，颗粒更明显，纪录片气质更强。",
    "film-35mm": "偏 35mm 胶片质感，颗粒、色彩和高光更有模拟味。",
    mirrorless: "偏现代微单拍摄质感，干净、轻便、数字感较自然。",
    dslr: "偏单反视频/照片混合质感，对比自然，细节清楚。",
    smartphone: "偏手机计算摄影效果，清晰、深景深，生活化更强。",
    drone: "偏无人机航拍视角，强调高机位、开阔空间和稳定运动。",
    "action-camera": "偏运动相机效果，超广角、动感强，适合第一视角或户外场景。",
    camcorder: "偏手持摄像机和纪录片质感，画面更直接、更生活化。",
    "gimbal-rig": "偏稳定器拍摄效果，运动平滑，适合跟拍和移动镜头。",
  },
  palette: {
    auto: "不额外指定色彩风格，保留模型默认色彩判断。",
    "natural-clean": "自然干净的色彩，饱和度和对比都较克制。",
    "warm-film": "暖调胶片色彩，高光更柔，整体更有怀旧感。",
    "bleach-bypass": "低饱和高反差，画面更冷峻、硬朗。",
    "neon-noir": "霓虹夜景风格，深阴影和高饱和色光更明显。",
    "teal-orange": "青橙电影调色，冷暖对比强，商业片感更明显。",
    "pastel-air": "低对比柔和粉彩，画面更轻盈、通透。",
    monochrome: "黑白影像风格，主要依赖明暗和轮廓表达情绪。",
    "muted-earth": "低饱和大地色，适合自然、复古、户外或生活方式场景。",
    cyberpunk: "高饱和赛博色彩，偏洋红、青蓝和夜景灯光。",
    "cross-process": "交叉冲洗胶片感，色相偏移更明显，风格化更强。",
  },
  lighting: {
    auto: "不额外指定光线，让模型按场景自动处理。",
    "soft-window": "柔和窗光，阴影过渡自然，适合人物和室内写实。",
    "overhead-fall": "顶部光源向下衰减，氛围更戏剧化。",
    "contre-jour": "逆光和轮廓光更强，主体边缘更亮，背景更有层次。",
    "low-key": "低调照明，阴影面积大，适合悬疑、冷峻或高级感画面。",
    "golden-hour": "黄金时刻暖光，低角度阳光和长阴影更明显。",
    "practical-lamps": "强调画面中可见灯具带来的实际光源，生活感更强。",
    "volumetric-rays": "空气中可见光束和雾化层次更明显。",
    "neon-edge": "彩色霓虹边缘光，主体轮廓更突出。",
    "moonlight-blue": "冷蓝月光氛围，适合夜景和安静情绪。",
    "harsh-flash": "直闪硬光，阴影锐利，画面更直接、更粗粝。",
  },
  lens: {
    auto: "不额外指定镜头特性，让模型按构图自动处理。",
    "zeiss-master-prime": "偏高解析、低炫光、干净锐利的电影镜头效果。",
    "cooke-s4": "偏温暖柔和的 Cooke 风格，肤色和高光更圆润。",
    "panavision-c-series": "偏经典变形镜头质感，椭圆焦外和电影感更强。",
    anamorphic: "变形宽银幕镜头感，横向光晕和焦外更有电影味。",
    macro: "微距细节，浅景深更明显，适合产品、材质和局部特写。",
    "vintage-haze": "老镜头雾化感，高光更散，画面更柔。",
    "canon-k35": "复古电影镜头暖调，反差较柔，人物更有年代感。",
    "leica-summilux-c": "高端电影镜头质感，清晰但不过硬，焦外顺滑。",
    "helios-44": "复古旋焦效果，背景焦外更旋转、更风格化。",
    fisheye: "鱼眼超广角畸变，空间夸张，适合特殊视角。",
    "telephoto-zoom": "长焦压缩空间，主体更突出，背景更贴近。",
  },
  focalLength: {
    auto: "不额外指定焦段，让模型按画面内容自动选择。",
    "12mm": "超广角视角，空间夸张，适合大场景和近距离冲击感。",
    "24mm": "广角电影视角，环境信息多，适合建立场景。",
    "35mm": "自然叙事视角，环境和人物比例较平衡。",
    "50mm": "标准人像视角，主体自然，畸变较少。",
    "75mm": "中长焦压缩，人物更突出，背景更柔。",
    "100mm": "长焦压缩更强，适合远距离、局部和安静观察感。",
  },
  aperture: {
    auto: "不额外指定光圈和景深。",
    "f1.2": "极浅景深，背景大幅虚化，主体分离最强。",
    "f1.4": "浅景深明显，适合人像、夜景和柔和焦外。",
    f2: "浅景深但仍保留部分环境信息。",
    "f2.8": "电影常用浅景深，主体清楚，背景适度虚化。",
    f4: "中等景深，主体和部分背景都可读。",
    "f5.6": "平衡景深，环境信息更完整。",
    f8: "深景深，前后景都更清楚。",
    f11: "更深景深，适合环境、建筑和群像。",
    f16: "很深景深，画面整体更清晰。",
    f22: "最大深景深倾向，前景和背景都尽量清楚。",
  },
  movement: {
    auto: "不额外指定运动方式，让模型按视频内容自动处理。",
    "locked-off": "固定机位，画面稳定，适合观察感和构图展示。",
    "slow-dolly": "缓慢推轨或拉轨，空间层次和情绪推进更明显。",
    steadicam: "平滑跟拍，适合人物行走和连续运动。",
    handheld: "轻微手持晃动，现场感和纪录感更强。",
    orbit: "围绕主体环绕移动，强调空间和主体轮廓。",
    crane: "升降镜头，适合揭示场景规模或制造开阔感。",
  },
  effect: {
    auto: "不额外指定后期效果。",
    "film-grain": "增加细腻胶片颗粒，让画面更有模拟质感。",
    halation: "高光边缘出现暖色晕染，胶片感更强。",
    bloom: "高光柔化扩散，画面更梦幻、更柔和。",
    vignette: "边缘轻微压暗，把注意力集中到画面中心。",
    "chromatic-aberration": "边缘轻微色散，增加镜头瑕疵和风格化质感。",
    "motion-blur": "方向性动态模糊，强化速度和运动感。",
    "lens-flare": "真实镜头眩光，适合强侧光和逆光画面。",
    "anamorphic-widescreen": "2.39:1 宽银幕感，横向光晕和变形镜头气质更明显。",
  },
};

const accentClassNames: Record<NonNullable<CinematicProfileControlsProps["accent"]>, {
  active: string;
  button: string;
  nav: string;
  ring: string;
}> = {
  blue: {
    active: "data-[active=true]:border-blue-400/60 data-[active=true]:bg-blue-500/10",
    button: "border-blue-400/40 bg-blue-500/15 text-blue-100 hover:bg-blue-500/25",
    nav: "data-[selected=true]:border-blue-400/70 data-[selected=true]:bg-blue-500/10",
    ring: "data-[selected=true]:border-blue-400 data-[selected=true]:shadow-[0_0_0_1px_rgba(96,165,250,0.45)]",
  },
  violet: {
    active: "data-[active=true]:border-violet-400/60 data-[active=true]:bg-violet-500/10",
    button: "border-violet-400/40 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25",
    nav: "data-[selected=true]:border-violet-400/70 data-[selected=true]:bg-violet-500/10",
    ring: "data-[selected=true]:border-violet-400 data-[selected=true]:shadow-[0_0_0_1px_rgba(167,139,250,0.45)]",
  },
};

function optionLabel<T extends string>(options: readonly CinematicOption<T>[], value: string): string {
  return options.find(option => option.value === value)?.label ?? "Auto";
}

function optionVisual<T extends string>(options: readonly CinematicOption<T>[], value: string): string {
  return options.find(option => option.value === value)?.visual ?? options[0]?.visual ?? "";
}

function optionVisualStyle(visual: string): CSSProperties {
  return visual ? { backgroundImage: `url(${visual})` } : {};
}

function optionDescription(field: CinematicField, value: string): string {
  const description = (optionDescriptions[field] as Record<string, string>)[value];
  if (!description) throw new Error(`Missing cinematic option description: ${field}:${value}`);
  return description;
}

function OptionGrid<T extends string>({
  accent,
  disabled,
  field,
  icon,
  options,
  value,
  onPreview,
  onSelect,
}: {
  accent: NonNullable<CinematicProfileControlsProps["accent"]>;
  disabled: boolean;
  field: CinematicField;
  icon: ReactNode;
  options: readonly CinematicOption<T>[];
  value: string;
  onPreview: (target: PreviewTarget | null) => void;
  onSelect: (field: CinematicField, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-disabled={disabled}
            data-disabled={disabled}
            data-selected={selected}
            onBlur={() => {
              if (!disabled) onPreview(null);
            }}
            onClick={() => {
              if (!disabled) onSelect(field, option.value);
            }}
            onFocus={() => {
              if (!disabled) onPreview({ field, value: option.value });
            }}
            onMouseEnter={() => {
              if (!disabled) onPreview({ field, value: option.value });
            }}
            onMouseLeave={() => {
              if (!disabled) onPreview(null);
            }}
            className={`group min-w-0 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-left transition data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-55 ${disabled ? "" : "hover:border-[var(--iw-border-strong)]"} ${accentClassNames[accent].ring}`}
          >
            <span
              className="relative mb-2 flex aspect-video overflow-hidden rounded-md border border-white/10 bg-[var(--iw-panel)] bg-cover bg-center"
              style={optionVisualStyle(option.visual)}
            >
              <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/35 text-white shadow-sm">
                {icon}
              </span>
              {selected && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-950 shadow-sm">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </span>
            <span className="block truncate text-[11px] font-semibold text-[var(--iw-text)]">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function selectedSectionOption<T extends string>(section: CinematicSection<T>, value: string): CinematicOption<T> {
  return section.options.find(option => option.value === value) ?? section.options[0];
}

export default function CinematicProfileControls({
  accent = "blue",
  className = "",
  mediaType,
  onChange,
  variant = "card",
  value,
}: CinematicProfileControlsProps) {
  const titleId = useId();
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeField, setActiveField] = useState<CinematicField>("camera");
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const isEnabled = value.enabled;
  const sections = useMemo<Array<CinematicSection<string>>>(() => [
    { field: "camera", icon: <Video className="h-3.5 w-3.5" />, options: CINEMATIC_CAMERA_OPTIONS, title: "摄影机" },
    { field: "lens", icon: <Camera className="h-3.5 w-3.5" />, options: CINEMATIC_LENS_OPTIONS, title: "镜头组" },
    { field: "focalLength", icon: <Focus className="h-3.5 w-3.5" />, options: CINEMATIC_FOCAL_LENGTH_OPTIONS, title: "焦段" },
    { field: "aperture", icon: <Aperture className="h-3.5 w-3.5" />, options: CINEMATIC_APERTURE_OPTIONS, title: "光圈" },
    { field: "palette", icon: <Palette className="h-3.5 w-3.5" />, options: CINEMATIC_PALETTE_OPTIONS, title: "色彩" },
    { field: "lighting", icon: <Lightbulb className="h-3.5 w-3.5" />, options: CINEMATIC_LIGHTING_OPTIONS, title: "光线" },
    { field: "effect", icon: <Sparkles className="h-3.5 w-3.5" />, options: CINEMATIC_EFFECT_OPTIONS, title: "效果" },
    ...(mediaType === "video"
      ? [{ field: "movement" as const, icon: <Move3D className="h-3.5 w-3.5" />, options: CINEMATIC_MOVEMENT_OPTIONS, title: "运动" }]
      : []),
  ], [mediaType]);
  const summaryItems = sections.slice(0, mediaType === "video" ? 4 : 3);
  const summaryGridClassName = mediaType === "video" ? "grid-cols-4" : "grid-cols-3";
  const activeSection = sections.find(section => section.field === activeField) ?? sections[0];
  const activeValue = String(value[activeSection.field] ?? "");
  const previewSection = previewTarget
    ? sections.find(section => section.field === previewTarget.field) ?? activeSection
    : activeSection;
  const previewValue = previewTarget?.value ?? activeValue;
  const previewOption = selectedSectionOption(previewSection, previewValue);
  const previewDescription = optionDescription(previewSection.field, previewOption.value);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!sections.some(section => section.field === activeField)) {
      setActiveField(sections[0].field);
      setPreviewTarget(null);
    }
  }, [activeField, sections]);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const getFocusableElements = () =>
      dialogRef.current
        ? Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
        window.requestAnimationFrame(() => openButtonRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const updateProfile = (patch: Partial<CinematicProfile>): void => {
    onChange(normalizeCinematicProfile({ ...value, ...patch }));
  };
  const selectOption = (field: CinematicField, optionValue: string): void => {
    onChange(normalizeCinematicProfile({ ...value, [field]: optionValue }));
  };
  const closeDialog = (): void => {
    setIsOpen(false);
    window.requestAnimationFrame(() => openButtonRef.current?.focus());
  };
  const compactLabel = isEnabled ? "开启" : "关闭";
  const dialog = isOpen ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md"
      onClick={closeDialog}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel)] shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--iw-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]">
              <Clapperboard className="h-4 w-4" />
            </span>
            <h2 id={titleId} className="truncate text-sm font-semibold text-[var(--iw-text)]">影像风格</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-pressed={isEnabled}
              onClick={() => updateProfile({ enabled: !isEnabled })}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                isEnabled
                  ? "border-blue-400/45 bg-blue-500/15 text-blue-100 hover:bg-blue-500/25"
                  : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]"
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              {isEnabled ? "已开启" : "开启"}
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDialog}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]"
              aria-label="关闭影像风格"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[var(--iw-border)] p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sections.map(section => {
                const sectionValue = String(value[section.field]);
                const sectionOption = selectedSectionOption(section, sectionValue);
                const active = section.field === activeField;
                return (
                  <button
                    key={section.field}
                    type="button"
                    data-selected={active}
                    onClick={() => {
                      setActiveField(section.field);
                      setPreviewTarget(null);
                    }}
                    className={`flex min-w-32 shrink-0 items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-left transition hover:border-[var(--iw-border-strong)] sm:min-w-36 ${accentClassNames[accent].nav}`}
                  >
                    <span
                      className="h-8 w-11 shrink-0 rounded-md border border-white/10 bg-[var(--iw-panel)] bg-cover bg-center"
                      style={optionVisualStyle(sectionOption.visual)}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--iw-muted)]">
                        {section.icon}
                        {section.title}
                      </span>
                      <span className="block truncate text-[11px] font-semibold text-[var(--iw-text)]">{sectionOption.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <section className="overflow-hidden rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]/70 lg:self-start">
              <div
                className="relative aspect-video min-h-44 bg-[var(--iw-panel)] bg-cover bg-center sm:min-h-56"
                style={optionVisualStyle(previewOption.visual)}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-white/80">
                      {previewSection.icon}
                      {previewSection.title}
                    </div>
                    <div className="truncate text-base font-semibold text-white">{previewOption.label}</div>
                  </div>
                  <span className="shrink-0 rounded-md border border-white/15 bg-black/35 px-2 py-1 text-[10px] font-semibold text-white/80">
                    示意图
                  </span>
                </div>
              </div>
              <div className="border-t border-[var(--iw-border)] p-3">
                <div className="mb-1 text-[10px] font-semibold text-[var(--iw-muted)]">效果说明</div>
                <p className="text-xs leading-5 text-[var(--iw-text)]">{previewDescription}</p>
              </div>
            </section>

            <section className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]/70 p-3">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
                {activeSection.icon}
                {activeSection.title}
              </h3>
              <OptionGrid
                accent={accent}
                disabled={!isEnabled}
                field={activeSection.field}
                icon={activeSection.icon}
                options={activeSection.options}
                value={activeValue}
                onPreview={setPreviewTarget}
                onSelect={selectOption}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {variant === "compact" ? (
        <button
          ref={openButtonRef}
          type="button"
          data-active={isEnabled}
          onClick={() => setIsOpen(true)}
          className={`flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 text-left text-[10px] font-semibold text-[var(--iw-muted)] transition hover:border-[var(--iw-border-strong)] hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)] ${accentClassNames[accent].active} ${className}`}
          title="影像风格"
        >
          <Clapperboard className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">摄影风格 · {compactLabel}</span>
        </button>
      ) : (
        <div
          data-active={isEnabled}
          className={`rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]/80 p-3 transition ${accentClassNames[accent].active} ${className}`}
        >
          <button
            type="button"
            aria-pressed={isEnabled}
            onClick={() => updateProfile({ enabled: !isEnabled })}
            className="mb-3 flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2.5 py-2 text-left transition hover:border-[var(--iw-border-strong)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-muted)]">
                <Clapperboard className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--iw-text)]">摄影风格</span>
                <span className="block truncate text-[10px] text-[var(--iw-faint)]">
                  {isEnabled ? "已启用镜头语言注入" : "关闭时不改写生成请求"}
                </span>
              </span>
            </span>
            <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${
              isEnabled
                ? "border-blue-400/45 bg-blue-500/15 text-blue-100"
                : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
            }`}>
              {isEnabled ? "已开启" : "点按开启"}
            </span>
          </button>

          <button
            ref={openButtonRef}
            type="button"
            onClick={() => setIsOpen(true)}
            className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${accentClassNames[accent].button}`}
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            <span className={`grid min-w-0 flex-1 gap-1.5 ${summaryGridClassName}`}>
              {summaryItems.map(section => (
                <span key={section.field} className="flex min-w-0 items-center gap-1.5 rounded-md border border-white/10 bg-black/20 p-1">
                  <span
                    className="h-5 w-5 shrink-0 rounded bg-[var(--iw-panel)] bg-cover bg-center"
                    style={optionVisualStyle(optionVisual(section.options, String(value[section.field])))}
                  />
                  <span className="truncate text-[10px] font-semibold">{optionLabel(section.options, String(value[section.field]))}</span>
                </span>
              ))}
            </span>
          </button>
        </div>
      )}

      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
