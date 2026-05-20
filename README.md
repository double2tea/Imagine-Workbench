# Imagine Workbench

Imagine Workbench is a Next.js creative workstation for AI image, image-editing, video, and agent-assisted visual ideation workflows.

The current app focuses on a browser-first creative loop:

- Generate images from prompts, reference images, or masked edits.
- Generate videos from prompts, reference images, or start/end frames depending on the selected video model.
- Use Agent Mode to plan creative actions and trigger one recommended workstation action.
- Store generated assets locally in browser IndexedDB.
- Search, compare, preview, delete, and ZIP-export workspace assets.
- Route model calls through internal provider adapters for 12AI and grok2api.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript strict mode
- Tailwind CSS 4
- Motion
- lucide-react
- JSZip
- Browser IndexedDB for local asset storage

## Run Locally

Prerequisite: Node.js.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Next.js, normally `http://localhost:3000`.

## Environment

Set credentials in `.env.local`.

```bash
TWELVE_AI_API_KEY="sk_your_12ai_key"
TWELVE_AI_BASE_URL="https://cdn.12ai.org"
TWELVE_AI_VIDEO_BASE_URL="https://new.12ai.org"

GROK2API_API_KEY="your_grok2api_key"
GROK2API_BASE_URL="http://localhost:8000"

XSTX_API_KEY="sk_your_xstx_key"
XSTX_BASE_URL="https://api.xstx.info"
```

The app can also accept provider credentials from the in-app settings panel. Request headers from the UI are resolved by `lib/providers/utils.ts`.

## Provider Support

Provider model IDs use this shape:

```text
12ai:gemini-3.1-flash-lite-preview
12ai:gemini-3.1-flash-image-preview
12ai-async:gemini-3.1-flash-image-preview
grok2api:grok-4.20-auto
grok2api:grok-imagine-image
xstx:claude-opus-4-5-20251101
```

### Adding a new provider

New providers are added through a centralized registry — no scattered if-else branches. Add one entry to `lib/providers/registry.ts`:

```typescript
{
  key: "newprovider",
  label: "Display Name",
  envApiKey: "NEWPROVIDER_API_KEY",
  envBaseUrl: "NEWPROVIDER_BASE_URL",
  defaultBaseUrl: "https://api.example.com",
  defaultVideoBaseUrl: "https://api.example.com",
  supportsImage: true | false,
  supportsVideo: true | false,
  supportsChat: true | false,
}
```

Then add model capabilities to `MODEL_CAPABILITIES` in `lib/providers/model-catalog.ts`. If the provider needs custom generation logic (non-OpenAI-compatible endpoints), add adapter branches in `lib/providers/image.ts` or `lib/providers/video.ts`. OpenAI-compatible chat, image, and model-listing endpoints work with zero additional adapter code.

The `AiProvider` type, `PROVIDER_KEYS`, settings UI cards, localStorage persistence, env var resolution, and model dropdown groups are all derived automatically from the registry.

Current adapters:

- Chat: `/v1/chat/completions` (OpenAI-compatible)
- Model list: `/v1/models` (OpenAI-compatible)
- 12AI Gemini image: `/v1beta/models/{model}:generateContent`
- 12AI GPT Image 2: `/v1/images/generations`, `/v1/images/edits`
- 12AI async image: `/v1/images/async/generations`
- 12AI Veo: `/v1/videos`
- grok2api image/video/chat: OpenAI-compatible endpoints plus `/v1/videos`
- 星途 (xstx): OpenAI-compatible chat and model listing — chat-only provider

## Model Defaults

- Image: `12ai:gemini-3.1-flash-image-preview`
- Video: `12ai:veo_3_1-fast`
- Agent text chat: `12ai:gemini-3.1-flash-lite-preview`
- Agent vision chat: `12ai:gemini-3.1-flash-lite-preview`

Agent Mode automatically switches to the vision chat model when the request carries a selected or pasted reference image. The UI does not expose sync/async as a user-facing choice; image requests stay synchronous by default, and repeat submissions use the async 12AI endpoint only when the selected image model supports it.

Agent recommendations can query the local model catalog before choosing a generation target, so recommended actions stay aligned with the capabilities currently defined in the app.

Model-specific parameters are defined in the catalog so the UI can adapt controls per model:

- Gemini image models expose aspect ratio, output size, and thinking-level controls when supported.
- GPT Image models expose explicit pixel sizes and quality.
- Video models expose `auto` size first, so image-to-video can preserve the source image size when the upstream service supports it.
- `12ai:veo_3_1-fast` supports text-to-video and reference-image mode with 0-3 images.
- `12ai:veo_3_1-fast-fl` is the only built-in 12AI first/last-frame mode and requires 1-2 images.
- `grok2api:grok-imagine-video` supports optional reference images with the grok2api video parameters.

## App Routes

- `POST /api/gemini/generate-image`: image generation and image editing.
- `POST /api/gemini/generate-video`: video generation.
- `POST /api/gemini/video-status`: polls async image/video operations.
- `POST /api/gemini/image-download`: proxies completed async image downloads.
- `POST /api/gemini/video-download`: proxies completed video downloads.
- `POST /api/gemini/optimize`: expands a visual prompt through the selected chat model.
- `POST /api/gemini/agent`: Agent Mode response and recommended action.
- `GET /api/models?provider=12ai|grok2api`: loads provider chat model options.

## Project Layout

```text
app/
  page.tsx                         Main workstation UI
  api/gemini/*                     Generation, agent, status, download APIs
  api/models/route.ts              Provider model listing
components/
  CanvasMaskEditor.tsx             In-browser mask editor
  PresetStyles.ts                  Visual preset definitions
lib/
  db.ts                            IndexedDB asset store
  providers/                       Provider adapters, registry, and model catalog
hooks/
  use-mobile.ts                    Mobile breakpoint helper
```

## Development Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
```

`next.config.ts` enables standalone output, React strict mode, and strict TypeScript build checking. ESLint is ignored during builds but should still be run during development.

## Notes

- Generated assets are stored in the browser, not in a server database.
- Async operations are tracked with operation names in the form `provider:mediaType:id`.
- Reference images are passed as data URI base64 strings.
- Provider metadata lives in `lib/providers/registry.ts` — the single source of truth for keys, labels, env vars, and defaults.
- The app keeps provider integration logic in `lib/providers/*`; avoid putting provider-specific request details directly in UI components.
