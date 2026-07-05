import { t as globalT, type TFunction } from "@/lib/i18n-core";
import { API_ROUTES } from "./api/routes";
import { browserByokFetch } from "./browser-byok-fetch";
import { readFetchError } from "./client-fetch-error";
import { readImageGenerationPayload } from "./client-image-response";
import { normalizeImageEditAspectRatio, resolveImageEditResolutionForAspect } from "./image-edit-geometry";
import { formatProviderModel, tryParseProviderModel, type ModelOption } from "./providers/model-catalog";
import {
  RUNNINGHUB_CONTROL_IMAGE_APP_LABEL,
  RUNNINGHUB_CONTROL_IMAGE_APP_MODEL,
} from "./providers/runninghub";

export type ImageEditFeature = "redraw" | "erase" | "outpaint" | "cutout" | "angle" | "lighting";

export interface ImageEditFeatureMeta {
  key: ImageEditFeature;
  label: string;
  description: string;
}

export type ImageQuickEditExecutionMode = "image-edit-route" | "generate-image-route";

export interface ImageQuickEditTarget {
  id: string;
  feature: ImageEditFeature;
  label: string;
  model: string;
  executionMode: ImageQuickEditExecutionMode;
  promptRequired: boolean;
  maskRequired: boolean;
  guideSupported: boolean;
}

export type ImageEditFeatureTargets = Record<ImageEditFeature, string>;

export const IMAGE_EDIT_FEATURES: readonly ImageEditFeatureMeta[] = [
  { key: "redraw", label: "Redraw", description: "Regenerate masked area from prompt" },
  { key: "erase", label: "Erase", description: "Clear masked area and fill the background" },
  { key: "outpaint", label: "Outpaint", description: "Extend content outside the frame" },
  { key: "cutout", label: "Cutout", description: "Remove background while keeping the subject" },
  { key: "angle", label: "Angle", description: "Generate camera-angle prompts through angle controls" },
  { key: "lighting", label: "Relight", description: "Generate relighting prompts through lighting controls" },
];

function readTranslatedKey(
  translator: TFunction,
  namespace: "common" | "creation",
  key: string,
  params?: Record<string, string | number>,
): string | undefined {
  const scoped = translator(key, params);
  if (scoped !== key && scoped !== `${namespace}.${key}`) return scoped;
  const fullKey = `${namespace}.${key}`;
  const full = translator(fullKey, params);
  if (full !== key && full !== fullKey && full !== `${namespace}.${fullKey}`) return full;
  return undefined;
}

export function imageEditFeatureMeta(feature: ImageEditFeature, t?: TFunction): ImageEditFeatureMeta {
  const meta = IMAGE_EDIT_FEATURES.find(item => item.key === feature);
  if (!meta) throw new Error(`Unknown image edit feature: ${feature}`);
  const translator = t ?? globalT;
  const labelKey = `imageEdit.features.${feature}.label`;
  const descriptionKey = `imageEdit.features.${feature}.description`;
  return {
    ...meta,
    label: readTranslatedKey(translator, "creation", labelKey) ?? meta.label,
    description: readTranslatedKey(translator, "creation", descriptionKey) ?? meta.description,
  };
}

export function imageEditFeatureLabel(feature: ImageEditFeature, t?: TFunction): string {
  return imageEditFeatureMeta(feature, t).label;
}

export function imageQuickEditFallbackPrompt(
  feature: ImageEditFeature,
  sourcePromptOrId: string,
  t?: TFunction,
): string {
  const translator = t ?? globalT;
  const params = {
    label: imageEditFeatureLabel(feature, translator),
    prompt: sourcePromptOrId,
  };
  return (
    readTranslatedKey(translator, "creation", "imageEdit.fallbackPrompt", params) ??
    globalT("creation.imageEdit.fallbackPrompt", params)
  );
}

export function imageQuickEditProcessingTitleFromPrompt(prompt: string, t?: TFunction): string | null {
  const hasFeaturePrefix = (label: string): boolean =>
    prompt.startsWith(`${label}:`) || prompt.startsWith(`${label}：`);
  const feature =
    IMAGE_EDIT_FEATURES.find(item => hasFeaturePrefix(item.label)) ??
    (t ? IMAGE_EDIT_FEATURES.find(item => hasFeaturePrefix(imageEditFeatureLabel(item.key, t))) : undefined);
  if (!feature) return null;
  const translator = t ?? globalT;
  const label = imageEditFeatureLabel(feature.key, translator);
  return (
    readTranslatedKey(translator, "creation", "imageEdit.processingTitle", { label }) ??
    globalT("creation.imageEdit.processingTitle", { label })
  );
}

const NANO_BANANA_PRO_MODEL = "12ai:gemini-3-pro-image-preview";
const GENERIC_TARGET_PREFIX = "model:";
const RUNNINGHUB_CONTROL_IMAGE_APP_VALUE = formatProviderModel("runninghub", RUNNINGHUB_CONTROL_IMAGE_APP_MODEL);
export const RUNNINGHUB_CUTOUT_TARGET_ID = "runninghub-control-image-cutout";

export const DEFAULT_IMAGE_EDIT_FEATURE_TARGETS: ImageEditFeatureTargets = {
  redraw: genericTargetId(NANO_BANANA_PRO_MODEL),
  erase: genericTargetId(NANO_BANANA_PRO_MODEL),
  outpaint: genericTargetId(NANO_BANANA_PRO_MODEL),
  cutout: RUNNINGHUB_CUTOUT_TARGET_ID,
  angle: genericTargetId(NANO_BANANA_PRO_MODEL),
  lighting: genericTargetId(NANO_BANANA_PRO_MODEL),
};

const DEDICATED_TARGETS: readonly ImageQuickEditTarget[] = [
  {
    id: RUNNINGHUB_CUTOUT_TARGET_ID,
    feature: "cutout",
    label: "RunningHub Cutout AI App",
    model: RUNNINGHUB_CONTROL_IMAGE_APP_VALUE,
    executionMode: "generate-image-route",
    promptRequired: false,
    maskRequired: false,
    guideSupported: false,
  },
];

function resolveDedicatedTargetLabel(target: ImageQuickEditTarget, t?: TFunction): ImageQuickEditTarget {
  if (target.id !== RUNNINGHUB_CUTOUT_TARGET_ID || !t) return target;
  return {
    ...target,
    label: readTranslatedKey(t, "common", "imageEdit.targets.runningHubCutout") ?? target.label,
  };
}

export function isImageEditFeature(value: string): value is ImageEditFeature {
  return IMAGE_EDIT_FEATURES.some(feature => feature.key === value);
}

export function normalizeImageQuickEditTargetId(feature: ImageEditFeature, value: string): string {
  if (getDedicatedTarget(feature, value)) return value;
  const model = readGenericTargetModel(value);
  if (model === RUNNINGHUB_CONTROL_IMAGE_APP_VALUE && feature === "cutout") return RUNNINGHUB_CUTOUT_TARGET_ID;
  if (isRunningHubModel(model)) return DEFAULT_IMAGE_EDIT_FEATURE_TARGETS[feature];
  if (value.startsWith(GENERIC_TARGET_PREFIX)) return value;
  return genericTargetId(value);
}

export function getImageQuickEditTargetOptions(
  feature: ImageEditFeature,
  imageModelOptions: readonly ModelOption[],
  t?: TFunction,
): ImageQuickEditTarget[] {
  return [
    ...DEDICATED_TARGETS.filter(target => target.feature === feature).map(target => resolveDedicatedTargetLabel(target, t)),
    ...imageModelOptions
      .filter(option => isGenericImageEditModel(option.value))
      .map(option => genericImageEditTarget(feature, option.value, option.label)),
  ];
}

export function resolveImageQuickEditTarget(feature: ImageEditFeature, targetId: string, t?: TFunction): ImageQuickEditTarget {
  const normalizedTargetId = normalizeImageQuickEditTargetId(feature, targetId);
  const dedicatedTarget = getDedicatedTarget(feature, normalizedTargetId);
  if (dedicatedTarget) return resolveDedicatedTargetLabel(dedicatedTarget, t);

  const model = readGenericTargetModel(normalizedTargetId);
  return genericImageEditTarget(feature, model, model);
}

export interface SubmitImageQuickEditInput {
  target: ImageQuickEditTarget;
  operation: ImageEditFeature;
  aspectRatio: string;
  image: string;
  mask?: string;
  guide?: string;
  prompt: string;
  imageResolution: string;
  buildProviderHeaders: (target?: string) => Record<string, string>;
  signal?: AbortSignal;
}

export async function submitImageQuickEdit(input: SubmitImageQuickEditInput): Promise<string> {
  const request = imageQuickEditRequest(input);
  const response = await browserByokFetch(request.route, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...input.buildProviderHeaders(request.headerTarget) },
    signal: input.signal,
    body: JSON.stringify(request.body),
  });
  if (!response.ok) {
    throw new Error(await readFetchError(response, globalT("creation.imageEdit.errors.editFailed")));
  }

  const payload = await readImageGenerationPayload(response);
  if (payload.imageUrl) return payload.imageUrl;
  if (payload.operationName) {
    return waitForImageOperation(payload.operationName, input.buildProviderHeaders, input.signal);
  }
  throw new Error(globalT("creation.imageEdit.errors.noReturnedImage"));
}

function imageQuickEditRequest(input: SubmitImageQuickEditInput): {
  route: string;
  headerTarget: string;
  body: Record<string, unknown>;
} {
  const aspectRatio = normalizeImageEditAspectRatio(input.aspectRatio);
  const imageResolution = resolveImageEditResolutionForAspect(input.target.model, input.imageResolution, aspectRatio);
  if (input.target.executionMode === "image-edit-route") {
    return {
      route: "/api/image/edit",
      headerTarget: input.target.model,
      body: {
        operation: input.operation,
        model: input.target.model,
        image: input.image,
        mask: input.mask,
        guide: input.guide,
        prompt: input.prompt,
        imageResolution,
      },
    };
  }

  return {
    route: API_ROUTES.media.generateImage,
    headerTarget: input.target.model,
    body: {
      model: input.target.model,
      prompt: input.prompt,
      referenceImages: [input.image],
      aspectRatio,
      imageResolution,
    },
  };
}

  async function waitForImageOperation(
  operationName: string,
  buildProviderHeaders: (target?: string) => Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<string> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(2000, signal);
    const statusResponse = await browserByokFetch(API_ROUTES.media.status, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildProviderHeaders(operationName) },
      signal,
      body: JSON.stringify({ operationName }),
    });
    if (!statusResponse.ok) {
      throw new Error(await readFetchError(statusResponse, globalT("creation.imageEdit.errors.statusQueryFailed")));
    }

    const status = await readImageStatus(statusResponse);
    if (!status.done) continue;
    if (status.errorMessage) throw new Error(status.errorMessage);
    return downloadImageOperation(operationName, buildProviderHeaders, signal);
  }
  throw new Error(globalT("creation.imageEdit.errors.taskTimeout"));
}

async function downloadImageOperation(
  operationName: string,
  buildProviderHeaders: (target?: string) => Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<string> {
  const response = await browserByokFetch(API_ROUTES.media.imageDownload, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildProviderHeaders(operationName) },
    signal,
    body: JSON.stringify({ operationName }),
  });
  if (!response.ok) {
    throw new Error(await readFetchError(response, globalT("creation.imageEdit.errors.downloadFailed")));
  }
  const payload = await readImageGenerationPayload(response);
  if (!payload.imageUrl) throw new Error(globalT("creation.imageEdit.errors.downloadNoImage"));
  return payload.imageUrl;
}

async function readImageStatus(response: Response): Promise<{ done: boolean; errorMessage?: string }> {
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null) return { done: false };
  const record = value as Record<string, unknown>;
  return {
    done: record.done === true,
    errorMessage: typeof record.errorMessage === "string" && record.errorMessage.trim() ? record.errorMessage : undefined,
  };
}

function genericImageEditTarget(feature: ImageEditFeature, model: string, label: string): ImageQuickEditTarget {
  return {
    id: genericTargetId(model),
    feature,
    label,
    model,
    executionMode: "image-edit-route",
    promptRequired: feature === "redraw" || feature === "outpaint" || feature === "angle" || feature === "lighting",
    maskRequired: feature === "redraw" || feature === "erase" || feature === "outpaint",
    guideSupported: feature !== "cutout" && feature !== "angle",
  };
}

function genericTargetId(model: string): string {
  return `${GENERIC_TARGET_PREFIX}${model}`;
}

function readGenericTargetModel(targetId: string): string {
  if (!targetId.startsWith(GENERIC_TARGET_PREFIX)) return targetId;
  return targetId.slice(GENERIC_TARGET_PREFIX.length);
}

function getDedicatedTarget(feature: ImageEditFeature, targetId: string): ImageQuickEditTarget | undefined {
  return DEDICATED_TARGETS.find(target => target.feature === feature && target.id === targetId);
}

function isGenericImageEditModel(model: string): boolean {
  const parsed = tryParseProviderModel(model, "12ai");
  return parsed?.provider !== "runninghub";
}

function isRunningHubModel(model: string): boolean {
  return tryParseProviderModel(model, "12ai")?.provider === "runninghub";
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise(resolve => window.setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));

  return new Promise((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export { RUNNINGHUB_CONTROL_IMAGE_APP_LABEL };
