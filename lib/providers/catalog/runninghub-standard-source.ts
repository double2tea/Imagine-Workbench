import type { MediaReferenceType } from "@/lib/media-references";
import type { JsonValue, ProviderPayloadFieldMappingDescriptor, ProviderPayloadMappingDescriptor } from "../model-capabilities";
import type { AudioOperationMode } from "../model-catalog";

export type RunningHubStandardModelKind = "image" | "video" | "audio";

export interface RunningHubStandardModelSource {
  model: string;
  label: string;
  kind: RunningHubStandardModelKind;
  listed?: boolean;
  supportsReferences: boolean;
  minReferenceImages: number;
  maxReferenceImages: number;
  referenceCounts?: {
    images?: { minCount: number; maxCount: number };
    videos?: { minCount: number; maxCount: number };
    audio?: { minCount: number; maxCount: number };
  };
  videoReferenceMode?: "reference" | "firstLast";
  videoReferenceModes?: readonly ("reference" | "firstLast")[];
  referenceMediaTypes?: readonly MediaReferenceType[];
  sizeOptions?: readonly string[];
  durationOptions?: readonly string[];
  resolutionOptions?: readonly string[];
  audioModes?: readonly AudioOperationMode[];
  audioFormatOptions?: readonly string[];
  referenceRoutes?: {
    imageToImage?: string;
    imageToVideo?: string;
    firstLast?: string;
    reference?: string;
  };
  request: RunningHubStandardRequest;
}

const SEEDANCE_15_DURATIONS = ["4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
const SEEDANCE_20_DURATIONS = ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const SEEDANCE_15_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const SEEDANCE_15_FAST_RESOLUTIONS = ["720p", "1080p"] as const;
const SEEDANCE_20_FAST_RESOLUTIONS = ["480p", "720p", "1080p", "2k", "4k"] as const;
const SEEDANCE_20_GLOBAL_RESOLUTIONS = ["480p", "720p", "native1080p", "1080p", "2k", "4k"] as const;
const VIDEOX_15_DURATIONS = [
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
] as const;
const VIDEOX_15_RESOLUTIONS = ["720p", "480p"] as const;
const VEO_31_DURATIONS = ["4", "6", "8"] as const;
const VEO_31_CHANNEL_DURATIONS = ["8"] as const;
const VEO_31_4K_RESOLUTIONS = ["720p", "1080p", "4k"] as const;
const VEO_31_HD_RESOLUTIONS = ["720p", "1080p"] as const;
const SEEDREAM_V5_LITE_IMAGE_RESOLUTIONS = ["2k", "3k"] as const;
const RUNNINGHUB_GROK_IMAGE_ASPECT_RATIOS = ["960x960", "720x1280", "1280x720", "1168x784", "784x1168"] as const;
const RUNNINGHUB_Z_IMAGE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;

type RunningHubStandardRequest =
  | {
      type: "mapped-fields";
      endpoint: string;
      operation?: ProviderPayloadMappingDescriptor["operation"];
      fields: readonly RunningHubMappedField[];
    }
  | {
      type: "prompt-dimensions";
      endpoint: string;
      extra?: Record<string, unknown>;
      referenceField?: "imageUrls";
      dimensionMode?: "pixel" | "resolution";
      resolutionField?: "resolution";
    }
  | {
      type: "grok-image";
      endpoint: string;
      model: string;
      referenceField?: "imageUrl";
      aspectField?: "aspectRatio";
      aspectRatioOptions?: readonly string[];
    }
  | {
      type: "node-dimensions";
      endpoint: string;
      promptField: string;
      widthField?: string;
      heightField?: string;
      extra: Record<string, unknown>;
    }
  | {
      type: "hailuo-video";
      endpoint: string;
      requiresReference?: boolean;
    }
  | {
      type: "seedance-video";
      endpoint: string;
      durations: readonly string[];
      aspectField: "aspectRatio" | "ratio";
      extra: Record<string, unknown>;
    }
  | {
      type: "aspect-resolution-video";
      endpoint: string;
      durations: readonly string[];
      aspectField: "aspectRatio" | "ratio";
      durationValueType?: "string" | "number";
      extra?: Record<string, unknown>;
    }
  | {
      type: "image-reference-video";
      endpoint: string;
      durations?: readonly string[];
      referenceField: "imageUrls" | "imageUrl" | "firstFrameUrl" | "firstImageUrl";
      referenceValue?: "single" | "array";
      lastReferenceField?: "lastFrameUrl" | "lastImageUrl";
      videoField?: "videoUrls" | "videoUrl";
      audioField?: "audioUrls";
      aspectField?: "aspectRatio" | "ratio";
      durationValueType?: "string" | "number";
      omitResolution?: boolean;
      extra?: Record<string, unknown>;
    }
  | {
      type: "aspect-resolution-image";
      endpoint: string;
      resolution: string;
      aspectRatioFallback?: string;
      quality?: string;
      referenceField?: "imageUrls";
      extra?: Record<string, unknown>;
    }
  | {
      type: "youchuan-image";
      endpoint: string;
      extra: Record<string, unknown>;
      aspectField?: "aspectRatio";
      qualityField?: "quality";
      referenceField?: "imageUrl";
    };

type RunningHubMappedField =
  | {
      target: string;
      source: "prompt" | "aspectRatio" | "imageResolution" | "imageQuality" | "resolutionName" | "durationSeconds";
      valueType?: "string" | "number" | "boolean" | "array" | "object";
      defaultValue?: string | number | boolean;
      omitAuto?: boolean;
      allowedValues?: readonly string[];
      dimensionAxis?: "width" | "height";
      durationValueType?: "string" | "number";
    }
  | {
      target: string;
      source: "imageUrls" | "videoUrls" | "audioUrls";
      valueType?: "string" | "array";
      index?: number;
    }
  | {
      target: string;
      source: "literal";
      literal: JsonValue;
      valueType?: "string" | "number" | "boolean" | "array" | "object";
    };

type RunningHubMappedScalarSource = "prompt" | "aspectRatio" | "imageResolution" | "imageQuality" | "resolutionName" | "durationSeconds";

const QWEN_IMAGE_20_SIZES = [
  "1024*1024",
  "1536*1536",
  "768*1152",
  "1024*1536",
  "1152*768",
  "1536*1024",
  "960*1280",
  "1080*1440",
  "1280*960",
  "1440*1080",
  "720*1280",
  "1080*1920",
  "1280*720",
  "1920*1080",
  "1344*576",
  "2048*872",
] as const;
const WAN_27_IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536", "1536x1536", "2048x2048"] as const;
const WAN_27_VIDEO_DURATIONS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const WAN_27_SHORT_VIDEO_DURATIONS = ["2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
const WAN_27_VIDEO_RESOLUTIONS = ["720P", "1080P"] as const;
const WAN_27_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const KLING_VIDEO_DURATIONS = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const KLING_VIDEO_ASPECT_RATIOS = ["1:1", "16:9", "9:16"] as const;
const KLING_O3_DURATIONS = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const PIXVERSE_V6_RESOLUTIONS = ["360p", "540p", "720p", "1080p"] as const;
const PIXVERSE_V6_DURATIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const PIXVERSE_V6_ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"] as const;
const HAILUO_SHORT_DURATIONS = ["6", "10"] as const;
const HAILUO_PRO_DURATIONS = ["6"] as const;
const MINIMAX_VIDEO_DURATIONS = ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const MINIMAX_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9", "adaptive"] as const;
const MINIMAX_VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const MINIMAX_FAST_VIDEO_RESOLUTIONS = ["480p", "720p"] as const;
const MINIMAX_AUDIO_FORMATS = ["mp3", "wav", "pcm"] as const;

type MappedStandardModelInput = Omit<RunningHubStandardModelSource, "model" | "request"> & {
  endpoint: string;
  operation?: ProviderPayloadMappingDescriptor["operation"];
  fields: readonly RunningHubMappedField[];
};

function apiModel(endpoint: string): string {
  return `api:/openapi/v2/${endpoint}`;
}

function mappedStandardModel(input: MappedStandardModelInput): RunningHubStandardModelSource {
  return {
    ...input,
    model: apiModel(input.endpoint),
    request: {
      type: "mapped-fields",
      endpoint: `/openapi/v2/${input.endpoint}`,
      operation: input.operation,
      fields: input.fields,
    },
  };
}

function promptField(target = "prompt"): RunningHubMappedField {
  return { target, source: "prompt", valueType: "string" };
}

function literalField(target: string, literal: JsonValue): RunningHubMappedField {
  return { target, source: "literal", literal };
}

function optionField(
  target: string,
  source: Extract<RunningHubMappedScalarSource, "aspectRatio" | "imageResolution" | "resolutionName" | "durationSeconds">,
  defaultValue: string,
  allowedValues: readonly string[],
  durationValueType?: "string" | "number",
): RunningHubMappedField {
  return { target, source, valueType: "string", defaultValue, allowedValues, durationValueType };
}

function dimensionOptionField(
  target: string,
  defaultValue: string,
  allowedValues: readonly string[],
  dimensionAxis: "width" | "height",
): RunningHubMappedField {
  return { target, source: "imageResolution", valueType: "number", defaultValue, allowedValues, dimensionAxis };
}

function mediaField(target: string, source: "imageUrls" | "videoUrls" | "audioUrls", valueType: "string" | "array", index?: number): RunningHubMappedField {
  return { target, source, valueType, index };
}

function qwenImageFields(references: boolean): readonly RunningHubMappedField[] {
  return [
    ...(references ? [mediaField("imageUrls", "imageUrls", "array")] : []),
    promptField(),
    optionField("size", "imageResolution", "1024*1024", QWEN_IMAGE_20_SIZES),
    literalField("imageNum", "1"),
    ...(references ? [] : [literalField("promptExtend", true)]),
  ];
}

function wanImageFields(references: boolean): readonly RunningHubMappedField[] {
  return [
    ...(references ? [mediaField("imageUrls", "imageUrls", "array")] : []),
    promptField(),
    dimensionOptionField("width", "1024", WAN_27_IMAGE_SIZES, "width"),
    dimensionOptionField("height", "1024", WAN_27_IMAGE_SIZES, "height"),
    ...(references ? [] : [literalField("thinkingMode", true)]),
  ];
}

function klingVideoFields(references: "none" | "firstLast" | "single" | "reference" | "edit", durationValueType: "string" | "number" = "string"): readonly RunningHubMappedField[] {
  return [
    promptField(),
    ...(references === "firstLast" ? [mediaField("firstImageUrl", "imageUrls", "string", 0), mediaField("lastImageUrl", "imageUrls", "string", 1)] : []),
    ...(references === "single" ? [mediaField("imageUrl", "imageUrls", "string", 0)] : []),
    ...(references === "reference" ? [mediaField("imageUrls", "imageUrls", "array"), mediaField("videoUrl", "videoUrls", "string", 0)] : []),
    ...(references === "edit" ? [mediaField("videoUrl", "videoUrls", "string", 0), mediaField("imageUrls", "imageUrls", "array")] : []),
    optionField("aspectRatio", "aspectRatio", "16:9", KLING_VIDEO_ASPECT_RATIOS),
    optionField("duration", "durationSeconds", "5", durationValueType === "number" ? KLING_O3_DURATIONS : KLING_VIDEO_DURATIONS, durationValueType),
    literalField("sound", true),
    literalField("multiShot", false),
    literalField("shotType", "customize"),
  ];
}

function wanVideoFields(references: "none" | "firstLast" | "reference" | "edit" | "extend" | "single", durations: readonly string[] = WAN_27_VIDEO_DURATIONS): readonly RunningHubMappedField[] {
  return [
    promptField(),
    ...(references === "firstLast" ? [mediaField("firstImageUrl", "imageUrls", "string", 0), mediaField("lastImageUrl", "imageUrls", "string", 1)] : []),
    ...(references === "reference" || references === "edit" ? [mediaField("imageUrls", "imageUrls", "array"), mediaField("videoUrls", "videoUrls", "array"), mediaField("audioUrl", "audioUrls", "string", 0)] : []),
    ...(references === "extend" ? [mediaField("videoUrl", "videoUrls", "string", 0), mediaField("audioUrl", "audioUrls", "string", 0)] : []),
    ...(references === "single" ? [mediaField("imageUrl", "imageUrls", "string", 0), mediaField("audioUrl", "audioUrls", "string", 0)] : []),
    optionField("resolution", "resolutionName", "720P", WAN_27_VIDEO_RESOLUTIONS),
    optionField("duration", "durationSeconds", "5", durations),
    ...(references === "firstLast" || references === "extend" || references === "single" ? [] : [optionField("aspectRatio", "aspectRatio", "16:9", WAN_27_VIDEO_ASPECT_RATIOS)]),
    literalField("promptExtend", true),
  ];
}

function pixverseVideoFields(references: "none" | "single" | "transition" | "effects" | "extend"): readonly RunningHubMappedField[] {
  return [
    promptField(),
    ...(references === "single" || references === "effects" ? [mediaField(references === "effects" ? "imageUrls" : "imageUrl", "imageUrls", references === "effects" ? "array" : "string", 0)] : []),
    ...(references === "transition" ? [mediaField("firstImageUrl", "imageUrls", "string", 0), mediaField("endImageUrl", "imageUrls", "string", 1)] : []),
    ...(references === "extend" ? [mediaField("videoUrl", "videoUrls", "string", 0)] : []),
    optionField(references === "effects" ? "quality" : "resolution", "resolutionName", "720p", PIXVERSE_V6_RESOLUTIONS),
    optionField("duration", "durationSeconds", "5", PIXVERSE_V6_DURATIONS, "number"),
    ...(references === "single" || references === "effects" || references === "extend" ? [] : [optionField("aspectRatio", "aspectRatio", "16:9", PIXVERSE_V6_ASPECT_RATIOS)]),
    ...(references === "effects" ? [literalField("templateId", "hug") ] : []),
    literalField("generateAudioSwitch", true),
  ];
}

function minimaxVideoFields(references: "none" | "firstLast" | "single" | "multi", resolutions: readonly string[] = MINIMAX_VIDEO_RESOLUTIONS): readonly RunningHubMappedField[] {
  return [
    promptField(),
    ...(references === "firstLast" ? [mediaField("firstFrameUrl", "imageUrls", "string", 0), mediaField("lastFrameUrl", "imageUrls", "string", 1)] : []),
    ...(references === "single" ? [mediaField("imageUrl", "imageUrls", "string", 0)] : []),
    ...(references === "multi" ? [
      mediaField("firstFrameUrl", "imageUrls", "string", 0),
      mediaField("lastFrameUrl", "imageUrls", "string", 1),
      mediaField("imageUrls", "imageUrls", "array"),
      mediaField("videoUrl", "videoUrls", "string", 0),
      mediaField("audioUrl", "audioUrls", "string", 0),
    ] : []),
    optionField("resolution", "resolutionName", "720p", resolutions),
    optionField("duration", "durationSeconds", "5", MINIMAX_VIDEO_DURATIONS),
    optionField("ratio", "aspectRatio", "16:9", MINIMAX_VIDEO_ASPECT_RATIOS),
    literalField("generateAudio", true),
  ];
}

function minimaxTtsFields(): readonly RunningHubMappedField[] {
  return [
    promptField("text"),
    literalField("voice_id", "Wise_Woman"),
    literalField("speed", 1),
    literalField("volume", 1),
    literalField("pitch", 0),
    literalField("emotion", "happy"),
    literalField("enable_base64_output", false),
    literalField("english_normalization", false),
  ];
}

const RUNNINGHUB_PRIORITY_STANDARD_MODELS: readonly RunningHubStandardModelSource[] = [
  mappedStandardModel({
    endpoint: "alibaba/qwen-image-2.0/text-to-image",
    label: "RunningHub Qwen Image 2.0 Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 3,
    resolutionOptions: QWEN_IMAGE_20_SIZES,
    referenceRoutes: { imageToImage: apiModel("alibaba/qwen-image-2.0/image-edit") },
    operation: "promptDimensions",
    fields: qwenImageFields(false),
  }),
  mappedStandardModel({
    endpoint: "alibaba/qwen-image-2.0/image-edit",
    label: "RunningHub Qwen Image 2.0 Image Edit",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
    resolutionOptions: QWEN_IMAGE_20_SIZES,
    operation: "referenceArray",
    fields: qwenImageFields(true),
  }),
  mappedStandardModel({
    endpoint: "alibaba/qwen-image-2.0-pro/text-to-image",
    label: "RunningHub Qwen Image 2.0 Pro Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 3,
    resolutionOptions: QWEN_IMAGE_20_SIZES,
    referenceRoutes: { imageToImage: apiModel("alibaba/qwen-image-2.0-pro/image-edit") },
    operation: "promptDimensions",
    fields: qwenImageFields(false),
  }),
  mappedStandardModel({
    endpoint: "alibaba/qwen-image-2.0-pro/image-edit",
    label: "RunningHub Qwen Image 2.0 Pro Image Edit",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
    resolutionOptions: QWEN_IMAGE_20_SIZES,
    operation: "referenceArray",
    fields: qwenImageFields(true),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/text-to-image",
    label: "RunningHub Wan 2.7 Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 9,
    resolutionOptions: WAN_27_IMAGE_SIZES,
    referenceRoutes: { imageToImage: apiModel("alibaba/wan-2.7/image-edit") },
    operation: "promptDimensions",
    fields: wanImageFields(false),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/image-edit",
    label: "RunningHub Wan 2.7 Image Edit",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 9,
    resolutionOptions: WAN_27_IMAGE_SIZES,
    operation: "referenceArray",
    fields: wanImageFields(true),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/text-to-image-pro",
    label: "RunningHub Wan 2.7 Pro Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 9,
    resolutionOptions: WAN_27_IMAGE_SIZES,
    referenceRoutes: { imageToImage: apiModel("alibaba/wan-2.7/image-edit-pro") },
    operation: "promptDimensions",
    fields: wanImageFields(false),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/image-edit-pro",
    label: "RunningHub Wan 2.7 Pro Image Edit",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 9,
    resolutionOptions: WAN_27_IMAGE_SIZES,
    operation: "referenceArray",
    fields: wanImageFields(true),
  }),
  ...[
    ["kling-v3.0-std/text-to-video", "RunningHub Kling V3.0 Std Text-to-Video", "none", "string"] as const,
    ["kling-v3.0-pro/text-to-video", "RunningHub Kling V3.0 Pro Text-to-Video", "none", "string"] as const,
    ["kling-v3-4k/text-to-video", "RunningHub Kling V3 4K Text-to-Video", "none", "string"] as const,
    ["kling-video-o3-std/text-to-video", "RunningHub Kling O3 Std Text-to-Video", "none", "number"] as const,
    ["kling-video-o3-pro/text-to-video", "RunningHub Kling O3 Pro Text-to-Video", "none", "number"] as const,
    ["kling-video-o3-4k/text-to-video", "RunningHub Kling O3 4K Text-to-Video", "none", "number"] as const,
  ].map(([endpoint, label, references, durationValueType]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 7,
    referenceRoutes: { imageToVideo: apiModel(endpoint.replace("text-to-video", "image-to-video")) },
    durationOptions: durationValueType === "number" ? KLING_O3_DURATIONS : KLING_VIDEO_DURATIONS,
    sizeOptions: KLING_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: klingVideoFields(references, durationValueType),
  })),
  ...[
    ["kling-v3.0-std/image-to-video", "RunningHub Kling V3.0 Std Image-to-Video", "firstLast", "string"] as const,
    ["kling-v3.0-pro/image-to-video", "RunningHub Kling V3.0 Pro Image-to-Video", "firstLast", "string"] as const,
    ["kling-v3-4k/image-to-video", "RunningHub Kling V3 4K Image-to-Video", "single", "number"] as const,
    ["kling-video-o3-std/image-to-video", "RunningHub Kling O3 Std Image-to-Video", "firstLast", "number"] as const,
    ["kling-video-o3-pro/image-to-video", "RunningHub Kling O3 Pro Image-to-Video", "firstLast", "number"] as const,
    ["kling-video-o3-4k/image-to-video", "RunningHub Kling O3 4K Image-to-Video", "firstLast", "number"] as const,
  ].map(([endpoint, label, references, durationValueType]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: references === "firstLast" ? 2 : 1,
    videoReferenceMode: "firstLast",
    videoReferenceModes: ["firstLast"],
    referenceMediaTypes: ["image"],
    durationOptions: durationValueType === "number" ? KLING_O3_DURATIONS : KLING_VIDEO_DURATIONS,
    sizeOptions: KLING_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: klingVideoFields(references, durationValueType),
  })),
  ...[
    ["kling-video-o3-std/reference-to-video", "RunningHub Kling O3 Std Reference-to-Video"] as const,
    ["kling-video-o3-pro/reference-to-video", "RunningHub Kling O3 Pro Reference-to-Video"] as const,
    ["kling-video-o3-4k/reference-to-video", "RunningHub Kling O3 4K Reference-to-Video"] as const,
  ].map(([endpoint, label]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 7,
    referenceMediaTypes: ["image", "video"],
    durationOptions: KLING_O3_DURATIONS,
    sizeOptions: KLING_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: klingVideoFields("reference", "number"),
  })),
  ...[
    ["kling-v3.0-std/motion-control", "RunningHub Kling V3.0 Std Motion Control"] as const,
    ["kling-v3.0-pro/motion-control", "RunningHub Kling V3.0 Pro Motion Control"] as const,
  ].map(([endpoint, label]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
    referenceMediaTypes: ["image", "video"],
    referenceCounts: {
      images: { minCount: 1, maxCount: 1 },
      videos: { minCount: 1, maxCount: 1 },
    },
    operation: "providerSpecific",
    fields: [
      mediaField("imageUrl", "imageUrls", "string", 0),
      mediaField("videoUrl", "videoUrls", "string", 0),
      promptField(),
      literalField("characterOrientation", "image"),
      literalField("keepOriginalSound", true),
    ],
  })),
  ...[
    ["kling-video-o3-std/video-edit", "RunningHub Kling O3 Std Video Edit"] as const,
    ["kling-video-o3-pro/video-edit", "RunningHub Kling O3 Pro Video Edit"] as const,
  ].map(([endpoint, label]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 5,
    referenceMediaTypes: ["image", "video"],
    referenceCounts: {
      images: { minCount: 0, maxCount: 4 },
      videos: { minCount: 1, maxCount: 1 },
    },
    operation: "providerSpecific",
    fields: [
      promptField(),
      mediaField("videoUrl", "videoUrls", "string", 0),
      mediaField("imageUrls", "imageUrls", "array"),
      literalField("keepOriginalSound", true),
    ],
  })),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/text-to-video",
    label: "RunningHub Wan 2.7 Text-to-Video",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 2,
    referenceRoutes: { imageToVideo: apiModel("alibaba/wan-2.7/image-to-video"), reference: apiModel("alibaba/wan-2.7/reference-to-video") },
    durationOptions: WAN_27_VIDEO_DURATIONS,
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    sizeOptions: WAN_27_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: wanVideoFields("none"),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/image-to-video",
    label: "RunningHub Wan 2.7 Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
    videoReferenceModes: ["firstLast"],
    referenceMediaTypes: ["image", "audio"],
    durationOptions: WAN_27_VIDEO_DURATIONS,
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    operation: "providerSpecific",
    fields: wanVideoFields("firstLast"),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/reference-to-video",
    label: "RunningHub Wan 2.7 Reference-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 10,
    referenceMediaTypes: ["image", "video", "audio"],
    durationOptions: WAN_27_SHORT_VIDEO_DURATIONS,
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    sizeOptions: WAN_27_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: wanVideoFields("reference", WAN_27_SHORT_VIDEO_DURATIONS),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/video-edit",
    label: "RunningHub Wan 2.7 Video Edit",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 4,
    referenceMediaTypes: ["image", "video"],
    durationOptions: ["0", ...WAN_27_SHORT_VIDEO_DURATIONS],
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    sizeOptions: WAN_27_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: wanVideoFields("edit", ["0", ...WAN_27_SHORT_VIDEO_DURATIONS]),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/video-extend",
    label: "RunningHub Wan 2.7 Video Extend",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    referenceMediaTypes: ["video", "audio"],
    durationOptions: WAN_27_VIDEO_DURATIONS,
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    operation: "providerSpecific",
    fields: wanVideoFields("extend"),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7-spicy/image-to-video",
    label: "RunningHub Wan 2.7 Spicy Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    referenceMediaTypes: ["image", "audio"],
    durationOptions: WAN_27_VIDEO_DURATIONS,
    resolutionOptions: ["720p", "1080p"],
    operation: "providerSpecific",
    fields: wanVideoFields("single"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/text-to-video",
    label: "RunningHub PixVerse V6 Text-to-Video",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 4,
    referenceRoutes: { imageToVideo: apiModel("pixverse-v6/image-to-video") },
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    sizeOptions: PIXVERSE_V6_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("none"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/image-to-video",
    label: "RunningHub PixVerse V6 Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    referenceMediaTypes: ["image"],
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("single"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/transition",
    label: "RunningHub PixVerse V6 Transition",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
    referenceMediaTypes: ["image"],
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    sizeOptions: PIXVERSE_V6_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("transition"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/effects",
    label: "RunningHub PixVerse V6 Effects",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 4,
    referenceMediaTypes: ["image"],
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("effects"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/extend",
    label: "RunningHub PixVerse V6 Extend",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    referenceMediaTypes: ["video"],
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("extend"),
  }),
  ...[
    ["minimax/hailuo-02/t2v-pro", "RunningHub Hailuo 02 Text-to-Video Pro", HAILUO_PRO_DURATIONS] as const,
    ["minimax/hailuo-2.3/t2v-standard", "RunningHub Hailuo 2.3 Text-to-Video Standard", HAILUO_SHORT_DURATIONS] as const,
    ["minimax/hailuo-2.3/t2v-pro", "RunningHub Hailuo 2.3 Text-to-Video Pro", HAILUO_PRO_DURATIONS] as const,
  ].map(([endpoint, label, durations]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 2,
    referenceRoutes: {
      imageToVideo: apiModel(endpoint === "minimax/hailuo-2.3/t2v-pro"
        ? "minimax/hailuo-2.3/image-to-video-pro"
        : endpoint.replace("t2v", "i2v").replace("text-to-video", "image-to-video")),
    },
    durationOptions: durations,
    operation: "providerSpecific",
    fields: [promptField(), optionField("duration", "durationSeconds", durations[0], durations), literalField("enablePromptExpansion", true)],
  })),
  ...[
    ["minimax/hailuo-02/i2v-pro", "RunningHub Hailuo 02 Image-to-Video Pro", "firstLast", HAILUO_PRO_DURATIONS] as const,
    ["minimax/hailuo-2.3/i2v-standard", "RunningHub Hailuo 2.3 Image-to-Video Standard", "single", HAILUO_SHORT_DURATIONS] as const,
    ["minimax/hailuo-2.3/image-to-video-pro", "RunningHub Hailuo 2.3 Image-to-Video Pro", "single", HAILUO_PRO_DURATIONS] as const,
    ["minimax/hailuo-2.3-fast/image-to-video", "RunningHub Hailuo 2.3 Fast Image-to-Video", "single", HAILUO_SHORT_DURATIONS] as const,
    ["minimax/hailuo-2.3-fast-pro/image-to-video", "RunningHub Hailuo 2.3 Fast Pro Image-to-Video", "single", HAILUO_PRO_DURATIONS] as const,
    ["minimax/hailuo-02/fast", "RunningHub Hailuo 02 Fast Image-to-Video", "single", HAILUO_SHORT_DURATIONS] as const,
  ].map(([endpoint, label, referenceMode, durations]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: referenceMode === "firstLast" ? 2 : 1,
    videoReferenceMode: referenceMode === "firstLast" ? "firstLast" : "reference",
    videoReferenceModes: referenceMode === "firstLast" ? ["firstLast"] : ["reference"],
    referenceMediaTypes: ["image"],
    durationOptions: durations,
    operation: "providerSpecific",
    fields: [
      promptField(),
      ...(referenceMode === "firstLast" ? [mediaField("firstImageUrl", "imageUrls", "string", 0), mediaField("lastImageUrl", "imageUrls", "string", 1)] : [mediaField("imageUrl", "imageUrls", "string", 0)]),
      optionField("duration", "durationSeconds", durations[0], durations),
      literalField("enablePromptExpansion", true),
    ],
  })),
  ...[
    ["minimax/nova-video-2.0/text-to-video", "RunningHub MiniMax Nova Video 2.0 Text-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/nova-video-2.0-fast/text-to-video", "RunningHub MiniMax Nova Video 2.0 Fast Text-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0/text-to-video", "RunningHub MiniMax EVA Video 2.0 Text-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0-fast/text-to-video", "RunningHub MiniMax EVA Video 2.0 Fast Text-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
  ].map(([endpoint, label, resolutions]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 5,
    referenceRoutes: { imageToVideo: apiModel(endpoint.replace("text-to-video", "image-to-video")), reference: apiModel(endpoint.replace("text-to-video", "multimodal-to-video")) },
    durationOptions: MINIMAX_VIDEO_DURATIONS,
    resolutionOptions: resolutions,
    sizeOptions: MINIMAX_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: minimaxVideoFields("none", resolutions),
  })),
  ...[
    ["minimax/nova-video-2.0/image-to-video", "RunningHub MiniMax Nova Video 2.0 Image-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/nova-video-2.0-fast/image-to-video", "RunningHub MiniMax Nova Video 2.0 Fast Image-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0/image-to-video", "RunningHub MiniMax EVA Video 2.0 Image-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0-fast/image-to-video", "RunningHub MiniMax EVA Video 2.0 Fast Image-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
  ].map(([endpoint, label, resolutions]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
    videoReferenceModes: ["firstLast"],
    referenceMediaTypes: ["image"],
    durationOptions: MINIMAX_VIDEO_DURATIONS,
    resolutionOptions: resolutions,
    sizeOptions: MINIMAX_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: minimaxVideoFields("firstLast", resolutions),
  })),
  ...[
    ["minimax/nova-video-2.0/multimodal-to-video", "RunningHub MiniMax Nova Video 2.0 Multimodal-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/nova-video-2.0-fast/multimodal-to-video", "RunningHub MiniMax Nova Video 2.0 Fast Multimodal-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0/multimodal-to-video", "RunningHub MiniMax EVA Video 2.0 Multimodal-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0-fast/multimodal-to-video", "RunningHub MiniMax EVA Video 2.0 Fast Multimodal-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
  ].map(([endpoint, label, resolutions]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 5,
    referenceMediaTypes: ["image", "video", "audio"],
    durationOptions: MINIMAX_VIDEO_DURATIONS,
    resolutionOptions: resolutions,
    sizeOptions: MINIMAX_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: minimaxVideoFields("multi", resolutions),
  })),
  ...[
    ["rhart-audio/text-to-audio/speech-2.8-hd", "RunningHub MiniMax Speech 2.8 HD"] as const,
    ["rhart-audio/text-to-audio/speech-02-hd", "RunningHub MiniMax Speech 02 HD"] as const,
    ["rhart-audio/text-to-audio/speech-2.8-turbo", "RunningHub MiniMax Speech 2.8 Turbo"] as const,
    ["rhart-audio/text-to-audio/speech-02-turbo", "RunningHub MiniMax Speech 02 Turbo"] as const,
    ["rhart-audio/text-to-audio/speech-2.6-hd", "RunningHub MiniMax Speech 2.6 HD"] as const,
    ["rhart-audio/text-to-audio/speech-2.6-turbo", "RunningHub MiniMax Speech 2.6 Turbo"] as const,
  ].map(([endpoint, label]) => mappedStandardModel({
    endpoint,
    label,
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["tts"],
    audioFormatOptions: ["mp3"],
    operation: "providerSpecific",
    fields: minimaxTtsFields(),
  })),
  mappedStandardModel({
    endpoint: "rhart-audio/text-to-audio/voice-clone",
    label: "RunningHub MiniMax Voice Clone",
    kind: "audio",
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    referenceMediaTypes: ["audio"],
    audioModes: ["voice_clone"],
    audioFormatOptions: ["mp3"],
    operation: "providerSpecific",
    fields: [
      mediaField("audio", "audioUrls", "string", 0),
      promptField("text"),
      literalField("custom_voice_id", "Elegant_Man"),
      literalField("accuracy", 0.7),
      literalField("need_noise_reduction", false),
      literalField("need_volume_normalization", false),
      literalField("model", "speech-02-hd"),
    ],
  }),
  mappedStandardModel({
    endpoint: "minimax/voice-design",
    label: "RunningHub MiniMax Voice Design",
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["voice_design"],
    audioFormatOptions: ["mp3"],
    operation: "providerSpecific",
    fields: [
      promptField(),
      literalField("previewText", "漂亮！一个精彩的过人！他带球突破，射门——球进了！不可思议的进球，他再次拯救了队伍！"),
      literalField("aigcWatermark", false),
    ],
  }),
  mappedStandardModel({
    endpoint: "rhart-audio/text-to-audio/music-2.5",
    label: "RunningHub MiniMax Music 2.5 Text-to-Music",
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["music"],
    audioFormatOptions: ["mp3"],
    operation: "providerSpecific",
    fields: [
      promptField(),
      literalField("lyrics", "[Verse] 心早有预感 光速地飙燃 浑然不知山前的悬崖 生而无惧是少年"),
      literalField("sampleRate", "44100"),
      literalField("bitrate", "256000"),
    ],
  }),
  mappedStandardModel({
    endpoint: "minimax/music-2.6/text-to-music",
    label: "RunningHub MiniMax Music 2.6 Text-to-Music",
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["music"],
    audioFormatOptions: MINIMAX_AUDIO_FORMATS,
    operation: "providerSpecific",
    fields: [
      promptField(),
      literalField("lyrics", "[Verse] 心早有预感 光速地飙燃 浑然不知山前的悬崖 生而无惧是少年"),
      literalField("sampleRate", "44100"),
      literalField("bitrate", "256000"),
      literalField("format", "mp3"),
      literalField("lyricsOptimizer", false),
    ],
  }),
  mappedStandardModel({
    endpoint: "minimax/music-2.6/text-to-instrumental",
    label: "RunningHub MiniMax Music 2.6 Text-to-Instrumental",
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["music"],
    audioFormatOptions: MINIMAX_AUDIO_FORMATS,
    operation: "providerSpecific",
    fields: [
      promptField(),
      literalField("sampleRate", "44100"),
      literalField("bitrate", "256000"),
      literalField("format", "mp3"),
    ],
  }),
];

export const RUNNINGHUB_STANDARD_MODELS: readonly RunningHubStandardModelSource[] = [
  ...RUNNINGHUB_PRIORITY_STANDARD_MODELS,
  {
    model: "api:/openapi/v2/seedream-v5-lite/text-to-image",
    label: "RunningHub Seedream V5 Lite Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 10,
    resolutionOptions: SEEDREAM_V5_LITE_IMAGE_RESOLUTIONS,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/seedream-v5-lite/image-to-image",
    },
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/seedream-v5-lite/text-to-image",
      dimensionMode: "resolution",
      resolutionField: "resolution",
      extra: {
        sequentialImageGeneration: "disabled",
        maxImages: 1,
      },
    },
  },
  {
    model: "api:/openapi/v2/seedream-v5-lite/image-to-image",
    label: "RunningHub Seedream V5 Lite Image-to-Image",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 10,
    resolutionOptions: SEEDREAM_V5_LITE_IMAGE_RESOLUTIONS,
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/seedream-v5-lite/image-to-image",
      referenceField: "imageUrls",
      dimensionMode: "resolution",
      resolutionField: "resolution",
      extra: {
        sequentialImageGeneration: "disabled",
        maxImages: 1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/jimeng-4.6/text-to-image",
    label: "RunningHub Jimeng 4.6 Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 16,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/bytedance/jimeng-4.6/image-to-image",
    },
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/bytedance/jimeng-4.6/text-to-image",
      extra: {
        scale: 50,
        forceSingle: false,
        minRatio: 0.333333,
        maxRatio: 3,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/jimeng-4.6/image-to-image",
    label: "RunningHub Jimeng 4.6 Image-to-Image",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 14,
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/bytedance/jimeng-4.6/image-to-image",
      referenceField: "imageUrls",
      extra: {
        scale: 50,
        forceSingle: false,
        minRatio: 0.333333,
        maxRatio: 3,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-g/text-to-image",
    label: "RunningHub Grok Image 4.2 Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 1,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-g/image-to-image",
    },
    request: {
      type: "grok-image",
      endpoint: "/openapi/v2/rhart-image-g/text-to-image",
      model: "g-4.2",
      aspectField: "aspectRatio",
      aspectRatioOptions: RUNNINGHUB_GROK_IMAGE_ASPECT_RATIOS,
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-g/image-to-image",
    label: "RunningHub Grok Image 4.2 Image-to-Image",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    request: {
      type: "grok-image",
      endpoint: "/openapi/v2/rhart-image-g/image-to-image",
      model: "g-4.2",
      referenceField: "imageUrl",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image/z-image/turbo",
    label: "RunningHub Z-Image Turbo",
    kind: "image",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    request: {
      type: "mapped-fields",
      endpoint: "/openapi/v2/rhart-image/z-image/turbo",
      fields: [
        promptField(),
        optionField("aspectRatio", "aspectRatio", "1:1", RUNNINGHUB_Z_IMAGE_ASPECT_RATIOS),
      ],
    },
  },
  {
    model: "api:/openapi/v2/rhart-image/f-2-dev/text-to-image",
    label: "RunningHub Flux 2 Dev Text-to-Image",
    kind: "image",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    request: {
      type: "node-dimensions",
      endpoint: "/openapi/v2/rhart-image/f-2-dev/text-to-image",
      promptField: "12##text",
      widthField: "30##value",
      heightField: "29##value",
      extra: {
        "41##select": "1",
        "43##file_type": "PNG",
      },
    },
  },
  {
    model: "api:/openapi/v2/minimax/hailuo-02/standard",
    label: "RunningHub Hailuo 02 Standard Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
    durationOptions: ["6", "10"],
    referenceRoutes: {
      firstLast: "api:/openapi/v2/minimax/hailuo-02/i2v-standard",
      imageToVideo: "api:/openapi/v2/minimax/hailuo-02/i2v-standard",
    },
    request: {
      type: "hailuo-video",
      endpoint: "/openapi/v2/minimax/hailuo-02/standard",
    },
  },
  {
    model: "api:/openapi/v2/minimax/hailuo-02/t2v-standard",
    label: "RunningHub Hailuo 02 T2V Standard",
    kind: "video",
    listed: false,
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    durationOptions: ["6", "10"],
    request: {
      type: "hailuo-video",
      endpoint: "/openapi/v2/minimax/hailuo-02/t2v-standard",
    },
  },
  {
    model: "api:/openapi/v2/minimax/hailuo-02/pro",
    label: "RunningHub Hailuo 02 Pro Video",
    kind: "video",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    durationOptions: ["6", "10"],
    request: {
      type: "hailuo-video",
      endpoint: "/openapi/v2/minimax/hailuo-02/pro",
    },
  },
  {
    model: "api:/openapi/v2/minimax/hailuo-02/i2v-standard",
    label: "RunningHub Hailuo 02 I2V Standard",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
    durationOptions: ["6", "10"],
    request: {
      type: "hailuo-video",
      endpoint: "/openapi/v2/minimax/hailuo-02/i2v-standard",
      requiresReference: true,
    },
  },
  {
    model: "api:/openapi/v2/seedance-v1.5-pro/text-to-video",
    label: "RunningHub Seedance 1.5 Pro Text-to-Video",
    kind: "video",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
      durationOptions: SEEDANCE_15_DURATIONS,
      resolutionOptions: SEEDANCE_15_RESOLUTIONS,
    request: {
      type: "seedance-video",
      endpoint: "/openapi/v2/seedance-v1.5-pro/text-to-video",
        durations: SEEDANCE_15_DURATIONS,
      aspectField: "aspectRatio",
      extra: {
        generateAudio: "true",
        cameraFixed: "false",
      },
    },
  },
  {
    model: "api:/openapi/v2/seedance-v1.5-pro/text-to-video-fast",
    label: "RunningHub Seedance 1.5 Pro Fast Text-to-Video",
    kind: "video",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
      durationOptions: SEEDANCE_15_DURATIONS,
      resolutionOptions: SEEDANCE_15_FAST_RESOLUTIONS,
    request: {
      type: "seedance-video",
      endpoint: "/openapi/v2/seedance-v1.5-pro/text-to-video-fast",
        durations: SEEDANCE_15_DURATIONS,
      aspectField: "aspectRatio",
      extra: {
        generateAudio: "true",
        cameraFixed: "false",
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video",
    label: "RunningHub Seedance 2.0 Global Fast Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 9,
    videoReferenceMode: "reference",
    videoReferenceModes: ["reference", "firstLast"],
    referenceMediaTypes: ["image", "video", "audio"],
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_FAST_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
      firstLast: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
      reference: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video",
    },
    request: {
      type: "seedance-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video",
        durations: SEEDANCE_20_DURATIONS,
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
    label: "RunningHub Seedance 2.0 Global Fast Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_FAST_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
        durations: SEEDANCE_20_DURATIONS,
      referenceField: "firstFrameUrl",
      lastReferenceField: "lastFrameUrl",
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        realPersonMode: true,
        conversionSlots: ["all"],
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video",
    label: "RunningHub Seedance 2.0 Global Fast Multimodal Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 9,
    referenceMediaTypes: ["image", "video", "audio"],
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_FAST_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video",
        durations: SEEDANCE_20_DURATIONS,
      referenceField: "imageUrls",
      videoField: "videoUrls",
      audioField: "audioUrls",
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        realPersonMode: true,
        conversionSlots: ["all"],
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global/text-to-video",
    label: "RunningHub Seedance 2.0 Global Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 9,
    videoReferenceMode: "reference",
    videoReferenceModes: ["reference", "firstLast"],
    referenceMediaTypes: ["image", "video", "audio"],
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_GLOBAL_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/bytedance/seedance-2.0-global/image-to-video",
      firstLast: "api:/openapi/v2/bytedance/seedance-2.0-global/image-to-video",
      reference: "api:/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
    },
    request: {
      type: "seedance-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global/text-to-video",
        durations: SEEDANCE_20_DURATIONS,
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global/image-to-video",
    label: "RunningHub Seedance 2.0 Global Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_GLOBAL_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global/image-to-video",
        durations: SEEDANCE_20_DURATIONS,
      referenceField: "firstFrameUrl",
      lastReferenceField: "lastFrameUrl",
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        realPersonMode: true,
        conversionSlots: ["all"],
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
    label: "RunningHub Seedance 2.0 Global Multimodal Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 9,
    referenceMediaTypes: ["image", "video", "audio"],
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_GLOBAL_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
        durations: SEEDANCE_20_DURATIONS,
      referenceField: "imageUrls",
      videoField: "videoUrls",
      audioField: "audioUrls",
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        realPersonMode: true,
        conversionSlots: ["all"],
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/gemini-omni-flash/text-to-video",
    label: "RunningHub Gemini Omni Flash Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 8,
    videoReferenceMode: "reference",
    referenceMediaTypes: ["image", "video"],
    durationOptions: ["4", "6", "8", "10"],
    resolutionOptions: ["720p", "1080p", "4k"],
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/gemini-omni-flash/image-to-video",
      reference: "api:/openapi/v2/gemini-omni-flash/video-edit",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/gemini-omni-flash/text-to-video",
      durations: ["4", "6", "8", "10"],
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/gemini-omni-flash/image-to-video",
    label: "RunningHub Gemini Omni Flash Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
    durationOptions: ["4", "6", "8", "10"],
    resolutionOptions: ["720p", "1080p", "4k"],
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/gemini-omni-flash/image-to-video",
      durations: ["4", "6", "8", "10"],
      referenceField: "imageUrls",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/gemini-omni-flash/video-edit",
    label: "RunningHub Gemini Omni Flash Video Edit",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 8,
    referenceMediaTypes: ["image", "video"],
    resolutionOptions: ["720p", "1080p", "4k"],
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/gemini-omni-flash/video-edit",
      referenceField: "imageUrls",
      videoField: "videoUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-n-g31-flash/text-to-image",
    label: "RunningHub Gemini 3 Flash Image Channel Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 10,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-n-g31-flash/image-to-image",
    },
    request: {
      type: "aspect-resolution-image",
      endpoint: "/openapi/v2/rhart-image-n-g31-flash/text-to-image",
      resolution: "1k",
      aspectRatioFallback: "9:16",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-n-g31-flash/image-to-image",
    label: "RunningHub Gemini 3 Flash Image Edit Channel Low Price",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 10,
    request: {
      type: "aspect-resolution-image",
      endpoint: "/openapi/v2/rhart-image-n-g31-flash/image-to-image",
      resolution: "1k",
      aspectRatioFallback: "9:16",
      referenceField: "imageUrls",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-n-g31-flash-official/text-to-image",
    label: "RunningHub Gemini 3 Flash Image Official Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 14,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-n-g31-flash-official/image-to-image",
    },
    request: {
      type: "aspect-resolution-image",
      endpoint: "/openapi/v2/rhart-image-n-g31-flash-official/text-to-image",
      resolution: "1k",
      aspectRatioFallback: "21:9",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-n-g31-flash-official/image-to-image",
    label: "RunningHub Gemini 3 Flash Image Edit Official Stable",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 14,
    request: {
      type: "aspect-resolution-image",
      endpoint: "/openapi/v2/rhart-image-n-g31-flash-official/image-to-image",
      resolution: "1k",
      aspectRatioFallback: "9:16",
      referenceField: "imageUrls",
    },
  },
    {
      model: "api:/openapi/v2/rhart-image-n-pro/text-to-image",
      label: "RunningHub Gemini Pro Image Channel Auto",
      kind: "image",
      supportsReferences: true,
      minReferenceImages: 0,
      maxReferenceImages: 10,
      referenceRoutes: {
        imageToImage: "api:/openapi/v2/rhart-image-n-pro/edit",
      },
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro/text-to-image",
        resolution: "1k",
        aspectRatioFallback: "9:16",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro/edit",
      label: "RunningHub Gemini Pro Image Edit Channel Low Price",
      kind: "image",
      listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro/edit",
        resolution: "1k",
        aspectRatioFallback: "3:4",
        referenceField: "imageUrls",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro-official/text-to-image",
      label: "RunningHub Gemini Pro Image Official Auto",
      kind: "image",
      supportsReferences: true,
      minReferenceImages: 0,
      maxReferenceImages: 10,
      referenceRoutes: {
        imageToImage: "api:/openapi/v2/rhart-image-n-pro-official/edit",
      },
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro-official/text-to-image",
        resolution: "1k",
        aspectRatioFallback: "3:4",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro-official/edit",
      label: "RunningHub Gemini Pro Image Edit Official Stable",
      kind: "image",
      listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro-official/edit",
        resolution: "1k",
        aspectRatioFallback: "3:4",
        referenceField: "imageUrls",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra",
      label: "RunningHub Gemini Pro Image Ultra Official Auto",
      kind: "image",
      supportsReferences: true,
      minReferenceImages: 0,
      maxReferenceImages: 10,
      referenceRoutes: {
        imageToImage: "api:/openapi/v2/rhart-image-n-pro-official/edit-ultra",
      },
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra",
        resolution: "8k",
        aspectRatioFallback: "3:4",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro-official/edit-ultra",
      label: "RunningHub Gemini Pro Image Edit Ultra Official Stable",
      kind: "image",
      listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro-official/edit-ultra",
        resolution: "8k",
        aspectRatioFallback: "3:4",
        referenceField: "imageUrls",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-g/text-to-video",
    label: "RunningHub VideoX 1.5 Channel Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 7,
    videoReferenceMode: "reference",
    durationOptions: VIDEOX_15_DURATIONS,
    resolutionOptions: VIDEOX_15_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/rhart-video-g/image-to-video",
      reference: "api:/openapi/v2/rhart-video-g/image-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-g/text-to-video",
      durations: VIDEOX_15_DURATIONS,
      aspectField: "aspectRatio",
      durationValueType: "number",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-g/image-to-video",
    label: "RunningHub VideoX 1.5 I2V Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 7,
    durationOptions: VIDEOX_15_DURATIONS,
    resolutionOptions: VIDEOX_15_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-g/image-to-video",
      durations: VIDEOX_15_DURATIONS,
      referenceField: "imageUrls",
      aspectField: "aspectRatio",
      durationValueType: "number",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast/text-to-video",
    label: "RunningHub Veo 3.1 Fast Channel Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
      maxReferenceImages: 3,
      videoReferenceMode: "reference",
      videoReferenceModes: ["reference", "firstLast"],
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/rhart-video-v3.1-fast/image-to-video",
      firstLast: "api:/openapi/v2/rhart-video-v3.1-fast/start-end-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast/text-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast/image-to-video",
    label: "RunningHub Veo 3.1 Fast I2V Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
      maxReferenceImages: 3,
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast/image-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      referenceField: "imageUrls",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast/start-end-to-video",
    label: "RunningHub Veo 3.1 Fast Start-End Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast/start-end-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      referenceField: "firstFrameUrl",
      lastReferenceField: "lastFrameUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video",
    label: "RunningHub Veo 3.1 Fast Official Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
      maxReferenceImages: 3,
      videoReferenceMode: "reference",
      videoReferenceModes: ["reference", "firstLast"],
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
      referenceRoutes: {
        imageToVideo: "api:/openapi/v2/rhart-video-v3.1-fast-official/image-to-video",
        firstLast: "api:/openapi/v2/rhart-video-v3.1-fast-official/image-to-video",
        reference: "api:/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast-official/text-to-video",
        durations: VEO_31_DURATIONS,
      aspectField: "aspectRatio",
      extra: {
        generateAudio: true,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast-official/image-to-video",
    label: "RunningHub Veo 3.1 Fast I2V Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
      maxReferenceImages: 2,
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast-official/image-to-video",
        durations: VEO_31_DURATIONS,
        referenceField: "imageUrl",
        lastReferenceField: "lastImageUrl",
      aspectField: "aspectRatio",
      extra: {
        generateAudio: true,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video",
    label: "RunningHub Veo 3.1 Fast Reference Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
      resolutionOptions: VEO_31_HD_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video",
      referenceField: "imageUrls",
      aspectField: "aspectRatio",
      extra: {
        generateAudio: false,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro/text-to-video",
    label: "RunningHub Veo 3.1 Pro Channel Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
      maxReferenceImages: 3,
      videoReferenceMode: "reference",
      videoReferenceModes: ["reference", "firstLast"],
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/rhart-video-v3.1-pro/image-to-video",
      firstLast: "api:/openapi/v2/rhart-video-v3.1-pro/start-end-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro/text-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro/image-to-video",
    label: "RunningHub Veo 3.1 Pro I2V Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
      maxReferenceImages: 3,
      durationOptions: VEO_31_CHANNEL_DURATIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro/image-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
        referenceField: "imageUrl",
        referenceValue: "array",
        omitResolution: true,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro/start-end-to-video",
    label: "RunningHub Veo 3.1 Pro Start-End Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro/start-end-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      referenceField: "firstFrameUrl",
      lastReferenceField: "lastFrameUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro-official/text-to-video",
    label: "RunningHub Veo 3.1 Pro Official Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
      maxReferenceImages: 3,
      videoReferenceMode: "reference",
      videoReferenceModes: ["reference", "firstLast"],
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
      referenceRoutes: {
        imageToVideo: "api:/openapi/v2/rhart-video-v3.1-pro-official/image-to-video",
        firstLast: "api:/openapi/v2/rhart-video-v3.1-pro-official/image-to-video",
        reference: "api:/openapi/v2/rhart-video-v3.1-pro-official/reference-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro-official/text-to-video",
        durations: VEO_31_DURATIONS,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro-official/image-to-video",
    label: "RunningHub Veo 3.1 Pro I2V Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
      maxReferenceImages: 2,
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro-official/image-to-video",
        durations: VEO_31_DURATIONS,
        referenceField: "imageUrl",
        lastReferenceField: "lastImageUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro-official/reference-to-video",
    label: "RunningHub Veo 3.1 Pro Reference Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro-official/reference-to-video",
      referenceField: "imageUrls",
      extra: {
        generateAudio: false,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-lite-official/text-to-video",
    label: "RunningHub Veo 3.1 Lite Official Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_HD_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/rhart-video-v3.1-lite-official/image-to-video",
      firstLast: "api:/openapi/v2/rhart-video-v3.1-lite-official/start-end-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-lite-official/text-to-video",
        durations: VEO_31_DURATIONS,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-lite-official/image-to-video",
    label: "RunningHub Veo 3.1 Lite I2V Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_HD_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-lite-official/image-to-video",
        durations: VEO_31_DURATIONS,
      referenceField: "imageUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-lite-official/start-end-to-video",
    label: "RunningHub Veo 3.1 Lite Start-End Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
      resolutionOptions: VEO_31_HD_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-lite-official/start-end-to-video",
        referenceField: "firstImageUrl",
      lastReferenceField: "lastImageUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-g-2/text-to-image",
    label: "RunningHub GPT Image 2 Channel Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 10,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-g-2/image-to-image",
    },
    request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-g-2/text-to-image",
        resolution: "1k",
        aspectRatioFallback: "empty",
      },
    },
  {
    model: "api:/openapi/v2/rhart-image-g-2-official/text-to-image",
    label: "RunningHub GPT Image 2 Official Auto",
      kind: "image",
      supportsReferences: true,
      minReferenceImages: 0,
      maxReferenceImages: 10,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-g-2-official/image-to-image",
    },
    request: {
      type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-g-2-official/text-to-image",
        resolution: "2k",
        aspectRatioFallback: "16:9",
        quality: "medium",
      },
  },
  {
    model: "api:/openapi/v2/rhart-image-g-2/image-to-image",
    label: "RunningHub GPT Image 2 Edit Channel Low Price",
    kind: "image",
    listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
    request: {
      type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-g-2/image-to-image",
        resolution: "1k",
        aspectRatioFallback: "empty",
        referenceField: "imageUrls",
      },
  },
  {
    model: "api:/openapi/v2/rhart-image-g-2-official/image-to-image",
    label: "RunningHub GPT Image 2 Edit Official Stable",
    kind: "image",
    listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
    request: {
      type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-g-2-official/image-to-image",
        resolution: "2k",
        aspectRatioFallback: "16:9",
        quality: "medium",
      referenceField: "imageUrls",
    },
  },
  {
    model: "api:/openapi/v2/youchuan/text-to-image-v7",
    label: "RunningHub Youchuan V7 Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 1,
    request: {
      type: "youchuan-image",
      endpoint: "/openapi/v2/youchuan/text-to-image-v7",
      aspectField: "aspectRatio",
      qualityField: "quality",
      referenceField: "imageUrl",
      extra: {
        chaos: 0,
        quality: "1",
        stylize: 0,
        weird: 0,
        raw: false,
        iw: 1,
        sw: 100,
        sv: 4,
        ow: 100,
        tile: false,
      },
    },
  },
  {
    model: "api:/openapi/v2/youchuan/text-to-image-v81",
    label: "RunningHub Youchuan V8.1 Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 1,
    request: {
      type: "youchuan-image",
      endpoint: "/openapi/v2/youchuan/text-to-image-v81",
      aspectField: "aspectRatio",
      qualityField: "quality",
      referenceField: "imageUrl",
      extra: {
        chaos: 0,
        quality: "1",
        stylize: 0,
        raw: false,
        iw: 1,
        sw: 100,
        sv: 6,
        hd: false,
      },
    },
  },
];

export function runningHubStandardPayloadMappingSource(
  model: RunningHubStandardModelSource,
): ProviderPayloadMappingDescriptor {
  return {
    provider: "runninghub",
    endpoint: model.request.endpoint,
    operation: runningHubPayloadMappingOperation(model.request),
    fields: runningHubPayloadFieldMappings(model),
    logic: runningHubPayloadMappingLogic(model.request),
    ...(model.referenceRoutes ? { referenceRoutes: model.referenceRoutes } : {}),
  };
}

function runningHubPayloadMappingOperation(
  request: RunningHubStandardRequest,
): ProviderPayloadMappingDescriptor["operation"] {
  if (request.type === "mapped-fields") return request.operation ?? "providerSpecific";
  if (request.type === "prompt-dimensions" || request.type === "aspect-resolution-image") return "promptDimensions";
  if (request.type === "grok-image") return request.referenceField ? "singleReference" : "promptDimensions";
  if (request.type === "node-dimensions") return "nodeFields";
  if (request.type === "image-reference-video") {
    if (request.lastReferenceField) return "firstLastFrames";
    if (request.videoField || request.audioField) return "groupedReferences";
    return request.referenceValue === "single" || request.referenceField !== "imageUrls" ? "singleReference" : "referenceArray";
  }
  return "providerSpecific";
}

function runningHubPayloadFieldMappings(
  model: RunningHubStandardModelSource,
): ProviderPayloadFieldMappingDescriptor[] {
  const request = model.request;
  const fields: ProviderPayloadFieldMappingDescriptor[] = [];
  if (request.type === "mapped-fields") {
    return request.fields.map(field => {
      if (field.source === "literal") {
        return {
          target: field.target,
          source: "literal",
          literal: field.literal,
          ...(field.valueType ? { valueType: field.valueType } : {}),
        };
      }
      return {
        target: field.target,
        source: field.source,
        ...(field.valueType ? { valueType: field.valueType } : {}),
        ...("defaultValue" in field && field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
        ...("omitAuto" in field && field.omitAuto !== undefined ? { omitAuto: field.omitAuto } : {}),
        ...("allowedValues" in field && field.allowedValues ? { allowedValues: field.allowedValues } : {}),
        ...("index" in field && field.index !== undefined ? { index: field.index } : {}),
        ...("dimensionAxis" in field && field.dimensionAxis ? { dimensionAxis: field.dimensionAxis } : {}),
        ...("durationValueType" in field && field.durationValueType ? { durationValueType: field.durationValueType } : {}),
      };
    });
  }
  if (request.type === "node-dimensions") {
    fields.push({ target: request.promptField, source: "prompt", valueType: "string" });
    if (request.widthField) fields.push({ target: request.widthField, source: "imageResolution", valueType: "number", dimensionAxis: "width" });
    if (request.heightField) fields.push({ target: request.heightField, source: "imageResolution", valueType: "number", dimensionAxis: "height" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }

  fields.push({ target: "prompt", source: "prompt", valueType: "string" });
  if (request.type === "grok-image") {
    fields.push({ target: "model", source: "literal", valueType: "string", literal: request.model });
    if (request.aspectField) fields.push({
      target: request.aspectField,
      source: "imageResolution",
      valueType: "string",
      allowedValues: request.aspectRatioOptions,
    });
    if (request.referenceField) fields.push({ target: request.referenceField, source: "imageUrls", valueType: "string", index: 0 });
    return fields;
  }
  if (request.type === "prompt-dimensions") {
    if (request.dimensionMode === "resolution" && request.resolutionField) {
      fields.push({
        target: request.resolutionField,
        source: "imageResolution",
        valueType: "string",
        allowedValues: model.resolutionOptions,
        omitAuto: true,
      });
    } else {
      fields.push({ target: "width", source: "imageResolution", valueType: "number", dimensionAxis: "width" });
      fields.push({ target: "height", source: "imageResolution", valueType: "number", dimensionAxis: "height" });
    }
    if (request.referenceField) fields.push({ target: request.referenceField, source: "imageUrls", valueType: "array" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }
  if (request.type === "hailuo-video") {
    fields.push({ target: "duration", source: "durationSeconds", valueType: "string", defaultValue: "6", allowedValues: ["6", "10"] });
    fields.push({ target: "enablePromptExpansion", source: "literal", literal: true });
    if (request.requiresReference) {
      fields.push({ target: "firstImageUrl", source: "imageUrls", valueType: "string", index: 0 });
      fields.push({ target: "lastImageUrl", source: "imageUrls", valueType: "string", index: 1 });
    }
    return fields;
  }
  if (request.type === "seedance-video" || request.type === "aspect-resolution-video") {
    fields.push({ target: "resolution", source: "resolutionName", valueType: "string", defaultValue: "720p" });
    fields.push({
      target: "duration",
      source: "durationSeconds",
      defaultValue: request.durations[0],
      allowedValues: request.durations,
      durationValueType: request.type === "aspect-resolution-video" ? request.durationValueType : undefined,
    });
    fields.push({ target: request.aspectField, source: "aspectRatio", valueType: "string", defaultValue: "adaptive" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }
  if (request.type === "image-reference-video") {
    if (!request.omitResolution) fields.push({ target: "resolution", source: "resolutionName", valueType: "string", defaultValue: "720p" });
    if (request.durations) {
      fields.push({
        target: "duration",
        source: "durationSeconds",
        defaultValue: request.durations[0],
        allowedValues: request.durations,
        durationValueType: request.durationValueType,
      });
    }
    if (request.aspectField) fields.push({ target: request.aspectField, source: "aspectRatio", valueType: "string", defaultValue: "adaptive" });
    fields.push({
      target: request.referenceField,
      source: "imageUrls",
      valueType: request.referenceField === "imageUrls" || request.referenceValue === "array" ? "array" : "string",
      index: 0,
    });
    if (request.lastReferenceField) fields.push({ target: request.lastReferenceField, source: "imageUrls", valueType: "string", index: 1 });
    if (request.videoField) fields.push({ target: request.videoField, source: "videoUrls", valueType: request.videoField === "videoUrls" ? "array" : "string", index: 0 });
    if (request.audioField) fields.push({ target: request.audioField, source: "audioUrls", valueType: "array" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }
  if (request.type === "aspect-resolution-image") {
    fields.push({ target: "aspectRatio", source: "aspectRatio", valueType: "string", defaultValue: request.aspectRatioFallback ?? "1:1" });
    fields.push({ target: "resolution", source: "imageResolution", valueType: "string", defaultValue: request.resolution });
    if (request.quality !== undefined) fields.push({ target: "quality", source: "imageQuality", valueType: "string", defaultValue: request.quality });
    if (request.referenceField) fields.push({ target: request.referenceField, source: "imageUrls", valueType: "array" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }
  if (request.type === "youchuan-image") {
    if (request.aspectField) fields.push({ target: request.aspectField, source: "aspectRatio", valueType: "string", omitAuto: true });
    if (request.referenceField) fields.push({ target: request.referenceField, source: "imageUrls", valueType: "string", index: 0 });
    fields.push(...extraLiteralFields(request.extra));
    if (request.qualityField) fields.push({ target: request.qualityField, source: "imageQuality", valueType: "string", omitAuto: true });
  }
  return fields;
}

function runningHubPayloadMappingLogic(request: RunningHubStandardRequest): ProviderPayloadMappingDescriptor["logic"] {
  const logic: Array<NonNullable<ProviderPayloadMappingDescriptor["logic"]>[number]> = ["mediaUpload"];
  if (request.type === "mapped-fields") {
    if (request.fields.some(field => field.source === "durationSeconds")) logic.push("durationCoercion");
    if (request.fields.some(field => field.source === "imageResolution")) logic.push("dimensionDerivation");
    if (request.fields.some(field => field.source === "imageUrls" || field.source === "videoUrls" || field.source === "audioUrls")) {
      logic.push("referenceRouting");
    }
    return logic;
  }
  if (
    request.type === "prompt-dimensions" ||
    request.type === "node-dimensions" ||
    request.type === "aspect-resolution-image"
  ) {
    logic.push("dimensionDerivation");
  }
  if (
    request.type === "hailuo-video" ||
    request.type === "seedance-video" ||
    request.type === "aspect-resolution-video" ||
    request.type === "image-reference-video"
  ) {
    logic.push("durationCoercion");
  }
  if (request.type === "image-reference-video") logic.push("referenceRouting");
  return logic;
}

function extraLiteralFields(extra: Record<string, unknown> | undefined): ProviderPayloadFieldMappingDescriptor[] {
  if (!extra) return [];
  return Object.entries(extra).flatMap(([target, literal]) =>
    isJsonValue(literal) ? [{ target, source: "literal", literal } satisfies ProviderPayloadFieldMappingDescriptor] : [],
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}
