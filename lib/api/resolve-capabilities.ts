import { DEFAULT_AUDIO_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "../providers/model-catalog";

export type ResolveBridgeClientMode = "external" | "in_resolve";
export type ResolveBridgeHttpMethod = "GET" | "POST";
export type ResolveBridgeContentType = "application/json" | "multipart/form-data";
export type ResolveBridgeResultKind = "image" | "video" | "audio" | "transcript";
export type ResolveBridgeOperationId =
  | "generate_image"
  | "edit_image"
  | "generate_video"
  | "tts"
  | "transcribe";

export interface ResolveBridgeRouteContract {
  path: string;
  method: ResolveBridgeHttpMethod;
  contentType: ResolveBridgeContentType;
}

export interface ResolveBridgeOperationContract {
  id: ResolveBridgeOperationId;
  label: string;
  route: ResolveBridgeRouteContract;
  defaultModel: string;
  resultKind: ResolveBridgeResultKind;
  requiresPrompt: boolean;
  acceptsReferenceMedia: boolean;
  async: boolean;
  clientModes: ResolveBridgeClientMode[];
}

export interface ResolveBridgeCapabilities {
  name: "imagine-resolve-bridge";
  version: 1;
  clientModes: ResolveBridgeClientMode[];
  operations: ResolveBridgeOperationContract[];
  routes: {
    status: string;
    downloads: {
      audio: string;
      image: string;
      video: string;
    };
  };
}

const CLIENT_MODES: ResolveBridgeClientMode[] = ["external", "in_resolve"];

export function getResolveBridgeCapabilities(): ResolveBridgeCapabilities {
  return {
    name: "imagine-resolve-bridge",
    version: 1,
    clientModes: CLIENT_MODES,
    operations: [
      {
        id: "generate_image",
        label: "Generate Image",
        route: { path: "/v1/images/generations", method: "POST", contentType: "application/json" },
        defaultModel: DEFAULT_IMAGE_MODEL,
        resultKind: "image",
        requiresPrompt: true,
        acceptsReferenceMedia: false,
        async: false,
        clientModes: CLIENT_MODES,
      },
      {
        id: "edit_image",
        label: "Edit Image",
        route: { path: "/v1/images/edits", method: "POST", contentType: "multipart/form-data" },
        defaultModel: DEFAULT_IMAGE_MODEL,
        resultKind: "image",
        requiresPrompt: true,
        acceptsReferenceMedia: true,
        async: false,
        clientModes: CLIENT_MODES,
      },
      {
        id: "generate_video",
        label: "Generate Video",
        route: { path: "/api/media/generate-video", method: "POST", contentType: "application/json" },
        defaultModel: DEFAULT_VIDEO_MODEL,
        resultKind: "video",
        requiresPrompt: true,
        acceptsReferenceMedia: true,
        async: true,
        clientModes: CLIENT_MODES,
      },
      {
        id: "tts",
        label: "Text to Speech",
        route: { path: "/v1/audio/speech", method: "POST", contentType: "application/json" },
        defaultModel: DEFAULT_AUDIO_MODEL,
        resultKind: "audio",
        requiresPrompt: true,
        acceptsReferenceMedia: false,
        async: false,
        clientModes: CLIENT_MODES,
      },
      {
        id: "transcribe",
        label: "Transcribe Audio",
        route: { path: "/v1/audio/transcriptions", method: "POST", contentType: "multipart/form-data" },
        defaultModel: "mimo:mimo-v2.5-asr",
        resultKind: "transcript",
        requiresPrompt: false,
        acceptsReferenceMedia: true,
        async: false,
        clientModes: CLIENT_MODES,
      },
    ],
    routes: {
      status: "/api/media/status",
      downloads: {
        audio: "/api/media/audio-download",
        image: "/api/media/image-download",
        video: "/api/media/video-download",
      },
    },
  };
}
