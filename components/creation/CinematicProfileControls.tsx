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
            onBlur={() => onPreview(null)}
            onClick={() => {
              if (!disabled) onSelect(field, option.value);
            }}
            onFocus={() => onPreview({ field, value: option.value })}
            onMouseEnter={() => onPreview({ field, value: option.value })}
            onMouseLeave={() => onPreview(null)}
            className={`group min-w-0 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-left transition hover:border-[var(--iw-border-strong)] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-55 ${accentClassNames[accent].ring}`}
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
  const activeValue = String(value[activeSection.field]);
  const previewSection = previewTarget
    ? sections.find(section => section.field === previewTarget.field) ?? activeSection
    : activeSection;
  const previewValue = previewTarget?.value ?? activeValue;
  const previewOption = selectedSectionOption(previewSection, previewValue);

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
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
        window.requestAnimationFrame(() => openButtonRef.current?.focus());
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

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-1">
          <div className="border-b border-[var(--iw-border)] p-3 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
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
                    className={`flex min-w-0 items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-left transition hover:border-[var(--iw-border-strong)] ${accentClassNames[accent].nav}`}
                  >
                    <span
                      className="h-9 w-12 shrink-0 rounded-md border border-white/10 bg-[var(--iw-panel)] bg-cover bg-center"
                      style={optionVisualStyle(sectionOption.visual)}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--iw-text)]">
                        {section.icon}
                        {section.title}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--iw-muted)]">{sectionOption.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-4">
            <section className="mb-4 overflow-hidden rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]/70">
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
