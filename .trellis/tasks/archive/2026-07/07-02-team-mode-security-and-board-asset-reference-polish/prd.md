# Team Mode Security and Board Asset Reference Polish

## Goal

Close the highest-risk team-mode gaps found in the `origin/main...HEAD` review: team provider calls must respect team authentication/roles, first-owner setup and Docker builds must not create avoidable security risks, and PostgreSQL-backed assets must remain usable as Board references for generation and analysis workflows.

## What I Already Know

* The user approved implementing Phase 1 and Phase 2 from the review plan.
* Phase 1 covers team-mode security closure: provider auth, first-owner bootstrap race, and Docker secret exclusion.
* Phase 2 covers Board/team asset reference closure: PostgreSQL asset media URLs should work as references in Board generation and analysis flows.
* Existing team storage conventions use `viewer` for read-only workspace access, `editor` for writes/generation/task mutation, and `admin` for team settings/secrets/member-management.
* Browser IndexedDB mode still needs local provider headers/env-based provider resolution.

## Requirements

* In `IMAGINE_STORAGE_TARGET=postgres`, Workbench-internal provider-backed API calls must require a valid team session before resolving provider credentials.
* Workbench-internal team provider calls should require `editor` role by default, matching existing generation/task write semantics.
* External compatible API surfaces, such as `/v1/*` and chat gateway wrappers, may continue to accept explicit request credentials without a team session so existing API clients do not break.
* Browser mode must continue to support request-provided provider credentials and env credentials.
* Team mode must not allow `x-ai-api-key` or `x-ai-base-url` to bypass team session/role checks on Workbench-internal routes.
* Team provider config resolution should continue to read encrypted team provider secrets/settings after the session/role check passes.
* First-owner bootstrap must be safe under concurrent setup requests.
* Docker build context must exclude local dotenv files.
* Board references to PostgreSQL team assets must resolve into request-sendable media URLs or payloads for image, video, prompt text, and agent analysis paths.
* The fix should stay narrow: no new provider model, no new Board execution engine, no broad UX redesign.

## Acceptance Criteria

* [ ] Anonymous provider API calls in team mode return an auth/permission error before provider credentials are used.
* [ ] Viewer sessions cannot make provider-backed generation/optimization/agent calls in team mode.
* [ ] Editor, admin, and owner sessions can make provider-backed calls using stored team provider credentials.
* [ ] Browser mode provider calls keep existing local credential behavior.
* [ ] Concurrent first-owner bootstrap attempts cannot create multiple owner workspaces.
* [ ] Docker build context excludes `.env*` files.
* [ ] A complete team asset can be used from the Board as an image reference.
* [ ] A complete team asset can be used from the Board as a video/media reference where the target operation supports that media type.
* [ ] Board prompt-text/agent media references do not silently drop valid team assets merely because their media route is relative.
* [ ] Relevant tests are added or updated for the security and reference paths.
* [ ] `pnpm run lint` and the smallest targeted tests for the changed code pass.

## Definition of Done

* Changes are minimal and follow existing project boundaries.
* Security-sensitive paths fail fast with explicit API errors.
* No unrequested fallback/provider compatibility behavior is added.
* Tests cover the changed behavior at the route/helper level where practical.
* Existing verification commands are run; any environment blocker is documented.

## Technical Approach

* Update team provider config resolution so PostgreSQL mode always validates the team session/role before considering provider overrides. Keep browser mode on the existing `resolveProviderConfig` path.
* Preserve request-level credentials for browser mode only. In team mode, ignore them as an auth bypass and use team settings/secrets or env fallback only after role validation.
* Protect bootstrap with a PostgreSQL transaction-level advisory lock or equivalent database-level serialization around the owner-exists check and inserts.
* Add `.env*` to `.dockerignore`.
* Normalize team asset media URLs before Board/reference submission. Prefer a single helper that turns same-origin relative API media routes into absolute URLs or fetchable payloads without broadening accepted URL types beyond existing route-owned media.
* Extend tests around the changed helpers/routes rather than adding broad end-to-end coverage.

## Decision (ADR-lite)

**Context**: Team mode introduces shared provider credentials and shared assets. The review found provider route bypasses and Board reference failures caused by mixing browser-mode assumptions with PostgreSQL mode.

**Decision**: Treat PostgreSQL mode as an authenticated team workspace for Workbench-internal provider routes. Those calls require `editor` role by default; browser mode retains request/env credential behavior. External compatible API surfaces keep request credential/gateway behavior without a team session. Team asset media routes remain route-owned, but Board/reference preparation must recognize and prepare them correctly.

**Consequences**: Viewers can still browse workspace data but cannot spend provider credits. Existing browser mode behavior is preserved. Some helper tests need to distinguish browser-mode request credentials from team-mode team credentials.

## Out of Scope

* Phase 3 UI polish: first-load storage flash, top-level Clear Project team UX, Settings permission copy, mobile storage badge.
* Phase 4 broader maintenance: migration locking beyond bootstrap unless directly touched, `/api/board/prompt-text` request-size hardening.
* New team billing/quota/rate-limit policy.
* New provider registry behavior.
* Full browser automation pass.

## Technical Notes

* Provider config: `lib/providers/team-config.ts`, `lib/providers/utils.ts`.
* Provider routes using team config: `app/api/media/*`, `app/api/prompts/optimize/route.ts`, `app/api/agent/respond/route.ts`, `app/api/board/prompt-text/route.ts`, `lib/api/openai-media.ts`, `lib/api/chat-completions.ts`, `lib/api/openai-models.ts`.
* Team auth/context: `lib/storage/team-auth.ts`, `lib/storage/team-context.ts`.
* Bootstrap: `lib/storage/team-bootstrap.ts`.
* Team asset media URL conversion: `lib/storage/team-assets.ts`, `lib/storage/team-client.ts`, `lib/api/routes.ts`.
* Board reference resolution: `components/board/BoardPageClient.tsx`, `hooks/useGenerationActions.ts`, `lib/reference-images.ts`, `lib/agent-chat-model.ts`.
* Docker context: `.dockerignore`, `Dockerfile`.
