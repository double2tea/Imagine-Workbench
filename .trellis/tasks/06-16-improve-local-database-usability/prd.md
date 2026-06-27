# PostgreSQL Team Storage Architecture

## Goal

Redesign Imagine Workbench storage for two clear modes:

* **Browser mode**: deployed/static/single-user experience continues to use browser IndexedDB by default.
* **Team PostgreSQL mode**: local LAN/self-hosted team deployments use a PostgreSQL-backed authoritative workspace, with future member login/management and online deployment kept feasible.

This replaces the earlier SQLite plan. PostgreSQL is now the target team database.

## What I Already Know

* User asked to continue improving local database usability.
* User first explored SQLite, then clarified a LAN/self-hosted team deployment target with future login/member management. The earlier "10 users" mention was only a rough team-size signal, not a hard product or architecture limit.
* User decided to switch from SQLite to PostgreSQL and requested a redesigned architecture plan.
* Current app stores generated media metadata and payloads in browser IndexedDB (`lib/db.ts`), boards in browser IndexedDB (`lib/board/persistence.ts`), and data-management flows in `lib/data-management.ts`.
* Current `lib/storage/*` already contains a storage schema/repository contract foundation, but it was planned around local targets and does not yet implement PostgreSQL.
* Settings -> Data already provides health, backup, restore, cleanup, safety snapshot, and local media import UI.
* Cloudflare Pages/public deployed builds must remain browser-first and must not be broken by Node-only database routes.

## 2026-06-21 Refresh

The plan is still directionally correct, but it must be refreshed before implementation because the app gained new persisted state and the project spec previously contained the earlier SQLite/local-database contract.

Current state to account for:

* `ImagineWorkbenchDB` is now version `9` and includes `assets_meta`, legacy `assets_blob`, content-addressed `asset_blob_payloads`, `asset_previews`, `asset_library`, and `generation_tasks`.
* `GenerationRequestSnapshot` now includes fields that must survive PostgreSQL import/export, including `cinematicProfile`, `referenceMedia`, reference dimensions, audio settings, RunningHub bindings, and deprecated `referenceImages` read support.
* Asset metadata now includes board/result-stack/library linkage such as `scope`, `boardId`, `sourceBoardNodeId`, `sourceBoardResultStackKey`, `libraryItemId`, `contentHash`, crop derivative metadata, and preview status fields.
* Board persistence now has `ImagineWorkbenchBoardDB.boards` and regenerated `board_summaries`.
* User-created prompt templates live in `localStorage.imagine_custom_prompt_templates`.
* Language/theme/default model/image-edit model/price/board/Agent orb preferences now live in localStorage and need explicit migration policy.
* Board generated-media "viewed" markers live in per-board localStorage as `imagine_board_viewed_generated_asset_ids:<boardId>`. They are local UX attention state, not shared board or asset schema.
* RunningHub saved AI App/workflow targets live in `localStorage.imagine_runninghub_saved_targets` and may include access passwords, so they belong with optional encrypted provider targets rather than ordinary UI preferences.
* The current `lib/data-management.ts` managed localStorage list does not include every persisted key above. Before building PostgreSQL import, data-management inventory must be updated so browser backup/restore and PostgreSQL migration share one source-of-truth classification.
* `.trellis/spec/frontend/state-management.md` has been revised with the final `browser` + `postgres` decision so implementation context no longer points coding agents toward the superseded SQLite/local-database direction.

## 2026-06-27 Implementation Update

Completed in the latest continuation:

* Added `GET /api/storage/team/data-summary` as a Node-only, viewer-authenticated PostgreSQL workspace summary route.
* Added `getTeamWorkspaceDataSummary()` to compute workspace-scoped asset, board, payload, library, generation task, prompt template, provider target, settings/secrets, voice profile, integrity, and latest safety snapshot summary data from PostgreSQL.
* Extended `WorkspaceDataSummary` with an optional `teamStorage` segment so Settings -> Data can render browser and PostgreSQL summaries through the same component shape.
* Added `fetchTeamWorkspaceDataSummary()` and client-side response validation.
* Updated Settings -> Data refresh flow so browser mode still uses IndexedDB/localStorage summary, while PostgreSQL mode fetches the team summary.
* Updated Settings -> Data cards and storage structure to display Team Settings, Team Media, payload refs, library records, generation tasks, and settings counts in PostgreSQL mode.
* Disabled browser cleanup/repair issue actions while showing PostgreSQL diagnostics, so team-mode diagnostics do not mutate IndexedDB/localStorage by mistake.
* Added service/client tests for team data summary and updated Trellis state-management code-spec with the cross-layer contract.
* Added in-memory per-instance brute-force protection for team login and first-owner bootstrap routes, including generic bootstrap token failures and 429 lockout responses.
* Added team rate-limit unit tests and a bootstrap route regression test that verifies repeated invalid setup tokens are locked before database access.
* Extended PostgreSQL team data summary with media volume consistency counts for missing payload/preview files, orphaned original/preview files, and tmp/trash files.
* Updated Settings -> Data to surface team media consistency counts without exposing media directory paths or raw storage keys.
* Extracted shared team media consistency helpers so summary and cleanup use the same missing/orphan/tmp/trash classification.
* Added `POST /api/storage/team/media-maintenance` for admin/CSRF-protected PostgreSQL media maintenance cleanup of orphaned originals/previews plus `tmp/` and `trash/` files only.
* Added Settings -> Data and team-client wiring so PostgreSQL mode can clean actionable maintenance files and refresh the team data summary afterward.
* Added service/client/helper tests proving cleanup does not delete referenced files, does not repair missing DB refs, rejects viewers, writes `team_media.cleanup` audit events, and preserves server-only media paths/storage keys.
* Extracted browser backup manifest/index constants and public backup result types into `lib/workspace-backup-format.ts` so browser and PostgreSQL export paths share the same portable ZIP vocabulary.
* Added `GET /api/storage/team/backup` as a Node-only, admin-authenticated PostgreSQL team workspace ZIP export route.
* Added `exportTeamWorkspaceBackup()` to export workspace-scoped assets/media, boards, asset-library records, generation tasks, voice profiles, non-secret team settings, and an empty browser `localStorage` settings segment using the existing backup schema.
* Team backup export redacts RunningHub access passwords from asset generation snapshots and board documents, records `team_backup.export` audit events, and exports encrypted team setting secrets only when the user explicitly opts into credential-inclusive backup. Secret values are decrypted server-side for the portable backup file and are never returned through ordinary settings/secret APIs.
* Updated Settings -> Data so PostgreSQL mode routes full workspace export to the team backup route, while restore/import, current-board export, and safety snapshot download do not fall through to browser IndexedDB/localStorage actions.
* Added service/client tests for PostgreSQL team workspace export, ZIP contents, password redaction, audit-event creation, explicit credential-export rejection, and client download/count parsing.
* Added `POST /api/storage/team/backup` as an admin/CSRF-protected PostgreSQL workspace restore route for existing portable backup ZIPs.
* Added `restoreTeamWorkspaceBackup()` to parse the shared backup manifest, create a pre-restore team safety snapshot, replace workspace assets/boards/library/tasks/voice profiles and non-secret team settings inside a transaction, optionally re-encrypt imported team secrets when credential restore is explicitly enabled, and write `team_backup.restore` audit events.
* Extended the local-file payload store to support `application/zip` safety snapshot payloads, and counted latest safety snapshot payload refs as referenced media so team media cleanup does not misclassify restore snapshots as orphaned files.
* Updated Settings -> Data so PostgreSQL mode can restore a backup through the team route with session + CSRF checks, then refresh the team data summary.
* Added service/client tests for team restore upload, transaction behavior, restored payload bytes, safety snapshot creation, restore audit events, credential-restore opt-in enforcement, team setting/secret import, and response validation.
* Extended `POST /api/storage/team/media-maintenance` with a `"missing-payload-assets"` target that deletes PostgreSQL asset rows whose local-file payloads are already missing on disk, while leaving remote refs and preview-only missing assets untouched.
* Updated Settings -> Data so PostgreSQL missing-payload diagnostics can trigger an explicit admin repair action, with separate confirm copy from safe file cleanup.
* Added service/client tests covering the new DB-row cleanup target, transaction behavior, audit event creation, target response validation, and existing maintenance-file behavior.
* Extended the team-aware provider config resolver so server-side provider routes can read encrypted team API keys plus non-secret provider base URLs/custom provider metadata from PostgreSQL, while preserving explicit request header precedence.
* Updated RunningHub board-node saved target controls so browser mode keeps `imagine_runninghub_saved_targets`, while PostgreSQL mode loads/saves/deletes targets through `/api/storage/team/provider-targets` and keeps access-password entry as an unsaved local draft instead of writing it to the team board document.
* Added server-side RunningHub target access-password resolution for image, video, and audio-workflow generation routes: explicit request passwords still win, otherwise authenticated PostgreSQL team requests decrypt the saved provider target password by the current virtual RunningHub model id.
* Added tests for decrypted team provider-target access-password reads and malformed ciphertext rejection.
* Hardened PostgreSQL Provider Settings model-option restore so corrupt `provider:modelOptions:*` team setting JSON applies default option groups, including empty custom-provider groups, without falling back to browser `localStorage`.
* Added provider settings storage tests covering corrupt team setting JSON and valid custom-provider model option merges.
* Added `DELETE /api/storage/team/assets` plus `clearTeamAssets()` service/client wiring so Settings -> Data clear-assets in PostgreSQL mode clears workspace assets, cascaded payloads/previews/library rows, and generation tasks without mutating browser IndexedDB.
* Team clear-assets requires admin, CSRF, trusted origin, runs in a transaction, writes a `team_assets.clear` audit event with non-secret counts, and leaves physical media-file cleanup to explicit maintenance actions.
* Added `DELETE /api/storage/team/boards` plus `resetTeamBoards()` service/client wiring so Settings -> Data reset-boards in PostgreSQL mode deletes workspace boards, recreates the default board, refreshes team summary, and avoids browser IndexedDB board persistence.
* Team reset-boards requires admin, CSRF, trusted origin, runs in a transaction, writes a `team_boards.reset` audit event with non-secret count/default-board metadata, and returns the new default board/version for client validation.
* Extracted `lib/workspace-local-storage-inventory.ts` so browser backup, data diagnostics, and PostgreSQL team restore share one managed localStorage classification source. Resolve integration toggles and board generated-media viewed markers are explicitly local-only.
* Extended PostgreSQL team backup restore so portable browser backup `settings.localStorage` entries are no longer rejected wholesale. Classified provider settings/model options become team settings, custom prompt templates become `prompt_templates` rows, provider API keys and legacy credential keys become encrypted team secrets only with explicit credential restore, RunningHub saved targets become `saved_provider_targets`, local-only entries are skipped with audit/response counts, and unknown managed keys fail fast.
* Added direct browser-to-PostgreSQL import from Settings -> Data: the UI previews IndexedDB/localStorage sources, blocks unknown persisted sources before mutation, builds a browser backup File in memory, and restores it through the existing team backup route so admin, CSRF, safety snapshot, transaction, and credential opt-in behavior stay shared.
* Added `PATCH /api/storage/team/assets` with `action: "repair-stale-source-links"` plus `repairTeamAssetSourceLinks()` service/client wiring so PostgreSQL Settings -> Data can explicitly clear stale asset `sourceBoardNodeId` metadata without mutating browser IndexedDB.
* Team stale-source repair requires admin, CSRF, trusted origin, scopes assets/boards through the authenticated workspace repository, writes a `team_assets.repair_source_links` audit event with a non-secret repaired count, returns repaired asset ids to the caller, and refreshes the team data summary.
* Added service, route, and client tests covering stale-source repair filtering, viewer rejection, audit metadata, missing-CSRF rejection before database access, and PATCH client request shape.
* Refreshed local team deployment docs to match current implementation: Docker Compose remains opt-in, backup/restore verification is documented, upgrade/rollback steps are explicit, and the current scope now includes team backup/restore, direct browser import, provider/RunningHub team settings, clear/reset, media maintenance, missing-payload cleanup, and stale source-link repair.
* Extended `POST /api/storage/team/media-maintenance` with a `"missing-preview-refs"` target that deletes PostgreSQL `asset_previews` rows whose local-file preview files are missing, while leaving assets and original payload refs untouched.
* Updated Settings -> Data so PostgreSQL missing-preview diagnostics can trigger an explicit owner/admin repair action when no missing-payload action takes priority.
* Added service/client tests covering missing-preview ref cleanup, workspace-scoped delete SQL, transaction behavior, non-secret audit metadata, target response validation, and preservation of asset rows.
* Added required `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES` configuration for PostgreSQL team mode, wired it into `LocalFilePayloadStore` writes, team backup/restore payload imports, Docker Compose, Settings -> Data health display, public runtime status, and deployment docs.
* Media payloads larger than the configured byte limit now fail visibly before a local-file payload is written, and config/status APIs expose only the non-secret byte limit without returning `DATABASE_URL` or `IMAGINE_MEDIA_DIR`.
* Added config/runtime/payload-store tests covering missing/invalid byte limits, public redaction, and over-limit payload rejection.
* Added non-secret system audit events for applied PostgreSQL schema migrations: `applyPostgresMigrations()` now records `team_migrations.apply` with app version, applied count, and migration ids after pending migrations run, without storing setup tokens, database URLs, or media paths.
* Added optional `IMAGINE_MEDIA_USAGE_WARNING_BYTES` for PostgreSQL team mode. Team data summary now returns aggregate media directory bytes plus `mediaUsageWarning`, and Settings -> Data shows an attention issue when total media usage reaches the configured threshold without exposing paths.
* Added `team_asset.delete` audit coverage for single team asset deletes. The service now wraps the workspace-scoped delete plus non-secret asset-id audit metadata in one transaction.
* Added `team_board.delete` audit coverage for single team board deletes. The service now wraps the workspace-scoped delete plus non-secret board-id audit metadata in one transaction.
* Added `team_asset_library.delete` audit coverage for team asset-library deletes. The service now wraps the dedicated backing-asset or promoted-library-row delete plus non-secret item/asset metadata in one transaction.
* Added `team_voice_profile.delete` audit coverage for team voice-profile deletes. The service now wraps the workspace-scoped delete plus non-secret profile/reference-count metadata in one transaction.
* Added `team_prompt_template.delete` audit coverage for team prompt-template deletes. The service now wraps the workspace-scoped delete plus non-secret template-id metadata in one transaction.
* Added `team_generation_task.delete` audit coverage for team generation-task deletes. The service now wraps the workspace-scoped delete plus non-secret task/status/media/board metadata in one transaction.

Still remaining before the full PRD can be considered complete:

* Broader operational hardening beyond basic login/bootstrap rate limiting.
* Residual team settings surfaces outside Provider Settings, audit coverage for all sensitive operations, and deployment/upgrade/rollback automation depth.

## Requirements

* Keep deployed/static/browser builds on IndexedDB by default.
* Add a PostgreSQL-backed team storage mode for local LAN/self-hosted deployments as an explicit custom/advanced feature only.
* Team/PostgreSQL mode must be disabled unless explicitly configured. Default `.env` and normal app startup must preserve the current browser IndexedDB workflow.
* Existing users should not visually experience the team feature by default: no login wall, no forced setup wizard, no prominent team controls, and no storage migration prompt unless team mode is configured.
* The first implementation has exactly two supported runtime storage modes: `browser` and `postgres`. Do not add SQLite, local-folder, remote-api, or other transitional storage targets in this task.
* Team mode must ship with deployment examples/templates so self-hosted users can start without inventing infrastructure from scratch.
* Team mode is one app server plus PostgreSQL; browser clients connect to the app server, not directly to the database.
* PostgreSQL mode requires explicit configuration, such as `IMAGINE_STORAGE_TARGET=postgres` and `DATABASE_URL`.
* If PostgreSQL mode is selected but `DATABASE_URL`, migrations, or connectivity fail, fail fast with a visible error. Do not silently fall back to IndexedDB.
* PostgreSQL schema changes must be handled through versioned migrations tracked in `schema_migrations`; future app versions must have a documented database upgrade path.
* The app must refuse to run against an unsupported newer schema version and must fail visibly when the configured database requires migrations that have not been applied.
* All workspace persistence must route through an active-storage boundary so assets, boards, gallery, backup, restore, cleanup, tasks, and settings do not write to mixed stores.
* Do not implement dual-write between IndexedDB and PostgreSQL. A workspace has one active authoritative store at a time.
* PostgreSQL stores metadata and relational records. Large generated media payloads live in a payload store.
* For LAN mode, the default payload store is an app-server local media volume. PostgreSQL stores safe payload refs, not absolute client paths.
* The payload-store interface must allow future object storage for online deployment without rewriting asset/board logic.
* Generated results and asset-library media use the same asset/payload model. The asset library is metadata and curation over assets; it must not create unrelated media storage semantics.
* Browser clients do not automatically mirror all media files locally in PostgreSQL mode. They stream/download media from the app server through authenticated app routes, with only normal browser caching or explicit exports.
* Local synchronization has two meanings and both must be explicit: browser IndexedDB -> PostgreSQL migration is user-triggered import; PostgreSQL metadata -> media volume consistency is maintained by server-side staged writes and reconciliation.
* IndexedDB/localStorage migration must inventory every known persisted data source before import. No persisted source may be silently ignored.
* `lib/data-management.ts` must classify all current persisted localStorage keys before PostgreSQL import is implemented. Browser backup/restore and PostgreSQL migration must not maintain separate, drifting inventories.
* Schema must include first-class team foundations: workspaces, users, teams, memberships, roles, created/updated ownership metadata.
* PostgreSQL team mode must include a server-side authentication and authorization boundary before shared workspace data APIs. Do not ship team mode as anonymous LAN-wide write access.
* Team login should start with local accounts and server-managed sessions. External SSO/OIDC can be added later.
* Session-authenticated mutating routes must include CSRF/origin protection and trusted host/origin configuration. Do not rely on "LAN only" as the security boundary.
* Login and bootstrap endpoints must include basic brute-force protection, such as rate limiting or lockout, without exposing whether a user/setup token exists.
* Authorization should start with simple workspace roles and server-side checks. Minimum roles: `owner`, `admin`, `editor`, `viewer`.
* Full member-management polish can be iterative, but the first PostgreSQL team mode must provide a safe bootstrap path for an initial owner/admin and must not expose write APIs without an authenticated workspace member.
* Data sharing is workspace/team-scoped by default: team members see shared assets, generated results, boards, asset library records, and generation tasks according to role.
* Configuration visibility must be role-gated. Ordinary members must not see provider credentials, database URLs, media volume paths, deployment secrets, setup tokens, session secrets, or raw environment/config values.
* Team-mode provider credentials and other workspace secrets stored in PostgreSQL must be encrypted at rest with a server-side secret. Secret values must never be returned after save.
* Personal/private assets, per-folder permissions, and real-time multiplayer board editing are not part of the first team-storage implementation unless explicitly added.
* Shared mutable records, especially boards and settings, must use optimistic concurrency or version checks to avoid silent last-write-wins overwrites.
* First team mode should implement refresh-visible shared state: after another member changes assets, generation tasks, boards, or asset library records, reloading the relevant page/view must show the latest PostgreSQL-backed state.
* Lightweight status freshness can use polling or a future SSE/event stream for key surfaces, but real-time multiplayer editing is out of scope.
* Existing browser IndexedDB data migrates to PostgreSQL only through explicit user action.
* Migration into PostgreSQL must be user-triggered, auditable, and rollback-aware. No automatic startup migration.
* Migration preview must show included, optional, and intentionally excluded data categories so users can confirm what will and will not move.
* Backup/export/restore must operate against the active storage target while preserving the explicit provider credential checkbox behavior.
* PostgreSQL/media backups must be taken as a consistent logical snapshot, either by pausing writes/using a maintenance lock or by another documented consistency mechanism.
* Team mode must provide an operations baseline: backup/restore, upgrade/migration steps, health checks, audit events for sensitive actions, media/database consistency checks, and documented rollback.
* Team mode must include configurable limits for upload/media size and safe cleanup of tmp/trash/orphaned payloads.
* PostgreSQL mode must support data health summaries and maintenance actions in Settings -> Data.
* PostgreSQL access must use a bounded server-side connection pool with explicit connection limits and timeouts suitable for small self-hosted deployments.
* Cloudflare Pages build must remain green. Local-only Node/PostgreSQL routes must not leak into edge/static deployment paths.

## Acceptance Criteria

* [ ] Users can clearly see whether the active storage mode is IndexedDB or PostgreSQL.
* [ ] Browser/deployed mode continues to work with IndexedDB and does not require PostgreSQL.
* [ ] With no PostgreSQL/team environment variables configured, the app behaves like the current project: no login prompt, no team setup prompt, no required migration, and no visible disruption to existing creation/board/gallery/settings workflows.
* [ ] Team/PostgreSQL UI, auth bootstrap, and PostgreSQL routes are shown or enabled only when team mode is explicitly configured.
* [ ] Storage-mode code exposes only `browser` and `postgres` for this task; stale SQLite/local-database/local-folder/remote-api planned targets are removed or made non-product-facing.
* [x] Team deployment templates are included and documented: Dockerfile, Docker Compose, team env example, media volume mapping, PostgreSQL volume mapping, and first-run bootstrap instructions.
* [x] Deployment templates do not change the default local/browser workflow and are opt-in.
* [ ] PostgreSQL mode reads/writes assets, asset payload refs, previews, asset library records, boards, generation tasks, managed settings, safety snapshots, and voice profiles, or any exclusions are explicitly documented before implementation.
* [ ] Migration coverage includes custom prompt templates and any other user-created localStorage data, or explicitly reports them as excluded before migration.
* [ ] Migration preview reports all detected persistent sources: asset DB, board DB, voice-profile DB, safety snapshot DB, managed localStorage, and known currently-unmanaged localStorage keys.
* [ ] The implementation updates `lib/data-management.ts` so current persisted keys such as default generation models, image-edit feature models, price visibility, Agent orb position, RunningHub saved targets, Resolve toggle, and custom prompt templates are classified before PostgreSQL migration preview uses them.
* [ ] Implementation context includes the refreshed `.trellis/spec/frontend/state-management.md` storage contract so future agents see `browser` + `postgres`, not the superseded SQLite/local-database direction.
* [ ] PostgreSQL migrations create versioned tables and indexes deterministically.
* [ ] Future schema changes can be applied through ordered migrations; the app reports current/required schema version and refuses unsupported newer schemas.
* [ ] Migrations cover relational tables and payload-ref/media metadata changes when storage structure changes.
* [ ] Team schema includes workspaces, users, teams, memberships, role-ready fields, and ownership metadata.
* [ ] PostgreSQL team mode has an auth boundary: unauthenticated requests cannot read/write shared workspace data.
* [ ] An initial owner/admin can be created through a safe bootstrap flow.
* [ ] Session cookies are HTTP-only, use appropriate SameSite/Secure settings for the configured deployment URL, and mutating routes reject invalid CSRF/origin requests.
* [ ] Login and first-owner bootstrap routes include brute-force protection and do not reveal whether accounts or setup tokens exist.
* [ ] Server-side authorization enforces at least owner/admin/editor/viewer roles for destructive, write, and read-only actions.
* [ ] Configuration and provider settings are hidden from ordinary members. Only privileged roles can view masked configuration status, and only owner/admin-level roles can modify team/workspace configuration.
* [ ] Team-mode provider credentials and workspace secrets are encrypted at rest, are never returned to the browser after save, and show masked status only.
* [ ] Team members share workspace assets, generated results, boards, asset library records, and generation tasks through PostgreSQL-backed queries.
* [ ] Team-mode storage preserves current asset/generation fields, including cinematic profiles, reference media snapshots, board/result-stack source links, crop derivative metadata, library backing links, preview status, voice profile asset refs, and transcript assets.
* [ ] Board generated-media viewed markers are classified as local/per-user UX state. They are not written into shared board documents or asset rows unless a later per-user attention-state feature explicitly adds server-side support.
* [ ] Browser mode remains login-free unless a later task explicitly changes public/single-user behavior.
* [ ] No code path dual-writes workspace data to IndexedDB and PostgreSQL.
* [ ] Board/settings updates use version checks or equivalent optimistic concurrency; conflicting edits produce a visible reload/merge prompt rather than silently overwriting another user.
* [ ] Refreshing the app or relevant view shows the latest shared PostgreSQL-backed assets, generation statuses, boards, and asset library records from other team members.
* [ ] Generation/task status surfaces either poll on an interval or expose an event-stream-ready query cursor so users can see progress without relying only on full-page reloads.
* [ ] Media payloads are stored outside PostgreSQL rows by default and resolved through safe payload refs.
* [ ] Generated results, imported assets, and asset-library items all resolve through `assets` + `asset_payloads`; `asset_library` records reference backing assets instead of storing separate files.
* [ ] Browser clients can view/download media through app routes without seeing `IMAGINE_MEDIA_DIR`, database credentials, or raw filesystem paths.
* [ ] Server-side media writes are staged before metadata commit; failed writes/commits clean staged files or mark them for explicit cleanup.
* [x] IndexedDB -> PostgreSQL migration is explicit, refuses unsafe/ambiguous targets, leaves source IndexedDB unchanged, and cleans up staged media files on failure.
* [x] Import refuses to proceed if it detects an unknown persisted data source that is not classified as migrate/optional/exclude.
* [x] Backup/export/restore uses the active storage target and preserves provider credential opt-in semantics.
* [ ] PostgreSQL/media backups use a documented consistent snapshot mechanism so database refs and media files match after restore.
* [x] Team deployment docs include backup/restore for PostgreSQL and media volume together, plus restore verification steps.
* [x] Upgrade docs explain when migrations run, how to back up before upgrade, and how to roll back app/database/media when migration fails.
* [ ] Audit events are stored for login, logout, bootstrap, member/role changes, provider credential changes, destructive cleanup/delete, backup/export, restore/import, and migration.
* [x] Configurable media/upload limits protect local disk usage and produce visible errors when exceeded.
* [ ] Data health detects PostgreSQL/media consistency issues: DB ref without file, file without DB ref, stale tmp, stale trash, stale preview, and failed task records.
* [ ] Settings -> Data reports PostgreSQL mode health, storage counts, and actionable maintenance states.
* [ ] PostgreSQL routes and driver imports are Node-only and do not break Cloudflare Pages/public builds.
* [ ] PostgreSQL connections use a bounded server-side pool with configured timeouts; health checks fail visibly when the pool/database is unavailable.
* [ ] Storage-focused tests cover migrations, CRUD, payload refs, hosted/browser mode, PostgreSQL fail-fast config errors, explicit migration, backup/restore target selection, authz role checks, config hiding, and CSRF/origin rejection.
* [ ] `pnpm run lint` and `pnpm run typecheck` pass.

## Research References

* [`research/postgres-team-architecture.md`](research/postgres-team-architecture.md) — PostgreSQL is the selected team database; use `pg`, connection pooling, Node-only runtime, and a future-proof payload-store boundary.
* [`research/local-team-database-fit.md`](research/local-team-database-fit.md) — superseded for database choice, but still useful for the LAN/server-owned storage distinction.
* [`research/sqlite-runtime.md`](research/sqlite-runtime.md) — superseded by the PostgreSQL decision.

## Architecture

### Storage Modes

| Mode | Target | Runtime | Intended Use |
| --- | --- | --- | --- |
| `browser` | IndexedDB | Client/browser + edge-compatible app | Public demo, Cloudflare Pages, single-user local browser |
| `postgres` | PostgreSQL + payload store | Node.js app server | Explicitly configured LAN team/self-hosted workspace |

Default storage mode is `browser`. `postgres` is opt-in only and should require explicit environment configuration.

### Non-Transitional Design Rules

This task should implement the final first-team architecture, not a temporary bridge:

* Supported modes for this task are only `browser` and `postgres`.
* Remove or rename stale local database configuration code that points to SQLite, including `local-database` mode names and SQLite labels, before adding PostgreSQL mode.
* Do not add a SQLite adapter, local-folder adapter, or remote-api adapter as part of this task.
* Do not keep a hidden compatibility mode where `postgres` falls back to IndexedDB for writes.
* Do not dual-write workspace records to browser IndexedDB and PostgreSQL.
* Do not make PostgreSQL clients run in the browser; all PostgreSQL access stays server-side.
* `FutureObjectStore` is only an interface boundary for later online migration. It must not become an object-storage implementation in this task.
* Deployment phases describe supported deployment paths, not product modes that users must pass through.

### Current Code Drift To Resolve First

This task must begin by aligning the existing planning scaffolding with PostgreSQL:

* Replace the current `WorkspaceStorageMode = "browser" | "local-database"` direction with `WorkspaceStorageMode = "browser" | "postgres"`.
* Replace storage target kinds that expose `local-folder`, `local-database`, or `remote-api` as product-facing planned targets with the two target concepts needed now: browser IndexedDB and PostgreSQL team storage.
* Remove SQLite-specific labels, path defaults, config names, and tests unless they are archived only as historical research. Do not leave them reachable in settings, runtime status, or active implementation context.
* Rename local runtime/status helpers if needed so they no longer imply filesystem/SQLite local storage. PostgreSQL mode is a Node app-server mode backed by `DATABASE_URL` and `IMAGINE_MEDIA_DIR`.
* Update Trellis frontend state-management spec before coding so implementation and review agents do not receive conflicting SQLite instructions.

### Runtime Topology

```text
Browser clients
  -> Imagine Workbench app server (Node runtime)
  -> PostgreSQL (metadata, teams, boards, tasks, settings)
  -> Payload store (LAN local media volume now; object storage later)
```

Browser clients must never receive database credentials or direct filesystem paths.

### Media Storage

In PostgreSQL team mode, actual media files live in the app server's configured media volume, for example:

```text
$IMAGINE_MEDIA_DIR/
  originals/
    image/
    video/
    audio/
    transcript/
  previews/
    image/
    video/
    audio/
  tmp/
  trash/
```

PostgreSQL stores records and refs:

* `assets`: generated results, uploaded media, board-scoped media, and hidden backing assets for library items.
* `asset_payloads`: one row per original media payload, with `asset_id`, `content_hash`, `mime_type`, `size_bytes`, `storage_kind`, and safe `storage_key`.
* `asset_previews`: generated preview payload refs and preview dimensions/status.
* `asset_library`: curated library metadata (`title`, `tags`, `favorite`, `category`, `origin`) that references a backing `asset_id`.

`storage_key` is an app-owned relative key such as `originals/image/ab/cd/<hash>.png`; it is not an absolute filesystem path and is never accepted from browser input.

Generated results and asset-library records can share media bytes by content hash. Promoting a generated result to the asset library should create or reuse a backing asset/library record, not duplicate the media file unless an explicit immutable-copy rule is chosen later.

### Local Sync

PostgreSQL team mode is server-authoritative:

* Team browsers fetch metadata and media through the app server.
* Browsers may keep transient object URLs, HTTP cache, or explicit ZIP/download exports.
* Browsers do not run background bidirectional sync or keep a complete local mirror of the team media store.
* IndexedDB -> PostgreSQL migration is explicit one-shot import from the current browser workspace. Current implementation has Settings -> Data preview plus an owner/admin-confirmed direct import action that builds the same portable browser backup ZIP in memory and posts it through the PostgreSQL team restore route.
* PostgreSQL -> IndexedDB sync is out of scope.

Server-side consistency rules:

* Write media to `tmp/` first.
* Compute content hash and validate MIME/size.
* Move to the final relative storage key.
* Insert/update PostgreSQL metadata in a transaction.
* If any step fails, remove staged files or leave them only under `tmp/` for explicit cleanup.
* Data health should detect broken refs: DB row without file, file without DB row, stale preview, and orphan trash.

### Data Inventory And Migration Coverage

Before implementing PostgreSQL import, maintain a source-of-truth migration inventory from current browser storage to PostgreSQL/team mode.

The current direct browser migration flow reads the live browser stores without mutation, counts all known IndexedDB/localStorage categories below, and blocks direct import readiness if `indexedDB.databases()` is unavailable, an `ImagineWorkbench*` database/store is unknown, or an `imagine_*` localStorage key is not covered by the managed localStorage classifier. When unblocked, Settings -> Data creates an in-memory full browser backup File and restores it through `/api/storage/team/backup`, so PostgreSQL import reuses the same CSRF, admin-role, safety snapshot, transaction, localStorage conversion, and credential opt-in checks as portable backup restore.

Known persisted sources found in the current project:

| Current source | Examples | Team-mode target | Migration policy |
| --- | --- | --- | --- |
| `ImagineWorkbenchDB.assets_meta` | Asset metadata, prompts, models, status, board/source links, result-stack links, crop derivative metadata, library backing links, preview status, generation snapshots | `assets` | Required |
| `ImagineWorkbenchDB.asset_blob_payloads` / `assets_blob` | Original image/video/audio/transcript payloads | payload store + `asset_payloads` | Required |
| `ImagineWorkbenchDB.asset_previews` | Preview data URLs and dimensions | payload store + `asset_previews` | Required |
| `ImagineWorkbenchDB.asset_library` | Curated asset library metadata | `asset_library` | Required |
| `ImagineWorkbenchDB.generation_tasks` | Pending/processing/failed/complete task records, request snapshots, active/result asset IDs | `generation_tasks` | Required |
| `ImagineWorkbenchBoardDB.boards` | Full board documents, nodes, edges, viewport, config | `boards` | Required |
| `ImagineWorkbenchBoardDB.board_summaries` | Board list summaries | `board_summaries` regenerated from imported boards | Required, may be regenerated |
| `ImagineWorkbenchVoiceDB.voice_profiles` | User-created cloned/designed/imported voice profiles | `voice_profiles` | Required |
| `ImagineWorkbenchSafetyDB.workspace_safety_snapshots` | Latest safety snapshot/backup record | `safety_snapshots` | Required |
| `localStorage.imagine_custom_prompt_templates` | User-created prompt templates | `prompt_templates` | Required |
| Provider settings localStorage | `imagine_ai_provider`, `imagine_chat_model`, `imagine_custom_providers`, selected model option caches | `settings` | Required for non-secret settings |
| Provider credential localStorage | provider API keys/base URLs and legacy credential keys | encrypted workspace secrets | Optional, controlled by explicit include-credentials checkbox |
| Agent chat localStorage | `imagine_agent_chat`, `imagine_agent_chat:<boardId>` | `agent_chats` when the user opts in | Optional, otherwise report local-only exclusion |
| RunningHub saved targets localStorage | `imagine_runninghub_saved_targets`, including AI App/workflow targets, bindings, and access passwords | encrypted `saved_provider_targets` when the user opts in | Optional, otherwise report local-only exclusion |
| Default generation model preferences | `imagine_default_image_model`, `imagine_default_video_model`, `imagine_default_audio_model` | `user_preferences` or `settings` according to final role policy | Optional/team-safe preference |
| Image edit feature model preferences | `imagine_image_edit_feature_models` | `user_preferences` or `settings` according to final role policy | Optional/team-safe preference |
| UI/user preferences localStorage | `imagine_theme_mode`, `imagine_language`, `imagine_board_last_insert`, `imagine_board_handles_hint_seen`, `imagine_board_side_collapsed`, `imagine_board_side_tab`, `imagine_show_price`, `imagine_agent_orb_position` | `user_preferences` for team-safe preferences when the user opts in | Optional/local, otherwise report browser-local exclusion |
| Board generated-media viewed markers | `imagine_board_viewed_generated_asset_ids:<boardId>` | Browser-local or future per-user attention state | Exclude from shared workspace import; optionally report as local-only |
| Resolve integration localStorage | `imagine_resolve_integration_enabled` | browser-local only | Exclude from team DB, report as local-only |
| Model cache localStorage | fetched model option caches | `settings` cache only when explicitly included | Optional; otherwise exclude and rebuild |

Migration rules:

* The import preview must list each category above with counts/bytes where possible and mark it as required, optional, or excluded.
* Required categories must either migrate successfully or the import fails before changing the target workspace.
* Optional categories require explicit user choice when they contain secrets or personal history.
* Optional encrypted categories include provider credentials and RunningHub saved targets with access passwords. They must never be imported accidentally through generic settings restore.
* Excluded local-only categories remain in the source browser and are not deleted.
* Unknown IndexedDB databases/stores or `imagine_*` localStorage keys must be surfaced in the preview instead of silently ignored.
* The old `local-database` / SQLite planned adapter naming in `lib/local-storage-targets.ts` must be removed or renamed during the storage-mode boundary task so future implementation does not follow stale SQLite assumptions.
* The browser backup/export path and PostgreSQL import preview must use the same classification list for managed, optional, secret, and excluded localStorage keys.
* If a new persisted key is added before PostgreSQL implementation starts, this table and `lib/data-management.ts` inventory must be updated before import ships.

### Storage Boundary

Introduce or complete a target-aware storage facade:

```text
UI/workflows -> WorkspaceStorageRepository -> IndexedDBRepository | PostgresRepository
                                      -> PayloadStore -> BrowserBlobStore | LocalFilePayloadStore | FutureObjectStore
```

Client components should call app-level actions/hooks and not know table names or SQL row shapes.

### PostgreSQL Schema Foundation

Baseline tables:

* `schema_migrations`
* `workspaces`
* `users`
* `teams`
* `team_memberships`
* `sessions`
* `csrf_tokens` or equivalent session CSRF state if the chosen session design requires server-side token tracking
* `assets`
* `asset_payloads`
* `asset_previews`
* `asset_library`
* `boards`
* `board_summaries`
* `generation_tasks`
* `settings`
* `user_preferences`
* `prompt_templates`
* `agent_chats`
* `saved_provider_targets`
* `safety_snapshots`
* `voice_profiles`
* `audit_events`

Core records should carry `workspace_id`, `created_by`, `updated_by`, `created_at`, and `updated_at` where relevant.

Use `jsonb` for complex app-native document payloads when it keeps the first implementation smaller, while indexing stable query fields such as `workspace_id`, `user_id`, `board_id`, `status`, and `created_at`.

Shared mutable records should include a `version` or comparable optimistic concurrency token.

Current complex payloads that may reasonably start as `jsonb` include board documents, generation request snapshots, cinematic profiles, RunningHub node bindings, crop derivative metadata, provider target bindings, non-secret settings, and custom prompt template bodies. Stable lookup fields still need first-class columns/indexes where the UI queries by workspace, board, status, model, media type, owner, source asset, or creation/update time.

### Schema Evolution Contract

PostgreSQL mode must support normal application upgrades through explicit schema evolution:

* Every schema change is represented by an ordered migration with an immutable id, description, checksum, applied timestamp, and app version metadata in `schema_migrations`.
* App startup or health checks compare the app's supported schema range with the database schema version.
* If the database is older than the app expects, the app must either run documented migrations or fail visibly with instructions to run the migration command.
* If the database is newer than the app supports, the app must refuse to start in PostgreSQL mode to avoid corrupting newer data.
* Migrations must cover table/index changes and any payload-reference changes needed for media layout evolution.
* Destructive or irreversible changes require a documented backup step before migration. When feasible, prefer additive expand/contract migrations over immediate destructive rewrites.
* Rollback means restoring a compatible app image plus a matching database/media backup. Down-migrations are optional and must not be assumed unless explicitly implemented and tested.
* Browser/IndexedDB mode is unaffected by PostgreSQL schema migration code.

### Team Login And Authorization

PostgreSQL team mode requires authentication for shared workspace data.

This section applies only when `postgres` team mode is explicitly enabled. Browser mode remains login-free unless a later task deliberately changes the default product behavior.

Minimum model:

* `users`: local account identity, display name, status, created/updated timestamps.
* `teams`: team container.
* `workspaces`: shared workspace under a team.
* `team_memberships`: user/team/workspace membership and role.
* `sessions`: server-managed sessions, exposed to browsers only through HTTP-only cookies.

Minimum roles:

| Role | Intended Capability |
| --- | --- |
| `owner` | Manage workspace, members, credentials, destructive actions, and exports |
| `admin` | Manage most workspace data and members except owner transfer/deletion |
| `editor` | Create/edit assets, boards, prompts, generation tasks, and library records |
| `viewer` | View and download shared workspace content without modifying it |

Authorization is enforced on the server before storage operations. Client UI state is only a convenience and must not be trusted.

Session and request safety:

* Session cookies must be HTTP-only. `SameSite` and `Secure` settings should be derived from the configured app URL/HTTPS deployment.
* Mutating routes must verify CSRF tokens or same-origin/trusted-origin headers before performing workspace writes.
* Team deployment should require explicit app URL/host configuration so server-side checks can reject untrusted origins instead of allowing wildcard browser access.
* Login and first-owner bootstrap routes need basic brute-force protection and generic failure responses.

Configuration access:

| Area | Owner | Admin | Editor | Viewer |
| --- | --- | --- | --- | --- |
| Provider credential status | Masked view/edit | Masked view/edit | Hidden | Hidden |
| Provider credential secret values | Never returned after save | Never returned after save | Hidden | Hidden |
| Team/workspace member settings | Full | Manage non-owner members | Hidden or read-only own profile | Hidden or read-only own profile |
| Storage/deployment settings | Masked status | Masked status | Hidden | Hidden |
| Data health counts | Full | Full | Limited non-sensitive summary | Limited non-sensitive summary |
| Backup/export/restore | Full | Allowed except owner-only exports if configured | Hidden | Hidden |
| Destructive cleanup/reset | Full | Allowed by policy | Hidden | Hidden |

Implementation rule: do not send hidden config fields to the client and rely on UI hiding. Shape responses by role on the server.

Bootstrap:

* First team deployment needs a safe way to create the first `owner`.
* Acceptable implementation choices include a first-run setup screen protected by a one-time setup token, or an admin bootstrap CLI/script.
* The bootstrap mechanism must be disabled or idempotent after the first owner exists.

Out of first auth scope:

* SSO/OIDC/LDAP.
* Password reset email.
* Fine-grained folder/object permissions.
* Personal/private workspaces.

### Data Sharing

In PostgreSQL team mode, data is shared by default inside a workspace:

* Generated results are shared assets once persisted.
* Imported media is shared if imported into the shared workspace or asset library.
* Asset library records are shared curation metadata over shared backing assets.
* Boards are shared workspace documents. Ownership metadata records who created/updated them, but default visibility is team-wide.
* Generation tasks and statuses are visible to members according to role.

This is shared persistence, not full real-time multiplayer editing. The first implementation may use refresh/poll/reload semantics for cross-user updates. Live cursors, conflict resolution, and simultaneous collaborative board editing are future work unless explicitly added.

Board result/provenance contract:

* Generated provenance is represented by connected `result` nodes owned by a source executable node, not by plain asset nodes that happen to reference a generated asset.
* A source `result-out -> result asset-in` edge is valid only when the result node's `sourceNodeId` matches the source node id.
* Manual gallery/library insertion creates reusable `asset` nodes and must not recreate generation provenance edges from stored `sourceBoardNodeId` metadata.
* Asset derivation edges, such as split/crop comparisons between an original image and derived crop assets, are ordinary asset-reference relationships. They must not be mixed with generation result ownership.
* PostgreSQL board persistence and import validation should preserve these distinctions so result writeback, compare references, cleanup, backup, and board prompt references do not drift.

Minimum freshness contract:

* Full page reload must reflect latest committed PostgreSQL state.
* Gallery/assets/library/task lists should refetch on focus/visibility change or a modest polling interval in PostgreSQL team mode.
* Board documents should show a visible "updated elsewhere" or conflict state if the server version changed while the user has local edits.
* SSE/event streams may be added later to reduce polling, but are not required for the first team-storage implementation.

Provider credentials in team mode should be workspace/team-scoped secrets managed by privileged roles. They must never be exposed to ordinary browser clients beyond masked status.

Persisted provider credentials and other workspace secrets should be encrypted at rest using a server-side encryption secret. Losing that encryption secret should be treated as an operational restore problem, not silently bypassed.

### Implementation Sequencing

The first implementation should be split into explicit sub-steps so the broad architecture does not turn into a hidden all-at-once rewrite:

1. **Storage-mode boundary refresh**: update storage-mode types/config/tests/specs from `local-database`/SQLite to `browser`/`postgres`; keep normal app startup browser-first.
2. **Inventory refresh**: update `lib/data-management.ts` localStorage classifications and diagnostics so browser backup/restore knows every current persisted key before PostgreSQL import uses the same inventory.
3. **PostgreSQL foundation**: add Node-only database config, bounded pool, migration runner, schema version checks, and baseline migrations without routing user workflows to PostgreSQL yet.
4. **Auth/bootstrap foundation**: add local account/session/CSRF/origin/rate-limit boundaries and first-owner bootstrap for `postgres` mode only.
5. **Repository and payload store**: implement `PostgresRepository` plus local media-volume payload store behind the active-storage boundary.
6. **Read/write workflow migration**: move assets, boards, library, generation tasks, voice profiles, prompt templates, settings, safety snapshots, backup/restore, cleanup, and health summaries onto the active storage boundary.
7. **Explicit browser import**: build the IndexedDB/localStorage -> PostgreSQL migration preview and import path using the refreshed inventory.
8. **Team deployment package**: add Docker/team env/docs/backup/restore/upgrade examples.

Do not skip directly to route or UI work before steps 1-3 are stable; otherwise the app will have multiple partial storage truths.

### Deployment Plan

LAN/self-hosted mode should provide a simple local deployment path:

* App server running Next.js in Node runtime.
* PostgreSQL reachable via `DATABASE_URL`.
* Local media volume configured by an environment variable, such as `IMAGINE_MEDIA_DIR`.
* Recommended first team deployment package: Docker Compose with `app`, `postgres`, and persistent media/database volumes.
* Optional reverse proxy profile, such as Caddy or nginx, can expose the LAN hostname/HTTPS in front of the app.
* Current repository has `next.config.ts` `output: 'standalone'`, Cloudflare Pages scripts, local dev scripts, `Dockerfile`, `docker-compose.team.yml`, `.env.team.example`, and `docs/deployment/team-local.md`. Team mode remains an explicit opt-in deployment path.

Cloudflare Pages/public deployment remains browser mode. It should not require PostgreSQL or local media volumes.

Default local development also remains browser mode unless the developer opts into PostgreSQL/team mode. Documentation should present team mode as an advanced/self-hosted option, not as the default startup path.

Recommended deployment phases:

1. `pnpm run dev` / current local scripts: development only, browser IndexedDB by default.
2. Cloudflare Pages: public/demo browser mode, no PostgreSQL.
3. Docker Compose team mode: one Node app container, one PostgreSQL service, one app-owned media volume, optional reverse proxy. This is the first real team deployment target.
4. Future online mode: managed PostgreSQL plus object storage and production hosting. This is out of scope for first team mode.

Do not make PostgreSQL/team deployment part of normal `pnpm run local`; keep it behind a separate command or documented compose profile, such as `pnpm run team:up` or `docker compose up`.

Required team deployment templates/examples:

* `Dockerfile`: builds the Next.js standalone app server.
* `.dockerignore`: keeps `.next`, `node_modules`, local env files, task artifacts, and media volumes out of build context.
* `docker-compose.team.yml`: app + PostgreSQL + persistent database volume + persistent media volume.
* `.env.team.example`: `IMAGINE_STORAGE_TARGET=postgres`, `DATABASE_URL`, `IMAGINE_MEDIA_DIR`, session/setup/encryption secrets, provider keys placeholders, and app URL/host/trusted-origin config.
* `docs/deployment/team-local.md` or README section: step-by-step LAN deployment, first owner bootstrap, backup/restore, updating containers, and troubleshooting.
* Optional reverse proxy example: Caddy or nginx profile for LAN hostname and HTTPS.

Templates should be examples, not defaults. Users must opt in by copying the team env file and running the team compose command.

### Future Online Migration

The PostgreSQL architecture should keep online migration straightforward:

* Database: dump/restore or managed migration from local PostgreSQL to managed PostgreSQL.
* Media: upload local media volume files to object storage.
* Payload refs: update payload-store records from `local-file` storage keys to `object-storage` storage keys without changing asset, board, or library semantics.
* App: switch environment variables from local `DATABASE_URL` / `IMAGINE_MEDIA_DIR` to managed database and object storage configuration.

Online deployment itself is out of scope for the first team-storage implementation.

### Operations Baseline

Team mode must be operable by a small self-hosted team without hidden manual database knowledge.

Backups:

* Backup PostgreSQL and media volume together as one logical workspace snapshot.
* A valid backup includes database dump, media files, manifest, app version, schema version, created timestamp, and counts.
* Backup must either pause writes with a maintenance lock or use another documented consistency mechanism so PostgreSQL payload refs and media files describe the same point in time.
* Restore must validate manifest and media/database counts before replacing active data.
* Provider credentials remain explicit opt-in for export/restore and should be masked in normal UI.

Upgrades:

* App startup or an explicit migration command should verify schema version.
* Team deployment should provide a clear migration command or container entrypoint, such as `pnpm db:migrate` / `docker compose run app pnpm db:migrate`, if migrations are not run automatically.
* Startup behavior must be explicit in docs: either "auto-run safe migrations on startup" or "refuse startup until migration command succeeds". Do not leave this ambiguous.
* Before running destructive or irreversible migrations, docs must instruct backing up PostgreSQL and media volume.
* Failed migrations should fail fast and leave the previous version recoverable from backup.
* Docker Compose docs must describe image update, migration, and rollback steps.

Health and cleanup:

* Settings -> Data should show PostgreSQL connectivity, migration version, media volume path status, approximate database/media usage, and latest backup/restore state.
* Health checks should detect DB refs without files, files without DB refs, stale `tmp/`, stale `trash/`, stale previews, and failed/stale generation tasks.
* Cleanup remains explicit user/admin action, never automatic startup deletion.

Security and audit:

* Session secrets, setup tokens, database URLs, provider credentials, and password hashes are server-only.
* Workspace/provider secrets stored in PostgreSQL should be encrypted at rest with a server-side encryption secret.
* Store password hashes with a modern password hashing algorithm chosen at implementation time. Do not store plaintext passwords.
* Session cookies must be HTTP-only, and mutating routes must enforce CSRF/origin checks based on configured trusted origins.
* Login/bootstrap endpoints should use generic error messages and basic brute-force protection.
* Audit sensitive events: bootstrap, login/logout, member/role changes, provider credential changes, destructive data actions, backup/export, restore/import, and storage migration.
* Browser clients should see masked credential status only.

Limits:

* Team mode should expose configurable upload/media limits, such as max file size and accepted media types. Current implementation enforces accepted MIME categories and requires `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES` for the per-payload byte limit.
* Exceeding limits should fail visibly before consuming large disk space.
* Disk usage warnings should be visible in Settings -> Data when usage approaches configured thresholds. Current implementation supports the optional `IMAGINE_MEDIA_USAGE_WARNING_BYTES` aggregate media-volume warning; deeper monitoring remains operational hardening.

### Migration

IndexedDB -> PostgreSQL migration is explicit only:

1. User opens Settings -> Data.
2. App previews current browser data counts.
3. User confirms migration/import into PostgreSQL.
4. Server creates or verifies target workspace.
5. Media payloads are staged into the payload store.
6. PostgreSQL transaction writes metadata/documents/refs.
7. On success, UI reports counts.
8. On failure, source IndexedDB remains unchanged and staged payload files are removed.

No automatic migration on app startup or storage mode switch.

## Decision (ADR-lite)

**Context**: The project moved from a single-user local database question to a LAN/self-hosted team deployment target, with future member login/management and possible online deployment later. Team size should not be hardcoded into the storage architecture.

**Decision**: Use PostgreSQL for team storage mode instead of SQLite. Keep IndexedDB as the deployed/browser default. Store large media outside relational rows behind a payload-store abstraction.

**Consequences**: PostgreSQL adds setup complexity (`DATABASE_URL`, migrations, optional local DB service) but gives a cleaner path to team users, permissions, concurrent access, and future online hosting. SQLite-specific adapter work is no longer part of this task.

## Out of Scope

* SQLite adapter implementation.
* Multi-server SaaS deployment.
* External SSO/OIDC/LDAP.
* Polished full member-management UI beyond the first safe owner bootstrap and role enforcement unless explicitly added to this task.
* Real-time multiplayer board editing.
* Personal/private workspace semantics.
* Object storage implementation unless explicitly added to this task.
* Bidirectional live sync between IndexedDB and PostgreSQL.
* Automatic migration from IndexedDB to PostgreSQL.
* Exposing database credentials or arbitrary filesystem paths to browser clients.

## Implementation Slices

This should be split into child tasks. The work crosses storage, API runtime, media IO, authentication, deployment, and migration. Keeping it as one implementation task would make review and rollback too coarse.

Recommended child tasks:

1. **Storage mode and runtime boundary**
   * Add explicit `browser` / `postgres` storage-mode config.
   * Keep default browser IndexedDB behavior unchanged.
   * Fail fast only when PostgreSQL mode is explicitly selected.
   * Remove stale `local-database`, SQLite, local-folder, and remote-api planned target exposure from storage-mode code for this task.
   * Keep `.trellis/spec/frontend/state-management.md` aligned with the final browser/PostgreSQL contract.
   * Verify no workspace write path dual-writes to IndexedDB and PostgreSQL.
   * Ensure Node-only PostgreSQL imports/routes do not affect Cloudflare/public builds.

2. **Browser persistence inventory refresh**
   * Update `lib/data-management.ts` so browser backup/restore classifies every current persisted localStorage key before PostgreSQL import consumes the same inventory.
   * Cover default generation models, image-edit feature models, custom prompt templates, price visibility, RunningHub saved targets, Resolve toggle, Agent orb position, board UI preferences, provider settings, model caches, and optional credentials.
   * Keep provider credentials and RunningHub saved targets with access passwords out of generic settings restore unless the user explicitly opts into importing encrypted secrets.

3. **PostgreSQL schema, migrations, and repository foundation**
   * Add deterministic migrations for workspace, team, user, membership, session/CSRF state, asset, payload, preview, library, board, task, settings, user preference, prompt template, agent chat, saved target, safety, voice-profile, and audit-event tables.
   * Add schema-version checks, migration runner behavior, and unsupported-newer-schema refusal.
   * Add bounded `pg` pool and health checks.
   * Implement the first `PostgresRepository` behind the active-storage boundary.

4. **Server media payload store**
   * Add `LocalFilePayloadStore` under `IMAGINE_MEDIA_DIR`.
   * Store only safe relative payload refs in PostgreSQL.
   * Implement staged writes, hash/MIME/size validation, preview refs, media serving/download routes, and consistency checks.

5. **Team auth, roles, and secret safety**
   * Add first-owner bootstrap, local accounts, server sessions, CSRF/origin protection, and brute-force protection.
   * Enforce owner/admin/editor/viewer checks server-side.
   * Hide ordinary-member configuration and encrypt stored workspace/provider secrets.

6. **Shared workspace surfaces**
   * Wire assets, gallery, asset library, boards, generation tasks, managed settings, user preferences, prompt templates, Agent chats, saved provider targets, safety snapshots, and voice profiles to the active repository where they are selected for team persistence.
   * Add refresh-visible shared state and modest polling/refetch where needed.
   * Add optimistic version checks for boards/settings.

7. **IndexedDB to PostgreSQL import**
   * Add explicit Settings -> Data migration/import flow.
   * Detect and classify every known browser-persisted source before import.
   * Preview counts, stage media, write metadata transactionally, leave source IndexedDB unchanged, and clean staged files on failure.
   * Report optional/local-only data categories instead of silently dropping them.

8. **Team deployment and operations**
   * Add `Dockerfile`, `.dockerignore`, `docker-compose.team.yml`, `.env.team.example`, and local team deployment docs.
   * Document first-owner bootstrap, backup/restore, consistent backup snapshots, upgrade, rollback, health checks, and cleanup.

Suggested implementation order is 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8. Tasks 4 and 5 can start after task 3 defines the schema/contracts. Task 8 can start once environment names and runtime shape are stable.

## Definition of Done

* PRD reflects PostgreSQL as the selected team database.
* Implementation, when started, follows the active-storage repository boundary.
* Tests cover PostgreSQL migrations, repository behavior, hosted/browser fallback behavior, migration safety, authz role checks, config hiding, CSRF/origin rejection, backup consistency, and connection-pool failure behavior.
* `pnpm run lint` and `pnpm run typecheck` pass for code changes.
* Docs/spec notes updated when architecture changes land.

## Technical Notes

* Recommended first dependency: `pg` / node-postgres.
* Use a bounded `pg` connection pool with explicit max connections, idle timeout, and connection timeout. Do not create per-request clients without pooling.
* Avoid adding an ORM in the first implementation unless a later task explicitly chooses one.
* Existing `lib/storage/schema.ts` and `lib/storage/repository.ts` should be evolved rather than bypassed.
* Existing `scripts/build-cloudflare-pages.mjs` already excludes local-only Node routes; PostgreSQL local-only routes may need the same treatment.
