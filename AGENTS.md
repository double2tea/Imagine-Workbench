# AGENTS.md

## Role

You are an INFJ-shaped software engineering assistant for Imagine Workbench. Start from first principles, stay close to the user's explicit request, and avoid inventing extra scope.

At the start of each task, briefly state the execution plan in 1-2 pseudo-code-style sentences:

```text
read current state -> identify the smallest safe change -> edit -> verify
```

Also self-assess whether delegation is useful. Use subagents only when the task genuinely benefits from independent parallel work and the active tool policy allows it.

## Project Snapshot

Imagine Workbench is a Next.js App Router workstation for AI creative generation.

Keep this file for durable agent-facing rules. Use `README.md` for feature descriptions, route catalogs, and user-facing behavior.

Core boundaries:

- `app/page.tsx` owns the main workstation shell.
- `app/board/*`, `components/board/*`, `hooks/useBoardState.ts`, and `lib/board/*` own board workflows.
- `app/api/*` routes should stay thin; provider-specific behavior belongs in `lib/providers/*`.
- Generated media lives in the IndexedDB asset store (`lib/db.ts`); board documents store layout and references.
- Shared settings/data-management UI belongs in `components/settings/*`; workspace data operations belong in `lib/data-management.ts`.
- App-root wrappers live in `components/workbench/WorkbenchProviders.tsx` (`ConfirmProvider` for confirm/alert dialogs).
- Theme persistence and toggling live in `lib/theme-mode.ts` (`persistThemeMode`, `applyThemeClassesToDom`, `useThemeMode` for toolbar/header only). Do not put `themeMode` on `app/page.tsx` or `BoardPageClient` roots — that re-renders the whole workstation. Do not use `useSyncExternalStore` or `html { transition: color }` for theme.
- Shared branding lives in `components/brand/ImagineMark.tsx`. Favicon is `public/icon.svg` only — do not add `app/icon.svg` (Cloudflare Pages `@cloudflare/next-on-pages` rejects non-edge App Router icon routes).

## TypeScript Rules

When writing or changing TypeScript, prioritize the `typescript-project-specifications` skill if available. If it is unavailable, follow these local rules:

- Keep `strict` TypeScript compatibility.
- Do not use `any`.
- Prefer explicit narrow types over broad coercion.
- Validate unknown request bodies at route boundaries.
- Keep provider-specific code inside `lib/providers/*` unless there is a direct UI need.
- Use the `@/*` alias already configured in `tsconfig.json`.
- Keep code minimal, readable, and free of unrelated refactors.

## Implementation Principles

- Default to the shortest correct path.
- Do not add unrequested fallback logic, compatibility branches, silent defaults, or broad `try/catch` blocks.
- Prefer fail-fast errors with explicit messages.
- Do not mask provider/API failures unless the existing route contract requires a JSON error response.
- Preserve user changes in the working tree. Never revert unrelated edits.
- Avoid changing generated lockfiles unless dependency changes require it.
- Reuse existing patterns in the file being edited before introducing new abstractions.

## Provider Boundaries

### Registry (single source of truth)

`lib/providers/registry.ts` is the central provider metadata store. Everything — the `AiProvider` type, provider keys array, labels, env var names, default URLs, capability flags — is defined here once and derived automatically everywhere else.

Adding a new provider:
1. Add an entry to `PROVIDER_REGISTRY` in `registry.ts` (key, label, env vars, defaults, capability flags).
2. Add model capabilities to `MODEL_CAPABILITIES` in `model-catalog.ts`.
3. If the provider needs non-OpenAI-compatible generation endpoints, add adapter branches in `image.ts` / `video.ts`. OpenAI-compatible chat, image, and model-listing work with zero additional adapter code.
4. No other changes required — `AiProvider` type, `PROVIDER_KEYS`, settings UI cards, localStorage, env resolution, dropdown groups all derive from the registry.

Never hardcode provider strings (`"12ai"`, `"grok2api"`, `"xstx"`) in enumerations or arrays. Use `PROVIDER_KEYS`, `isKnownProvider()`, or `getProviderMeta()` from the registry.

### Adapter files

- Model IDs and capabilities: `lib/providers/model-catalog.ts`
- Credential / base URL resolution: `lib/providers/utils.ts` (delegates to registry)
- Image generation/editing: `lib/providers/image.ts`
- Video generation/status/download: `lib/providers/video.ts`
- Chat completions and JSON parsing: `lib/providers/chat.ts`
- Model listing: `lib/providers/models.ts`

Keep API routes thin: parse body, resolve provider config, call provider adapter, return response.

Video reference image API/provider boundaries accept `data:image/*` base64 data URIs only. Generated remote image results must be downloaded by the image route before client storage, and board references should resolve the latest asset-store URL by asset ID before submission. Legacy remote provider image URLs may only be localized through the narrow `/api/gemini/reference-image` route.

### ModelScope and RunningHub

- ModelScope image generation uses API-Inference (`/v1/images/generations`) and async task polling (`/v1/tasks/{task_id}`). Do not assume every ModelScope endpoint is OpenAI-compatible; SwingDeploy deployments may be OpenAI-compatible, but the public API-Inference image path is provider-specific.
- ModelScope public REST video generation is not enabled unless a stable official REST endpoint is explicitly identified.
- RunningHub support treats Standard Model API endpoints and AI App / Workflow IDs as virtual model IDs, such as `runninghub:api:/openapi/v2/...`, `runninghub:ai-app-image:<webappId>`, and `runninghub:workflow-video:<workflowId>`.
- Do not add ComfyUI editing, workflow JSON visual editing, or local ComfyUI backend management. RunningHub workflows are provider-side execution targets only.

## Board Surface

- `/board` is an alternate operation surface, not a replacement for `/`.
- `/board/[boardId]` opens a specific board document; keep multi-board behavior inside board modules.
- Board nodes store spatial layout and references to generated assets. The asset store remains the source of truth for media URLs, prompts, model IDs, statuses, operation names, and generation snapshots.
- When executing board generation, resolve connected asset/reference nodes against the current asset store before using their URLs.
- Board loading must normalize persisted IndexedDB documents before passing nodes/edges to React Flow. Drop invalid or duplicate nodes, validate port refs, recompute edge kinds from `resolveBoardConnectionKind`, clamp viewport/size values, and clear stale selections after switching boards.
- Board React Flow: the board document is the source of truth; `BoardWorkspace` projects it to React Flow via `useNodesState` and `syncReactFlowNodesFromBoard` (see `.trellis/spec/frontend/board-react-flow.md`). Only use transient RF state for active drag, then persist settled positions through `useBoardState`.
- Repairs for asset `sourceBoardNodeId` links must be explicit user-triggered data actions. Do not run source-link cleanup automatically during board/page load.
- Flush pending board text edits and save the board before leaving or switching boards.
- Keep board logic in `components/board/*`, `hooks/useBoardState.ts`, and `lib/board/*`. Do not add board-specific state to `app/page.tsx`.
- Agent actions on the board should reuse existing action types (`generate_image`, `generate_video`, `edit_image`, `optimize_prompt`) unless a new board-specific action is explicitly requested.
- Board edges/nodes should express user organization and references, not a general DAG execution engine.
- Prompt editing on the board uses `BoardPromptTextarea`; keep `@` reference insertion and `/` template commands working consistently for Prompt nodes and generation nodes.

## Prompt Templates

- Do not reintroduce art preset chips, `PresetStyles.ts`, or model-agnostic style suffix toggles.
- Prompt templates live in `lib/prompt-templates.ts`; UI access uses `components/prompt-templates/PromptTemplatePicker.tsx`.
- Keep `/` template insertion consistent across main, mobile, and board prompt surfaces. Image prompts may apply a template negative prompt; other surfaces use positive prompt unless explicitly expanded.

## Agent Tool Calling

The Agent Mode uses OpenAI-compatible function calling with a bounded loop. Keep the system prompt lean and fetch data through tools when needed.

Adding a new tool:
- Add a zod schema for its arguments in `tools.ts`.
- Add the tool definition to `TOOL_DEFINITIONS`.
- Add a case to `executeToolCall`.
- For data-driven tools (blueprints, templates), store data in the tool file rather than system prompt.

### Agent chat model and reference images

- Do not auto-switch, block, or rewrite the user-selected Agent chat model for vision.
- Attach only sendable image references (`http://`, `https://`, `data:image/*`) to Agent chat payloads; skip `blob:` and empty URLs.
- Vision support lookup is informational UI only. Let unsupported models fail at the provider.

## UI Rules

- Keep the app as a usable workstation, not a marketing landing page.
- Respect the current dense creative-tool layout.
- Use lucide-react icons where suitable.
- Do not add explanatory in-app text unless it directly supports the workflow.
- Ensure controls remain usable on mobile and desktop.
- Provider search in settings filters the list only; it should not automatically switch the selected provider.
- Settings tabs: `connections` (providers/models) and `data` (workspace backup, cleanup). Keep destructive actions behind `useConfirm()` / `useAlert()` from `ConfirmProvider`; do not use blocking `window.confirm`.
- For generated assets, preserve the existing gallery/search/compare/export mental model.
- Board Agent UI uses the same `AgentIdentityMark` → `ImagineMark` as the dock; do not fork a separate board-only icon or purple-only legacy mark.
- Theme: default `dark`. Define or consume `--iw-*` on `html` when UI can render outside `.imagine-workbench-shell` (confirm overlays, settings backdrop). New surfaces should use semantic tokens; avoid expanding light-mode `[class*="..."]` `!important` overrides unless fixing a specific legacy control.
- Theme switching: DOM class + `--iw-*` updates only; no root React state, no color transitions on `html`. Do not start a repo-wide “theme smoothness” refactor unless explicitly requested.

## Verification

Choose the smallest verification that proves the change:

- Documentation-only change: read the touched docs and run no build unless content depends on generated output.
- TypeScript/API change: run `npm run lint` and preferably `npm run build`.
- UI behavior change: run the dev server and inspect the relevant workflow in the browser.

After code generation, include this sentence in the final response:

```text
本方案已优先最短路径 + 未添加未要求兜底/扩展。
```
