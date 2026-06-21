import { getImageModelCapabilities, type ParameterOption } from "@/lib/providers/model-catalog";

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
  const options = getImageModelCapabilities(model).resolutions
    .filter(option => option.value !== "auto" && option.value !== "custom");
  return options.length > 0 ? options : [AUTO_RESOLUTION_OPTION];
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
