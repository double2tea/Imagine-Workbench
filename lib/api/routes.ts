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
    commands: "/api/resolve/commands",
    providerCredentials: "/api/resolve/provider-credentials",
  },
  storage: {
    localStatus: "/api/storage/local/status",
    teamBootstrap: "/api/storage/team/bootstrap",
    teamAssets: "/api/storage/team/assets",
    teamBoards: "/api/storage/team/boards",
    teamBoard: (boardId: string) => `/api/storage/team/boards/${encodeURIComponent(boardId)}`,
    teamAssetMedia: (assetId: string, options: { download?: boolean } = {}) => {
      const url = `/api/storage/team/assets/${encodeURIComponent(assetId)}/media`;
      return options.download ? `${url}?download=1` : url;
    },
    teamHealth: "/api/storage/team/health",
    teamMigrations: "/api/storage/team/migrations",
    teamSession: "/api/storage/team/session",
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
