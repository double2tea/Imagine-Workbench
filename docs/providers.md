# Provider and Model Guide

Imagine Workbench routes model calls through provider adapters. Most UI model lists are driven by the model capability catalog, while provider credentials and default URLs are centralized in the provider registry.

## Built-In Provider Families

- 12AI: chat, image, async image, and video adapters.
- grok2api: OpenAI-compatible chat, image, and video endpoints.
- xstx: OpenAI-compatible chat, image, and model listing.
- Agnes AI: OpenAI-compatible chat, image, video, and model listing.
- ModelScope: API-Inference image generation and async task polling.
- RunningHub: Standard Model APIs, AI Apps, workflows, and LLM chat.
- MiMo: direct audio speech/transcription targets.

## Model ID Shape

Provider-prefixed model IDs keep routing explicit:

```text
12ai:gemini-3.1-flash-lite-preview
12ai:gemini-3.1-flash-image-preview
grok2api:grok-4.20-auto
grok2api:grok-imagine-image
xstx:gpt-image-2
agnes:agnes-video-v2.0
modelscope:Qwen/Qwen-Image
runninghub:api:/openapi/v2/bytedance/jimeng-4.6/text-to-image
runninghub:ai-app-image:<webappId>
runninghub:workflow-video:<workflowId>
```

## Adding a Provider

Provider metadata starts in `lib/providers/registry.ts`:

```typescript
{
  key: "newprovider",
  label: "Display Name",
  envApiKey: "NEWPROVIDER_API_KEY",
  envBaseUrl: "NEWPROVIDER_BASE_URL",
  defaultBaseUrl: "https://api.example.com",
  defaultVideoBaseUrl: "https://api.example.com",
  apiKeyPlaceholder: "sk_your_key",
  hasEditableBaseUrl: true,
  supportsImage: true,
  supportsVideo: false,
  supportsChat: true,
}
```

Then add model capabilities to `lib/providers/catalog/data/model-capabilities.json`.

If a provider uses OpenAI-compatible chat, model listing, or immediate single-image endpoints, no custom adapter branch is usually needed. Add adapter logic in `lib/providers/image.ts`, `lib/providers/video.ts`, or `lib/providers/audio.ts` only when the provider has a non-compatible media API.

## RunningHub Boundaries

RunningHub is task-oriented:

- Standard Model API targets use `runninghub:api:/openapi/v2/...` and poll through `/openapi/v2/query`.
- AI Apps use `runninghub:ai-app-*:<webappId>`.
- Workflows use `runninghub:workflow-*:<workflowId>`.
- Audio AI Apps and workflows stay on `/api/media/generate-audio-workflow`.

This project does not provide local ComfyUI graph editing or local workflow execution.
