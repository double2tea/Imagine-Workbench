import type { ImageEditFeature } from "@/lib/image-quick-edit-targets";

export interface AngleAdjustmentState {
  rotation: number;
  tilt: number;
  zoom: number;
  wideAngle: boolean;
}

export interface LightingAdjustmentState {
  direction: "front" | "left" | "right" | "top" | "bottom" | "back";
  height: number;
  intensity: number;
  temperature: number;
  rimLight: boolean;
}

type PromptModelFamily = "gpt-image-2" | "nano-banana-pro" | "generic";

const ANGLE_ZOOM_CLOSEUP_THRESHOLD = 65;
const ANGLE_ZOOM_WIDE_THRESHOLD = 35;
const ANGLE_TILT_ELEVATED_THRESHOLD = 20;
const ANGLE_TILT_LOW_ANGLE_THRESHOLD = -20;
export const LIGHT_HEIGHT_HIGH_THRESHOLD = 35;
export const LIGHT_HEIGHT_LOW_THRESHOLD = -35;
const LIGHT_INTENSITY_STRONG_THRESHOLD = 70;
const LIGHT_INTENSITY_SOFT_THRESHOLD = 35;
export const LIGHT_TEMPERATURE_COOL_THRESHOLD = 6200;
export const LIGHT_TEMPERATURE_WARM_THRESHOLD = 3800;

export function buildAngleAdjustmentPrompt(state: AngleAdjustmentState, model: string | undefined): string {
  const camera = angleCameraPhrases(state);
  const family = promptModelFamily(model);
  if (family === "gpt-image-2") {
    return [
      "Source image: the first input image is the image to edit.",
      `Goal: change the camera viewpoint to a ${camera.azimuth}, ${camera.elevation}, ${camera.distance}${camera.wideAngle}.`,
      "Change only: camera viewpoint, perspective, and newly visible scene details required by that viewpoint.",
      "Preserve: subject identity, key objects, visual style, scene mood, color palette, and recognizable scene content.",
      "Constraints: no unrelated objects, no extra text, no watermark, keep all other aspects unchanged.",
    ].join("\n");
  }
  if (family === "nano-banana-pro") {
    return [
      "Use Image 1 as the source image and preserve its subject identity, scene content, style, and mood.",
      `Create a professional camera-angle edit: ${camera.azimuth}, ${camera.elevation}, ${camera.distance}${camera.wideAngle}.`,
      `Camera and lens: ${camera.lens}.`,
      "Keep unchanged: the main subject, important objects, color palette, and overall art direction.",
      "Reconstruct newly visible areas naturally so the result still feels like the same scene.",
    ].join("\n");
  }
  return [
    `Edit the provided image into a ${camera.azimuth}, ${camera.elevation}, ${camera.distance}${camera.wideAngle}.`,
    "Preserve the same subject identity, main objects, visual style, and scene mood.",
    "Reconstruct only the newly visible parts needed for the changed camera viewpoint.",
    "Keep the output coherent with the original image.",
  ].join("\n");
}

export function buildLightingAdjustmentPrompt(state: LightingAdjustmentState, model: string | undefined): string {
  const lighting = lightingPhrases(state);
  const family = promptModelFamily(model);
  if (family === "gpt-image-2") {
    return [
      "Source image: the first input image is the image to relight.",
      "Guide image: any additional input image is a lighting guide only, not a content replacement.",
      `Goal: relight the image with ${lighting.direction} at ${lighting.height}.`,
      `Change only: lighting direction, shadow direction, highlight placement, intensity set to ${lighting.intensity}, and color temperature set to ${lighting.temperature}.${lighting.rimLight}`,
      "Preserve: subject identity, camera angle, geometry, composition, texture detail, key objects, and scene content.",
      "Constraints: no unrelated objects, no extra text, no watermark, keep all non-lighting details unchanged.",
    ].join("\n");
  }
  if (family === "nano-banana-pro") {
    return [
      "Use Image 1 as the source image and preserve its subject identity, scene content, composition, and style.",
      "Use Image 2, if provided, only as a lighting direction guide.",
      `Create a professional relighting edit with ${lighting.direction} at ${lighting.height}.`,
      `Lighting: ${lighting.intensity}, ${lighting.temperature}, natural shadows and highlights.${lighting.rimLight}`,
      "Keep unchanged: camera angle, layout, geometry, texture detail, and all non-lighting content.",
    ].join("\n");
  }
  return [
    `Relight the provided image as if the key light is coming from ${lighting.direction} at ${lighting.height}.`,
    `Set light intensity to ${lighting.intensity} with ${lighting.temperature} color temperature.${lighting.rimLight}`,
    "Preserve subject identity, composition, texture detail, and the original scene content.",
    "Only change lighting, highlights, shadows, and color temperature.",
  ].join("\n");
}

export function isVisualAdjustmentFeature(feature: ImageEditFeature): feature is "angle" | "lighting" {
  return feature === "angle" || feature === "lighting";
}

function promptModelFamily(model: string | undefined): PromptModelFamily {
  if (!model) return "generic";
  if (model.includes("gpt-image-2")) return "gpt-image-2";
  if (model.includes("gemini-3-pro-image") || model.includes("gemini-3-pro-image-preview")) return "nano-banana-pro";
  return "generic";
}

function angleCameraPhrases(state: AngleAdjustmentState): {
  azimuth: string;
  distance: string;
  elevation: string;
  lens: string;
  wideAngle: string;
} {
  return {
    azimuth: azimuthPhrase(state.rotation),
    distance: distancePhrase(state.zoom),
    elevation: elevationPhrase(state.tilt),
    lens: state.wideAngle ? "wide-angle lens with controlled perspective distortion" : "natural perspective lens",
    wideAngle: state.wideAngle ? ", with a wide-angle lens feel" : "",
  };
}

function distancePhrase(zoom: number): string {
  if (zoom >= ANGLE_ZOOM_CLOSEUP_THRESHOLD) return "close-up shot";
  if (zoom <= ANGLE_ZOOM_WIDE_THRESHOLD) return "wide shot";
  return "medium shot";
}

function elevationPhrase(tilt: number): string {
  if (tilt >= ANGLE_TILT_ELEVATED_THRESHOLD) return "elevated shot";
  if (tilt <= ANGLE_TILT_LOW_ANGLE_THRESHOLD) return "low-angle shot";
  return "eye-level shot";
}

function azimuthPhrase(rotation: number): string {
  const normalized = ((((rotation % 360) + 360) % 360) + 22.5) % 360;
  const index = Math.floor(normalized / 45);
  const phrases = [
    "front view",
    "front-right quarter view",
    "right side view",
    "back-right quarter view",
    "back view",
    "back-left quarter view",
    "left side view",
    "front-left quarter view",
  ] as const;
  return phrases[index] ?? "front view";
}

function lightingPhrases(state: LightingAdjustmentState): {
  direction: string;
  height: string;
  intensity: string;
  rimLight: string;
  temperature: string;
} {
  return {
    direction: directionPhrase(state.direction),
    height: heightPhrase(state.height),
    intensity: intensityPhrase(state.intensity),
    rimLight: state.rimLight ? " Add a subtle rim light around the subject." : "",
    temperature: temperaturePhrase(state.temperature),
  };
}

function heightPhrase(height: number): string {
  if (height >= LIGHT_HEIGHT_HIGH_THRESHOLD) return "a high angle";
  if (height <= LIGHT_HEIGHT_LOW_THRESHOLD) return "a low angle";
  return "eye level";
}

function intensityPhrase(intensity: number): string {
  if (intensity >= LIGHT_INTENSITY_STRONG_THRESHOLD) return "strong";
  if (intensity <= LIGHT_INTENSITY_SOFT_THRESHOLD) return "soft";
  return "balanced";
}

function temperaturePhrase(temperature: number): string {
  if (temperature >= LIGHT_TEMPERATURE_COOL_THRESHOLD) return "cool daylight";
  if (temperature <= LIGHT_TEMPERATURE_WARM_THRESHOLD) return "warm tungsten";
  return "neutral white";
}

function directionPhrase(direction: LightingAdjustmentState["direction"]): string {
  const phrases: Record<LightingAdjustmentState["direction"], string> = {
    back: "behind the subject",
    bottom: "below the subject",
    front: "in front of the subject",
    left: "from camera left",
    right: "from camera right",
    top: "above the subject",
  };
  return phrases[direction];
}
