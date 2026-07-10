import { z } from "zod";
import { API_ROUTES } from "@/lib/api/routes";
import { audioOperationApiError } from "@/lib/api/audio-errors";
import { ApiError, apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { assertPublicHttpUrl } from "@/lib/api/url-safety";
import type { AgentBoardContext, AgentSurface } from "@/lib/agent-context";
import { isRunningHubWorkflowAudioTarget } from "@/lib/audio-generation-routing";
import { readOptionalAudioFormat } from "@/lib/audio-operation-rules";
import { executeToolCall, getAgentTools, type ToolContext } from "@/app/api/agent/respond/tools";
import { SKILL_REGISTRY } from "@/app/api/agent/respond/skills";
import {
  getSendableAgentMediaReferences,
  parseAgentAudioDataUrl,
  type AgentReferenceInput,
} from "@/lib/agent-chat-model";
import { AGENT_BOARD_ACTION_TYPES, AGENT_WORKBENCH_ACTION_TYPES } from "@/lib/agent-actions";
import { isBrowserByokDeployment } from "@/lib/deployment-mode";
import {
  mediaReferenceLabel,
  mediaReferenceTypeFromBase64DataUri,
  getMediaReferenceType,
  type MediaReferenceType,
} from "@/lib/media-references";
import { validateCapabilityParameterValues, validateInputModalityReferences, ModelCapabilityValidationError } from "@/lib/providers/model-capabilities";
import {
  AUDIO_OPERATION_MODES,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  formatProviderModel,
  getListedModelCapabilities,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getModelCapability,
  getOptionalModelCapability,
  parseProviderModel,
  ProviderModelParseError,
  tryParseProviderModel,
  type AiProvider,
} from "@/lib/providers/model-catalog";
import { createChatCompletionText, createChatCompletionWithTools, ChatJsonParseError, parseJsonObjectText } from "@/lib/providers/chat";
import { editImage, downloadImage, generateImage, getAsyncImageStatus } from "@/lib/providers/image";
import { generateVideo, getVideoStatus, downloadVideo, cancelVideo } from "@/lib/providers/video";
import { generateAudio, generateAudioOperation, getAudioStatus, downloadAudio } from "@/lib/providers/audio";
import { listProviderModels, type ModelKindFilter } from "@/lib/providers/models";
import { readModelParameterValues } from "@/lib/providers/parameter-values";
import { fetchRunningHubAiAppSchema } from "@/lib/providers/runninghub-app";
import { getRunningHubYouchuanCatalog } from "@/lib/providers/runninghub";
import { isSeedAudioProviderModel } from "@/lib/providers/seed-audio";
import {
  isRunningHubTaskTarget,
  readRunningHubNodeInfoList,
  resolveRunningHubNodeInfoListForModel,
  runningHubResolvedNodeInfoAllowsEmptyPrompt,
} from "@/lib/providers/runninghub-node-info";
import type {
  ChatContentPart,
  ChatMessageInput,
  GenerateImageResult,
  ImageEditOperation,
  ProviderConfig,
  ReferenceMedia,
  RunningHubYouchuanAdvancedSettings,
} from "@/lib/providers/types";
import {
  optionalText,
  parseMediaOperationName,
  resolveProviderConfig,
  type ResolveProviderConfigOptions,
} from "@/lib/providers/utils";
import { isProviderKey } from "@/lib/providers/registry";
import {
  getReferenceImagePayloadError,
  getReferenceMediaPayloadError,
} from "@/lib/reference-images";

type BrowserJsonBody = Record<string, unknown>;

const imageEditOperationSchema = z.enum(["redraw", "erase", "outpaint", "cutout", "angle", "lighting"]);
const imageEditPromptRequiredOperations = new Set<ImageEditOperation>(["redraw", "outpaint", "angle", "lighting"]);
const audioGenerateBodySchema = z.object({
  asrLanguage: z.enum(["auto", "zh", "en"]).optional(),
  model: z.string().trim().min(1),
  prompt: z.string().optional(),
  mode: z.enum(AUDIO_OPERATION_MODES),
  format: z.string().transform(readOptionalAudioFormat).optional(),
  stylePrompt: z.string().trim().min(1).optional(),
  voice: z.string().trim().min(1).optional(),
  voiceProfileId: z.string().trim().min(1).optional(),
  voiceCloneConsentAccepted: z.boolean().optional(),
  optimizeTextPreview: z.boolean().optional(),
  parameterValues: z.unknown().optional(),
  referenceMedia: z.unknown().optional(),
  runningHubAccessPassword: z.unknown().optional(),
  runningHubNodeInfoList: z.unknown().optional(),
});

const promptTextBodySchema = z.object({
  locale: z.enum(["zh", "en"]).optional().default("zh"),
  model: z.string().optional(),
  prompt: z.string().trim().min(1, "Prompt is required"),
  references: z.array(z.object({
    id: z.string().trim().min(1),
    type: z.enum(["image", "video", "audio"]).optional(),
    url: z.string().trim().min(1),
  })).optional().default([]),
});

const agentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const localeSchema = z.enum(["zh", "en"]);
type AgentLocale = z.infer<typeof localeSchema>;

const boardPortRefSchema = z.object({
  nodeId: z.string(),
  portId: z.string(),
  portKind: z.enum(["asset", "prompt", "result", "agent"]),
});

const audioOperationModeSchema = z.enum(AUDIO_OPERATION_MODES);
const asrLanguageSchema = z.enum(["auto", "zh", "en"]);

const boardNodeParamsSchema = z.object({
  asrLanguage: z.string().optional(),
  audioFormat: z.string().optional(),
  audioMode: z.string().optional(),
  audioStylePrompt: z.string().optional(),
  bindingCount: z.number().optional(),
  customImageResolution: z.string().optional(),
  errorMessage: z.string().optional(),
  imageQuality: z.string().optional(),
  imageResolution: z.string().optional(),
  outputType: z.string().optional(),
  resultAssetId: z.string().optional(),
  resultAssetIds: z.array(z.string()).optional(),
  resultStackKey: z.string().optional(),
  targetId: z.string().optional(),
  targetType: z.string().optional(),
  thinkingLevel: z.string().optional(),
  variantCount: z.number().optional(),
  videoDuration: z.string().optional(),
  videoPreset: z.string().optional(),
  videoReferenceMode: z.string().optional(),
  videoResolution: z.string().optional(),
  voiceCloneConsentAccepted: z.boolean().optional(),
  voiceProfileId: z.string().optional(),
});

const boardNodeSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(["asset", "prompt", "reference-group", "group", "multi-grid", "image-generate", "video-generate", "audio-operation", "runninghub-app", "agent", "note", "result"]),
  title: z.string(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  aspectRatio: z.string().optional(),
  status: z.string().optional(),
  resultAssetId: z.string().optional(),
  assetId: z.string().optional(),
  assetType: z.string().optional(),
  body: z.string().optional(),
  instruction: z.string().optional(),
  params: boardNodeParamsSchema.optional(),
});

const boardNodeDetailSchema = boardNodeSummarySchema.extend({
  details: z.record(z.string(), z.unknown()).optional(),
});

const boardContextSchema = z.object({
  boardId: z.string(),
  title: z.string(),
  selectedNodeId: z.string().nullable(),
  selectedNodeIds: z.array(z.string()).optional().default([]),
  selectedEdgeId: z.string().nullable(),
  selectedNodes: z.array(boardNodeSummarySchema).optional().default([]),
  selectedNodeDetails: z.array(boardNodeDetailSchema).optional().default([]),
  selectedAssetReferenceCount: z.number().int().nonnegative().optional().default(0),
  nodes: z.array(boardNodeSummarySchema),
  edges: z.array(z.object({
    id: z.string(),
    kind: z.enum(["reference", "prompt", "result", "agent-context"]),
    from: boardPortRefSchema,
    to: boardPortRefSchema,
  })),
});

const agentBodySchema = z.object({
  messages: z.array(agentMessageSchema).min(1),
  locale: localeSchema.optional().default("zh"),
  surface: z.enum(["workbench", "board"]).optional().default("workbench"),
  boardContext: boardContextSchema.optional(),
  gallerySummary: z.array(z.object({
    id: z.string(),
    type: z.string(),
    prompt: z.string(),
    aspectRatio: z.string(),
  })).optional().default([]),
  agentReferences: z.array(z.object({
    id: z.string(),
    type: z.enum(["image", "video", "audio"]).optional(),
    url: z.string(),
  })).optional().default([]),
  agentReferenceId: z.string().optional(),
  model: z.string().optional(),
});

const agentActionSchema = z.object({
  type: z.enum(AGENT_WORKBENCH_ACTION_TYPES),
  params: z.object({
    prompt: z.string().optional(),
    model: z.string().optional(),
    aspectRatio: z.string().optional(),
    referenceImageId: z.string().optional(),
    imageResolution: z.string().optional(),
    imageQuality: z.string().optional(),
    thinkingLevel: z.string().optional(),
    videoResolution: z.string().optional(),
    videoDuration: z.string().optional(),
    videoPreset: z.string().optional(),
    videoReferenceMode: z.enum(["reference", "firstLast"]).optional(),
    audioFormat: z.string().optional(),
    audioMode: audioOperationModeSchema.optional(),
    audioStylePrompt: z.string().optional(),
    asrLanguage: asrLanguageSchema.optional(),
    voiceCloneConsentAccepted: z.boolean().optional(),
    voiceProfileId: z.string().optional(),
  }).optional(),
});

const agentBoardPatchPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const agentBoardPatchPortRefSchema = z.object({
  nodeId: z.string(),
  portId: z.string(),
  portKind: z.enum(["asset", "prompt", "result", "agent"]),
});

const agentBoardPatchCreateNodeSchema = z.object({
  op: z.literal("create_node"),
  tempId: z.string(),
  kind: z.enum(["prompt", "note", "image-generate", "video-generate", "audio-operation", "agent"]),
  title: z.string().optional(),
  position: agentBoardPatchPointSchema.optional(),
  prompt: z.string().optional(),
  body: z.string().optional(),
  instruction: z.string().optional(),
  model: z.string().optional(),
  aspectRatio: z.string().optional(),
  imageResolution: z.string().optional(),
  imageQuality: z.string().optional(),
  thinkingLevel: z.string().optional(),
  videoResolution: z.string().optional(),
  videoDuration: z.string().optional(),
  videoPreset: z.string().optional(),
  videoReferenceMode: z.enum(["reference", "firstLast"]).optional(),
  audioFormat: z.string().optional(),
  audioMode: audioOperationModeSchema.optional(),
  audioStylePrompt: z.string().optional(),
  asrLanguage: asrLanguageSchema.optional(),
  voiceCloneConsentAccepted: z.boolean().optional(),
  voiceProfileId: z.string().optional(),
  run: z.boolean().optional(),
});

const agentBoardPatchUpdateNodeSchema = z.object({
  op: z.literal("update_node"),
  nodeId: z.string(),
  prompt: z.string().optional(),
  body: z.string().optional(),
  instruction: z.string().optional(),
  model: z.string().optional(),
  aspectRatio: z.string().optional(),
  imageResolution: z.string().optional(),
  imageQuality: z.string().optional(),
  thinkingLevel: z.string().optional(),
  videoResolution: z.string().optional(),
  videoDuration: z.string().optional(),
  videoPreset: z.string().optional(),
  videoReferenceMode: z.enum(["reference", "firstLast"]).optional(),
  audioFormat: z.string().optional(),
  audioMode: audioOperationModeSchema.optional(),
  audioStylePrompt: z.string().optional(),
  asrLanguage: asrLanguageSchema.optional(),
  voiceCloneConsentAccepted: z.boolean().optional(),
  voiceProfileId: z.string().optional(),
});

const agentBoardPatchConnectPortsSchema = z.object({
  op: z.literal("connect_ports"),
  from: agentBoardPatchPortRefSchema,
  to: agentBoardPatchPortRefSchema,
});

const agentBoardPatchSchema = z.object({
  title: z.string().optional(),
  run: z.boolean().optional(),
  shots: z.array(z.object({
    id: z.string().optional(),
    scene: z.string().optional(),
    shot: z.string().optional(),
    beat: z.string().optional(),
    imagePrompt: z.string().optional(),
    videoPrompt: z.string().optional(),
    run: z.boolean().optional(),
  })).optional(),
  operations: z.array(z.discriminatedUnion("op", [
    agentBoardPatchCreateNodeSchema,
    agentBoardPatchUpdateNodeSchema,
    agentBoardPatchConnectPortsSchema,
  ])),
});

const agentBoardActionSchema = z.object({
  type: z.enum(AGENT_BOARD_ACTION_TYPES),
  params: z.object({
    nodeId: z.string().optional(),
    prompt: z.string().optional(),
    model: z.string().optional(),
    aspectRatio: z.string().optional(),
    referenceImageId: z.string().optional(),
    imageResolution: z.string().optional(),
    imageQuality: z.string().optional(),
    thinkingLevel: z.string().optional(),
    videoResolution: z.string().optional(),
    videoDuration: z.string().optional(),
    videoPreset: z.string().optional(),
    videoReferenceMode: z.enum(["reference", "firstLast"]).optional(),
    audioFormat: z.string().optional(),
    audioMode: audioOperationModeSchema.optional(),
    audioStylePrompt: z.string().optional(),
    asrLanguage: asrLanguageSchema.optional(),
    voiceCloneConsentAccepted: z.boolean().optional(),
    voiceProfileId: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    instruction: z.string().optional(),
    boardPatch: agentBoardPatchSchema.optional(),
    run: z.boolean().optional(),
  }).optional(),
});

const agentResponseSchema = z.object({
  thought: z.string().optional(),
  text: z.string().optional(),
  activeSkills: z.array(z.string()).default([]),
  recommendedAction: agentActionSchema.default({ type: "none" }),
  boardAction: agentBoardActionSchema.default({ type: "none" }),
  suggestedFollowUps: z.array(z.string()).default([]),
});

const VALID_AGENT_MODEL_IDS = new Set(getListedModelCapabilities().map(capability => capability.value));
const MAX_TOOL_ROUNDS = 3;
const AGENT_CHAT_RESPONSE_OPTIONS = { responseFormat: { type: "json_object" as const } };

interface AgentToolCallSummary {
  name: string;
  args: Record<string, unknown>;
}

function validateActionModel(action: { type: string; params?: { model?: string } }): void {
  const model = action.params?.model;
  if (model && !VALID_AGENT_MODEL_IDS.has(model)) {
    delete action.params!.model;
    console.warn(`Agent recommended unknown model "${model}", removed from action params`);
  }
}

function validateActiveSkills(skills: string[]): string[] {
  const valid = new Set(SKILL_REGISTRY.map(skill => skill.name));
  return skills.filter(skill => valid.has(skill));
}

function payloadTooLarge(message: string): ApiError {
  return new ApiError(413, "payload_too_large", message);
}

export async function browserByokFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isBrowserByokDeployment()) return fetch(input, init);
  const url = routeUrl(input);
  if (!url) return fetch(input, init);
  const signal = init?.signal ?? undefined;
  throwIfAborted(signal);

  try {
    const headers = new Headers(init?.headers);
    const path = url.pathname;
    if (path === API_ROUTES.media.generateImage) return withAbort(signal, jsonTask(generateImageForBrowser(headers, await readJsonBody(init), signal)));
    if (path === API_ROUTES.media.generateVideo) return withAbort(signal, jsonTask(generateVideoForBrowser(headers, await readJsonBody(init), signal)));
    if (path === API_ROUTES.media.generateAudio) {
      const body = await readJsonBody(init);
      const seedAudioModel = getSeedAudioBrowserRouteModel(body);
      if (seedAudioModel) {
        return fetch(API_ROUTES.media.generateSeedAudio, {
          ...init,
          body: JSON.stringify({ ...jsonRecord(body), model: seedAudioModel }),
        });
      }
      return withAbort(signal, jsonTask(generateAudioOperationForBrowser(headers, body, signal)));
    }
    if (path === API_ROUTES.media.generateAudioWorkflow) return withAbort(signal, jsonTask(generateAudioWorkflowForBrowser(headers, await readJsonBody(init), signal)));
    if (path === API_ROUTES.media.status) return withAbort(signal, jsonTask(getMediaStatusForBrowser(headers, await readJsonBody(init), signal)));
    if (path === API_ROUTES.media.imageDownload) return withAbort(signal, downloadImageForBrowser(headers, await readJsonBody(init), signal));
    if (path === API_ROUTES.media.videoDownload) return withAbort(signal, downloadVideoForBrowser(headers, await readJsonBody(init), signal));
    if (path === API_ROUTES.media.audioDownload) return withAbort(signal, downloadAudioForBrowser(headers, await readJsonBody(init), signal));
    if (path === API_ROUTES.media.cancel) return withAbort(signal, jsonTask(cancelMediaForBrowser(headers, await readJsonBody(init), signal)));
    if (path === API_ROUTES.prompts.optimize) return withAbort(signal, jsonTask(optimizePromptForBrowser(headers, await readJsonBody(init), signal)));
    if (path === API_ROUTES.board.promptText) return withAbort(signal, jsonTask(generateBoardPromptTextForBrowser(headers, await readJsonBody(init), signal)));
    if (path === "/api/image/edit") return withAbort(signal, jsonTask(editImageForBrowser(headers, await readJsonBody(init), signal)));
    if (path === API_ROUTES.agent.respond) return withAbort(signal, jsonTask(respondAgentForBrowser(headers, await readJsonBody(init), signal)));
    if (path === "/api/runninghub/ai-app-schema") return withAbort(signal, jsonTask(getRunningHubAiAppSchemaForBrowser(headers, await readJsonBody(init), signal)));
    if (path === "/api/models") return withAbort(signal, jsonTask(listModelsForBrowser(headers, url, signal)));
    return fetch(input, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return errorResponse(error);
  }
}

async function generateImageForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const record = jsonRecord(body);
  const modelValue = optionalText(record.model) ?? DEFAULT_IMAGE_MODEL;
  const parsed = parseProviderModel(modelValue, "12ai");
  const isRunningHubImageTask = parsed.provider === "runninghub" && isRunningHubTaskTarget(parsed.model, "image");
  const modelCapability = isRunningHubImageTask ? null : getModelCapability(modelValue, "image");
  const requestImageResolution = optionalText(record.imageResolution);
  if (requestImageResolution === "custom") {
    throw badRequest("imageResolution custom must be resolved to a concrete size before image generation", "unsupported_image_resolution");
  }
  const aspectRatio = customImageSizeAspectRatio(requestImageResolution) ?? optionalText(record.aspectRatio) ?? "1:1";
  const imageResolution = isRunningHubImageTask ? requestImageResolution ?? "auto" : resolveImageResolution(modelValue, aspectRatio, requestImageResolution);
  const imageQuality = isRunningHubImageTask ? optionalText(record.imageQuality) : resolveImageQuality(modelValue, optionalText(record.imageQuality));
  const legacyReferenceImages = readReferenceImages(record.referenceImages, record.referenceImage);
  const referenceMedia = readReferenceMedia(record.referenceMedia, legacyReferenceImages);
  const runningHubYouchuan = isRunningHubImageTask ? undefined : readRunningHubYouchuanAdvancedSettings(record.runningHubYouchuan, parsed.model);
  const explicitRunningHubNodeInfoList = readRunningHubNodeInfoList(record.runningHubNodeInfoList);
  const runningHubNodeInfo = resolveRunningHubNodeInfoListForModel(parsed.model, explicitRunningHubNodeInfoList);
  const formatError = getReferenceMediaFormatError(referenceMedia);
  if (formatError) throw badRequest(formatError, "invalid_reference_media");
  const payloadError = isRunningHubImageTask
    ? getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri))
    : getReferenceImagePayloadError([...referenceMedia.filter(reference => reference.type === "image").map(reference => reference.dataUri), ...runningHubYouchuanReferenceImages(runningHubYouchuan)]);
  if (payloadError) throw payloadTooLarge(payloadError);
  if (modelCapability) validateInputModalityReferences(modelCapability.inputModalities, referenceMedia);

  const allowsEmptyPrompt = runningHubResolvedNodeInfoAllowsEmptyPrompt(parsed.model, "image", runningHubNodeInfo);
  const config = resolveBrowserProviderConfig(headers, parsed.provider, signal);
  const result = await generateImage(config, {
    prompt: allowsEmptyPrompt ? optionalText(record.prompt) ?? "" : requireApiText(record.prompt, "Prompt"),
    model: parsed.model,
    aspectRatio,
    imageResolution,
    imageQuality,
    thinkingLevel: optionalText(record.thinkingLevel),
    referenceImages: referenceMedia.filter(reference => reference.type === "image").map(reference => ({ dataUri: reference.dataUri })),
    referenceMedia,
    async: parsed.async,
    runningHubAccessPassword: optionalText(record.runningHubAccessPassword),
    runningHubNodeInfoList: runningHubNodeInfo.nodeInfoList,
    runningHubYouchuan,
  });
  return normalizeGeneratedImageResult(result);
}

async function generateVideoForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const record = jsonRecord(body);
  const modelValue = optionalText(record.model) ?? DEFAULT_VIDEO_MODEL;
  const parsed = parseProviderModel(modelValue, "12ai");
  const isRunningHubVideoTask = parsed.provider === "runninghub" && isRunningHubTaskTarget(parsed.model, "video");
  const modelCapability = isRunningHubVideoTask ? null : getModelCapability(modelValue, "video");
  const referenceMedia = readVideoReferenceMedia(record.referenceMedia, record.images, record.image, record.lastFrame);
  const explicitRunningHubNodeInfoList = readRunningHubNodeInfoList(record.runningHubNodeInfoList);
  const runningHubNodeInfo = resolveRunningHubNodeInfoListForModel(parsed.model, explicitRunningHubNodeInfoList);
  const formatError = getReferenceMediaFormatError(referenceMedia);
  if (formatError) throw badRequest(formatError, "invalid_reference_media");
  const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
  if (payloadError) throw payloadTooLarge(payloadError);
  if (modelCapability) validateInputModalityReferences(modelCapability.inputModalities, referenceMedia);

  const allowsEmptyPrompt = runningHubResolvedNodeInfoAllowsEmptyPrompt(parsed.model, "video", runningHubNodeInfo);
  return generateVideo(resolveBrowserProviderConfig(headers, parsed.provider, signal), {
    prompt: allowsEmptyPrompt ? optionalText(record.prompt) ?? "" : requireApiText(record.prompt, "Prompt"),
    model: parsed.model,
    aspectRatio: optionalText(record.aspectRatio) ?? "16:9",
    durationSeconds: optionalText(record.durationSeconds),
    preset: optionalText(record.preset),
    referenceMode: readReferenceMode(record.referenceMode),
    resolutionName: optionalText(record.resolutionName),
    referenceMedia,
    runningHubAccessPassword: optionalText(record.runningHubAccessPassword),
    runningHubNodeInfoList: runningHubNodeInfo.nodeInfoList,
  });
}

async function generateAudioOperationForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const parsedBody = audioGenerateBodySchema.parse(body);
  if (parsedBody.voiceProfileId) {
    throw badRequest("Voice profile IDs must be resolved before calling audio generation", "unresolved_voice_profile");
  }
  const parsed = parseProviderModel(parsedBody.model, "mimo");
  const runningHubNodeInfoList = readRunningHubNodeInfoList(parsedBody.runningHubNodeInfoList) ?? [];
  if (isRunningHubWorkflowAudioTarget(parsedBody.model, runningHubNodeInfoList) || runningHubNodeInfoList.length > 0) {
    throw badRequest("RunningHub workflow audio must use /api/media/generate-audio-workflow", "invalid_audio_route");
  }
  const referenceMedia = readReferenceMedia(parsedBody.referenceMedia, []);
  const capability = getOptionalModelCapability(parsedBody.model, "audio");
  if (!capability) throw badRequest("Unknown audio model capability", "invalid_audio_model");
  if (!capability.audioModes.includes(parsedBody.mode)) throw badRequest("Selected audio model does not support this operation mode", "unsupported_audio_mode");
  if (parsedBody.mode === "voice_clone" && parsedBody.voiceCloneConsentAccepted !== true) {
    throw badRequest("Voice cloning requires confirming reference audio authorization first", "voice_clone_consent_required");
  }
  const formatError = getReferenceMediaFormatError(referenceMedia);
  if (formatError) throw badRequest(formatError, "invalid_reference_media");
  validateInputModalityReferences(capability.inputModalities, referenceMedia);
  const parameterValues = readAudioParameterValues(parsedBody.parameterValues, capability.parameterDescriptors);
  const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
  if (payloadError) throw payloadTooLarge(payloadError);

  return generateAudioOperation(resolveBrowserProviderConfig(headers, parsed.provider, signal, {
    credentialScope: isSeedAudioProviderModel(parsed.provider, parsed.model) ? "audio" : "default",
  }), {
    mode: parsedBody.mode,
    prompt: parsedBody.mode === "asr" ? optionalText(parsedBody.prompt) ?? "" : requireApiText(parsedBody.prompt, "Prompt"),
    model: parsed.model,
    referenceMedia,
    asrLanguage: parsedBody.asrLanguage,
    format: parsedBody.format,
    parameterValues,
    stylePrompt: parsedBody.stylePrompt,
    voice: parsedBody.voice,
    voiceCloneConsentAccepted: parsedBody.voiceCloneConsentAccepted,
    optimizeTextPreview: parsedBody.optimizeTextPreview,
    runningHubAccessPassword: optionalText(parsedBody.runningHubAccessPassword),
    runningHubNodeInfoList,
  });
}

function getSeedAudioBrowserRouteModel(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("model" in body)) return null;
  const model = body.model;
  if (typeof model !== "string") return null;
  const parsed = tryParseProviderModel(model, "mimo");
  if (!parsed || !isSeedAudioProviderModel(parsed.provider, parsed.model)) return null;
  return formatProviderModel(parsed.provider, parsed.model);
}

async function generateAudioWorkflowForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const record = jsonRecord(body);
  const modelValue = requireApiText(record.model, "model");
  const parsed = parseProviderModel(modelValue, "runninghub");
  if (parsed.provider !== "runninghub") throw badRequest("Audio AI App generation currently supports RunningHub targets only", "invalid_audio_workflow_provider");
  const referenceMedia = readReferenceMedia(record.referenceMedia, []);
  const formatError = getReferenceMediaFormatError(referenceMedia);
  if (formatError) throw badRequest(formatError, "invalid_reference_media");
  const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
  if (payloadError) throw payloadTooLarge(payloadError);
  const runningHubNodeInfoList = readRunningHubNodeInfoList(record.runningHubNodeInfoList) ?? [];
  if (!isRunningHubWorkflowAudioTarget(modelValue, runningHubNodeInfoList)) {
    throw badRequest("RunningHub workflow audio route requires runninghub:ai-app-audio:* or runninghub:workflow-audio:*", "invalid_audio_workflow_model");
  }
  return generateAudio(resolveBrowserProviderConfig(headers, parsed.provider, signal), {
    prompt: runningHubNodeInfoList.length > 0 ? optionalText(record.prompt) ?? "" : requireApiText(record.prompt, "Prompt"),
    model: parsed.model,
    referenceMedia,
    runningHubAccessPassword: optionalText(record.runningHubAccessPassword),
    runningHubNodeInfoList,
  });
}

async function getMediaStatusForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const record = jsonRecord(body);
  const operation = parseMediaOperationName(requireApiText(record.operationName, "operationName"));
  const config = resolveBrowserProviderConfig(headers, operation.provider, signal);
  if (operation.mediaType === "image") return getAsyncImageStatus(config, operation.id);
  if (operation.mediaType === "audio") return getAudioStatus(config, operation.id);
  return getVideoStatus(config, operation.id, optionalText(record.model));
}

async function downloadImageForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<Response> {
  const record = jsonRecord(body);
  const operation = parseMediaOperationName(requireApiText(record.operationName, "operationName"));
  if (operation.mediaType !== "image") throw badRequest("Only image operations can be downloaded", "invalid_media_type");
  return downloadImage(resolveBrowserProviderConfig(headers, operation.provider, signal), operation.id, optionalOutputIndex(record.outputIndex));
}

async function downloadVideoForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<Response> {
  const record = jsonRecord(body);
  const operation = parseMediaOperationName(requireApiText(record.operationName, "operationName"));
  if (operation.mediaType !== "video") throw badRequest("Only video operations can be downloaded", "invalid_media_type");
  return downloadVideo(resolveBrowserProviderConfig(headers, operation.provider, signal), operation.id, optionalText(record.model), optionalOutputIndex(record.outputIndex));
}

async function downloadAudioForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<Response> {
  const record = jsonRecord(body);
  const operation = parseMediaOperationName(requireApiText(record.operationName, "operationName"));
  if (operation.mediaType !== "audio") throw badRequest("Only audio operations can be downloaded", "invalid_media_type");
  return downloadAudio(resolveBrowserProviderConfig(headers, operation.provider, signal), operation.id, optionalOutputIndex(record.outputIndex));
}

async function cancelMediaForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const record = jsonRecord(body);
  const operation = parseMediaOperationName(requireApiText(record.operationName, "operationName"));
  if (operation.provider !== "12ai" || operation.mediaType !== "video") {
    throw badRequest("Only 12AI video tasks can be canceled", "unsupported_cancel_operation");
  }
  await cancelVideo(resolveBrowserProviderConfig(headers, operation.provider, signal), operation.id);
  return { success: true };
}

async function editImageForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const record = jsonRecord(body);
  const operation = imageEditOperationSchema.parse(record.operation);
  const modelValue = requireApiText(record.model, "model");
  const image = requireApiText(record.image, "image");
  const prompt = optionalText(record.prompt);
  if (imageEditPromptRequiredOperations.has(operation) && !prompt) {
    throw badRequest("prompt is required for this image edit operation", "missing_required_field");
  }
  const mask = optionalText(record.mask);
  const guide = optionalText(record.guide);
  const payloadError = getReferenceImagePayloadError([image, ...(mask ? [mask] : []), ...(guide ? [guide] : [])]);
  if (payloadError) throw payloadTooLarge(payloadError);
  const parsed = parseProviderModel(modelValue, "12ai");
  if (parsed.provider === "runninghub") {
    throw badRequest("RunningHub quick image edits require /api/media/generate-image with an image-to-image Standard Model, AI App, or workflow target", "unsupported_image_edit_provider");
  }
  const imageResolution = optionalText(record.imageResolution) ?? "auto";
  if (imageResolution === "custom") {
    throw badRequest("imageResolution custom must be resolved to a concrete size before image editing", "unsupported_image_resolution");
  }
  const config = resolveBrowserProviderConfig(headers, parsed.provider, signal);
  const result = await editImage(config, {
    operation,
    prompt,
    model: parsed.model,
    image: { dataUri: image },
    ...(mask ? { mask: { dataUri: mask } } : {}),
    ...(guide ? { guide: { dataUri: guide } } : {}),
    imageResolution,
    imageQuality: optionalText(record.imageQuality),
  });
  return normalizeGeneratedImageResult(result);
}

async function optimizePromptForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const record = jsonRecord(body);
  const prompt = requireApiText(record.prompt, "Prompt");
  const modelValue = optionalText(record.model) ?? headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
  const parsed = parseProviderModel(modelValue, "12ai");
  const optimized = await createChatCompletionText(
    resolveBrowserProviderConfig(headers, parsed.provider, signal),
    parsed.model,
    [
      {
        role: "system",
        content:
          "You are an expert prompt engineer for AI image and video models. Expand short prompts into a concise, high-fidelity English visual prompt. Include subject, style, lighting, camera language, composition, and color palette. Do not use generic hype words like photorealistic, ultra realistic, hyperdetailed, or 8K. Return only the rewritten prompt.",
      },
      { role: "user", content: `Prompt to expand: "${prompt}"` },
    ],
    0.85,
  );
  return { optimized };
}

async function generateBoardPromptTextForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const parsedBody = promptTextBodySchema.parse(body);
  const modelValue = parsedBody.model ?? headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
  const parsed = parseProviderModel(modelValue, "12ai");
  const text = (await createChatCompletionText(
    resolveBrowserProviderConfig(headers, parsed.provider, signal),
    parsed.model,
    buildPromptTextMessages(parsedBody),
    0.75,
  )).trim();
  if (!text) throw new Error("Prompt text generation returned no content");
  return { text };
}

async function respondAgentForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const parsedBody = agentBodySchema.parse(body);
  const messages: ChatMessageInput[] = parsedBody.messages.map(message => ({
    role: message.role,
    content: message.content,
  }));
  const galleryItems = parsedBody.gallerySummary;
  const surface: AgentSurface = parsedBody.surface;
  const modelValue = parsedBody.model ?? headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
  const parsed = parseProviderModel(modelValue, "12ai");
  const sendableAgentRefs = getSendableAgentMediaReferences(parsedBody.agentReferences, parsedBody.agentReferenceId, undefined);
  const responseLanguage = agentResponseLanguage(parsedBody.locale);
  const referenceMsg = sendableAgentRefs.length > 0
    ? `\n[USER REFERENCES]\n${sendableAgentRefs
        .map((item, index) => `- Ref [${index + 1}]: ${mediaReferenceLabel(getMediaReferenceType(item))} ID "${item.id}"`)
        .join("\n")}\n`
    : "";
  const contextSummary = formatAgentRuntimeSummary(surface, parsedBody.boardContext, galleryItems, sendableAgentRefs);
  const boardMsg = surface === "board"
    ? "\n## Board Surface\n" +
      "The user is operating a spatial board. Read board details progressively: call get_board_context(summary) for broad board questions and get_connected_context for selected-node work.\n" +
      "For board mutations, prefer boardAction over recommendedAction. Do not invent a general DAG or ComfyUI workflow.\n" +
      "Allowed boardAction.type values: none, create_board_image_flow, create_board_video_flow, create_board_audio_flow, create_board_note, update_board_node, apply_board_patch, continue_image_to_video.\n" +
      "When selectedNodeIds/selectedNodes are present, treat them as the current board context and default target. The Runtime Summary includes lightweight selected node params. Call get_board_context({scope:\"selected_full\"}) only when exact advanced selected-node settings are needed. Do not pull connected nodes into scope unless the user asks or a tool result explicitly shows them.\n" +
      "create_board_image_flow/create_board_video_flow/create_board_audio_flow should include params.prompt except ASR transcription, and may include params.model, params.aspectRatio, params.referenceImageId, params.run. Audio actions may include params.audioMode, params.audioFormat, params.audioStylePrompt, params.voiceProfileId, params.voiceCloneConsentAccepted, params.asrLanguage.\n" +
      "For audio board planning, only use audio-operation functions returned by query_models({kind:\"audio\"}). Seed Audio uses one generate mode for speech, music, sound effects, ambience, and mixtures; describe the content in prompt and attach optional supported audio/image references. MiMo uses tts, voice_design, voice_clone, and asr. RunningHub audio belongs to RunningHub AI App / Workflow nodes, not audio-operation nodes.\n" +
      "Use update_board_node when the user asks to revise the selected/current board node or a specific node. Include params.nodeId when known; otherwise omit it to target the current selection. Use params.prompt for Prompt and generation nodes, params.body for Note nodes, and params.instruction for Agent nodes. If no target can be resolved, return boardAction.type none and ask the user to select a node.\n" +
      "Use apply_board_patch for multi-shot storyboard plans. Put the plan in params.boardPatch.operations. Allowed operations are create_node, update_node, connect_ports. Use tempId for created nodes and refer to it from later connect_ports operations. Keep patches to 36 operations or fewer; split larger scripts into follow-ups. Default params.boardPatch.run to false unless the user explicitly asks to run generation.\n" +
      "Use continue_image_to_video only when the target is an existing image asset or completed image generation result. Include params.nodeId when known, plus params.prompt and a video params.model.\n"
    : "\n## Workbench Surface\nUse recommendedAction for normal workstation actions. Keep boardAction.type as none.\n";
  const systemInstruction =
    "You are the senior Creative Agent of the Imagine Workbench.\n" +
    "Collaborate with the user on visual creative projects and recommend exactly one executable action when useful.\n\n" +
    "## Context Policy\n" +
    "Use progressive disclosure. Start from the user's latest message and the Runtime Summary. Do not assume full gallery, board, model, or skill details.\n" +
    "When the user asks what you can do or which tools you have, call get_agent_capabilities and answer without recommending an executable action unless they explicitly ask you to do one.\n" +
    "Before selecting a model or explaining model parameters, call query_models for the relevant kind. Use only returned model IDs.\n" +
    "Only call get_gallery_assets when prior generated assets matter. Only call board context tools when the board structure matters.\n\n" +
    "## Tools\n" +
    "Use tool calls to inspect Agent capabilities, skills, model capabilities, gallery assets, board context, and templates.\n" +
    "- Call get_agent_capabilities for Agent/tool/capability questions.\n" +
    "- Call get_skill_info before activating a skill whose details matter.\n" +
    "- Call query_models before recommending a generation model.\n" +
    "- Call get_gallery_assets when the user references previous assets.\n\n" +
    "## Audio Planning\n" +
    "For script or video-production requests, plan audio as first-class media only through supported audio functions returned by query_models({kind:\"audio\"}). Seed Audio uses audioMode generate for all supported audio content; express speech, music, sound effects, ambience, or mixtures in prompt and use optional supported references. MiMo narration/dialogue uses tts, described custom voices use voice_design with audioStylePrompt, authorized reference-voice work uses voice_clone with an audio reference, and transcription uses asr with an audio reference. Do not split Seed Audio into TTS/music/SFX/clone modes or invent RunningHub audio-operation capabilities.\n\n" +
    "- On board surface, call get_board_context or get_connected_context before returning boardAction.\n" +
    "- Call get_prompt_blueprint with screenplay-draft, script-analysis, shot-breakdown, or storyboard-board-patch when the user asks for script/storyboard workflow planning.\n" +
    "- Call get_prompt_templates when the user asks for reusable prompt templates.\n\n" +
    "## Language Policy\n" +
    `Write user-facing reply fields in ${responseLanguage}: thought, text, suggestedFollowUps, boardPatch.title, note body, and Agent/node instructions meant for the user.\n` +
    "Keep generation prompt fields in English by default: params.prompt, imagePrompt, videoPrompt, audioStylePrompt, and prompt fields inside boardPatch operations.\n" +
    "Only include non-English words inside generation prompt fields when the user explicitly asks for exact text to appear in generated media.\n\n" +
    boardMsg +
    "\n" +
    "## Runtime Summary\n" +
    `${contextSummary}\n\n` +
    "## Output\n" +
    "Return ONLY valid JSON:\n" +
    '{"thought":"...","text":"User-facing reply","activeSkills":["..."],"recommendedAction":{"type":"none|optimize_prompt|generate_image|edit_image|generate_video|generate_audio","params":{"prompt":"...","model":"...","aspectRatio":"...","referenceImageId":"...","imageResolution":"...","imageQuality":"...","thinkingLevel":"...","videoResolution":"...","videoDuration":"...","videoPreset":"...","videoReferenceMode":"reference|firstLast","audioMode":"generate|tts|voice_design|voice_clone|music|asr","audioFormat":"wav","audioStylePrompt":"...","voiceProfileId":"...","voiceCloneConsentAccepted":true}},"boardAction":{"type":"none|create_board_image_flow|create_board_video_flow|create_board_audio_flow|create_board_note|update_board_node|apply_board_patch|continue_image_to_video","params":{"nodeId":"...","prompt":"...","model":"...","aspectRatio":"...","referenceImageId":"...","imageResolution":"...","imageQuality":"...","thinkingLevel":"...","videoResolution":"...","videoDuration":"...","videoPreset":"...","videoReferenceMode":"reference|firstLast","audioMode":"generate|tts|voice_design|voice_clone|music|asr","audioFormat":"wav","audioStylePrompt":"...","voiceProfileId":"...","voiceCloneConsentAccepted":true,"title":"...","body":"...","instruction":"...","boardPatch":{"title":"...","run":false,"shots":[{"id":"S1","scene":"...","shot":"...","beat":"...","imagePrompt":"...","videoPrompt":"...","run":false}],"operations":[{"op":"create_node","tempId":"shot1_prompt","kind":"prompt","title":"S1 Prompt","prompt":"...","position":{"x":120,"y":160}},{"op":"create_node","tempId":"shot1_audio","kind":"audio-operation","title":"S1 Audio","prompt":"...","model":"...","audioMode":"tts","audioFormat":"wav","run":false,"position":{"x":520,"y":160}},{"op":"connect_ports","from":{"nodeId":"shot1_prompt","portId":"prompt-out","portKind":"prompt"},"to":{"nodeId":"shot1_audio","portId":"prompt-in","portKind":"prompt"}}]},"run":true}},"suggestedFollowUps":["...","..."]}\n\n' +
    referenceMsg;
  try {
    const config = resolveBrowserProviderConfig(headers, parsed.provider, signal);
    const tools = getAgentTools();
    const toolCtx: ToolContext = { boardContext: parsedBody.boardContext, galleryItems };
    const { payload, toolCalls } = await runAgentLoop(
      config,
      parsed.model,
      systemInstruction,
      buildAgentMessages(messages, sendableAgentRefs),
      tools,
      toolCtx,
      parsedBody.locale,
    );
    const parsedResponse = agentResponseSchema.parse(payload);
    parsedResponse.thought ??= defaultAgentThought(parsedBody.locale);
    parsedResponse.text ??= defaultAgentText(parsedBody.locale);
    if (toolCalls.length === 0 && mentionsKnownToolName(parsedResponse, tools)) {
      parsedResponse.thought = missingToolCallThought(parsedBody.locale);
    }
    validateActionModel(parsedResponse.recommendedAction);
    validateActionModel(parsedResponse.boardAction);
    if (surface === "board") {
      parsedResponse.recommendedAction = { type: "none" };
    } else {
      parsedResponse.boardAction = { type: "none" };
    }
    parsedResponse.activeSkills = validateActiveSkills(parsedResponse.activeSkills);

    if (parsedResponse.activeSkills.length === 0 && hasExecutableAgentAction(parsedResponse.recommendedAction, parsedResponse.boardAction)) {
      parsedResponse.activeSkills = surface === "board"
        ? ["BoardContextRetriever", "BoardComposer"]
        : ["PromptEngineer", "ImageGenerator"];
    }

    return { ...parsedResponse, toolCalls };
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof ProviderModelParseError) throw error;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Browser BYOK Agent interaction failure:", error);
    return {
      thought: agentServiceFailureThought(parsedBody.locale),
      text: agentServiceFailureText(message, parsedBody.locale),
      activeSkills: ["PromptEngineer"],
      recommendedAction: { type: "none" as const },
      suggestedFollowUps: agentServiceFailureFollowUps(parsedBody.locale),
    };
  }
}

async function getRunningHubAiAppSchemaForBrowser(headers: Headers, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  const webappId = requireRunningHubWebappId(jsonRecord(body).webappId);
  return fetchRunningHubAiAppSchema(resolveBrowserProviderConfig(headers, "runninghub", signal), webappId);
}

async function listModelsForBrowser(headers: Headers, url: URL, signal: AbortSignal | undefined): Promise<unknown> {
  const provider = readProvider(url, headers);
  const kind = readKind(url);
  const models = await listProviderModels(resolveBrowserProviderConfig(headers, provider, signal, {
    credentialScope: provider === "volcengine" && kind === "audio" ? "audio" : "default",
  }), kind);
  return { models, kind, source: "provider" };
}

function resolveBrowserProviderConfig(
  headers: Headers,
  provider: AiProvider,
  signal: AbortSignal | undefined,
  options: ResolveProviderConfigOptions = {},
): ProviderConfig {
  return {
    ...resolveProviderConfig(new Request("https://imagine-workbench.local", { headers }), provider, options),
    signal,
  };
}

function routeUrl(input: RequestInfo | URL): URL | null {
  if (typeof window === "undefined") return null;
  const url = typeof input === "string"
    ? new URL(input, window.location.origin)
    : input instanceof URL
      ? input
      : new URL(input.url, window.location.origin);
  return url.origin === window.location.origin ? url : null;
}

async function readJsonBody(init: RequestInit | undefined): Promise<unknown> {
  if (!init?.body) return {};
  if (typeof init.body !== "string") throw badRequest("Browser BYOK route body must be JSON text", "invalid_request_body");
  return JSON.parse(init.body);
}

async function jsonTask(task: Promise<unknown>): Promise<Response> {
  return jsonResponse(await task);
}

function withAbort<T>(signal: AbortSignal | null | undefined, task: Promise<T>): Promise<T> {
  if (!signal) return task;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function jsonRecord(value: unknown): BrowserJsonBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("Request body must be an object", "invalid_request_body");
  }
  return value as BrowserJsonBody;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

function errorResponse(error: unknown): Response {
  const normalized = audioOperationApiError(error) ?? error;
  if (normalized instanceof z.ZodError) {
    return jsonResponse({ error: normalized.message, code: "invalid_request", details: normalized.issues }, { status: 400 });
  }
  if (normalized instanceof ProviderModelParseError) {
    return jsonResponse({ error: normalized.message, code: "invalid_provider_model" }, { status: 400 });
  }
  if (normalized instanceof ModelCapabilityValidationError) {
    return jsonResponse({ error: normalized.message, code: "invalid_reference_media" }, { status: 400 });
  }
  const response = apiErrorResponse(normalized, "Browser BYOK provider request failed");
  return jsonResponse(response.body, { status: response.status });
}

function normalizeGeneratedImageResult(result: GenerateImageResult): GenerateImageResult & { imageUrls: string[] } {
  const imageUrls = result.imageUrls ?? (result.imageUrl ? [result.imageUrl] : []);
  const normalizedImageUrls = imageUrls.map(normalizeBrowserImageResultUrl);
  return {
    ...result,
    imageUrl: normalizedImageUrls[0] ?? result.imageUrl,
    imageUrls: normalizedImageUrls,
  };
}

export function normalizeBrowserImageResultUrl(imageUrl: string): string {
  if (imageUrl.startsWith("data:")) return imageUrl;
  return assertPublicHttpUrl(imageUrl, "unsafe_image_result_url").toString();
}

function readReferenceImages(referenceImages: unknown, referenceImage: unknown): string[] {
  if (Array.isArray(referenceImages)) {
    return referenceImages.filter((value): value is string => typeof value === "string" && value.length > 0);
  }
  if (typeof referenceImage === "string" && referenceImage.length > 0) return [referenceImage];
  return [];
}

function readReferenceMedia(referenceMedia: unknown, fallbackImages: string[]): ReferenceMedia[] {
  if (Array.isArray(referenceMedia) && referenceMedia.length > 0) {
    return referenceMedia.map(readReferenceMediaValue).filter((reference): reference is ReferenceMedia => reference !== null);
  }
  return fallbackImages.map(dataUri => ({ dataUri, type: "image" }));
}

function readVideoReferenceMedia(referenceMedia: unknown, images: unknown, image: unknown, lastFrame: unknown): ReferenceMedia[] {
  if (Array.isArray(referenceMedia) && referenceMedia.length > 0) {
    return referenceMedia.map(readReferenceMediaValue).filter((reference): reference is ReferenceMedia => reference !== null);
  }
  if (Array.isArray(images) && images.length > 0) {
    return images.filter((value): value is string => typeof value === "string" && value.length > 0).map(readReferenceMediaItem);
  }
  const refs: string[] = [];
  if (typeof image === "string" && image.length > 0) refs.push(image);
  if (typeof lastFrame === "string" && lastFrame.length > 0) refs.push(lastFrame);
  return refs.map(readReferenceMediaItem);
}

function readReferenceMediaValue(value: unknown): ReferenceMedia | null {
  if (typeof value === "string" && value.length > 0) return readReferenceMediaItem(value);
  if (typeof value !== "object" || value === null || !("dataUri" in value)) return null;
  const dataUri = value.dataUri;
  if (typeof dataUri !== "string" || dataUri.length === 0) return null;
  return readReferenceMediaItem(dataUri);
}

function readReferenceMediaItem(dataUri: string): ReferenceMedia {
  const type = mediaReferenceTypeFromBase64DataUri(dataUri);
  if (!type) return { dataUri, type: "image" };
  return { dataUri, type };
}

function getReferenceMediaFormatError(referenceMedia: ReferenceMedia[]): string | null {
  for (const reference of referenceMedia) {
    const actualType = mediaReferenceTypeFromBase64DataUri(reference.dataUri);
    if (!actualType) return "Reference media must be data:image/*, data:video/* or data:audio/* base64 data URIs";
  }
  return null;
}

function readAudioParameterValues(
  value: unknown,
  descriptors: Parameters<typeof validateCapabilityParameterValues>[0],
): ReturnType<typeof validateCapabilityParameterValues> {
  try {
    return validateCapabilityParameterValues(descriptors, readModelParameterValues(value));
  } catch (error) {
    if (error instanceof ModelCapabilityValidationError) {
      throw badRequest(error.message, "invalid_audio_parameter");
    }
    throw error;
  }
}

function readReferenceMode(value: unknown): "reference" | "firstLast" | undefined {
  return value === "reference" || value === "firstLast" ? value : undefined;
}

function optionalOutputIndex(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw badRequest("outputIndex must be a non-negative integer", "invalid_output_index");
  }
  return value;
}

function resolveImageResolution(modelValue: string, aspectRatio: string, imageResolution: string | undefined): string {
  const options = getImageResolutionOptions(modelValue, aspectRatio);
  if (options.length === 0) return imageResolution ?? "auto";
  if (!imageResolution) throw badRequest("imageResolution is required for this image model", "missing_required_field");
  if (imageResolution === "custom") throw badRequest("imageResolution custom must be resolved to a concrete size before image generation", "unsupported_image_resolution");
  if (options.some(option => option.value === imageResolution)) return imageResolution;
  if (options.some(option => option.value === "custom") && isValidCustomImageResolution(imageResolution, aspectRatio)) return imageResolution;
  throw badRequest(`Unsupported imageResolution "${imageResolution}" for aspectRatio "${aspectRatio}"`, "unsupported_image_resolution");
}

function resolveImageQuality(modelValue: string, imageQuality: string | undefined): string | undefined {
  if (!imageQuality) return undefined;
  const capabilities = getImageModelCapabilities(modelValue);
  if (capabilities.qualities.some(option => option.value === imageQuality)) return imageQuality;
  throw badRequest(`Unsupported imageQuality "${imageQuality}" for this image model`, "unsupported_image_quality");
}

function isValidCustomImageResolution(value: string, aspectRatio: string): boolean {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width > 3840 || height > 3840) return false;
  if (width % 16 !== 0 || height % 16 !== 0) return false;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (longSide / shortSide > 3) return false;
  const pixels = width * height;
  return pixels >= 655360 && pixels <= 8294400 && pixelSizeAspectRatio(width, height) === aspectRatio;
}

function customImageSizeAspectRatio(value: string | undefined): string | null {
  if (!value || !/^\d+x\d+$/.test(value)) return null;
  const [widthText, heightText] = value.split("x");
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  return pixelSizeAspectRatio(width, height);
}

function pixelSizeAspectRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = a;
  let right = b;
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

function readRunningHubYouchuanAdvancedSettings(value: unknown, model: string): RunningHubYouchuanAdvancedSettings | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw badRequest("runningHubYouchuan must be an object", "invalid_runninghub_youchuan");
  const catalog = getRunningHubYouchuanCatalog(model);
  if (!catalog) throw badRequest("runningHubYouchuan is only supported for Youchuan image models", "invalid_runninghub_youchuan");
  const record = value as Record<string, unknown>;
  const settings: Partial<RunningHubYouchuanAdvancedSettings> = {};
  for (const param of catalog.numericParams) {
    const next = record[param.field];
    if (next !== undefined && (typeof next !== "number" || !Number.isFinite(next) || next < param.min || next > param.max)) {
      throw badRequest(`runningHubYouchuan.${param.field} must be a number from ${param.min} to ${param.max}`, "invalid_runninghub_youchuan");
    }
    Object.assign(settings, { [param.field]: next ?? param.defaultValue });
  }
  for (const param of catalog.booleanParams) {
    const next = record[param.field];
    if (next !== undefined && typeof next !== "boolean") {
      throw badRequest(`runningHubYouchuan.${param.field} must be a boolean`, "invalid_runninghub_youchuan");
    }
    Object.assign(settings, { [param.field]: next ?? param.defaultValue });
  }
  for (const param of catalog.referenceParams) {
    const next = record[param.field];
    if (next === undefined) continue;
    if (typeof next !== "string" || (!next.startsWith("data:image/") && !next.startsWith("http://") && !next.startsWith("https://"))) {
      throw badRequest(`runningHubYouchuan.${param.field} must be an image URL or data URI`, "invalid_runninghub_youchuan");
    }
    Object.assign(settings, { [param.field]: next });
  }
  return settings as RunningHubYouchuanAdvancedSettings;
}

function runningHubYouchuanReferenceImages(settings: RunningHubYouchuanAdvancedSettings | undefined): string[] {
  return [settings?.sref, settings?.oref].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function createMediaContentPart(reference: { type?: MediaReferenceType; url: string }): ChatContentPart | null {
  const type = getMediaReferenceType(reference);
  if (type === "image") return { type: "image_url", image_url: { url: reference.url } };
  if (type === "video") return { type: "video_url", video_url: { url: reference.url } };
  const audio = parseAgentAudioDataUrl(reference.url);
  return audio ? { type: "input_audio", input_audio: audio } : null;
}

function buildPromptTextMessages(body: z.infer<typeof promptTextBodySchema>): ChatMessageInput[] {
  const outputLanguage = body.locale === "zh" ? "Simplified Chinese" : "English";
  const mediaParts = getSendableAgentMediaReferences(body.references)
    .map(createMediaContentPart)
    .filter((part): part is ChatContentPart => part !== null);
  const userContent: string | ChatContentPart[] = mediaParts.length > 0
    ? [{ type: "text", text: body.prompt }, ...mediaParts]
    : body.prompt;
  return [
    {
      role: "system",
      content: [
        "You generate plain text for an Imagine Workbench board Note.",
        "Use the user's prompt as the task instruction and use attached media only as reference context.",
        `If the user does not specify an output language, write in ${outputLanguage}.`,
        "Return only the final note body. Do not return JSON, markdown fences, tool actions, or explanations about your process.",
      ].join("\n"),
    },
    { role: "user", content: userContent },
  ];
}

function buildAgentMessages(messages: ChatMessageInput[], references: AgentReferenceInput[]): ChatMessageInput[] {
  const mediaParts = references
    .filter(reference => reference.url.length > 0)
    .map(createMediaContentPart)
    .filter((part): part is ChatContentPart => part !== null);
  if (mediaParts.length === 0) return messages;
  return messages.map((message, index) => {
    if (index !== messages.length - 1 || message.role !== "user" || typeof message.content !== "string") return message;
    return { role: message.role, content: [{ type: "text", text: message.content }, ...mediaParts] };
  });
}

function agentResponseLanguage(locale: AgentLocale): string {
  return locale === "zh" ? "Simplified Chinese" : "English";
}

function defaultAgentThought(locale: AgentLocale): string {
  return locale === "zh" ? "已分析当前创作上下文。" : "Analyzed the current creative context.";
}

function defaultAgentText(locale: AgentLocale): string {
  return locale === "zh" ? "我已准备好下一步建议操作。" : "I have prepared the next recommended action.";
}

function agentServiceFailureThought(locale: AgentLocale): string {
  return locale === "zh" ? "Agent 服务请求失败。" : "Agent provider request failed.";
}

function agentServiceFailureText(message: string, locale: AgentLocale): string {
  return locale === "zh" ? `Agent 服务请求失败：${message}` : `Agent service request failed: ${message}`;
}

function agentServiceFailureFollowUps(locale: AgentLocale): string[] {
  return locale === "zh"
    ? ["检查 API Key 和 Base URL", "切换到经典创作模式"]
    : ["Check API Key and Base URL", "Switch to classic creation mode"];
}

function missingToolCallThought(locale: AgentLocale): string {
  return locale === "zh"
    ? "模型提到了工具名，但没有返回正式工具调用；本轮没有执行工具。"
    : "The model mentioned a tool name but did not return a formal tool call; no tool was executed.";
}

function mentionsKnownToolName(
  response: z.infer<typeof agentResponseSchema>,
  tools: ReturnType<typeof getAgentTools>,
): boolean {
  const content = `${response.thought ?? ""}\n${response.text ?? ""}`;
  return tools.some(tool => content.includes(tool.function.name));
}

function hasExecutableAgentAction(
  recommendedAction: z.infer<typeof agentActionSchema>,
  boardAction: z.infer<typeof agentBoardActionSchema>,
): boolean {
  return recommendedAction.type !== "none" || boardAction.type !== "none";
}

function formatAgentRuntimeSummary(
  surface: AgentSurface,
  boardContext: AgentBoardContext | undefined,
  galleryItems: Array<{ type: string }>,
  references: AgentReferenceInput[],
): string {
  const galleryCounts = countValues(galleryItems.map(item => item.type));
  const referenceCounts = countValues(references.map(reference => getMediaReferenceType(reference)));
  const boardSummary = boardContext
    ? {
        boardId: boardContext.boardId,
        edgeCount: boardContext.edges.length,
        nodeCount: boardContext.nodes.length,
        nodeKinds: countValues(boardContext.nodes.map(node => node.kind)),
        selectedAssetReferenceCount: boardContext.selectedAssetReferenceCount,
        selectedEdgeId: boardContext.selectedEdgeId,
        selectedNodeId: boardContext.selectedNodeId,
        selectedNodeIds: boardContext.selectedNodeIds,
        selectedNodeKinds: countValues(boardContext.selectedNodes.map(node => node.kind)),
        selectedNodes: boardContext.selectedNodes,
        title: boardContext.title,
      }
    : null;

  return JSON.stringify({
    surface,
    board: boardSummary,
    gallery: {
      count: galleryItems.length,
      types: galleryCounts,
    },
    userReferences: {
      count: references.length,
      types: referenceCounts,
    },
  });
}

function countValues(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

async function runAgentLoop(
  config: ProviderConfig,
  model: string,
  systemInstruction: string,
  userMessages: ChatMessageInput[],
  tools: ReturnType<typeof getAgentTools>,
  toolCtx: ToolContext,
  locale: AgentLocale,
): Promise<{ payload: unknown; toolCalls: AgentToolCallSummary[] }> {
  const conversation: ChatMessageInput[] = [
    { role: "system", content: systemInstruction },
    ...userMessages,
  ];
  const toolCallLog: AgentToolCallSummary[] = [];
  const toolResultCache = new Map<string, string>();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await createChatCompletionWithTools(
      config,
      model,
      conversation,
      tools,
      0.75,
      AGENT_CHAT_RESPONSE_OPTIONS,
    );
    const choice = completion.choices?.[0];
    if (!choice) throw new Error("Chat completion returned no choices");

    const requestedCalls = choice.message.tool_calls;
    if (requestedCalls && requestedCalls.length > 0) {
      conversation.push({ role: "assistant", content: null, tool_calls: requestedCalls });
      for (const toolCall of requestedCalls) {
        const signature = toolCallSignature(toolCall.function.name, toolCall.function.arguments);
        const cachedResult = toolResultCache.get(signature);
        const result = cachedResult ?? executeToolCall(toolCall.function.name, toolCall.function.arguments, toolCtx);
        if (!cachedResult) {
          toolResultCache.set(signature, result);
          toolCallLog.push({
            name: toolCall.function.name,
            args: readToolCallArgs(toolCall.function.arguments),
          });
        }
        conversation.push({ role: "tool", tool_call_id: toolCall.id, content: result });
      }
      continue;
    }

    return { payload: parseAgentPayloadText(readContent(choice.message.content), locale), toolCalls: toolCallLog };
  }

  const final = await createChatCompletionText(config, model, conversation, 0.75, AGENT_CHAT_RESPONSE_OPTIONS);
  return { payload: parseAgentPayloadText(final, locale), toolCalls: toolCallLog };
}

function toolCallSignature(name: string, args: string): string {
  return `${name}\n${args}`;
}

function readToolCallArgs(args: string): Record<string, unknown> {
  const parsed = JSON.parse(args) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function parseAgentPayloadText(text: string, locale: AgentLocale): unknown {
  try {
    return parseJsonObjectText(text);
  } catch (error) {
    if (!(error instanceof ChatJsonParseError) || error.kind !== "missing") throw error;
    const fallbackText = text.trim();
    return {
      thought: locale === "zh" ? "模型返回了纯文本，而不是 Agent JSON。" : "Provider returned plain text instead of Agent JSON.",
      text: fallbackText || (locale === "zh" ? "我收到了模型回复，但它没有返回可执行的 Agent JSON。" : "I received the model response, but it did not return executable Agent JSON."),
      activeSkills: [],
      recommendedAction: { type: "none" },
      boardAction: { type: "none" },
      suggestedFollowUps: [],
    };
  }
}

function readContent(value: string | null): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error("Agent returned empty response");
}

function requireRunningHubWebappId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw badRequest("webappId is required", "missing_required_field");
  const webappId = value.trim();
  if (!/^\d{12,}$/.test(webappId)) throw badRequest("webappId must be a RunningHub AI App numeric id", "invalid_webapp_id");
  return webappId;
}

function readProvider(url: URL, headers: Headers): AiProvider {
  const raw = url.searchParams.get("provider") ?? headers.get("x-ai-provider");
  if (!raw) return "12ai";
  if (isProviderKey(raw)) return raw;
  throw badRequest("provider must be a valid provider key", "invalid_provider");
}

function readKind(url: URL): ModelKindFilter {
  const kind = url.searchParams.get("kind");
  if (!kind) return "chat";
  if (kind === "chat" || kind === "image" || kind === "video" || kind === "audio" || kind === "all") return kind;
  throw badRequest("kind must be one of all, chat, image, video, or audio", "invalid_model_kind");
}
