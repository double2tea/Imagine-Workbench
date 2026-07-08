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
import { useTranslations } from "@/lib/i18n";
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
  accent?: "blue" | "violet" | "neutral";
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

function buildOptionDescriptions(t: (key: string) => string): CinematicOptionDescriptions {
  return {
    camera: {
      auto: t("cinematic.descriptions.camera.auto"),
      "arri-alexa-35": t("cinematic.descriptions.camera.arri-alexa-35"),
      "arri-alexa-65": t("cinematic.descriptions.camera.arri-alexa-65"),
      "sony-venice-2": t("cinematic.descriptions.camera.sony-venice-2"),
      "red-v-raptor": t("cinematic.descriptions.camera.red-v-raptor"),
      "imax-65mm": t("cinematic.descriptions.camera.imax-65mm"),
      "bolex-16mm": t("cinematic.descriptions.camera.bolex-16mm"),
      "film-35mm": t("cinematic.descriptions.camera.film-35mm"),
      mirrorless: t("cinematic.descriptions.camera.mirrorless"),
      dslr: t("cinematic.descriptions.camera.dslr"),
      smartphone: t("cinematic.descriptions.camera.smartphone"),
      drone: t("cinematic.descriptions.camera.drone"),
      "action-camera": t("cinematic.descriptions.camera.action-camera"),
      camcorder: t("cinematic.descriptions.camera.camcorder"),
      "gimbal-rig": t("cinematic.descriptions.camera.gimbal-rig"),
    },
    palette: {
      auto: t("cinematic.descriptions.palette.auto"),
      "natural-clean": t("cinematic.descriptions.palette.natural-clean"),
      "warm-film": t("cinematic.descriptions.palette.warm-film"),
      "bleach-bypass": t("cinematic.descriptions.palette.bleach-bypass"),
      "neon-noir": t("cinematic.descriptions.palette.neon-noir"),
      "teal-orange": t("cinematic.descriptions.palette.teal-orange"),
      "pastel-air": t("cinematic.descriptions.palette.pastel-air"),
      monochrome: t("cinematic.descriptions.palette.monochrome"),
      "muted-earth": t("cinematic.descriptions.palette.muted-earth"),
      cyberpunk: t("cinematic.descriptions.palette.cyberpunk"),
      "cross-process": t("cinematic.descriptions.palette.cross-process"),
    },
    lighting: {
      auto: t("cinematic.descriptions.lighting.auto"),
      "soft-window": t("cinematic.descriptions.lighting.soft-window"),
      "overhead-fall": t("cinematic.descriptions.lighting.overhead-fall"),
      "contre-jour": t("cinematic.descriptions.lighting.contre-jour"),
      "low-key": t("cinematic.descriptions.lighting.low-key"),
      "golden-hour": t("cinematic.descriptions.lighting.golden-hour"),
      "practical-lamps": t("cinematic.descriptions.lighting.practical-lamps"),
      "volumetric-rays": t("cinematic.descriptions.lighting.volumetric-rays"),
      "neon-edge": t("cinematic.descriptions.lighting.neon-edge"),
      "moonlight-blue": t("cinematic.descriptions.lighting.moonlight-blue"),
      "harsh-flash": t("cinematic.descriptions.lighting.harsh-flash"),
    },
    lens: {
      auto: t("cinematic.descriptions.lens.auto"),
      "zeiss-master-prime": t("cinematic.descriptions.lens.zeiss-master-prime"),
      "cooke-s4": t("cinematic.descriptions.lens.cooke-s4"),
      "panavision-c-series": t("cinematic.descriptions.lens.panavision-c-series"),
      anamorphic: t("cinematic.descriptions.lens.anamorphic"),
      macro: t("cinematic.descriptions.lens.macro"),
      "vintage-haze": t("cinematic.descriptions.lens.vintage-haze"),
      "canon-k35": t("cinematic.descriptions.lens.canon-k35"),
      "leica-summilux-c": t("cinematic.descriptions.lens.leica-summilux-c"),
      "helios-44": t("cinematic.descriptions.lens.helios-44"),
      fisheye: t("cinematic.descriptions.lens.fisheye"),
      "telephoto-zoom": t("cinematic.descriptions.lens.telephoto-zoom"),
    },
    focalLength: {
      auto: t("cinematic.descriptions.focalLength.auto"),
      "12mm": t("cinematic.descriptions.focalLength.12mm"),
      "24mm": t("cinematic.descriptions.focalLength.24mm"),
      "35mm": t("cinematic.descriptions.focalLength.35mm"),
      "50mm": t("cinematic.descriptions.focalLength.50mm"),
      "75mm": t("cinematic.descriptions.focalLength.75mm"),
      "100mm": t("cinematic.descriptions.focalLength.100mm"),
    },
    aperture: {
      auto: t("cinematic.descriptions.aperture.auto"),
      "f1.2": t("cinematic.descriptions.aperture.f1.2"),
      "f1.4": t("cinematic.descriptions.aperture.f1.4"),
      f2: t("cinematic.descriptions.aperture.f2"),
      "f2.8": t("cinematic.descriptions.aperture.f2.8"),
      f4: t("cinematic.descriptions.aperture.f4"),
      "f5.6": t("cinematic.descriptions.aperture.f5.6"),
      f8: t("cinematic.descriptions.aperture.f8"),
      f11: t("cinematic.descriptions.aperture.f11"),
      f16: t("cinematic.descriptions.aperture.f16"),
      f22: t("cinematic.descriptions.aperture.f22"),
    },
    movement: {
      auto: t("cinematic.descriptions.movement.auto"),
      "locked-off": t("cinematic.descriptions.movement.locked-off"),
      "slow-dolly": t("cinematic.descriptions.movement.slow-dolly"),
      steadicam: t("cinematic.descriptions.movement.steadicam"),
      handheld: t("cinematic.descriptions.movement.handheld"),
      orbit: t("cinematic.descriptions.movement.orbit"),
      crane: t("cinematic.descriptions.movement.crane"),
    },
    effect: {
      auto: t("cinematic.descriptions.effect.auto"),
      "film-grain": t("cinematic.descriptions.effect.film-grain"),
      halation: t("cinematic.descriptions.effect.halation"),
      bloom: t("cinematic.descriptions.effect.bloom"),
      vignette: t("cinematic.descriptions.effect.vignette"),
      "chromatic-aberration": t("cinematic.descriptions.effect.chromatic-aberration"),
      "motion-blur": t("cinematic.descriptions.effect.motion-blur"),
      "lens-flare": t("cinematic.descriptions.effect.lens-flare"),
      "anamorphic-widescreen": t("cinematic.descriptions.effect.anamorphic-widescreen"),
    },
  };
}

const accentClassNames: Record<NonNullable<CinematicProfileControlsProps["accent"]>, {
  active: string;
  badge: string;
  button: string;
  nav: string;
  ring: string;
}> = {
  blue: {
    active: "data-[active=true]:border-[var(--iw-tone-accent-border)] data-[active=true]:bg-[var(--iw-tone-accent-bg)]",
    badge: "border-[var(--iw-tone-accent-border)] bg-[var(--iw-tone-accent-bg)] text-[var(--iw-tone-accent-text)]",
    button: "border-[var(--iw-tone-accent-border)] bg-[var(--iw-tone-accent-bg)] text-[var(--iw-tone-accent-text)] hover:border-[var(--iw-accent)] hover:bg-[var(--iw-accent-soft)]",
    nav: "data-[selected=true]:border-[var(--iw-tone-accent-border)] data-[selected=true]:bg-[var(--iw-tone-accent-bg)]",
    ring: "data-[selected=true]:border-[var(--iw-accent)] data-[selected=true]:shadow-[0_0_0_1px_var(--iw-accent-glow)]",
  },
  violet: {
    active: "data-[active=true]:border-[var(--iw-tone-violet-border)] data-[active=true]:bg-[var(--iw-tone-violet-bg)]",
    badge: "border-[var(--iw-tone-violet-border)] bg-[var(--iw-tone-violet-bg)] text-[var(--iw-tone-violet-text)]",
    button: "border-[var(--iw-tone-violet-border)] bg-[var(--iw-tone-violet-bg)] text-[var(--iw-tone-violet-text)] hover:border-[var(--iw-tone-violet-text)] hover:bg-[var(--iw-tone-violet-bg)]",
    nav: "data-[selected=true]:border-[var(--iw-tone-violet-border)] data-[selected=true]:bg-[var(--iw-tone-violet-bg)]",
    ring: "data-[selected=true]:border-[var(--iw-tone-violet-border)] data-[selected=true]:shadow-[0_0_0_1px_var(--iw-tone-violet-border)]",
  },
  neutral: {
    active: "data-[active=true]:border-[var(--iw-border)] data-[active=true]:bg-[var(--iw-panel)]",
    badge: "border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-text)]",
    button: "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-text)] hover:border-[var(--iw-border)] hover:bg-[var(--iw-panel)]",
    nav: "data-[selected=true]:border-[var(--iw-border)] data-[selected=true]:bg-[var(--iw-panel)]",
    ring: "data-[selected=true]:border-[var(--iw-border)] data-[selected=true]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--iw-text)_8%,transparent)]",
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

function optionDescription(t: (key: string) => string, field: CinematicField, value: string): string {
  const descriptions = buildOptionDescriptions(t);
  const description = (descriptions[field] as Record<string, string>)[value];
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
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[var(--iw-bg)]">
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
  accent = "neutral",
  className = "",
  mediaType,
  onChange,
  variant = "card",
  value,
}: CinematicProfileControlsProps) {
  const { t } = useTranslations("creation");
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
    { field: "camera", icon: <Video className="h-3.5 w-3.5" />, options: CINEMATIC_CAMERA_OPTIONS, title: t("cinematic.sectionTitles.camera") },
    { field: "lens", icon: <Camera className="h-3.5 w-3.5" />, options: CINEMATIC_LENS_OPTIONS, title: t("cinematic.sectionTitles.lens") },
    { field: "focalLength", icon: <Focus className="h-3.5 w-3.5" />, options: CINEMATIC_FOCAL_LENGTH_OPTIONS, title: t("cinematic.sectionTitles.focalLength") },
    { field: "aperture", icon: <Aperture className="h-3.5 w-3.5" />, options: CINEMATIC_APERTURE_OPTIONS, title: t("cinematic.sectionTitles.aperture") },
    { field: "palette", icon: <Palette className="h-3.5 w-3.5" />, options: CINEMATIC_PALETTE_OPTIONS, title: t("cinematic.sectionTitles.palette") },
    { field: "lighting", icon: <Lightbulb className="h-3.5 w-3.5" />, options: CINEMATIC_LIGHTING_OPTIONS, title: t("cinematic.sectionTitles.lighting") },
    { field: "effect", icon: <Sparkles className="h-3.5 w-3.5" />, options: CINEMATIC_EFFECT_OPTIONS, title: t("cinematic.sectionTitles.effect") },
    ...(mediaType === "video"
      ? [{ field: "movement" as const, icon: <Move3D className="h-3.5 w-3.5" />, options: CINEMATIC_MOVEMENT_OPTIONS, title: t("cinematic.sectionTitles.movement") }]
      : []),
  ], [mediaType, t]);
  const summaryItems = sections.slice(0, mediaType === "video" ? 4 : 3);
  const summaryGridClassName = mediaType === "video" ? "grid-cols-4" : "grid-cols-3";
  const activeSection = sections.find(section => section.field === activeField) ?? sections[0];
  const activeValue = String(value[activeSection.field] ?? "");
  const previewSection = previewTarget
    ? sections.find(section => section.field === previewTarget.field) ?? activeSection
    : activeSection;
  const previewValue = previewTarget?.value ?? activeValue;
  const previewOption = selectedSectionOption(previewSection, previewValue);
  const previewDescription = optionDescription(t, previewSection.field, previewOption.value);

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
  const compactLabel = isEnabled ? t("cinematic.compactLabelOn") : t("cinematic.compactLabelOff");
  const sectionRailGridClassName = mediaType === "video" ? "xl:grid-cols-8" : "xl:grid-cols-7";
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
        className="flex h-[82vh] max-h-[740px] w-[96vw] max-w-[1440px] flex-col overflow-hidden rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel)] shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--iw-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]">
              <Clapperboard className="h-4 w-4" />
            </span>
            <h2 id={titleId} className="truncate text-sm font-semibold text-[var(--iw-text)]">{t("cinematic.dialogTitle")}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-pressed={isEnabled}
              onClick={() => updateProfile({ enabled: !isEnabled })}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                isEnabled
                  ? accentClassNames[accent].button
                  : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]"
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              {isEnabled ? t("cinematic.cardBadgeEnabled") : t("cinematic.cardBadgeDisabled")}
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDialog}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]"
              aria-label={t("cinematic.closeDialogAriaLabel")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[var(--iw-border)] p-3">
            <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${sectionRailGridClassName}`}>
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
                    className={`flex min-w-0 items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-left transition hover:border-[var(--iw-border-strong)] ${accentClassNames[accent].nav}`}
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
                    {t("cinematic.previewDiagramLabel")}
                  </span>
                </div>
              </div>
              <div className="border-t border-[var(--iw-border)] p-3">
                <div className="mb-1 text-[10px] font-semibold text-[var(--iw-muted)]">{t("cinematic.effectDescriptionLabel")}</div>
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
          title={t("cinematic.cardTitle")}
        >
          <Clapperboard className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{t("cinematic.compactToggleLabel")} · {compactLabel}</span>
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
                <span className="block truncate text-xs font-semibold text-[var(--iw-text)]">{t("cinematic.cardTitle")}</span>
                <span className="block truncate text-[10px] text-[var(--iw-faint)]">
                  {isEnabled ? t("cinematic.cardEnabledHint") : t("cinematic.cardDisabledHint")}
                </span>
              </span>
            </span>
            <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${
              isEnabled
                ? accentClassNames[accent].badge
                : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
            }`}>
              {isEnabled ? t("cinematic.enabledBadge") : t("cinematic.disabledBadge")}
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
