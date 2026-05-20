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

- `app/page.tsx`: main browser UI for traditional image/video generation, Agent Mode, gallery, compare, masking, batch delete, and ZIP export.
- `app/api/gemini/*`: server routes for generation, optimization, Agent Mode, async polling, and media download proxying.
- `app/api/gemini/agent/route.ts`: Agent Mode with tool-calling loop. Uses zod for request/response validation. Agent calls tools to query models, skills, and gallery assets before recommending actions. Model IDs are validated server-side against the catalog.
- `app/api/gemini/agent/tools.ts`: Agent tool definitions and executors. Tools: `query_models`, `get_skill_info`, `get_gallery_assets`. Tool arg schemas defined with zod, JSON Schema introspected for OpenAI tool definitions.
- `app/api/gemini/agent/skills.ts`: Skill registry (static descriptions). Agent activates skills at runtime via tools rather than a pre-routed LLM call.
- `app/api/models/route.ts`: provider model listing.
- `lib/providers/*`: provider adapters, model catalog, tool-calling chat completions, parsing, request helpers, and shared types.
- `lib/db.ts`: browser IndexedDB persistence for generated assets.
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

Provider model IDs are parsed in `lib/providers/model-catalog.ts`.

Supported provider prefixes:

- `12ai:`
- `12ai-async:`
- `grok2api:`

Credential and base URL resolution belongs in `lib/providers/utils.ts`.

Generation responsibilities:

- Image generation/editing: `lib/providers/image.ts`
- Video generation/status/download: `lib/providers/video.ts`
- Chat completions and JSON parsing: `lib/providers/chat.ts`
- Model listing: `lib/providers/models.ts`

Keep API routes thin: parse body, resolve provider config, call provider adapter, return response.

## Agent Tool Calling

The Agent Mode uses OpenAI-compatible function calling with a bounded loop (max 3 rounds). The flow:

1. Request body is validated with a zod schema (`agentBodySchema`).
2. Skill names only (not full descriptions) are injected into the system prompt.
3. Gallery assets are NOT injected — the agent queries them via `get_gallery_assets` when needed.
4. The agent loop calls `createChatCompletionWithTools`; if the model returns `tool_calls`, each is executed and results fed back.
5. After the loop, the final LLM text response is parsed with `agentResponseSchema` (zod).
6. `validateActionModel` checks the recommended model ID against `MODEL_CAPABILITIES` — invalid IDs are stripped.
7. `validateActiveSkills` filters skill names to known registry entries.

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
