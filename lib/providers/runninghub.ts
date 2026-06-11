import type { MediaReferenceType } from "@/lib/media-references";
import type { RunningHubTaskNodeBinding } from "./types";

export const RUNNINGHUB_LLM_BASE_URL = "https://llm.runninghub.cn";
export const RUNNINGHUB_DEFAULT_LLM_MODEL = "qwen/qwen3.7-max";
export const RUNNINGHUB_CONTROL_IMAGE_APP_MODEL = "ai-app-image:1961345119528140802";
export const RUNNINGHUB_CONTROL_IMAGE_APP_LABEL = "RunningHub Control Image AI App";
const RUNNINGHUB_PROVIDER_PREFIX = "runninghub:";
const RUNNINGHUB_STANDARD_BASE_URLS = new Set(["https://www.runninghub.cn", "https://www.runninghub.ai"]);
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

export type RunningHubStandardModelKind = "image" | "video";
export type RunningHubAppPresetKind = "image" | "video";

export interface RunningHubAppPreset {
  model: string;
  label: string;
  kind: RunningHubAppPresetKind;
  promptRequired: boolean;
  supportsReferences: boolean;
  minReferenceImages: number;
  maxReferenceImages: number;
  referenceMediaTypes: readonly MediaReferenceType[];
  nodeInfoList: readonly RunningHubTaskNodeBinding[];
}

export interface RunningHubStandardModel {
  model: string;
  label: string;
  kind: RunningHubStandardModelKind;
  listed?: boolean;
  supportsReferences: boolean;
  minReferenceImages: number;
  maxReferenceImages: number;
  videoReferenceMode?: "reference" | "firstLast";
  videoReferenceModes?: readonly ("reference" | "firstLast")[];
  referenceMediaTypes?: readonly MediaReferenceType[];
  durationOptions?: readonly string[];
  resolutionOptions?: readonly string[];
  referenceRoutes?: {
    imageToImage?: string;
    imageToVideo?: string;
    firstLast?: string;
    reference?: string;
  };
  request: RunningHubStandardRequest;
}

export interface RunningHubStandardRequestInput {
  prompt: string;
  aspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  resolutionName?: string;
  durationSeconds?: string;
  referenceImages: Array<{ dataUri: string }>;
  referenceMedia?: Array<{ dataUri: string; type: MediaReferenceType }>;
  referenceUrls?: string[];
  referenceMediaUrls?: {
    imageUrls: string[];
    videoUrls: string[];
    audioUrls: string[];
  };
}

export type RunningHubReferenceMode = "reference" | "firstLast";

export const RUNNINGHUB_APP_PRESETS: readonly RunningHubAppPreset[] = [
  {
    model: RUNNINGHUB_CONTROL_IMAGE_APP_MODEL,
    label: RUNNINGHUB_CONTROL_IMAGE_APP_LABEL,
    kind: "image",
    promptRequired: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    referenceMediaTypes: ["image"],
    nodeInfoList: [
      {
        nodeId: "252",
        fieldName: "image",
        label: "Control image",
        source: "reference",
        valueType: "image",
        required: true,
        referenceIndex: 0,
        referenceType: "image",
        deliveryMode: "fileName",
      },
    ],
  },
];

export function getRunningHubAppPreset(model: string): RunningHubAppPreset | undefined {
  const normalized = normalizeRunningHubModel(model);
  return RUNNINGHUB_APP_PRESETS.find(preset => preset.model === normalized);
}

export function hasRunningHubAppPreset(model: string): boolean {
  return getRunningHubAppPreset(model) !== undefined;
}

function normalizeRunningHubModel(model: string): string {
  return model.startsWith(RUNNINGHUB_PROVIDER_PREFIX)
    ? model.slice(RUNNINGHUB_PROVIDER_PREFIX.length)
    : model;
}

type RunningHubStandardRequest =
  | {
      type: "prompt-dimensions";
      endpoint: string;
      extra?: Record<string, unknown>;
      referenceField?: "imageUrls";
    }
  | {
      type: "grok-image";
      endpoint: string;
      model: string;
      referenceField?: "imageUrl";
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
    };

export const RUNNINGHUB_STANDARD_MODELS: readonly RunningHubStandardModel[] = [
  {
    model: "api:/openapi/v2/seedream-v5-lite/text-to-image",
    label: "RunningHub Seedream V5 Lite Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 10,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/seedream-v5-lite/image-to-image",
    },
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/seedream-v5-lite/text-to-image",
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
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/seedream-v5-lite/image-to-image",
      referenceField: "imageUrls",
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
      type: "node-dimensions",
      endpoint: "/openapi/v2/rhart-image/z-image/turbo",
      promptField: "10##text",
      extra: {
        "28##select": "8",
        "29##file_type": "PNG",
      },
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
    durationOptions: ["4", "6", "8", "10"],
    resolutionOptions: ["720p", "1080p", "4k"],
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/gemini-omni-flash/video-edit",
      durations: ["4", "6", "8", "10"],
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
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    request: {
      type: "youchuan-image",
      endpoint: "/openapi/v2/youchuan/text-to-image-v7",
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
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    request: {
      type: "youchuan-image",
      endpoint: "/openapi/v2/youchuan/text-to-image-v81",
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

export function runningHubLlmBaseUrl(baseUrl: string): string {
  return RUNNINGHUB_STANDARD_BASE_URLS.has(baseUrl) ? RUNNINGHUB_LLM_BASE_URL : baseUrl;
}

export function getRunningHubStandardModel(
  model: string,
  kind: RunningHubStandardModelKind,
): RunningHubStandardModel | undefined {
  return RUNNINGHUB_STANDARD_MODELS.find(item => item.kind === kind && item.model === model);
}

export function resolveRunningHubStandardModelForReferences(
  model: RunningHubStandardModel,
  referenceCount: number,
): RunningHubStandardModel {
  return resolveRunningHubStandardModel(model, referenceCount, false);
}

export function resolveRunningHubStandardModelForReferenceMedia(
  model: RunningHubStandardModel,
  references: readonly { type: MediaReferenceType }[],
  referenceMode?: RunningHubReferenceMode,
): RunningHubStandardModel {
  return resolveRunningHubStandardModel(
    model,
    references.length,
    references.some(reference => reference.type !== "image"),
    referenceMode,
  );
}

function resolveRunningHubStandardModel(
  model: RunningHubStandardModel,
  referenceCount: number,
  hasNonImageReference: boolean,
  referenceMode?: RunningHubReferenceMode,
): RunningHubStandardModel {
  const routes = model.referenceRoutes;
  if (!routes || referenceCount === 0) return model;

  if (model.kind === "image" && routes.imageToImage) {
    const resolved = getRunningHubStandardModel(routes.imageToImage, model.kind);
    if (!resolved) throw new Error(`${model.label} route target is not configured: ${routes.imageToImage}`);
    return resolved;
  }

  const routedModel =
    hasNonImageReference
      ? routes.reference
      : referenceMode === "reference"
        ? routes.reference ?? routes.imageToVideo
        : referenceMode === "firstLast"
          ? referenceCount === 2
            ? routes.firstLast ?? routes.imageToVideo
            : routes.imageToVideo ?? routes.reference
      : referenceCount === 1
      ? routes.imageToVideo ?? routes.reference
      : referenceCount === 2
        ? routes.firstLast ?? routes.reference
        : routes.reference;
  if (!routedModel) return model;

  const resolved = getRunningHubStandardModel(routedModel, model.kind);
  if (!resolved) throw new Error(`${model.label} route target is not configured: ${routedModel}`);
  return resolved;
}

export function getRunningHubStandardEndpoint(model: RunningHubStandardModel): string {
  return model.request.endpoint;
}

export function validateRunningHubStandardReferenceCount(model: RunningHubStandardModel, referenceCount: number): void {
  if (!model.supportsReferences && referenceCount > 0) {
    throw new Error(`${model.label} does not support reference media`);
  }
  if (referenceCount < model.minReferenceImages) {
    throw new Error(`${model.label} requires at least ${model.minReferenceImages} reference media item`);
  }
  if (referenceCount > model.maxReferenceImages) {
    throw new Error(`${model.label} supports at most ${model.maxReferenceImages} reference media items`);
  }
}

export function buildRunningHubStandardBody(
  model: RunningHubStandardModel,
  input: RunningHubStandardRequestInput,
): Record<string, unknown> {
  const referenceMediaUrls = input.referenceMediaUrls ?? {
    imageUrls: input.referenceUrls ?? input.referenceImages.map(ref => ref.dataUri),
    videoUrls: [],
    audioUrls: [],
  };
  const referenceCount =
    referenceMediaUrls.imageUrls.length + referenceMediaUrls.videoUrls.length + referenceMediaUrls.audioUrls.length;
  validateRunningHubStandardReferenceCount(model, referenceCount);

  switch (model.request.type) {
    case "prompt-dimensions": {
      return {
        prompt: input.prompt,
        ...readDimensions(input.imageResolution),
        ...model.request.extra,
        ...(model.request.referenceField ? { [model.request.referenceField]: referenceMediaUrls.imageUrls } : {}),
      };
    }
    case "grok-image": {
      return {
        model: model.request.model,
        prompt: input.prompt,
        ...(model.request.referenceField ? { [model.request.referenceField]: referenceMediaUrls.imageUrls[0] } : {}),
      };
    }
    case "node-dimensions": {
      const dimensions = readDimensions(input.imageResolution) ?? { width: 1024, height: 1024 };
      return {
        [model.request.promptField]: input.prompt,
        ...(model.request.widthField ? { [model.request.widthField]: dimensions.width } : {}),
        ...(model.request.heightField ? { [model.request.heightField]: dimensions.height } : {}),
        ...model.request.extra,
      };
    }
    case "hailuo-video": {
      return {
        prompt: input.prompt,
        enablePromptExpansion: true,
        duration: readHailuoDuration(input.durationSeconds),
        ...(model.request.requiresReference
          ? { firstImageUrl: referenceMediaUrls.imageUrls[0], lastImageUrl: referenceMediaUrls.imageUrls[1] }
          : {}),
      };
    }
    case "seedance-video": {
      return {
        prompt: input.prompt,
        resolution: input.resolutionName ?? "720p",
        duration: readDuration(input.durationSeconds, model.request.durations, model.label),
        [model.request.aspectField]:
          input.aspectRatio === "auto" || input.aspectRatio === undefined ? "adaptive" : input.aspectRatio,
        ...model.request.extra,
      };
    }
    case "aspect-resolution-video": {
      return {
        prompt: input.prompt,
        resolution: input.resolutionName ?? "720p",
        duration: readDurationValue(input.durationSeconds, model.request.durations, model.label, model.request.durationValueType),
        [model.request.aspectField]:
          input.aspectRatio === "auto" || input.aspectRatio === undefined ? "adaptive" : input.aspectRatio,
        ...model.request.extra,
      };
    }
      case "image-reference-video": {
        return {
          prompt: input.prompt,
          ...(model.request.omitResolution ? {} : { resolution: input.resolutionName ?? "720p" }),
          ...(model.request.durations
            ? { duration: readDurationValue(input.durationSeconds, model.request.durations, model.label, model.request.durationValueType) }
            : {}),
        ...(model.request.aspectField
          ? {
              [model.request.aspectField]:
                input.aspectRatio === "auto" || input.aspectRatio === undefined ? "adaptive" : input.aspectRatio,
            }
          : {}),
          ...readVideoReferenceFields(
            model.request.referenceField,
            model.request.referenceValue,
            model.request.lastReferenceField,
            model.request.videoField,
            model.request.audioField,
          referenceMediaUrls,
        ),
        ...model.request.extra,
      };
    }
      case "aspect-resolution-image": {
        return {
          prompt: input.prompt,
          aspectRatio:
            input.aspectRatio === "auto" || input.aspectRatio === undefined
              ? model.request.aspectRatioFallback ?? "1:1"
              : input.aspectRatio,
          resolution: readImageResolutionTier(input.imageResolution, model.request.resolution),
        ...readImageQuality(input.imageQuality, model.request.quality),
        ...(model.request.referenceField ? { [model.request.referenceField]: referenceMediaUrls.imageUrls } : {}),
        ...model.request.extra,
      };
    }
    case "youchuan-image": {
      return {
        prompt: input.prompt,
        ...model.request.extra,
      };
    }
  }
}

function readDimensions(value: string | undefined): { width: number; height: number } | undefined {
  if (!value || value === "auto") return undefined;
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return undefined;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function readImageResolutionTier(value: string | undefined, fallback: string): string {
  if (!value || value === "auto") return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "1k" || normalized === "2k" || normalized === "4k" || normalized === "8k") return normalized;

  const dimensions = readDimensions(value);
  if (!dimensions) return fallback;
  const longSide = Math.max(dimensions.width, dimensions.height);
  if (longSide >= 3200) return "4k";
  if (longSide >= 1900) return "2k";
  return "1k";
}

function readImageQuality(value: string | undefined, fallback: string | undefined): Record<string, string> {
  if (value && value !== "auto") return { quality: value };
  return fallback ? { quality: fallback } : {};
}

function readHailuoDuration(value: string | undefined): string {
  if (value === undefined) return "6";
  if (value === "6" || value === "10") return value;
  throw new Error("RunningHub Hailuo 02 Standard duration must be 6 or 10 seconds");
}

function readDuration(value: string | undefined, allowedValues: readonly string[], label: string): string {
  if (value === undefined) return allowedValues[0] ?? "5";
  if (allowedValues.includes(value)) return value;
  throw new Error(`${label} duration must be ${allowedValues.join(", ")} seconds`);
}

function readDurationValue(
  value: string | undefined,
  allowedValues: readonly string[],
  label: string,
  valueType: "string" | "number" = "string",
): string | number {
  const duration = readDuration(value, allowedValues, label);
  return valueType === "number" ? Number(duration) : duration;
}

function readVideoReferenceFields(
  referenceField: "imageUrls" | "imageUrl" | "firstFrameUrl" | "firstImageUrl",
  referenceValue: "single" | "array" | undefined,
  lastReferenceField: "lastFrameUrl" | "lastImageUrl" | undefined,
  videoField: "videoUrls" | "videoUrl" | undefined,
  audioField: "audioUrls" | undefined,
  referenceMediaUrls: { imageUrls: string[]; videoUrls: string[]; audioUrls: string[] },
): Record<string, unknown> {
  const imageFields =
    referenceField === "imageUrls" || referenceValue === "array"
      ? { [referenceField]: referenceMediaUrls.imageUrls }
      : {
          [referenceField]: referenceMediaUrls.imageUrls[0],
          ...(lastReferenceField && referenceMediaUrls.imageUrls[1]
            ? { [lastReferenceField]: referenceMediaUrls.imageUrls[1] }
            : {}),
        };
  const videoFields =
    videoField && referenceMediaUrls.videoUrls.length > 0
      ? { [videoField]: videoField === "videoUrls" ? referenceMediaUrls.videoUrls : referenceMediaUrls.videoUrls[0] }
      : {};
  const audioFields =
    audioField && referenceMediaUrls.audioUrls.length > 0 ? { [audioField]: referenceMediaUrls.audioUrls } : {};
  return {
    ...imageFields,
    ...videoFields,
    ...audioFields,
  };
}
