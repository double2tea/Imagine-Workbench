# Imagine Workbench

Imagine Workbench is a Next.js creative workstation for AI image, image-editing, video, and agent-assisted visual ideation workflows.

The current app focuses on a browser-first creative loop:

- Generate images from prompts, reference images, or masked edits.
- Generate videos from prompts, reference images, or start/end frames depending on the selected video model.
- Insert shared prompt templates from the template picker or by typing `/` in supported prompt fields.
- Use Agent Mode to plan creative actions and trigger one recommended workstation action.
- Use `/board` and `/board/[boardId]` canvases to arrange assets, notes, references, and Agent-driven generation in spatial workflows.
- Store generated assets locally in browser IndexedDB.
- Search, compare, preview, delete, and ZIP-export workspace assets.
- Export, import, and clean workspace data (assets, boards, settings) from Settings → 数据.
- Route model calls through internal provider adapters for 12AI, grok2api, xstx, Agnes AI, ModelScope, and RunningHub.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript strict mode
- Tailwind CSS 4
- Motion
- lucide-react
- JSZip
- Browser IndexedDB for local asset storage

## Appearance and Theme

- **Brand mark:** Header, Agent dock, and board Agent nodes share `components/brand/ImagineMark.tsx` via `components/agent/AgentIdentityMark.tsx`. The browser tab icon is `public/icon.svg` (served as a static asset; do not add `app/icon.svg` — Cloudflare Pages requires edge routes for App Router metadata icons).
- **Theme modes:** Light and dark. Preference is stored in `localStorage` under `imagine_theme_mode` (default `dark`). `app/layout.tsx` runs an inline bootstrap script before paint to set `html[data-imagine-theme]` and `color-scheme`, so the first frame matches the saved mode.
- **In-app toggle:** Header/board toolbar call `useThemeMode()`; `persistThemeMode()` updates `html`, `localStorage`, and shell/agent classes via DOM (`applyThemeClassesToDom`) without re-rendering the main workstation tree. `ThemeDomSync` in `WorkbenchProviders` applies stored classes on first paint. Board React Flow uses `useThemeModeSnapshot()` only where `colorMode` must react.
- **Design tokens:** Semantic colors use `--iw-*` CSS variables on both `html` and `.imagine-workbench-shell`. Body-level UI (for example `ConfirmProvider` confirm/alert overlays) reads the same variables from `html`, so dialogs are not transparent when opened outside the shell.
- **Expectations:** Theme switching targets instant DOM/token updates without page-wide React re-renders or `html { transition: color }` (both caused multi-second jank). Legacy light-mode `!important` overrides remain for older Tailwind classes; new UI should prefer `--iw-*` tokens.

## Run Locally

Prerequisite: Node.js 24 and pnpm 10.27.0. If pnpm is not installed, enable it with Corepack.

```bash
corepack enable
corepack prepare pnpm@10.27.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm run dev
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

AGNES_AI_API_KEY="your_agnes_ai_key"
AGNES_AI_BASE_URL="https://apihub.agnes-ai.com"

MODELSCOPE_API_KEY="ms_your_modelscope_token"
MODELSCOPE_BASE_URL="https://api-inference.modelscope.cn"

RUNNINGHUB_API_KEY="your_runninghub_api_key"
RUNNINGHUB_BASE_URL="https://www.runninghub.cn"
# RunningHub LLM chat uses https://llm.runninghub.cn automatically when the base URL is the official Standard Model host.
```

The app can also accept provider credentials from the in-app settings panel. Request headers from the UI are resolved by `lib/providers/utils.ts`.
Settings has two tabs: `连接` for provider/model configuration and `数据` for local workspace data management. The older standalone `系统` tab was removed after its asset summary/reset controls moved into `数据`.
Provider search in settings filters the provider list only; it does not auto-switch the selected provider.

## Data Management

Open Settings → `数据` to inspect and manage local browser data:

- Summary cards cover assets, boards, managed localStorage keys, and browser storage quota when the browser exposes it.
- `完整备份` exports a ZIP with a manifest, asset index, media files, board documents, and optional local settings/provider credentials.
- `当前画板` exports only the active board plus the assets it references, and is shown on board routes.
- `恢复备份` previews the backup counts before overwriting local assets, boards, and managed settings. Provider credentials import only when the credentials checkbox is enabled.
- `导入图片/视频` stores selected local media files as completed local assets in IndexedDB.
- Cleanup actions remove failed tasks, stale processing/queued tasks older than two hours, completed records without media URLs, or completed assets not referenced by any board.
- `修复来源链接` scans all board nodes and clears asset `sourceBoardNodeId` values that point to deleted board nodes; it keeps asset files, prompts, results, and statuses intact.
- The danger zone can clear all assets, reset boards to a default empty board, or clear Agent history, model cache, provider credentials, and UI preferences from localStorage.

## Provider Support

Provider model IDs use this shape:

```text
12ai:gemini-3.1-flash-lite-preview
12ai:gemini-3.1-flash-image-preview
12ai-async:gemini-3.1-flash-image-preview
grok2api:grok-4.20-auto
grok2api:grok-imagine-image
xstx:gpt-image-2
xstx:gpt-5.4
agnes:agnes-2.0-flash
agnes:agnes-image-2.1-flash
agnes:agnes-video-v2.0
modelscope:Qwen/Qwen-Image
modelscope:Qwen/Qwen-Image-Edit
runninghub:api:/openapi/v2/bytedance/jimeng-4.6/text-to-image
runninghub:ai-app-image:<webappId>
runninghub:workflow-video:<workflowId>
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
  apiKeyPlaceholder: "sk_your_key",
  hasEditableBaseUrl: true,
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
- 星途 (xstx): OpenAI-compatible chat, image, and model listing
- Agnes AI: OpenAI-compatible chat, image, video, and model listing
- ModelScope image: API-Inference `/v1/images/generations` with async polling via `/v1/tasks/{task_id}`
- RunningHub LLM chat/model list: OpenAI-compatible `/v1/chat/completions` and `/v1/models` via `https://llm.runninghub.cn`
- RunningHub image/video: configured Standard Model API endpoints (`api:/openapi/v2/...`) are polled through `/openapi/v2/query`; AI App / Workflow virtual models are polled through `/task/openapi/outputs`

ModelScope public REST video generation is not enabled by default because the public official docs verified for this implementation do not expose one stable unified REST video endpoint. Use a deployed OpenAI-compatible service or RunningHub for video.

RunningHub support intentionally treats Standard Model API endpoints, AI Apps, and workflows as provider-backed execution targets. AI App board nodes can read the official RunningHub API-call demo for a `webappId` and turn its `nodeInfoList` into editable prompt/reference/literal bindings. Workflow nodes accept imported API-format JSON. This does not add ComfyUI graph editing, local ComfyUI backends, or local workflow execution to Imagine Workbench.

## Model Defaults

- Image: `12ai:gemini-3.1-flash-image-preview`
- Video: `12ai:veo_3_1-fast`
- Agent chat: `12ai:gemini-3.1-flash-lite-preview`

Agent Mode always uses the chat model you select in the Agent dock. It does not auto-switch models when reference images are present. Sendable references (`http://`, `https://`, or `data:image/*`) are attached to the Agent request; `blob:` and other non-sendable URLs are skipped. If the provider rejects image input, the API error surfaces as usual.

When references are present, the dock may show an OpenRouter-based vision hint (`GET /api/model-vision-support?model=...`). Hints use fuzzy ID matching against OpenRouter `input_modalities` (image). `supportsVision: true|false` is informational only; `null` means no catalog match. Hints never block model selection or change the submitted model.

The UI does not expose sync/async as a user-facing choice; image requests stay synchronous by default, and repeat submissions use the async 12AI endpoint only when the selected image model supports it.

Agent recommendations can query the local model catalog before choosing a generation target, so recommended actions stay aligned with the capabilities currently defined in the app.
Agent action params can carry image/video model controls such as image resolution, image quality, thinking level, video resolution, duration, and preset.

Model-specific parameters are defined in the catalog so the UI can adapt controls per model:

- Gemini image models expose aspect ratio, output size, and thinking-level controls when supported.
- GPT Image models expose explicit pixel sizes and quality.
- GPT Image 2 resolution labels are normalized in the UI as `1K`, `2K`, `4K`, etc. while request payloads still use provider-valid dimensions; RunningHub GPT Image 2 channel/official choices auto-route text-only vs image-edit requests by reference presence.
- Video models expose `auto` size first, so image-to-video can preserve the source image size when the upstream service supports it.
- `12ai:veo_3_1-fast` supports text-to-video and reference-image mode with 0-3 images.
- `12ai:veo_3_1-fast-fl` is the only built-in 12AI first/last-frame mode and requires 1-2 images.
- RunningHub Veo 3.1 models expose channel/official/quality choices while the adapter auto-routes text-only, image-to-video, first/last-frame, and reference-to-video requests by reference count.
- `grok2api:grok-imagine-video` supports optional reference images with the grok2api video parameters.
- Video reference media API/provider payloads accept `data:image/*`, `data:video/*`, and `data:audio/*` base64 data URIs when the selected model capability allows them. Generated remote image results are downloaded by the image route before client storage so later image-to-video references avoid browser CORS fetches.

## Prompt Templates

Prompt templates replaced the older art preset chip system. The shared template source lives in `lib/prompt-templates.ts`, and the reusable picker lives in `components/prompt-templates/PromptTemplatePicker.tsx`.

Current template categories:

- 视角
- 分镜
- 角色
- 产品
- 光影
- 自定义

Supported insertion surfaces:

- Main image prompt panel
- Main video prompt panel
- Mobile composer prompt
- Board Prompt nodes
- Board image/video generation nodes

Users can open the picker with the template button or type `/` in supported prompt text areas. Selecting "插入" replaces the active slash command token when one is present; selecting "替换" replaces the full prompt. Image prompts also apply a template's negative prompt when provided.

## App Routes

- `GET /`: main workstation.
- `GET /board`: standalone canvas operation surface for assets, notes, generation, and Agent interaction.
- `GET /board/[boardId]`: opens a specific persisted board document.
- `POST /api/board/import-image`: imports a `data:image/*` base64 data URI into the local asset store for board workflows.
- `POST /api/gemini/generate-image`: image generation and image editing.
- `POST /api/gemini/generate-video`: video generation.
- `POST /api/gemini/reference-image`: server-side localization path for supported legacy remote image result URLs before they are reused as references.
- `POST /api/gemini/video-status`: polls async image/video operations.
- `POST /api/gemini/image-download`: proxies completed async image downloads.
- `POST /api/gemini/video-download`: proxies completed video downloads.
- `POST /api/gemini/optimize`: expands a visual prompt through the selected chat model.
- `POST /api/gemini/agent`: Agent Mode response and recommended action.
- `GET /api/model-vision-support?model=<id>`: OpenRouter vision hint for Agent dock (`supportsVision`, `source`).
- `GET /api/models?provider=<key>&kind=all|chat|image|video`: loads provider model options dynamically from `/v1/models`.

## Project Layout

```text
app/
  page.tsx                         Main workstation composition shell
  board/page.tsx                   Standalone board operation shell
  board/[boardId]/page.tsx         Specific board route
  api/board/import-image/route.ts   Board image import API
  api/gemini/*                     Generation, agent, status, download APIs
  api/models/route.ts              Provider model listing
components/
  agent/                           Agent dock, AgentIdentityMark wrapper, chat messages
  assets/                          Gallery cards, compare panel, toolbar, fullscreen preview
  board/                           Canvas toolbar, nodes, and board viewport
  brand/                           Shared ImagineMark SVG brand component
  confirm/                         ConfirmProvider, useConfirm, useAlert for destructive actions
  creation/                        Image/video generation panels
  prompt-templates/                Shared prompt template picker
  reference/                       Reference image picker, drag-and-drop, @-mention dropdown
  settings/                        Settings modal (connections + 数据 management)
  workbench/                       Workspace header, WorkbenchProviders, notices, gallery layout
  CanvasMaskEditor.tsx             In-browser mask editor
lib/
  agent-chat-model.ts              Agent reference normalization and sendable URL rules
  theme-mode.ts                    Theme persistence, html bootstrap sync, useThemeMode hook
  board/                           Board types, defaults, and IndexedDB persistence
  client-fetch-error.ts            Shared client-side fetch error reader
  data-management.ts               Workspace backup, import, cleanup, board reset
  db.ts                            IndexedDB asset store
  openrouter/                      OpenRouter model catalog cache for vision hints
  prompt-templates.ts              Built-in template catalog and insertion helpers
  providers/                       Provider registry, adapters, model catalog, types
hooks/
  useAgentController.ts            Agent chat, tool actions, auto-execute countdown
  useAssetActions.ts               Asset selection, delete, cancel, retry, export actions
  useAssetWorkspaceState.ts        Gallery filters, stats, compare state
  useClipboardImageImport.ts       Clipboard image reference import
  useGenerationActions.ts          Image/video submit actions
  useMediaPolling.ts               Async media polling and result download
  useProviderSettings.ts           Provider credentials, model list, connection tests
  useReferenceState.ts             Prompt/reference image state and drag/drop handling
  use-mobile.ts                    Mobile breakpoint helper
tests/
  agent-chat-model.test.ts         Agent sendable reference helpers
  openrouter-capabilities.test.ts  OpenRouter vision index matching
  *.test.ts                        Node test suite for helpers and provider behavior
```

Board text edits are flushed and the board is saved before leaving or switching boards.
Board documents loaded from IndexedDB are normalized at runtime before they reach React Flow. The loader drops invalid or duplicate nodes, recomputes valid edge kinds from current port definitions, clamps viewport/size values, and clears stale selections after board switches.
Board generation resolves connected image references against the latest asset store URL, then converts `blob:`, `data:image/*`, or supported legacy remote result URLs into compressed `data:image/*` payloads before calling provider routes. This keeps board image/video references inside the same API boundary as the main workstation and avoids browser-side CORS fetches against provider storage.

## Development Commands

```bash
pnpm run dev
pnpm run dev:no-hmr
pnpm run lint
pnpm run build
pnpm run pages:build
pnpm run start
pnpm run test:providers
```

`pnpm run dev` keeps Fast Refresh/HMR enabled for normal local work. `pnpm run dev:no-hmr` is only for non-interactive agent sessions that intentionally disable file watching while rewriting files rapidly. `pnpm run pages:build` clears prior Next/Vercel output and enables Vercel Corepack support so the Cloudflare adapter uses the `packageManager` version declared in `package.json`.

`next.config.ts` enables standalone output, React strict mode, and strict TypeScript build checking. ESLint is ignored during builds but should still be run during development. For production standalone output, build first and run the generated standalone server when needed.

## Notes

- Generated assets are stored in the browser, not in a server database.
- Async operations are tracked with operation names in the form `provider:mediaType:id`.
- Reference images are passed as data URI base64 strings.
- Provider metadata lives in `lib/providers/registry.ts` — the single source of truth for keys, labels, env vars, defaults, and UI fields.
- The app keeps provider integration logic in `lib/providers/*`; avoid putting provider-specific request details directly in UI components.
- Built-in model capabilities in `MODEL_CAPABILITIES` serve as initial defaults. The "获取模型" button fetches the live model list from each provider's `/v1/models` endpoint and merges it into the dropdowns. Models are auto-classified as chat/image/video by name.
- Board documents are persisted separately from generated media. Board nodes reference assets by ID/url, while generated media remains owned by the IndexedDB asset store.
- Board generation resolves connected image references against the latest IndexedDB asset item before submission.
- React Flow node state on the board should stay single-source from the normalized board document. Use transient visual state only for active drag feedback, then write settled positions back to `useBoardState`.
- Settings → 数据 can export/import a ZIP workspace backup, clear asset or board stores, reset boards to the default document, and remove selected localStorage groups. Optional credential export is explicit and off by default.
- Agent UI and board Agent nodes share `components/agent/AgentIdentityMark.tsx`, which renders `components/brand/ImagineMark.tsx`.
- Destructive or irreversible actions use `useConfirm()` / `useAlert()` from `components/confirm/ConfirmProvider.tsx` (wrapped at the app root by `components/workbench/WorkbenchProviders.tsx`).
