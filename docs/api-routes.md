# API Routes

[English](api-routes.md) | [简体中文](zh-CN/api-routes.md)

Imagine Workbench is a Next.js App Router application. It exposes two API surfaces:

- `/v1/*`: a small OpenAI-compatible gateway intended for plugins and external scripts.
- `/api/*`: Workbench-native routes used by the app UI and integrations.

## Remote Calling Guidance

Use `/v1/*` for user-facing remote API calls when possible. It has the clearest external contract and can be protected with `OPENAI_COMPAT_API_KEY`.

For hosted or shared deployments:

```bash
OPENAI_COMPAT_API_KEY="your_gateway_key"
```

Then call:

```http
Authorization: Bearer your_gateway_key
```

The bearer token protects the Workbench gateway. Upstream provider credentials come from server environment variables or optional provider headers such as `x-ai-api-key`.

Do not expose an unprotected deployment as a public API service. Most `/api/*` routes are application routes, not a multi-tenant SaaS backend with users, accounts, rate limits, or per-user storage.

## Public Compatibility Routes

| Route | Purpose |
| --- | --- |
| `GET /v1/models` | OpenAI-shaped model list for directly callable chat, image, and audio models. |
| `POST /v1/chat/completions` | OpenAI-compatible chat completions proxy. |
| `POST /v1/images/generations` | Immediate single-image generation. |
| `POST /v1/images/edits` | Multipart image edit facade over Workbench edit operations. |
| `POST /v1/audio/speech` | Direct MiMo-compatible TTS. |
| `POST /v1/audio/transcriptions` | Direct MiMo-compatible ASR. |

Details: [OpenAI-compatible API](openai-compatible-api.md).

## Workbench-Native Routes

These routes are primarily used by the Workbench UI. They can be called over HTTP when you understand the Workbench-native request/response shape, but they are not the stable OpenAI-compatible facade.

| Route family | Purpose |
| --- | --- |
| `/api/media/*` | Image, video, audio, async task polling, downloads, cancellation, and reference-image localization. |
| `/api/chat/completions` | Internal chat completions proxy used by Workbench and Agent flows. |
| `/api/agent/respond` | Agent Mode planning/action response route. |
| `/api/prompts/optimize` | Prompt optimization. |
| `/api/models` | Provider-specific model listing for app UI. |
| `/api/model-capabilities` | Static model capability catalog used by app UI. |
| `/api/model-vision-support` | Informational model vision support lookup. |
| `/api/runninghub/ai-app-schema` | RunningHub AI App schema lookup. |
| `/api/resolve/*` | DaVinci Resolve Workflow Integration bridge routes. |
| `/api/board/import-image` | Board image import helper. |
| `/api/storage/local/status` | Public local storage runtime status. |

Most provider-backed routes accept provider selection through model IDs or request fields, and use provider credentials from server environment variables or `x-ai-api-key` / `x-ai-base-url` style headers.

## What This Is Not

Imagine Workbench does not currently provide:

- user accounts or multi-user authorization;
- server-side workspace persistence for each remote user;
- a general REST API for browsing another user's IndexedDB assets;
- a hosted database layer enabled by default;
- rate limiting or billing controls for public API resale.

If you deploy it for other users, treat `/v1/*` as the external API surface and protect it with `OPENAI_COMPAT_API_KEY`.
