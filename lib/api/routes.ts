export const API_ROUTES = {
  agent: {
    respond: "/api/agent/respond",
  },
  chat: {
    completions: "/api/chat/completions",
  },
  media: {
    audioDownload: "/api/media/audio-download",
    cancel: "/api/media/cancel",
    generateAudio: "/api/media/generate-audio",
    generateAudioWorkflow: "/api/media/generate-audio-workflow",
    generateImage: "/api/media/generate-image",
    generateVideo: "/api/media/generate-video",
    imageDownload: "/api/media/image-download",
    referenceImage: "/api/media/reference-image",
    status: "/api/media/status",
    videoDownload: "/api/media/video-download",
  },
  prompts: {
    optimize: "/api/prompts/optimize",
  },
  resolve: {
    capabilities: "/api/resolve/capabilities",
    providerCredentials: "/api/resolve/provider-credentials",
  },
  v1: {
    audioSpeech: "/v1/audio/speech",
    audioTranscriptions: "/v1/audio/transcriptions",
    chatCompletions: "/v1/chat/completions",
    imageEdits: "/v1/images/edits",
    imageGenerations: "/v1/images/generations",
    models: "/v1/models",
  },
} as const;
