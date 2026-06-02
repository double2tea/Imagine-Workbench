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

Current core surfaces:

- `app/page.tsx`: main browser composition shell. It wires workstation state/hooks into creation panels, Agent Dock, gallery, settings, fullscreen preview, and mask editor.
- `app/board/page.tsx`: standalone canvas operation shell. It reuses the existing asset store, generation hooks, provider settings, Agent Dock, mask editor, and media polling while presenting a spatial board workflow.
- `app/board/[boardId]/page.tsx`: specific persisted board route.
- `app/api/board/import-image/route.ts`: board image import route for `data:image/*` base64 data URI capture into local assets.
- `app/api/gemini/*`: server routes for generation, optimization, Agent Mode, async polling, and media download proxying.
- `app/api/gemini/agent/route.ts`: Agent Mode with tool-calling loop. Uses zod for request/response validation. Agent calls tools to query models, skills, and gallery assets before recommending actions. Model IDs are validated server-side against the catalog.
- `app/api/gemini/agent/tools.ts`: Agent tool definitions and executors. Tools: `query_models`, `get_skill_info`, `get_gallery_assets`, `get_prompt_blueprint`. Tool arg schemas defined with zod, JSON Schema introspected for OpenAI tool definitions.
- `app/api/gemini/agent/skills.ts`: Skill registry (static descriptions). Agent activates skills at runtime via tools rather than a pre-routed LLM call.
- `app/api/models/route.ts`: provider model listing.
- `components/prompt-templates/PromptTemplatePicker.tsx`: reusable prompt template picker, including slash-command opening and portal-based floating panel.
- `lib/prompt-templates.ts`: built-in template catalog, categories, slash-command detection, and insertion helpers.
- `hooks/useAgentController.ts`: Agent chat state, localStorage persistence, tool action execution, auto-execute countdown, and Agent API submission.
- `hooks/useAssetActions.ts`: gallery actions for selection, delete, cancel, retry, metadata export, ZIP export, and compare toggles.
- `hooks/useAssetWorkspaceState.ts`: gallery filters, counts, search, selected IDs, compare state, and derived reference-image lists.
- `hooks/useGenerationActions.ts`: manual image/video submission, temporary asset records, async operation handles, and generation abort controllers.
- `hooks/useProviderSettings.ts`: provider credentials, base URLs, model-list fetching, connection tests, and header construction.
- `hooks/useReferenceState.ts`: reference image upload/drop handling, prompt `@` references, and role toggling.
- `hooks/useMediaPolling.ts`: async image/video status polling and final media download into IndexedDB.
- `lib/providers/*`: provider adapters, model catalog, tool-calling chat completions, parsing, request helpers, and shared types.
- `lib/client-fetch-error.ts`: shared client-side helper for JSON and non-JSON provider error responses.
- `lib/db.ts`: browser IndexedDB persistence for generated assets.
- `lib/board/*`: board document types, defaults, and IndexedDB persistence. Board data stores layout and references; generated media remains owned by `StorageItem` in `lib/db.ts`.
- `components/CanvasMaskEditor.tsx`: local mask drawing UI.

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

Video reference image API/provider boundaries accept `data:image/*` base64 data URIs only. Generated remote image results must be downloaded by the image route before client storage, and board references should resolve the latest asset-store URL by asset ID before submission.

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
- Flush pending board text edits and save the board before leaving or switching boards.
- Keep board logic in `components/board/*`, `hooks/useBoardState.ts`, and `lib/board/*`. Do not add board-specific state to `app/page.tsx`.
- Agent actions on the board should reuse existing action types (`generate_image`, `generate_video`, `edit_image`, `optimize_prompt`) unless a new board-specific action is explicitly requested.
- Board edges/nodes should express user organization and references, not a general DAG execution engine.
- Prompt editing on the board uses `BoardPromptTextarea`; keep `@` reference insertion and `/` template commands working consistently for Prompt nodes and generation nodes.

## Prompt Templates

- Art preset chips have been removed. Do not reintroduce `PresetStyles.ts` or model-agnostic style suffix toggles.
- Built-in prompt templates live in `lib/prompt-templates.ts`.
- UI access uses `components/prompt-templates/PromptTemplatePicker.tsx`.
- Supported prompt surfaces: main image panel, main video panel, mobile composer, board Prompt nodes, and board image/video generation nodes.
- Slash commands use `detectPromptTemplateSlashCommand()`. Insert mode should replace the active slash token when present; replace mode should replace the full prompt.
- Image prompts may apply a template negative prompt. Video and board prompt insertion should only use the positive prompt unless explicitly expanded.

## Agent Tool Calling

The Agent Mode uses OpenAI-compatible function calling with a bounded loop (max 3 rounds). The flow:

1. Request body is validated with a zod schema (`agentBodySchema`).
2. Skill names only (not full descriptions) are injected into the system prompt.
3. Gallery assets are NOT injected — the agent queries them via `get_gallery_assets` when needed.
4. The agent loop calls `createChatCompletionWithTools`; if the model returns `tool_calls`, each is executed and results fed back.
5. After the loop, the final LLM text response is parsed with `agentResponseSchema` (zod).
6. `validateActionModel` checks the recommended model ID against `MODEL_CAPABILITIES` — invalid IDs are stripped.
7. `validateActiveSkills` filters skill names to known registry entries.

Agent action schemas support image/video parameter fields: `imageResolution`, `imageQuality`, `thinkingLevel`, `videoResolution`, `videoDuration`, and `videoPreset`.

Adding a new tool:
- Add a zod schema for its arguments in `tools.ts`.
- Add the tool definition to `TOOL_DEFINITIONS`.
- Add a case to `executeToolCall`.
- For data-driven tools (blueprints, templates), store data in the tool file rather than system prompt.

The system prompt is kept lean: no hardcoded model recommendations, no gallery summary, no full skill descriptions. All data is fetched on demand through tools (progressive disclosure).

### Prompt Engineering

The `PromptEngineer` skill and `get_prompt_blueprint` tool encode knowledge from prompt libraries:

- **Structured JSON format** for complex compositions (infographics, UI mockups, posters) — use explicit `type`/`style`/`subject`/`sections`/`callouts` fields
- **Use case taxonomy** (10 categories): portrait, social-media, infographic, youtube-thumbnail, comic-storyboard, product-marketing, ecommerce, game-asset, poster-flyer, app-web-design
- **Style taxonomy** (16 categories): photography, cinematic, anime, illustration, sketch, 3D-render, chibi, isometric, pixel-art, oil-painting, watercolor, ink/chinese, retro/vintage, cyberpunk/sci-fi, minimalism
- **GPT Image 2 notes**: pixel-perfect text rendering, multi-language support, cross-image consistency — prefer for infographics, posters, and storyboards

## UI Rules

- Keep the app as a usable workstation, not a marketing landing page.
- Respect the current dense creative-tool layout.
- Use lucide-react icons where suitable.
- Do not add explanatory in-app text unless it directly supports the workflow.
- Ensure controls remain usable on mobile and desktop.
- Provider search in settings filters the list only; it should not automatically switch the selected provider.
- For generated assets, preserve the existing gallery/search/compare/export mental model.

## Verification

Choose the smallest verification that proves the change:

- Documentation-only change: read the touched docs and run no build unless content depends on generated output.
- TypeScript/API change: run `npm run lint` and preferably `npm run build`.
- UI behavior change: run the dev server and inspect the relevant workflow in the browser.

After code generation, include this sentence in the final response:

```text
本方案已优先最短路径 + 未添加未要求兜底/扩展。
```
