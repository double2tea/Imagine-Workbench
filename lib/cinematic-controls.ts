export type CinematicCamera = "auto" | "arri-alexa-35" | "arri-alexa-65" | "sony-venice-2" | "red-v-raptor" | "imax-65mm" | "bolex-16mm" | "film-35mm" | "mirrorless" | "dslr" | "smartphone";
export type CinematicPalette = "auto" | "natural-clean" | "warm-film" | "bleach-bypass" | "neon-noir";
export type CinematicLighting = "auto" | "soft-window" | "overhead-fall" | "contre-jour" | "low-key";
export type CinematicLens = "auto" | "zeiss-master-prime" | "cooke-s4" | "panavision-c-series" | "anamorphic" | "macro" | "vintage-haze" | "canon-k35" | "leica-summilux-c" | "helios-44" | "fisheye" | "telephoto-zoom";
export type CinematicFocalLength = "auto" | "12mm" | "24mm" | "35mm" | "50mm" | "75mm" | "100mm";
export type CinematicAperture = "auto" | "f1.2" | "f1.4" | "f2" | "f2.8" | "f4" | "f5.6" | "f8" | "f11" | "f16" | "f22";
export type CinematicMovement = "auto" | "locked-off" | "slow-dolly" | "steadicam" | "handheld" | "orbit" | "crane";
export type CinematicEffect = "auto" | "film-grain" | "halation" | "bloom" | "vignette" | "chromatic-aberration" | "motion-blur" | "lens-flare";
export type CinematicControlKind = "camera" | "palette" | "lighting" | "lens" | "focalLength" | "aperture" | "movement" | "effect";
export type CinematicMediaType = "image" | "video";

export interface CinematicOption<T extends string> {
  label: string;
  prompt: string;
  visual: string;
  value: T;
}

export interface CinematicProfile {
  enabled: boolean;
  camera: CinematicCamera;
  palette: CinematicPalette;
  lighting: CinematicLighting;
  lens: CinematicLens;
  focalLength: CinematicFocalLength;
  aperture: CinematicAperture;
  movement: CinematicMovement;
  effect: CinematicEffect;
}

export const DEFAULT_CINEMATIC_PROFILE: CinematicProfile = {
  enabled: false,
  camera: "auto",
  palette: "auto",
  lighting: "auto",
  lens: "auto",
  focalLength: "auto",
  aperture: "auto",
  movement: "auto",
  effect: "auto",
};

const CINEMATIC_PROFILE_FIELDS = Object.keys(DEFAULT_CINEMATIC_PROFILE) as Array<keyof CinematicProfile>;
const CINEMATIC_PREVIEW_ROOT = "/cinematic-controls";

function previewImage(name: string): string {
  return `${CINEMATIC_PREVIEW_ROOT}/${name}.jpg`;
}

export const CINEMATIC_CAMERA_OPTIONS: readonly CinematicOption<CinematicCamera>[] = [
  { value: "auto", label: "Auto", prompt: "", visual: previewImage("camera-auto") },
  { value: "arri-alexa-35", label: "ARRI Alexa 35", prompt: "ARRI Alexa 35 digital cinema camera color science and high dynamic range", visual: previewImage("camera-arri-alexa-35") },
  { value: "arri-alexa-65", label: "ARRI Alexa 65", prompt: "large-format ARRI Alexa 65 look with expansive cinematic depth", visual: previewImage("camera-arri-alexa-65") },
  { value: "sony-venice-2", label: "Sony Venice 2", prompt: "Sony Venice 2 full-frame cinema camera look with smooth highlight rolloff", visual: previewImage("camera-sony-venice-2") },
  { value: "red-v-raptor", label: "RED V-Raptor", prompt: "RED V-Raptor style crisp high-resolution cinema image", visual: previewImage("camera-red-v-raptor") },
  { value: "imax-65mm", label: "IMAX 65mm", prompt: "IMAX 65mm film camera grandeur with monumental scale and clean detail", visual: previewImage("camera-imax-65mm") },
  { value: "bolex-16mm", label: "Bolex 16mm", prompt: "Bolex 16mm film texture with organic grain and handmade documentary feeling", visual: previewImage("camera-bolex-16mm") },
  { value: "film-35mm", label: "35mm Film", prompt: "35mm motion picture film camera look with analog grain and soft highlight rolloff", visual: previewImage("camera-film-35mm") },
  { value: "mirrorless", label: "Mirrorless", prompt: "modern full-frame mirrorless camera look with clean compact digital sharpness", visual: previewImage("camera-mirrorless") },
  { value: "dslr", label: "DSLR", prompt: "DSLR photo-video hybrid look with crisp detail and natural contrast", visual: previewImage("camera-dslr") },
  { value: "smartphone", label: "Smartphone", prompt: "modern smartphone camera look with computational clarity and deep focus", visual: previewImage("camera-smartphone") },
];

export const CINEMATIC_PALETTE_OPTIONS: readonly CinematicOption<CinematicPalette>[] = [
  { value: "auto", label: "Auto", prompt: "", visual: previewImage("palette-auto") },
  { value: "natural-clean", label: "Natural Clean", prompt: "natural clean color palette", visual: previewImage("palette-natural-clean") },
  { value: "warm-film", label: "Warm Film", prompt: "warm film color with gentle halation", visual: previewImage("palette-warm-film") },
  { value: "bleach-bypass", label: "Bleach Bypass", prompt: "bleach bypass contrast with restrained saturation", visual: previewImage("palette-bleach-bypass") },
  { value: "neon-noir", label: "Neon Noir", prompt: "neon noir color contrast with deep shadows", visual: previewImage("palette-neon-noir") },
];

export const CINEMATIC_LIGHTING_OPTIONS: readonly CinematicOption<CinematicLighting>[] = [
  { value: "auto", label: "Auto", prompt: "", visual: previewImage("lighting-auto") },
  { value: "soft-window", label: "Soft Window", prompt: "soft window key light", visual: previewImage("lighting-soft-window") },
  { value: "overhead-fall", label: "Overhead Fall", prompt: "overhead light with dramatic falloff", visual: previewImage("lighting-overhead-fall") },
  { value: "contre-jour", label: "Contre Jour", prompt: "contre-jour backlight and rim highlights", visual: previewImage("lighting-contre-jour") },
  { value: "low-key", label: "Low Key", prompt: "low-key lighting with shaped shadows", visual: previewImage("lighting-low-key") },
];

export const CINEMATIC_LENS_OPTIONS: readonly CinematicOption<CinematicLens>[] = [
  { value: "auto", label: "Auto", prompt: "", visual: previewImage("lens-auto") },
  { value: "zeiss-master-prime", label: "Zeiss Master Prime", prompt: "Zeiss Master Prime lens clarity with controlled contrast", visual: previewImage("lens-zeiss-master-prime") },
  { value: "cooke-s4", label: "Cooke S4", prompt: "Cooke S4 lens warmth with gentle rounded highlights", visual: previewImage("lens-cooke-s4") },
  { value: "panavision-c-series", label: "Panavision C-Series", prompt: "Panavision C-Series anamorphic lens character and oval bokeh", visual: previewImage("lens-panavision-c-series") },
  { value: "anamorphic", label: "Anamorphic", prompt: "anamorphic lens character with cinematic bokeh", visual: previewImage("lens-anamorphic") },
  { value: "macro", label: "Macro Detail", prompt: "macro lens detail with shallow depth of field", visual: previewImage("lens-macro") },
  { value: "vintage-haze", label: "Vintage Haze", prompt: "vintage lens haze with soft blooming highlights", visual: previewImage("lens-vintage-haze") },
  { value: "canon-k35", label: "Canon K-35", prompt: "Canon K-35 inspired vintage cinema lens warmth and gentle contrast", visual: previewImage("lens-canon-k35") },
  { value: "leica-summilux-c", label: "Leica Summilux-C", prompt: "Leica Summilux-C inspired premium cinema lens clarity and creamy falloff", visual: previewImage("lens-leica-summilux-c") },
  { value: "helios-44", label: "Helios 44", prompt: "Helios 44 inspired vintage swirly bokeh and soft character", visual: previewImage("lens-helios-44") },
  { value: "fisheye", label: "Fisheye", prompt: "fisheye lens distortion with an ultra-wide curved field of view", visual: previewImage("lens-fisheye") },
  { value: "telephoto-zoom", label: "Telephoto Zoom", prompt: "long telephoto zoom lens compression with isolated subject depth", visual: previewImage("lens-telephoto-zoom") },
];

export const CINEMATIC_FOCAL_LENGTH_OPTIONS: readonly CinematicOption<CinematicFocalLength>[] = [
  { value: "auto", label: "Auto", prompt: "", visual: previewImage("focal-auto") },
  { value: "12mm", label: "12mm", prompt: "12mm ultra-wide perspective", visual: previewImage("focal-12mm") },
  { value: "24mm", label: "24mm", prompt: "24mm wide cinematic perspective", visual: previewImage("focal-24mm") },
  { value: "35mm", label: "35mm", prompt: "35mm natural cinematic field of view", visual: previewImage("focal-35mm") },
  { value: "50mm", label: "50mm", prompt: "50mm balanced portrait perspective", visual: previewImage("focal-50mm") },
  { value: "75mm", label: "75mm", prompt: "75mm compressed portrait perspective", visual: previewImage("focal-75mm") },
  { value: "100mm", label: "100mm", prompt: "100mm telephoto compression", visual: previewImage("focal-100mm") },
];

export const CINEMATIC_APERTURE_OPTIONS: readonly CinematicOption<CinematicAperture>[] = [
  { value: "auto", label: "Auto", prompt: "", visual: previewImage("aperture-auto") },
  { value: "f1.2", label: "f/1.2", prompt: "f/1.2 ultra-wide-open aperture with extremely shallow depth of field", visual: previewImage("aperture-f1-2") },
  { value: "f1.4", label: "f/1.4", prompt: "f/1.4 wide-open aperture with very shallow depth of field", visual: previewImage("aperture-f1-4") },
  { value: "f2", label: "f/2", prompt: "f/2 shallow cinematic depth of field", visual: previewImage("aperture-f2") },
  { value: "f2.8", label: "f/2.8", prompt: "f/2.8 shallow depth of field", visual: previewImage("aperture-f2-8") },
  { value: "f4", label: "f/4", prompt: "f/4 moderate depth of field", visual: previewImage("aperture-f4") },
  { value: "f5.6", label: "f/5.6", prompt: "f/5.6 balanced depth of field with readable background", visual: previewImage("aperture-f5-6") },
  { value: "f8", label: "f/8", prompt: "f/8 deep focus", visual: previewImage("aperture-f8") },
  { value: "f11", label: "f/11", prompt: "f/11 deep focus with crisp background detail", visual: previewImage("aperture-f11") },
  { value: "f16", label: "f/16", prompt: "f/16 very deep focus with crisp environmental detail", visual: previewImage("aperture-f16") },
  { value: "f22", label: "f/22", prompt: "f/22 maximum deep focus with sharp foreground and background", visual: previewImage("aperture-f22") },
];

export const CINEMATIC_MOVEMENT_OPTIONS: readonly CinematicOption<CinematicMovement>[] = [
  { value: "auto", label: "Auto", prompt: "", visual: previewImage("movement-auto") },
  { value: "locked-off", label: "Locked Off", prompt: "locked-off static camera", visual: previewImage("movement-locked-off") },
  { value: "slow-dolly", label: "Slow Dolly", prompt: "slow controlled dolly camera movement", visual: previewImage("movement-slow-dolly") },
  { value: "steadicam", label: "Steadicam", prompt: "smooth steadicam follow movement", visual: previewImage("movement-steadicam") },
  { value: "handheld", label: "Handheld", prompt: "subtle handheld camera movement", visual: previewImage("movement-handheld") },
  { value: "orbit", label: "Orbit", prompt: "slow orbiting camera move", visual: previewImage("movement-orbit") },
  { value: "crane", label: "Crane Rise", prompt: "smooth crane rise camera movement", visual: previewImage("movement-crane") },
];

export const CINEMATIC_EFFECT_OPTIONS: readonly CinematicOption<CinematicEffect>[] = [
  { value: "auto", label: "Auto", prompt: "", visual: previewImage("effect-auto") },
  { value: "film-grain", label: "Film Grain", prompt: "fine analog film grain texture", visual: previewImage("effect-film-grain") },
  { value: "halation", label: "Halation", prompt: "warm film halation around bright highlights", visual: previewImage("effect-halation") },
  { value: "bloom", label: "Bloom", prompt: "soft blooming highlights with gentle glow", visual: previewImage("effect-bloom") },
  { value: "vignette", label: "Vignette", prompt: "subtle cinematic vignette around the frame edges", visual: previewImage("effect-vignette") },
  { value: "chromatic-aberration", label: "Chromatic Aberration", prompt: "tasteful chromatic aberration near high-contrast frame edges", visual: previewImage("effect-chromatic-aberration") },
  { value: "motion-blur", label: "Motion Blur", prompt: "directional cinematic motion blur while keeping the subject readable", visual: previewImage("effect-motion-blur") },
  { value: "lens-flare", label: "Lens Flare", prompt: "realistic cinematic lens flare from a bright side light", visual: previewImage("effect-lens-flare") },
];

export function normalizeCinematicProfile(value: unknown): CinematicProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_CINEMATIC_PROFILE;
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    camera: optionValueOrDefault(record.camera, CINEMATIC_CAMERA_OPTIONS, DEFAULT_CINEMATIC_PROFILE.camera),
    palette: optionValueOrDefault(record.palette, CINEMATIC_PALETTE_OPTIONS, DEFAULT_CINEMATIC_PROFILE.palette),
    lighting: optionValueOrDefault(record.lighting, CINEMATIC_LIGHTING_OPTIONS, DEFAULT_CINEMATIC_PROFILE.lighting),
    lens: optionValueOrDefault(record.lens, CINEMATIC_LENS_OPTIONS, DEFAULT_CINEMATIC_PROFILE.lens),
    focalLength: optionValueOrDefault(record.focalLength, CINEMATIC_FOCAL_LENGTH_OPTIONS, DEFAULT_CINEMATIC_PROFILE.focalLength),
    aperture: optionValueOrDefault(record.aperture, CINEMATIC_APERTURE_OPTIONS, DEFAULT_CINEMATIC_PROFILE.aperture),
    movement: optionValueOrDefault(record.movement, CINEMATIC_MOVEMENT_OPTIONS, DEFAULT_CINEMATIC_PROFILE.movement),
    effect: optionValueOrDefault(record.effect, CINEMATIC_EFFECT_OPTIONS, DEFAULT_CINEMATIC_PROFILE.effect),
  };
}

export function cinematicProfileKey(profile: CinematicProfile | undefined): string {
  const normalizedProfile = normalizeCinematicProfile(profile);
  if (!normalizedProfile.enabled) return "enabled:false";
  return CINEMATIC_PROFILE_FIELDS
    .map(field => `${field}:${normalizedProfile[field]}`)
    .join("|");
}

export function sameCinematicProfile(left: CinematicProfile | undefined, right: CinematicProfile | undefined): boolean {
  return cinematicProfileKey(left) === cinematicProfileKey(right);
}

export function hasActiveCinematicProfile(profile: CinematicProfile | undefined, mediaType: CinematicMediaType): boolean {
  return cinematicFragments(profile, mediaType).length > 0;
}

export function applyCinematicProfileToPrompt(
  prompt: string,
  profile: CinematicProfile | undefined,
  mediaType: CinematicMediaType,
): string {
  const fragments = cinematicFragments(profile, mediaType);
  if (fragments.length === 0) return prompt;
  const cinematicPrompt = `Cinematic direction: ${fragments.join("; ")}.`;
  const trimmedPrompt = prompt.trim();
  return trimmedPrompt ? `${trimmedPrompt}\n\n${cinematicPrompt}` : cinematicPrompt;
}

function cinematicFragments(profile: CinematicProfile | undefined, mediaType: CinematicMediaType): string[] {
  if (!profile?.enabled) return [];
  return [
    optionPrompt(profile.camera, CINEMATIC_CAMERA_OPTIONS),
    optionPrompt(profile.palette, CINEMATIC_PALETTE_OPTIONS),
    optionPrompt(profile.lighting, CINEMATIC_LIGHTING_OPTIONS),
    optionPrompt(profile.lens, CINEMATIC_LENS_OPTIONS),
    optionPrompt(profile.focalLength, CINEMATIC_FOCAL_LENGTH_OPTIONS),
    optionPrompt(profile.aperture, CINEMATIC_APERTURE_OPTIONS),
    optionPrompt(profile.effect, CINEMATIC_EFFECT_OPTIONS),
    mediaType === "video" ? optionPrompt(profile.movement, CINEMATIC_MOVEMENT_OPTIONS) : "",
  ].filter((fragment): fragment is string => fragment.length > 0);
}

function optionPrompt<T extends string>(value: T, options: readonly CinematicOption<T>[]): string {
  return options.find(option => option.value === value)?.prompt ?? "";
}

function optionValueOrDefault<T extends string>(
  value: unknown,
  options: readonly CinematicOption<T>[],
  fallback: T,
): T {
  return typeof value === "string" && options.some(option => option.value === value) ? value as T : fallback;
}
