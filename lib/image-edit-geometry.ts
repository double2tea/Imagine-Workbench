import {
  getImageAspectRatioFromResolution,
  getOptionalModelCapability,
  type ParameterOption,
} from "@/lib/providers/model-catalog";

export interface ImageEditSize {
  width: number;
  height: number;
}

const AUTO_RESOLUTION_OPTION: ParameterOption = { value: "auto", label: "Auto" };

export function imageEditAspectRatioFromSize(size: ImageEditSize): string {
  assertPositiveFiniteSize(size);
  const divisor = gcd(size.width, size.height);
  return `${Math.round(size.width / divisor)}:${Math.round(size.height / divisor)}`;
}

export function normalizeImageEditAspectRatio(value: string): string {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return value;
  return imageEditAspectRatioFromSize({
    width: Number(match[1]),
    height: Number(match[2]),
  });
}

export function getImageEditResolutionOptions(model: string | undefined): ParameterOption[] {
  if (!model) return [AUTO_RESOLUTION_OPTION];
  const capability = getOptionalModelCapability(model, "image");
  if (!capability) return [AUTO_RESOLUTION_OPTION];
  const options = uniqueResolutionLabels(
    capability.sizes
      .filter(option => option.value !== "auto" && option.value !== "custom")
      .map(option => isPixelSize(option.value) ? { value: option.label, label: option.label } : option),
  );
  return options.length > 0 ? options : [AUTO_RESOLUTION_OPTION];
}

export function resolveImageEditResolutionForAspect(
  model: string,
  imageResolution: string,
  aspectRatio: string,
): string {
  const capability = getOptionalModelCapability(model, "image");
  if (!capability || imageResolution === "auto" || imageResolution === "custom") return imageResolution;

  const pixelOptions = capability.sizes.filter(option => isPixelSize(option.value));
  if (pixelOptions.length === 0) return imageResolution;

  const exactOption = capability.sizes.find(option => option.value === imageResolution);
  const targetLabel = exactOption?.label ?? imageResolution;
  const candidates = pixelOptions.filter(option => option.label === targetLabel);
  if (candidates.length === 0) return exactOption?.value ?? imageResolution;

  const targetRatio = ratioNumber(normalizeImageEditAspectRatio(aspectRatio));
  if (!targetRatio) return candidates[0]?.value ?? imageResolution;

  const exactRatioMatch = candidates.find(option => getImageAspectRatioFromResolution(option.value) === normalizeImageEditAspectRatio(aspectRatio));
  if (exactRatioMatch) return exactRatioMatch.value;

  return candidates
    .map(option => ({
      option,
      distance: ratioDistance(option.value, targetRatio),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.option.value ?? imageResolution;
}

function uniqueResolutionLabels(options: ParameterOption[]): ParameterOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    if (seen.has(option.label)) return false;
    seen.add(option.label);
    return true;
  });
}

function ratioDistance(resolution: string, targetRatio: number): number {
  const ratio = ratioNumber(getImageAspectRatioFromResolution(resolution));
  if (!ratio) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.log(ratio / targetRatio));
}

function ratioNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

function isPixelSize(value: string): boolean {
  return /^\d+x\d+$/.test(value);
}

function assertPositiveFiniteSize(size: ImageEditSize): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error("Image edit size must have positive finite width and height");
  }
}

function gcd(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}
