# OpenAI-Compatible API

Imagine Workbench exposes a small OpenAI-shaped API surface for plugins and external scripts. It is not a full OpenAI or 12AI API clone. Workbench-specific async media workflows, downloads, cancellation, and RunningHub workflow execution stay under `/api/media/*`.

RunningHub-specific async tasks, AI Apps, workflows, uploads, and audio AI App targets are documented separately in [RunningHub API](runninghub-api.md).

## Authentication

For local-only use, `/v1/*` routes can use the configured provider environment variables directly.

For hosted or shared deployments, set:

```bash
OPENAI_COMPAT_API_KEY="your_gateway_key"
```

When this variable is set, every `/v1/*` request must include:

```http
Authorization: Bearer your_gateway_key
```

That bearer token is treated as the Workbench gateway key, not as the upstream provider key. Upstream provider credentials then come from the server environment or from `x-ai-api-key`.

Optional provider credential headers:

```http
x-ai-api-key: provider_key
x-ai-base-url: https://provider.example/v1
x-ai-provider-label: Provider Name
```

For execution routes such as `/v1/chat/completions`, `/v1/images/*`, and `/v1/audio/*`, choose the provider with the `provider:model` model ID prefix. `x-ai-provider` is used by `GET /v1/models` as an alternative to its `provider` query parameter.

## Model IDs

Use provider-prefixed model IDs when a route can target more than one provider:

```text
12ai:gpt-image-2
mimo:mimo-v2.5-asr
newapi:image-model
runninghub:qwen/qwen3.7-max
```

Unprefixed chat and image models default to `12ai`. Unprefixed audio speech/transcription models default to `mimo`.

## Supported `/v1/*` Routes

### `GET /v1/models`

Returns an OpenAI-shaped model list.

Query parameters:

- `provider`: `all` or a provider key; defaults to `all`
- `kind`: `chat`, `image`, `video`, `audio`, or `all`; defaults to `chat`

When `provider` is omitted or set to `all`, the route returns the Workbench-known provider/model catalog across currently registered providers. Use `provider=<key>` when you want that provider's dedicated dynamic model listing behavior.

Example:

```bash
curl "http://localhost:3000/v1/models?kind=all" \
  -H "Authorization: Bearer $OPENAI_COMPAT_API_KEY"
```

### `POST /v1/chat/completions`

Proxies OpenAI-compatible chat completions to the selected provider.

Required body fields:

- `model`
- `messages`

Extra OpenAI-compatible fields are proxied through.

### `POST /v1/images/generations`

Immediate single-image generation only.

Supported fields:

- `model`
- `prompt`
- `n`: only `1`
- `size`
- `quality`
- `response_format`: `b64_json` or `url`

Async and workflow image targets are rejected here. Use `/api/media/generate-image` plus `/api/media/status` for those.

### `POST /v1/images/edits`

Multipart image edit mapped to Workbench edit operations.

Supported fields:

- `model`
- `image` or `image[]`; the first image is the source image and later images are visual references
- `mask`
- `prompt`
- `operation`: `redraw`, `erase`, `outpaint`, or `cutout`; defaults to `redraw`
- `n`: only `1`
- `size`
- `quality`
- `response_format`: `b64_json` or `url`

This is an OpenAI-shaped facade over Workbench edit semantics, not a complete clone of every OpenAI image edit feature. Multi-image requests are forwarded as OpenAI-style `image[]` uploads to immediate OpenAI-compatible image edit providers.

### `POST /v1/audio/speech`

Direct MiMo-compatible TTS.

Supported fields:

- `model`
- `input`
- `voice`
- `instructions`
- `response_format`: `wav` or `pcm16`

RunningHub workflow audio is not supported here. Use `/api/media/generate-audio-workflow`.

### `POST /v1/audio/transcriptions`

Direct MiMo-compatible ASR.

Multipart fields:

- `model`
- `file`: `wav` or `mp3`
- `language`: `auto`, `zh`, or `en`
- `prompt`
- `response_format`: omitted or `json`

MiMo ASR input must be `wav` or `mp3`, and the base64 payload sent upstream must be at or below 10MB.

## Workbench Media Routes

Use `/api/media/*` when the operation is not naturally synchronous OpenAI-style request/response:

- `POST /api/media/generate-image`
- `POST /api/media/generate-video`
- `POST /api/media/generate-audio`
- `POST /api/media/generate-audio-workflow`
- `POST /api/media/status`
- `POST /api/media/image-download`
- `POST /api/media/video-download`
- `POST /api/media/audio-download`
- `POST /api/media/cancel`

These routes are for Workbench clients and support provider-specific async tasks, polling, downloads, and workflow execution.

## Not Implemented

These 12AI/OpenAI-style API families are intentionally not exposed yet:

- `/v1/responses`
- `/v1/messages`
- `/v1/videos`
- `/v1/audio/translations`
- `/v1/images/variations`
- Files, Vector Stores, Batch, Fine-tuning, and Realtime

Add them only after defining a provider mapping that can represent the behavior honestly.
