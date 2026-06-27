# State Management

> How state is stored and updated in Imagine Workbench.

---

## Overview

The app does **not** use Redux, Zustand, or React Context for global app data. State falls into four categories: **React local state** in pages/hooks, **React Context** for narrow UX (confirm dialogs), **browser persistence** (IndexedDB + localStorage), and **URL** (board routes). Server state is fetched on demand via API routes; there is no normalized client cache layer.

---

## State Categories

### Local / hook state

- Workstation UI: selection, modals, generation in-flight flags — `useState` / `useMemo` / `useCallback` in `app/page.tsx` and dedicated hooks
- Board: `useBoardState` holds the authoritative in-memory `BoardDocument`, undo stack, selection, save status
- Agent dock: `useAgentController` for messages, pending tool actions, model choice

### Context (narrow scope)

- `ConfirmProvider` — promise-based `confirm()` / `alert()` only (`components/confirm/ConfirmProvider.tsx`)
- No global “app store” context

### Persisted client state

| Store | Key modules | Contents |
|-------|-------------|----------|
| IndexedDB assets | `lib/db.ts` | Generated images/videos, prompts, model IDs, statuses, shared media payload hashes |
| IndexedDB boards | `lib/board/persistence.ts` | Nodes, edges, viewport, board config |
| IndexedDB safety snapshots | `lib/data-management.ts` | Last pre-destructive workspace backup ZIP, stored outside asset/board DBs |
| localStorage | `lib/theme-mode.ts`, `lib/i18n.ts`, provider settings hooks, `lib/default-generation-models.ts`, `hooks/useImageEditFeatureModels.ts`, `lib/custom-prompt-templates.ts`, `lib/providers/pricing.ts`, board/Agent UI hooks | Theme/language, API keys / base URLs (settings UI), default image/video/audio generation model preferences, image-edit model preferences, custom prompt templates, price visibility, board/Agent UI preferences |

**Asset store is source of truth** for media URLs and generation metadata. Board nodes store layout + **references** (asset IDs), not duplicate generation snapshots as authority.
Board persistence IndexedDB opens must never hang silently: reject `request.onblocked`, close board DB connections on `onversionchange`, and close per-operation board DB handles after transactions complete so the board header save state cannot stay stuck on `loading`.

Managed provider model caches in `lib/data-management.ts` must include every persisted model option key written by `useProviderSettings`: chat, image, video, and audio. Export/import, stats, and model-cache cleanup should not leave one model kind outside the managed settings boundary.

### Scenario: Provider Settings in PostgreSQL Team Mode

#### 1. Scope / Trigger

- Trigger: changing Settings -> Connections provider selection, provider base URLs, custom providers, or manually/fetched model lists while `fetchWorkspaceStorageRuntimeStatus()` reports `targetKind: "postgres"`.
- Goal: provider API keys remain encrypted team secrets, while non-secret provider UI settings use the team settings API instead of browser localStorage.

#### 2. Signatures

- Runtime check: `fetchWorkspaceStorageRuntimeStatus(): Promise<{ targetKind: "indexeddb" | "postgres"; ... }>` determines the active persistence branch.
- Secrets API: `saveTeamSecret({ group: "provider", key: "provider:<provider>:apiKey", value }, csrfToken)` and `deleteTeamSecret(key, csrfToken)` store provider API keys only.
- Settings API: `fetchTeamSettings({ groups: ["provider"] })`, `saveTeamSetting({ group: "provider", key, value, expectedUpdatedAt? }, csrfToken)`, and `deleteTeamSetting(key, csrfToken, expectedUpdatedAt?)` store non-secret provider settings.
- Provider setting keys:
  - `provider:selected`
  - `provider:chatModel`
  - `provider:customProviders`
  - `provider:modelOptions:chat`
  - `provider:modelOptions:image`
  - `provider:modelOptions:video`
  - `provider:modelOptions:audio`
  - `provider:<provider>:baseUrl`

#### 3. Contracts

- Browser mode keeps using the existing localStorage keys for provider settings.
- PostgreSQL mode must not read localStorage as a fallback for provider settings; the team workspace is the authoritative store.
- API keys are secret records and must never be saved through `/api/storage/team/settings`.
- Base URLs, selected provider, selected chat model, custom provider definitions, and saved model option lists are non-secret records and must never be saved through `/api/storage/team/secrets`.
- Team setting values are JSON strings only where the existing browser setting already stores JSON, such as custom provider arrays and model option maps.
- `PublicTeamSetting.updatedAt` is also the optimistic concurrency token for non-secret team setting writes. Provider Settings stores the loaded token per key, sends it on updates/deletes, refreshes it after successful saves, and clears it after successful deletes.
- Saving a new setting may omit `expectedUpdatedAt`; updating or deleting an existing non-secret setting without a token must fail with `409 team_setting_version_required`.
- Updating or deleting a setting with a stale token must fail with `409 team_setting_version_conflict` instead of overwriting another admin's change.
- Provider base URL text may stay in React state while editing, but committing in PostgreSQL mode happens through an explicit save boundary such as input blur.

#### 4. Validation & Error Matrix

- Missing CSRF token on a PostgreSQL save/delete -> show the existing provider credential CSRF notice and do not mutate team settings.
- `fetchTeamSettings({ groups: ["provider"] })` rejects because the user is not authorized -> keep defaults for non-secret provider settings without falling back to localStorage.
- Secret-shaped response from team settings client -> client parser rejects; settings UI must not accept leaked secret values.
- Existing setting save/delete without a loaded `updatedAt` token -> `409 team_setting_version_required`.
- Stale setting `updatedAt` token -> `409 team_setting_version_conflict`.
- Empty built-in provider base URL in PostgreSQL mode -> delete `provider:<provider>:baseUrl`.
- Empty custom provider base URL in PostgreSQL mode -> save `provider:<provider>:baseUrl` with an empty string so the custom provider definition URL does not rehydrate after reload.
- Corrupt JSON in `provider:customProviders` or `provider:modelOptions:*` -> ignore that value and restore defaults for that category.

#### 5. Good/Base/Bad Cases

- Good: in PostgreSQL mode, selecting `grok2api`, adding a custom provider, and adding manual video models writes only provider-scoped team settings; saving an API key writes only `provider:<provider>:apiKey` as a team secret.
- Base: in browser mode, the same actions continue to read/write the established localStorage keys.
- Bad: storing a provider API key in `provider:customProviders` or falling back to stale localStorage values when a team settings fetch fails.

#### 6. Tests Required

- Type/lint: `pnpm run typecheck` and `pnpm run lint`.
- Provider bundle: `pnpm run test:providers` must include team setting/secrets client and service tests.
- UI/manual when touching Settings -> Connections rendering: verify provider API key blur, base URL blur, provider selection, and custom provider deletion in both browser and PostgreSQL modes.

#### 7. Wrong vs Correct

##### Wrong

```typescript
localStorage.setItem("imagine_ai_provider", provider);
saveTeamSecret({ group: "provider", key: "provider:grok2api:baseUrl", value: baseUrl }, csrfToken);
```

##### Correct

```typescript
saveTeamSetting({ group: "provider", key: "provider:selected", value: provider }, csrfToken);
saveTeamSetting({ group: "provider", key: "provider:grok2api:baseUrl", value: baseUrl }, csrfToken);
saveTeamSecret({ group: "provider", key: "provider:grok2api:apiKey", value: apiKey }, csrfToken);
```

### Scenario: PostgreSQL Team Safety Snapshots

#### 1. Scope / Trigger

- Trigger: changing PostgreSQL/team-mode safety snapshot storage, summary display, backup/import plumbing, or API responses for the latest pre-destructive workspace snapshot.
- Goal: PostgreSQL stores the full server-side snapshot record with a payload ref, while browsers only receive a safe public summary.

#### 2. Signatures

- Storage record: `WorkspaceSafetySnapshotRecord` in `lib/storage/schema.ts`.
- Repository: `context.repository.safetySnapshots.getLatest()` / `.put(record)`.
- Service read: `getLatestTeamSafetySnapshot(queryable, config, request)`.
- Service write: `saveTeamSafetySnapshot(queryable, config, request, { snapshot })`; this is for server-side backup/import flows that already created a trusted payload ref.
- Public API: `GET /api/storage/team/safety-snapshot`.
- Client: `fetchTeamSafetySnapshot()`.

#### 3. Contracts

- Public responses use `TeamSafetySnapshotResult` with `snapshot: PublicTeamSafetySnapshot | null`.
- `PublicTeamSafetySnapshot` must include counts and metadata: `assetCount`, `boardCount`, `generationTaskCount`, `libraryAssetCount`, `voiceProfileCount`, `settingsKeyCount`, `reason`, `origin`, `fileName`, `sizeBytes`, and timestamps.
- Public responses must not include `payload`, `payload.uri`, media directory paths, or any raw storage key.
- `WorkspaceSafetySnapshotRecord.payload` remains internal to server-side repository/service code.
- `saveTeamSafetySnapshot` requires at least editor access and records `safety_snapshot.save` in the same transaction as the `safety_snapshots` write; `getLatestTeamSafetySnapshot` requires viewer access.
- Browser mode keeps using IndexedDB safety snapshots in `lib/data-management.ts` until active-storage backup/restore routes are implemented.

#### 4. Validation & Error Matrix

- Missing/invalid team session -> service rejects before reading or writing snapshot rows.
- Viewer session saving a snapshot -> authorization rejects through `createTeamWorkspaceStorageContext`.
- Public snapshot response containing `payload` -> `fetchTeamSafetySnapshot()` rejects the response as invalid.
- PostgreSQL config missing while hitting the route -> route returns the existing structured config error.
- No saved snapshot -> API returns `{ snapshot: null, targetKind: "postgres", workspaceId }`.

#### 5. Good/Base/Bad Cases

- Good: server-side backup flow writes a snapshot record with a trusted local-file payload ref, then the browser reads only the public summary.
- Base: no team snapshot exists; Settings/Data can render an empty latest-snapshot state without seeing storage internals.
- Bad: accepting a browser-submitted `payload.uri` or returning `originals/backup/...zip` in a public API response.

#### 6. Tests Required

- Service: get latest snapshot is workspace-scoped and omits payload from the public result.
- Service: save snapshot writes `safety_snapshots` and `safety_snapshot.save` in one transaction.
- Client: `fetchTeamSafetySnapshot()` uses `/api/storage/team/safety-snapshot` and rejects leaked `payload` fields.
- Quality gates: `pnpm run typecheck`, `pnpm run lint`, and `pnpm run test:providers`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
return Response.json(await context.repository.safetySnapshots.getLatest());
```

##### Correct

```typescript
const snapshot = await context.repository.safetySnapshots.getLatest();
return Response.json({
  snapshot: snapshot ? toPublicTeamSafetySnapshot(snapshot) : null,
  targetKind: "postgres",
  workspaceId: context.session.workspaceId,
});
```

### Scenario: PostgreSQL Team Data Summary

#### 1. Scope / Trigger

- Trigger: changing Settings -> Data stats, storage health summaries, PostgreSQL data diagnostics, or active-storage summary routing.
- Goal: browser mode keeps using `getWorkspaceDataSummary()` from IndexedDB/localStorage, while PostgreSQL team mode reads a server-side workspace summary through an authenticated Node-only API.

#### 2. Signatures

- Public API: `GET /api/storage/team/data-summary`.
- Service: `getTeamWorkspaceDataSummary(queryable, config, request): Promise<TeamWorkspaceDataSummaryResult>`.
- Client: `fetchTeamWorkspaceDataSummary(): Promise<WorkspaceDataSummary>`.
- Runtime branch: `fetchWorkspaceStorageRuntimeStatus()` decides whether Settings -> Data calls `getWorkspaceDataSummary()` or `fetchTeamWorkspaceDataSummary()`.
- Shared type extension: `WorkspaceDataSummary.teamStorage?: { assetLibraryRecords; failedGenerationTasks; generationTasks; mediaBytes; mediaConsistency; mediaUsageWarning; mediaUsageWarningBytes?; payloadBytes; payloadRefs; promptTemplates; providerTargets; secretSettings; settings; voiceProfiles }`.
- Team media consistency shape: `mediaConsistency: { missingPayloadFiles; missingPreviewFiles; orphanedPayloadFiles; orphanedPreviewFiles; tmpFiles; trashFiles }`.

#### 3. Contracts

- `GET /api/storage/team/data-summary` requires at least viewer access through `createTeamWorkspaceStorageContext`.
- Public response shape is `{ summary, targetKind: "postgres", workspaceId }`.
- `summary` must reuse `WorkspaceDataSummary` so Settings -> Data can render browser and PostgreSQL summaries through one UI component.
- Team summary must report database-proven counts: asset totals by type/status, board/node totals, payload ref count/bytes, asset library count, total and failed generation task counts, prompt template count, provider target count, setting/secret count, voice profile count, and latest safety snapshot public summary.
- Team summary must also inspect the configured server media volume for known local-file refs and return only aggregate consistency counts:
  - DB ref without file: `missingPayloadFiles`, `missingPreviewFiles`
  - File without DB ref: `orphanedPayloadFiles`, `orphanedPreviewFiles`
  - Maintenance directories: `tmpFiles`, `trashFiles`
- Public summary must not include payload `uri`, `IMAGINE_MEDIA_DIR`, database URLs, absolute file paths, setup tokens, session secrets, or decrypted provider secrets.
- Public media consistency counts must not include `storage_key`, relative file paths, or absolute media paths; cleanup and repair actions must use separate authenticated maintenance mutation APIs.
- PostgreSQL media maintenance uses `POST /api/storage/team/media-maintenance`, `runtime = "nodejs"`, body `{ target: "maintenance-files" | "missing-payload-assets" | "missing-preview-refs" }`.
- In team mode, Settings -> Data may show diagnostic issue groups but must not wire those buttons to browser IndexedDB/localStorage cleanup handlers. Team-mode buttons may only call explicit team APIs, such as media maintenance cleanup or stale source-link repair.
- Stale asset source-link repair in PostgreSQL mode uses `PATCH /api/storage/team/assets` with body `{ action: "repair-stale-source-links" }`, requires trusted origin, CSRF, and at least `admin`, clears only stale `StorageItemMeta.sourceBoardNodeId` values, returns `{ repairedIds, targetKind: "postgres", workspaceId }`, and writes `team_assets.repair_source_links` with aggregate non-secret audit metadata.

#### 4. Validation & Error Matrix

- Missing/invalid team session -> API returns the existing structured team auth error before reading workspace tables.
- Viewer access -> can read summary; editor/admin/owner are not required for read-only diagnostics.
- Missing PostgreSQL config -> route returns the existing structured config error with `400`.
- Client response missing `{ targetKind: "postgres", workspaceId, summary }` -> `fetchTeamWorkspaceDataSummary()` rejects.
- Client response with malformed summary fields -> parser rejects instead of rendering partial team stats.
- Complete asset with `hasBlob: true` but no `asset_payloads` row -> counted as `brokenComplete`.
- Board reference to an absent asset ID -> counted as a critical missing board reference.
- Local-file payload DB ref missing on disk -> `mediaConsistency.missingPayloadFiles` increments and integrity status is critical.
- Local-file preview DB ref missing on disk -> `mediaConsistency.missingPreviewFiles` increments and integrity issue count increases.
- Unreferenced files under `originals/` or `previews/` -> orphaned media consistency counts increase.
- Files under `tmp/` or `trash/` -> maintenance counts increase; Settings -> Data displays them without offering browser cleanup actions.
- Stale `sourceBoardNodeId` in PostgreSQL mode -> Settings -> Data shows the existing stale-source issue group; owner/admin can run the team PATCH repair action, while viewer/editor can only inspect the issue details.
- Missing local-file preview in PostgreSQL mode -> Settings -> Data can call `"missing-preview-refs"` after owner/admin confirmation; the service deletes only missing `asset_previews` rows and leaves assets plus original payload refs intact.

#### 5. Good/Base/Bad Cases

- Good: PostgreSQL mode opens Settings -> Data, shows `PostgreSQL` as the storage target, renders Team Settings / Team Media cards, and displays payload/library/task/setting slots from the server summary.
- Good: a missing payload file increments issue count, marks integrity critical, and shows only aggregate missing-file counts in Settings -> Data.
- Good: an owner/admin repairs stale source links in PostgreSQL mode; the API clears only invalid `sourceBoardNodeId` metadata, records a non-secret audit count, and the UI refreshes the team summary.
- Good: an owner/admin repairs missing preview refs in PostgreSQL mode; the API removes only stale preview DB refs, records a non-secret count, and the UI refreshes the team summary.
- Base: browser mode still renders IndexedDB stats, browser quota, local settings inventory, and local safety snapshots without making team summary calls.
- Bad: returning `storage_key`/media paths to the browser, treating orphaned media files as browser IndexedDB cleanup targets, repairing PostgreSQL stale source links through IndexedDB, or importing browser-only data-management runtime into the Node route.

#### 6. Tests Required

- Service: summary is workspace-scoped, counts database rows, detects missing payload refs and board references, and omits safety snapshot payload data.
- Service: media consistency uses a temporary media dir in tests and asserts missing preview refs, orphaned original/preview files, tmp files, and trash files.
- Client: `fetchTeamWorkspaceDataSummary()` calls `/api/storage/team/data-summary`, parses a valid envelope, and rejects malformed summaries.
- Client/service: `repairTeamAssetSourceLinks()` sends PATCH with CSRF, rejects blank CSRF before fetch, clears only stale workspace-scoped source links, rejects viewers, and rejects missing CSRF before opening a database client.
- Client/service: `cleanupTeamMediaMaintenance("missing-preview-refs")` sends CSRF, validates the target, deletes only workspace-scoped preview refs whose local-file preview is missing, rejects viewers, records `team_media.cleanup`, and rejects malformed responses.
- UI/manual: Settings -> Data renders in browser mode; when team mode is active or mocked, labels switch to Team Settings / Team Media and storage slots switch to payload/library/task/settings counts.
- Quality gates: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:providers`, `pnpm run check`, and `pnpm run build`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
const summary = await getWorkspaceDataSummary();
await cleanupWorkspaceAssets("broken-complete");
```

##### Correct

```typescript
const status = await fetchWorkspaceStorageRuntimeStatus();
const summary = status.mode === "postgres"
  ? await fetchTeamWorkspaceDataSummary()
  : await getWorkspaceDataSummary();
```

##### Wrong

```typescript
return Response.json({
  missingFiles: [{ storageKey: "originals/image/aa/bb/file.png" }],
  mediaDir: process.env.IMAGINE_MEDIA_DIR,
});
```

##### Correct

```typescript
return Response.json({
  summary: {
    teamStorage: {
      mediaConsistency: {
        missingPayloadFiles,
        missingPreviewFiles,
        orphanedPayloadFiles,
        orphanedPreviewFiles,
        tmpFiles,
        trashFiles,
      },
    },
  },
});
```

### Scenario: PostgreSQL Team Media Maintenance Cleanup

#### 1. Scope / Trigger

- Trigger: changing PostgreSQL media consistency cleanup, Settings -> Data team maintenance actions, or `/api/storage/team/media-maintenance`.
- Goal: provide explicit admin-only maintenance actions for known-safe media file cleanup and unrecoverable missing-payload asset row cleanup, without exposing media storage details to the browser.

#### 2. Signatures

- Public API: `POST /api/storage/team/media-maintenance`, `runtime = "nodejs"`, body `{ target: "maintenance-files" | "missing-payload-assets" }`.
- Service: `cleanupTeamMediaMaintenance(queryable, config, request, target): Promise<TeamMediaMaintenanceCleanupResult>`.
- Shared target type: `TeamMediaMaintenanceTarget = "maintenance-files" | "missing-payload-assets"`.
- Helpers: `cleanupTeamMediaMaintenanceFiles(mediaDir, refs): Promise<TeamMediaConsistencyCleanupResult>` and `listMissingTeamMediaStorageKeys(mediaDir, storageKeys)`.
- Client: `cleanupTeamMediaMaintenance(target, csrfToken): Promise<TeamMediaMaintenanceCleanupResult>`.
- UI: Settings -> Data may attach `"maintenance-files"` only to the team orphaned-media issue group and `"missing-payload-assets"` only to the missing-media issue group when missing payload files are present.

#### 3. Contracts

- The route requires trusted origin, valid `imagine_team_csrf` cookie matching `x-imagine-csrf-token`, and an authenticated team session with at least `admin`.
- The route must resolve `DATABASE_URL` and `IMAGINE_MEDIA_DIR` server-side and must never return those values, raw `storage_key`, or absolute file paths.
- The only accepted targets are `"maintenance-files"` and `"missing-payload-assets"`.
- The service reads workspace-scoped local-file refs from `asset_payloads` and `asset_previews`.
- `"maintenance-files"` deletes only:
  - unreferenced files under `originals/`
  - unreferenced files under `previews/`
  - files under `tmp/`
  - files under `trash/`
- `"maintenance-files"` must not delete referenced payload/preview files, must not create missing files for DB refs, and must not delete or update PostgreSQL rows.
- `"missing-payload-assets"` deletes PostgreSQL `assets` rows whose local-file payload storage key is missing on disk, inside a transaction. It must ignore remote/non-local payload refs, must not delete media files, and must not delete assets that only have a missing preview file.
- Cleanup must write `team_media.cleanup` to `audit_events` with non-secret aggregate counts and target metadata only.
- Client responses must be validated as `{ targetKind: "postgres", target, workspaceId, deletedFiles, deletedMissingPayloadAssets, deletedOrphanedPayloadFiles, deletedOrphanedPreviewFiles, deletedTmpFiles, deletedTrashFiles }`.

#### 4. Validation & Error Matrix

- Missing/invalid CSRF or untrusted origin -> reject before opening a database client.
- Missing/invalid team session -> reject before reading media refs.
- Viewer/editor role -> `403 forbidden` before deleting files.
- Invalid body or target other than `"maintenance-files"` / `"missing-payload-assets"` -> `400 invalid_team_media_maintenance_request` or `400 invalid_team_media_maintenance_target`.
- Missing PostgreSQL/media config -> route returns the existing structured config error with `400`.
- Unsafe referenced storage key containing absolute paths, empty path parts, or `..` -> fail fast with `Invalid team media storage key`; do not continue deleting other files.
- Referenced preview file missing on disk -> count remains a diagnostics issue; cleanup does not repair it.
- Referenced payload file missing on disk -> `"missing-payload-assets"` can delete the affected asset rows and database cascades handle payload/preview/library rows.
- Orphaned original/preview, `tmp/`, and `trash/` files -> deleted from the media volume and counted in the response.

#### 5. Good/Base/Bad Cases

- Good: admin clicks Settings -> Data clean-files action in PostgreSQL mode; the API deletes orphaned originals/previews plus tmp/trash files, records an audit event, and the UI refreshes the team summary.
- Good: admin clicks Settings -> Data delete-missing-asset-records action when payload files are missing; the API deletes only the matching asset rows in a transaction, records an audit event, and the UI refreshes the team summary.
- Base: no orphan/tmp/trash files exist; response reports zero deletes and still records the explicit maintenance action.
- Bad: file cleanup deletes a referenced `originals/...` file, missing-payload cleanup deletes a remote-url asset or preview-only-missing asset, leaks a storage key in JSON, or routes the button to browser IndexedDB cleanup.

#### 6. Tests Required

- Unit: helper detects missing refs and deletes only orphaned originals/previews plus `tmp/`/`trash`, preserving referenced files.
- Unit: helper rejects unsafe referenced storage keys before deleting.
- Service: `cleanupTeamMediaMaintenance()` enforces admin role, reads only workspace-scoped local-file refs, deletes the expected files, and writes `team_media.cleanup`.
- Service: `"missing-payload-assets"` deletes only missing local-file payload asset rows, wraps the mutation in begin/commit/rollback, ignores remote refs, and writes `team_media.cleanup`.
- Service: viewer/editor cannot trigger cleanup and files remain untouched.
- Client: `cleanupTeamMediaMaintenance()` posts `{ target }`, sends CSRF only as `x-imagine-csrf-token`, rejects blank CSRF, and rejects malformed/error responses.
- Quality gates: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:providers`, `pnpm run check`, and `pnpm run build`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
await cleanupWorkspaceAssets("orphaned");
await fetch("/api/storage/team/media-maintenance", {
  body: JSON.stringify({ target: "all-media" }),
});
```

##### Correct

```typescript
const csrfToken = readTeamCsrfToken();
if (!csrfToken) throw new Error(t("dataManagement.teamSessionCsrfMissing"));
await cleanupTeamMediaMaintenance("maintenance-files", csrfToken);
```

##### Wrong

```typescript
return Response.json({
  deleted: ["originals/image/orphan.png"],
  mediaDir: process.env.IMAGINE_MEDIA_DIR,
});
```

##### Correct

```typescript
return Response.json({
  deletedFiles,
  deletedOrphanedPayloadFiles,
  deletedOrphanedPreviewFiles,
  deletedTmpFiles,
  deletedTrashFiles,
  target: "maintenance-files",
  targetKind: "postgres",
  workspaceId,
});
```

### Scenario: PostgreSQL Team Workspace Backup Export And Restore

#### 1. Scope / Trigger

- Trigger: changing PostgreSQL team backup/export/restore, Settings -> Data full workspace backup routing, shared backup ZIP format constants, safety snapshot payload handling, or `/api/storage/team/backup`.
- Goal: let an admin export or restore the active PostgreSQL team workspace without accidentally mutating browser IndexedDB/localStorage or leaking team secrets.

#### 2. Signatures

- Public API: `GET /api/storage/team/backup`, `runtime = "nodejs"`, optional query `includeCredentials=1`.
- Public API: `POST /api/storage/team/backup`, `runtime = "nodejs"`, multipart form `{ file: <zip>, includeCredentials?: "1" }`.
- Service: `exportTeamWorkspaceBackup(queryable, config, request, includeCredentials): Promise<TeamWorkspaceBackupExport>`.
- Service: `restoreTeamWorkspaceBackup(queryable, config, request, backupFile, includeCredentials): Promise<TeamWorkspaceBackupRestoreResult>`.
- Public result: `TeamWorkspaceBackupExport extends WorkspaceExportResult` with `{ body: ArrayBuffer; targetKind: "postgres"; workspaceId: string }`.
- Public result: `TeamWorkspaceBackupRestoreResult extends WorkspaceExportResult` with `{ safetySnapshotId: string; targetKind: "postgres"; workspaceId: string }`.
- Shared backup format module: `lib/workspace-backup-format.ts` owns `WORKSPACE_BACKUP_SCHEMA_VERSION`, manifest/index file names, `WorkspaceBackupManifest`, `WorkspaceBackupAssetRecord`, `WorkspaceExportResult`, and safety snapshot result types.
- Client: `downloadTeamWorkspaceBackup(includeCredentials, fetcher?): Promise<WorkspaceExportResult>`.
- Client: `restoreTeamWorkspaceBackup(file, includeCredentials, csrfToken, fetcher?): Promise<TeamWorkspaceBackupRestoreResult>`.
- Settings UI: in PostgreSQL mode, full workspace export calls `downloadTeamWorkspaceBackup()`; restore calls `restoreTeamWorkspaceBackup()` with `imagine_team_csrf`; browser-only current-board export is hidden, and safety-snapshot download still fails visibly instead of using browser stores.

#### 3. Contracts

- The route requires PostgreSQL config and a valid team session with at least `admin`.
- The route is read-only but must be `nodejs` because it reads PostgreSQL rows and local media payloads.
- `POST` is mutating and must validate trusted origin plus `imagine_team_csrf` cookie matching `x-imagine-csrf-token` before opening a database client.
- Export pages through workspace-scoped repository lists for assets, boards, asset library, generation tasks, and voice profiles.
- The ZIP uses the existing browser backup schema files: `manifest.json`, `assets/index.json`, `library/index.json`, `boards/index.json`, `generation-tasks/index.json`, `voice-profiles/index.json`, and `settings/local-storage.json`.
- Media payload bytes are copied to `assets/media/<safe-asset-id>.<ext>` and each asset index record stores `mediaFile` plus `mediaMimeType` instead of an app-server media URL.
- Assets with `hasBlob: true` and no workspace payload ref fail fast; remote/non-blob assets may export their existing URL.
- Asset `generationRequest.runningHubAccessPassword` must be removed before writing `assets/index.json`.
- Board documents must pass through `redactTeamBoardDocument()` before writing `boards/index.json`.
- Generation tasks already use `GenerationTaskRequestSnapshot`; do not add secret fields to task export.
- `settings/local-storage.json` is a shared settings envelope. PostgreSQL team exports keep `localStorage: {}` for browser-local settings, include non-secret workspace settings in `teamSettings`, and include decrypted `teamSecrets` only when `includeCredentials=1` is explicitly requested.
- `includeCredentials=1` requires `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY`; encrypted team settings are decrypted server-side only for the portable backup file and must not be returned through ordinary team settings/secret APIs.
- Successful export writes `team_backup.export` to `audit_events` with aggregate counts and non-secret metadata only.
- Response headers expose only counts and the generated file name: `X-Imagine-Asset-Count`, `X-Imagine-Board-Count`, `X-Imagine-Generation-Task-Count`, `X-Imagine-Library-Asset-Count`, `X-Imagine-Settings-Key-Count`, `X-Imagine-Voice-Profile-Count`, and `X-Imagine-Backup-File-Name`.
- Restore parses the same ZIP manifest/index files, validates manifest counts, safe media paths, media MIME/type compatibility, and library/task/voice-profile asset references before clearing team records.
- Restore rejects backups containing `teamSecrets` unless `includeCredentials=1` is explicitly provided. Browser backup `localStorage` entries are restored only after shared managed-key classification: known provider/model/prompt-template/RunningHub entries convert into team stores, local-only keys are skipped with counts, unknown keys reject with `invalid_team_backup`, and browser credential keys require `includeCredentials=1`.
- Restore creates a pre-restore safety snapshot using the team export ZIP before deleting current workspace records.
- Safety snapshot ZIP payloads use `LocalFilePayloadStore` with MIME `application/zip`; media consistency summaries must treat the latest safety snapshot local-file payload ref as referenced so cleanup does not delete it as orphaned media.
- Restore clears and replaces assets, boards, asset-library records, generation tasks, voice profiles, and non-secret team settings. It clears/replaces team secrets only when credential restore is explicitly enabled; otherwise existing team secrets are preserved.
- Restore writes restored asset metadata first, then writes local-file payload bytes, then updates asset metadata with the payload `contentHash`; this avoids asset-payload foreign-key failures.
- Restore runs workspace replacement inside a transaction, rolls back on failure, and deletes any payload files written during the failed restore attempt.
- Successful restore writes `team_backup.restore` to `audit_events` with aggregate counts and the pre-restore `safetySnapshotId`.

#### 4. Validation & Error Matrix

- Missing PostgreSQL config -> existing structured config error with `400`.
- Missing/expired team session -> reject before reading workspace data.
- Viewer/editor role -> reject before reading/exporting workspace data.
- `GET includeCredentials=1` with missing `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY` -> explicit secret-encryption config error.
- `POST` missing/invalid origin or CSRF -> reject before opening a database client.
- `POST` missing `file` part -> `400 missing_team_backup_file`.
- Restore with `teamSecrets` and no `includeCredentials=1` -> `400 team_restore_credentials_required`.
- Restore with unknown browser `localStorage` settings -> `400 invalid_team_backup`.
- Restore with browser credential-bearing `localStorage` settings and no `includeCredentials=1` -> `400 team_restore_credentials_required`.
- Restore with missing manifest/index/media file, bad schema version, count mismatch, unsafe media path, MIME/type mismatch, or missing referenced asset -> `400 invalid_team_backup`.
- Asset marked blob-backed but missing payload ref -> fail fast with a clear missing-payload error.
- Payload ref exists but MIME type is missing -> fail fast with a clear missing-MIME error.
- Client receives a non-OK response -> surface the server error message.
- Client receives missing/non-integer count headers -> reject the response as invalid.
- Client receives an invalid restore JSON shape -> reject the response as invalid.
- PostgreSQL mode safety-snapshot download -> visible unsupported error; browser snapshot download code must not run.

#### 5. Good/Base/Bad Cases

- Good: admin clicks full backup in PostgreSQL mode with credentials unchecked; the browser downloads a ZIP containing team workspace records, media, and non-secret team settings, with passwords redacted and an audit event stored.
- Good: admin clicks full backup in PostgreSQL mode with credentials checked; the ZIP includes team secret values only in the explicit credential-inclusive backup file.
- Good: admin restores a PostgreSQL team ZIP with credentials unchecked; the route creates a safety snapshot, replaces workspace records and non-secret team settings transactionally, restores media payloads, writes audit metadata, and the UI refreshes the team data summary.
- Good: admin restores a credential-inclusive PostgreSQL team ZIP with credentials checked; imported team secrets are encrypted before storage and existing team secrets are replaced.
- Base: workspace has no assets/boards/tasks/profiles; export still writes a valid manifest and empty index files.
- Base: restore ZIP has zero assets/boards/tasks/profiles/settings; restore still creates a safety snapshot and produces zero counts.
- Bad: team export reads IndexedDB/localStorage, restore writes browser IndexedDB/localStorage, includes `runningHubAccessPassword`, silently ignores an enabled credential checkbox, leaks storage keys/media paths in JSON, lets a viewer restore team data, or deletes the pre-restore safety snapshot payload as orphaned media.

#### 6. Tests Required

- Service: export writes the expected ZIP files, media bytes, manifest counts, redacted asset/board JSON, and `team_backup.export`.
- Service: `includeCredentials=true` exports team secrets only with the configured encryption key and leaves ordinary secret APIs masked.
- Service: restore parses a valid ZIP, creates a safety snapshot, begins/commits a transaction, restores payload bytes and workspace records, and writes `team_backup.restore`.
- Service: restore imports team settings, re-encrypts credential-inclusive team secrets, converts classified portable browser localStorage into team settings/secrets/prompt templates/provider targets, rejects credential-bearing browser settings without opt-in, and rejects malformed/mismatched backups or unknown browser settings before replacing workspace data.
- Client: download wrapper uses `/api/storage/team/backup`, parses all count headers, triggers a file download, and surfaces server errors.
- Client: restore wrapper uploads `FormData` with `x-imagine-csrf-token`, parses restore counts and `safetySnapshotId`, rejects blank CSRF, and surfaces server errors.
- UI: Settings -> Data routes PostgreSQL full backup/restore to the team client, hides current-board browser export, and rejects PostgreSQL safety download without mutating browser storage.
- Quality gates: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:providers`, `pnpm run check`, and `pnpm run build`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
writeManagedLocalStorage(parsed.settings.localStorage, true);
```

##### Correct

```typescript
await restoreTeamWorkspaceBackup(file, true, csrfToken);
```

##### Wrong

```typescript
zip.file("boards/index.json", JSON.stringify(teamBoards.map(record => record.board)));
```

##### Correct

```typescript
zip.file("boards/index.json", JSON.stringify(teamBoards.map(record => redactTeamBoardDocument(record.board))));
```

##### Wrong

```typescript
await repository.settings.put({
  group: secret.group,
  isSecret: true,
  key: secret.key,
  value: secret.value,
});
```

##### Correct

```typescript
await repository.settings.put({
  group: secret.group,
  isSecret: true,
  key: secret.key,
  value: encryptWorkspaceSecret(secret.value, encryptionKey),
});
```

### Scenario: PostgreSQL Team Auth Rate Limiting

#### 1. Scope / Trigger

- Trigger: changing `/api/storage/team/session`, `/api/storage/team/bootstrap`, team setup-token validation, or local team auth brute-force protection.
- Goal: repeated invalid login/bootstrap attempts are locked out before they can keep probing credentials or setup tokens, and bootstrap failures do not reveal whether the setup token exists.

#### 2. Signatures

- Login API: `POST /api/storage/team/session` with `{ email: string; password: string }`.
- Bootstrap API: `POST /api/storage/team/bootstrap` with `{ email: string; password: string; teamName?: string; workspaceName?: string }` and header `x-imagine-setup-token`.
- Rate limiter:
  - `teamRequestRateLimitKey(request, scope, identifier?)`
  - `assertTeamRateLimit(key, policy)`
  - `recordTeamRateLimitFailure(key, policy)`
  - `clearTeamRateLimit(key)`
- Policies:
  - `TEAM_LOGIN_RATE_LIMIT`: 5 failures per 15 minutes, then 15-minute lockout.
  - `TEAM_BOOTSTRAP_RATE_LIMIT`: 5 failures per 30 minutes, then 30-minute lockout.

#### 3. Contracts

- Login rate-limit keys include scope, client address, and normalized email.
- Bootstrap rate-limit keys include scope and client address only; they must not include the submitted setup token.
- `x-forwarded-for` first hop is the preferred client address; `x-real-ip` is the secondary source; otherwise use `unknown`.
- Invalid login credentials call `recordTeamRateLimitFailure`; successful login calls `clearTeamRateLimit`.
- Invalid bootstrap setup tokens call `recordTeamRateLimitFailure` and return a generic auth failure.
- Successful bootstrap calls `clearTeamRateLimit`.
- Missing `IMAGINE_TEAM_SETUP_TOKEN` remains an explicit server configuration error, because there is no configured secret to protect.
- The limiter is per app-server process and in memory. Do not claim distributed or cross-restart lockout semantics until a shared store is added.

#### 4. Validation & Error Matrix

- Invalid login body -> `400 invalid_team_session_request`; do not count as an auth failure.
- Invalid login credentials -> existing `401 invalid_credentials`; count the failure.
- Locked login key -> `429 team_rate_limited`.
- Missing bootstrap setup-token env -> `400 internal_error` with the explicit config message.
- Wrong bootstrap setup token -> `401 team_bootstrap_failed` with `Team bootstrap failed`; count the failure.
- Locked bootstrap key -> `429 team_rate_limited`.
- Wrong origin -> origin/CSRF error before auth work.

#### 5. Good/Base/Bad Cases

- Good: five invalid bootstrap tokens from the same client IP return generic failures; the next attempt returns `429` before database access.
- Base: one bad login followed by a valid login clears the login rate-limit key for that normalized email and client address.
- Bad: returning `invalid_setup_token`, keying bootstrap attempts by token value, or silently allowing unlimited invalid credentials because the database query failed.

#### 6. Tests Required

- Unit: limiter locks after repeated failures, resets after the window, builds normalized keys, and can be cleared after success.
- Route: bootstrap invalid setup-token attempts return generic `401` responses and then `429`.
- Provider bundle: `pnpm run test:providers`.
- Quality gates: `pnpm run typecheck`, `pnpm run lint`, `pnpm run check`, and `pnpm run build`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
if (request.headers.get("x-imagine-setup-token") !== process.env.IMAGINE_TEAM_SETUP_TOKEN) {
  throw new ApiError(401, "invalid_setup_token", "Invalid setup token");
}
```

##### Correct

```typescript
const rateLimitKey = teamRequestRateLimitKey(request, "team-bootstrap");
assertTeamRateLimit(rateLimitKey, TEAM_BOOTSTRAP_RATE_LIMIT);
if (requestToken !== setupToken) {
  recordTeamRateLimitFailure(rateLimitKey, TEAM_BOOTSTRAP_RATE_LIMIT);
  throw new ApiError(401, "team_bootstrap_failed", "Team bootstrap failed");
}
```

### Scenario: PostgreSQL Team Asset Library

#### 1. Scope / Trigger

- Trigger: changing Asset Library modal data loading, source promotion, file import, library metadata editing/deletion, or team storage API/client code while `fetchWorkspaceStorageRuntimeStatus()` reports `targetKind: "postgres"`.
- Goal: browser mode keeps using IndexedDB `asset_library`, while PostgreSQL team mode uses workspace-scoped `asset_library` rows plus safe public backing asset records.

#### 2. Signatures

- Repository: `context.repository.assetLibrary.get(id)`, `.list({ limit, offset })`, `.put({ record })`, `.delete(id)`.
- Public APIs:
  - `GET /api/storage/team/asset-library?limit=&offset=`
  - `POST /api/storage/team/asset-library` with `{ record: LibraryAssetRecord }`
  - `DELETE /api/storage/team/asset-library/[itemId]`
- Client:
  - `fetchTeamAssetLibrary({ limit, offset })`
  - `saveTeamAssetLibraryRecord(record, csrfToken)`
  - `deleteTeamAssetLibraryRecord(itemId, csrfToken)`
- Hook branch: `useAssetLibrary()` reads `/api/storage/local/status`; `targetKind: "postgres"` switches reload/add/import/update/delete to the team client, otherwise it keeps IndexedDB functions from `lib/db.ts` and `lib/asset-library.ts`.

#### 3. Contracts

- Public list/mutation envelopes use `TeamAssetLibraryListResult` / `TeamAssetLibraryMutationResult` with `targetKind: "postgres"` and `workspaceId`.
- Each public entry is `{ record: LibraryAssetRecord, asset: PublicTeamAssetRecord | null }`.
- `PublicTeamAssetRecord` may include safe `mediaUrl`, `downloadUrl`, and public payload metadata, but must not include `payload.uri`, server media directories, local file paths, or raw storage keys.
- `POST` must verify `record.assetId` belongs to an asset in the caller workspace before writing the library record.
- Promoted team library records may point directly at the source asset with `assetId === sourceAssetId`; deleting that library record must not delete the source asset.
- Imported team library files create a dedicated backing asset with `meta.libraryItemId === record.id`; deleting that library item deletes the backing asset and relies on the database cascade to remove its library row.
- Team asset-library saves must write `team_asset_library.save` with non-secret item id, asset id, and media type metadata in the same transaction as the upsert. Do not include titles, notes, tags, payload refs, media paths, prompts, or source board/node metadata in audit metadata.
- Team asset-library deletes must write `team_asset_library.delete` with non-secret item id, asset id, and `deletedBackingAsset` metadata in the same transaction as the delete.
- Missing CSRF on save/delete fails visibly; do not fall back to IndexedDB after PostgreSQL mode has been selected.

#### 4. Validation & Error Matrix

- Invalid `limit` / `offset` query -> `400 invalid_team_asset_library_query`.
- Malformed `{ record }` JSON or invalid `LibraryAssetRecord` fields -> `400 invalid_team_asset_library_request`.
- Missing/invalid team session -> reject before reading library rows.
- Viewer session saving/deleting -> role check rejects through `createTeamWorkspaceStorageContext`.
- `record.assetId` not found in the caller workspace -> `404 team_asset_not_found`.
- Deleting a missing library item -> `404 team_asset_library_not_found`.
- Client receives a payload object containing `uri` -> reject the response as invalid.

#### 5. Good/Base/Bad Cases

- Good: in PostgreSQL mode, opening Asset Library fetches `/api/storage/team/asset-library`, renders records with app-server media URLs, and edits metadata through `saveTeamAssetLibraryRecord`.
- Base: in browser mode, Asset Library continues to load records from IndexedDB and hydrate backing assets locally.
- Bad: returning `originals/image/...` from the API, deleting a promoted source asset when only removing the library record, or silently writing team-mode edits to IndexedDB after the runtime target reports PostgreSQL.

#### 6. Tests Required

- Service: list returns workspace-scoped entries with safe public payload metadata and no `uri`.
- Service: save requires editor access, verifies the backing asset exists, writes `asset_library`, and records `team_asset_library.save` audit metadata without library text or payload details.
- Service: delete removes only dedicated backing assets (`meta.libraryItemId === itemId`) and otherwise deletes only the library record, with `team_asset_library.delete` audit metadata in the same transaction.
- Route: invalid query/missing CSRF are rejected before opening a database client for mutating calls.
- Client: list URL encodes filters, save/delete send CSRF headers, item IDs are encoded, and leaked payload `uri` fields are rejected.
- Quality gates: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:providers`, and `pnpm run build`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
await context.repository.assets.delete(record.assetId);
return Response.json(await context.repository.assetLibrary.list());
```

##### Correct

```typescript
const asset = await context.repository.assets.get(record.assetId);
if (!asset) throw new ApiError(404, "team_asset_not_found", "Team library asset was not found");
await context.repository.assetLibrary.put({ record });
return Response.json({
  entry: {
    asset: asset ? publicTeamAssetRecord(asset) : null,
    record,
  },
  targetKind: "postgres",
  workspaceId: context.session.workspaceId,
});
```

### Scenario: Content-Addressed Asset Payloads

#### 1. Scope / Trigger

- Trigger: asset IndexedDB schema/migration work in `lib/db.ts`.
- Goal: repeated uploads/imports may keep separate asset records, but identical local media payloads must share one stored payload.

#### 2. Signatures

- `StorageItemMeta.contentHash?: string` stores a `sha256:<hex>` payload key when `hasBlob` is true.
- `assets_meta` remains keyed by `id` and has a non-unique `by_contentHash` index.
- `asset_blob_payloads` is keyed by `hash` and stores `{ hash: string; data: string }`.
- `assets_blob` remains keyed by asset `id` only for legacy migration/read fallback.
- `saveToDB(item: StorageItem)` computes the hash before opening its write transaction.
- `getAssetBlobPayload(id: string)` resolves `id -> meta -> contentHash -> payload`, then falls back to and lazily migrates `assets_blob[id]`.
- `getAssetDatabaseDiagnostics()` returns read-only store counts for `assets_meta`, `assets_blob`, `asset_blob_payloads`, `asset_previews`, and legacy `assets`.

#### 3. Contracts

- Metadata is the source of truth for asset identity, status, board scope, and generation fields.
- Shared payloads are the source of truth for local `data:` / `blob:` media once `contentHash` is present.
- Remote `http(s)` assets keep `url` on metadata and must not set `contentHash`.
- Board nodes keep referencing asset IDs; never replace multiple asset records with one record solely because payloads match.
- Board asset reference collection includes asset nodes, reference groups, result nodes, and generation node `resultAssetId(s)` so cleanup/export does not treat generated results as orphaned.
- Data settings must surface missing board asset references and underlying asset store counts; do not silently present IndexedDB read failure as an empty asset library.

#### 4. Validation & Error Matrix

- `window` missing -> `openDatabase()` rejects because IndexedDB is browser-only.
- WebCrypto SHA-256 unavailable -> `saveToDB()` / migration rejects instead of silently storing duplicate payloads.
- `contentHash` points to a missing shared payload -> read falls back to legacy `assets_blob[id]`.
- Deleting an asset -> delete its metadata, preview, legacy blob, then delete the shared payload only when no remaining metadata references the hash.

#### 5. Good/Base/Bad Cases

- Good: upload the same stored data URL twice; two asset IDs exist, one shared `asset_blob_payloads` row exists.
- Base: old asset without `contentHash`; hydrate through `assets_blob[id]` and lazily migrate only that touched row after DB open.
- Bad: dedupe by reusing an existing asset ID; this breaks task history, board placement, and scoped asset references.

#### 6. Tests Required

- Unit: `computeAssetContentHash()` returns a stable `sha256:<hex>` value for the same payload.
- Type/lint: `pnpm run typecheck` and `pnpm run lint`.
- Integration when browser tooling is available: write two assets with the same data URL, assert equal `contentHash`, one shared payload row, and both assets hydrate.

#### 7. Wrong vs Correct

##### Wrong

```typescript
blobStore.put({ id: meta.id, data: item.url });
```

##### Correct

```typescript
const contentHash = await computeAssetContentHash(item.url);
metaStore.put({ ...meta, contentHash });
hashBlobStore.put({ hash: contentHash, data: item.url });
```

### Scenario: Cinematic Prompt Controls

#### 1. Scope / Trigger

- Trigger: changing optional camera/style controls for image or video generation.
- Goal: store compact user selections while keeping prompt injection centralized and invisible to editable user prompts.

#### 2. Signatures

- Shared type: `CinematicProfile` in `lib/cinematic-controls.ts` stores `enabled`, `camera`, `lens`, `focalLength`, `aperture`, `palette`, `lighting`, and `movement`.
- Option metadata: each `CinematicOption` includes a compact `prompt` fragment plus a code-driven `visual` signature used by the picker UI.
- Board nodes: `BoardImageGenerateNode.cinematicProfile` and `BoardVideoGenerateNode.cinematicProfile`.
- Generation snapshot: `GenerationRequestSnapshot.cinematicProfile?: CinematicProfile`.
- Request-time transform: `applyCinematicProfileToPrompt(prompt, profile, "image" | "video")`.

#### 3. Contracts

- Default profile is `DEFAULT_CINEMATIC_PROFILE` and is off.
- Auto/off profile values must not change the submitted prompt.
- When active, only `generationRequest.prompt` receives the cinematic suffix; `StorageItem.prompt`, board node `prompt`, and visible textareas remain the user's original prompt.
- Board normalization must repair missing/old `cinematicProfile` fields to the default profile.
- Video may use movement instructions; image ignores movement even when the profile stores a movement value.
- Main and board UI should render a compact summary plus the shared visual picker dialog; do not split option data between separate main/board component constants.
- The visual picker dialog must render through a page-root portal such as `document.body`; do not leave it inside board nodes, inspectors, or transformed React Flow containers where `position: fixed` can be clipped or constrained.
- Visual option signatures are lightweight CSS-driven cues for this MVP. Do not add a downloaded/generated bitmap thumbnail pipeline unless explicitly requested.

#### 4. Validation & Error Matrix

- Missing board profile -> normalize to default.
- Invalid persisted option value -> normalize that option to `auto`.
- Disabled profile -> no prompt suffix.
- Empty prompt with `allowEmptyPrompt !== true` -> keep existing prompt-required validation before cinematic injection.

#### 5. Good/Base/Bad Cases

- Good: board image node with Arri Alexa 65 + 50mm + f/2.8 + Warm Film + Soft Window saves those selections, runs generation, and stores the injected prompt only in `generationRequest.prompt`.
- Base: all controls Auto or off; generated request prompt equals the reference-mapped user prompt.
- Bad: appending cinematic text directly into prompt textarea state or board node `prompt`.

#### 6. Tests Required

- Type/lint: `pnpm run check`.
- Provider/test bundle: `pnpm run test:providers` when snapshot or board node types change.
- UI/manual: compile `/` and `/board`; verify controls render in main panels and board inspector.

#### 7. Wrong vs Correct

##### Wrong

```typescript
setPrompt(`${prompt}\nCinematic direction: warm film color.`);
```

##### Correct

```typescript
const cinematicPrompt = applyCinematicProfileToPrompt(prompt, cinematicProfile, "image");
const generationPrompt = buildPromptWithReferenceMap(cinematicPrompt, references, referenceUrls);
```

### Scenario: Asset Preview URLs vs Original Media

#### 1. Scope / Trigger

- Trigger: any change that creates, stores, displays, downloads, edits, references, or submits generated media assets.
- Goal: preview URLs are a rendering optimization only; user actions and generation inputs must consume original media payloads.

#### 2. Signatures

- Preview creation: `saveItemWithPreview(item: StorageItem): Promise<StorageItem>` may return a `StorageItem` whose `url` is a lightweight preview.
- Original resolution: `resolveAssetOriginalUrl(meta): Promise<string>` resolves `http(s)` metadata URLs or IndexedDB blob payloads.
- Preview resolution: `resolveAssetPreviewUrl(meta): Promise<string>` / `ensureAssetPreviewUrl(meta)` are for thumbnail/grid display.

#### 3. Contracts

- Gallery and board thumbnails may render preview URLs.
- Board asset-store hydration must call `ensureAssetPreviewUrl(meta)` for local blob-backed images and videos when `resolveAssetPreviewUrl(meta)` returns an empty string.
- Fullscreen, download, ZIP export, image edit, panorama, voice-profile save, Agent/reference handoff, and generation request payloads must resolve original media before use.
- Selecting an asset or dwelling on a gallery media preview may promote the in-memory `StorageItem.url` to the original URL for a smoother high-quality preview.
- Board canvas hover/pointer movement must not passively promote media to original URLs; board original resolution belongs at explicit action boundaries such as selection-driven preview, fullscreen, download, edit, Agent/reference handoff, and generation execution.
- In-memory original promotion must return the previous `items` array when the resolved original URL matches the current URL, so passive or repeated promotions do not trigger global gallery/board recomputation.
- Board documents may store preview URLs as display references, but asset IDs remain the authority for resolving original payloads.
- Video board nodes must keep using a `data:image/*` preview URL for unselected cover rendering even when the in-memory item has been promoted to original `data:video/*`; use the board node's persisted preview URL as the cover source and keep original video URLs for selected playback/fullscreen actions.
- Do not write original `data:` payloads back into board documents as part of passive preview promotion.

#### 4. Validation & Error Matrix

- Original URL missing -> show the existing visible workspace error and do not continue the action.
- Non-local uploaded/reference media without an asset meta record -> keep its explicit URL.
- Transcript assets -> exclude from media-reference actions rather than coercing to image/audio/video.

#### 5. Good/Base/Bad Cases

- Good: newly generated image displays a preview in the gallery, gallery dwell or selection promotes it in memory only when the URL changes, and fullscreen/download/edit use the original stored data URL.
- Base: after reload, hydrated assets already contain original URLs; action code still resolves through the same original boundary.
- Bad: passing `item.url` from a preview-hydrated card directly to download or generation reference payloads.

#### 6. Tests Required

- Type/lint: `pnpm run lint` and `pnpm run typecheck`.
- Build for cross-surface changes: `pnpm run build`.
- Manual/browser when available: generate an image, do not refresh, then fullscreen/download/edit/reference it and verify the original payload is used; hover over board media nodes should not update the global asset list.

#### 7. Wrong vs Correct

##### Wrong

```typescript
setFullscreenItem(item);
```

##### Correct

```typescript
const originalUrl = await resolveAssetOriginalUrl(item);
setFullscreenItem({ ...item, url: originalUrl });
```

### Scenario: Generation Reference Snapshots

#### 1. Scope / Trigger

- Trigger: changing generation retry, task history, workspace backup/restore, cleanup, or Agent/media reference handoff.
- Goal: generated/imported media follow one asset-reference model instead of separate generated-result and imported-asset paths.

#### 2. Signatures

- `MediaReference.sourceAssetId?: string` points to the authoritative asset record when a reference comes from the asset store.
- `GenerationReferenceMediaSnapshot.sourceAssetId?: string` persists that pointer in `GenerationRequestSnapshot.referenceMedia`.
- `MediaReference.width/height` and `GenerationReferenceMediaSnapshot.width/height` optionally preserve known pixel dimensions for image references. Browser-imported image references should store the post-compression dimensions actually used as the reference payload.
- Snapshot `url` may be empty only when `sourceAssetId` is present; retry/submit code must resolve the original media from the asset store before sending a provider request.

#### 3. Contracts

- Store asset-origin references by `sourceAssetId` rather than copying local `data:` payloads into task snapshots or backup JSON.
- Transient references without an asset record keep their explicit URL in the snapshot.
- Retry, Agent reference handoff, and provider request preparation must resolve original media through `resolveAssetOriginalUrl()` before submission.
- The main workstation may use the first image reference's known pixel dimensions once to seed image generation size. Before selecting `custom`, normalize the reference dimensions to the closest legal custom generation size (16px grid, max edge/pixel/aspect constraints); models without arbitrary pixel-size support only receive the resulting aspect ratio.
- Additional image references must not keep re-applying size defaults over the user's current model/resolution choices.
- Missing `sourceAssetId` targets are visible errors; do not silently fall back to preview URLs.
- Workspace cleanup, diagnostics, backup, and restore must treat board nodes, library records, generation tasks, and voice profiles as one protected asset graph.
- Board `asset` and `result` nodes are both media reference sources; result nodes keep result-stack behavior but should offer the same reference/generation connection affordances as imported assets.

#### 4. Validation & Error Matrix

- Snapshot has `sourceAssetId` and empty `url` -> resolve original from IndexedDB before retry/submission.
- Snapshot has no `sourceAssetId` and empty `url` -> parse/import failure.
- Backup manifest declares task/profile indexes -> import must read them and validate referenced asset IDs.
- Generated result dragged to blank canvas -> quick-insert menu includes image/video/audio/reference-group/RunningHub-compatible targets, with multi-grid limited to image media.

#### 5. Tests Required

- Type/lint: `pnpm run lint` and `pnpm run typecheck`.
- Build when local Next installation is healthy.
- Manual/browser when available: generated image result dragged to blank canvas can connect to non-multi-grid operation nodes; imported image keeps the same behavior.

### Scenario: Board Agent Selection Context

#### 1. Scope / Trigger

- Trigger: changing board Agent prompts, board selection state, Agent media references, or `/api/agent/respond` board context shape.
- Goal: when Agent is used from `/board`, the current selected or box-selected nodes become explicit, visible context for the current Agent turn without silently expanding to unrelated connected nodes.

#### 2. Signatures

- Shared type: `AgentBoardContext` in `lib/agent-context.ts` includes `selectedNodeId`, `selectedNodeIds`, lightweight `selectedNodes`, full `selectedNodeDetails`, `selectedAssetReferenceCount`, bounded `nodes`, and bounded `edges`.
- Lightweight params: `AgentBoardNodeSummary.params` carries core executable node settings such as image/video/audio resolution, quality, duration, reference mode, audio mode, variant count, result ids, RunningHub target identity, and binding count.
- UI snapshot type: `AgentBoardContextSnapshot` stores only `{ boardTitle, nodeCount, assetCount }` for display and chat-history audit.
- Client builder: `BoardPageClient` derives selected nodes from `selectedNodeIds` first, then falls back to `selectedNodeId`.
- Request payload: `useAgentController.submitAgentPrompt()` sends `boardContext` plus merged `agentReferences`.
- Server boundary: `/api/agent/respond` validates `boardContext` with Zod, including `selectedNodeIds`, `selectedNodes`, `selectedAssetReferenceCount`, and every current board node kind such as `multi-grid`.
- Tool boundary: `get_board_context` exposes selected counts and selected node summaries; `get_board_context({ scope: "selected_full" })` returns only selected node full details; `get_connected_context` may fall back to the first selected node when no primary selected node exists.

#### 3. Contracts

- The first-version scope is selected/box-selected nodes and assets directly represented by those nodes only. Do not automatically include one-hop upstream/downstream connected assets unless the feature scope explicitly changes.
- Selected asset references must be derived through the same board reference helpers used by other board Agent/media handoffs, then resolved to original media before submission.
- Manual Agent references and selected-board references merge for the outgoing request; deduplication and sendability filtering belong to the existing Agent reference normalization path.
- Runtime Summary may include lightweight selected node summaries and core params so selected-node prompts/settings are visible without an extra tool call.
- Chat messages should store only the small `AgentBoardContextSnapshot`, not the full board context or media URLs.
- Full selected-node details must stay tool-gated. Do not place large advanced objects such as cinematic profiles, RunningHub binding arrays, or multi-grid items into Runtime Summary.
- Sensitive node fields such as RunningHub `accessPassword` must not be included in Agent summaries or `selected_full` details.
- Empty board selection preserves existing Agent behavior: board summary may still be sent, but no selected media references are auto-attached.
- The UI must show selected context before sending and snapshot counts after sending so users can audit which board context was used.

#### 4. Validation & Error Matrix

- Selected node id no longer exists -> drop it from `selectedNodes` and `selectedNodeDetails` during context construction.
- Selected node has no complete/sendable asset -> include its node summary but do not add a media reference.
- Selected asset original URL cannot be resolved -> fail the Agent submission visibly through the existing Agent error path.
- `blob:` or empty media URL reaches sendability filtering -> exclude it from `agentReferences`.
- Old or partial clients omit new board context fields -> Zod defaults `selectedNodeIds`, `selectedNodes`, `selectedNodeDetails`, and `selectedAssetReferenceCount` to empty values.

#### 5. Good/Base/Bad Cases

- Good: user box-selects three board nodes, Agent input shows `3 nodes`, Runtime Summary includes lightweight prompt/model/params for those nodes, and `get_board_context({ scope: "selected_full" })` can retrieve exact advanced selected-node details when needed.
- Base: user has no selection; Agent still receives the normal board summary and gallery summary with no auto-selected media payload.
- Bad: Agent silently includes an upstream asset that is connected to a selected node but not itself selected, making the UI chip under-report what the model saw.

#### 6. Tests Required

- Type/lint: `pnpm run check`.
- Build for cross-layer contract changes: `pnpm run build`.
- Manual/browser when available: open `/board`, select one or more nodes, open Agent, verify the context strip shows selected node and asset counts, then send and verify the user message has a context snapshot.
- API/tool sanity: `get_board_context(summary)` should report `selectedNodeIds`, `selectedNodeCount`, `selectedAssetReferenceCount`, and lightweight `selectedNodes`; `get_board_context(selected_full)` should report `selectedNodeDetails` without secrets.

#### 7. Wrong vs Correct

##### Wrong

```typescript
body: JSON.stringify({
  boardContext: buildBoardSummaryOnly(),
  agentReferences: manualReferences,
});
```

##### Correct

```typescript
const boardContext = buildAgentBoardContext();
const selectedReferences = await getAgentBoardContextReferences();

body: JSON.stringify({
  boardContext,
  agentReferences: getSendableAgentMediaReferences([
    ...manualReferences,
    ...selectedReferences,
  ]),
});
```

### Scenario: Transcript Asset Storage

#### 1. Scope / Trigger

- Trigger: adding or changing text-generation outputs persisted through the asset store, including ASR transcripts.
- Goal: allow transcript outputs to live in the gallery/export/history surface without treating them as image/video/audio media references.

#### 2. Signatures

- `StorageItem["type"]` includes `"transcript"`.
- Transcript asset URL: `data:text/plain;charset=utf-8;base64,<utf8 text>`.
- Transcript helper boundary: `createTranscriptDataUrl(text: string): string` and `decodeTranscriptDataUrl(url: string): string`.
- Generation result shape: `{ type: "direct", outputKind: "transcript", transcript: string, model: string, source: string }`.

#### 3. Contracts

- Transcript metadata is stored in the normal asset metadata store so search, status, date grouping, export, backup, cleanup, and task snapshots can reference it.
- Transcript text payload is stored through the asset blob/content-hash path like local media payloads; do not create a separate transcript database.
- Transcript assets are downloadable text results, not sendable media. Exclude them from media reference dropdowns, Agent media refs, board media drag lists, and generation reference payloads.
- Board ASR output should copy the transcript text into a structured Note node at completion time. After that, the note body is the board document's editable text, while the transcript asset remains the gallery/history record.
- Board asset store hydration must resolve the original transcript payload when it needs source text; preview generation is not required for transcripts.

#### 4. Validation & Error Matrix

- Empty transcript from provider -> fail the generation task before saving an asset.
- Non-transcript asset URL passed to `decodeTranscriptDataUrl` -> throw explicit invalid transcript data URL error.
- Transcript asset encountered by media-reference collection -> skip it rather than coercing it to audio/video/image.
- Backup/export/import contains transcript assets -> preserve `type`, metadata, and blob payload exactly.

#### 5. Good/Base/Bad Cases

- Good: MiMo ASR returns text, `saveToDB` stores a `transcript` asset with a text data URL, gallery displays a text preview, and board execution creates an editable transcript Note.
- Base: user downloads a transcript asset; filename uses `.txt`, not an audio extension.
- Bad: storing transcript text in `audioBase64`, showing a waveform, or passing transcript `data:text/plain` as a reference media payload.

#### 6. Tests Required

- Unit: transcript data URL encode/decode round-trips UTF-8 text.
- Provider/client: direct transcript result becomes a `transcript` asset and fails on missing transcript text.
- State/export: transcript asset survives backup/export/import with `type: "transcript"` and readable text payload.
- Board: ASR completion creates a Note and does not add transcript to board media drag lists.

#### 7. Wrong vs Correct

##### Wrong

```typescript
await saveToDB({ ...item, type: "audio", url: transcriptText });
```

##### Correct

```typescript
await saveToDB({
  ...item,
  type: "transcript",
  url: createTranscriptDataUrl(transcriptText),
});
```

### Scenario: Data Health Center and Indexed Local Data Diagnostics

#### 1. Scope / Trigger

- Trigger: changes to Settings → Data health summaries, IndexedDB asset/task query performance, or board/asset integrity diagnostics.
- Goal: expose local data health without hydrating every media payload or silently mutating user data.

#### 2. Signatures

- Asset DB version: `ImagineWorkbenchDB` version `9`.
- Generation task indexes: `generation_tasks.by_boardId`, `generation_tasks.by_status`, `generation_tasks.by_createdAt`.
- Asset meta pagination: `listAssetMetaPage(options: ListAssetMetaPageOptions): Promise<AssetMetaPage>` uses a stable `{ createdAt, id }` cursor backed by `assets_meta.by_createdAt_id`.
- Workspace summary: `getWorkspaceDataSummary(): Promise<WorkspaceDataSummary>` uses asset metadata for counts and diagnostics.
- Integrity contract: `WorkspaceDataSummary.integrity: WorkspaceIntegrityDiagnostics`.
- Pure diagnostics: `buildWorkspaceIntegrityDiagnostics(assets: StorageItemMeta[], boards: BoardDocument[], now?: number)`.
- Payload-aware diagnostics: `buildWorkspaceIntegrityDiagnosticsWithPayloads(...)` checks whether completed local blob assets still have a resolvable payload.

#### 3. Contracts

- `WorkspaceIntegrityDiagnostics.status` is `"healthy" | "attention" | "critical"`.
- Missing board references include `assetId`, `boardId`, `boardTitle`, `nodeId`, `nodeKind`, and `field`.
- Stale source links include `assetId`, `boardId`, `sourceBoardNodeId`, `status`, `prompt`, and `model`.
- Summary code must prefer `StorageItemMeta` for counts, issue detection, store counts, and UI health status.
- Completed assets that are not referenced by any board are cleanup candidates, not health issues; they must not affect `WorkspaceIntegrityDiagnostics.issueCount` or `status`.
- Heavy media hydration is still required for ZIP export, backup snapshots, restore, and actions that need original media payloads.

#### 4. Validation & Error Matrix

- Missing board asset reference -> report in diagnostics; do not auto-delete or repair.
- `sourceBoardNodeId` points to a missing board node -> report as stale source link; repair only via explicit user action.
- Complete asset with no blob and no remote URL -> report as broken complete record.
- Complete local asset with `hasBlob: true` but no shared or legacy payload -> report as broken complete record in payload-aware summary/cleanup.
- Destructive cleanup target set is non-empty -> create safety snapshot before deleting records.
- IndexedDB asset/task store exists without indexes -> DB version upgrade must create missing indexes.

#### 5. Good/Base/Bad Cases

- Good: Settings → Data opens a health panel showing issue counts and expandable affected IDs without loading every local media blob.
- Base: a healthy empty workspace reports zero issues and still shows backup/safety controls.
- Bad: summary calls `getAllFromDB()` just to count assets; this hydrates media payloads and makes large workspaces slow.
- Bad: board load automatically removes stale `sourceBoardNodeId`; repairs must remain user-triggered.

#### 6. Tests Required

- Unit: `buildWorkspaceIntegrityDiagnostics()` reports missing board references with affected board/node/field details.
- Unit: stale source links, stale processing IDs, failed IDs, and broken complete IDs are separated into the correct arrays.
- Type/lint: `pnpm run lint` and `pnpm run typecheck`.
- Build for Settings UI changes: `pnpm run build`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
const assets = await getAllFromDB();
const missing = collectBoardAssetIds(boards).filter(id => !assets.some(asset => asset.id === id));
```

##### Correct

```typescript
const assetMetas = await listAllAssetMetas();
const diagnostics = buildWorkspaceIntegrityDiagnostics(assetMetas, boards);
```

### Scenario: PostgreSQL Team Storage Target Contract

#### 1. Scope / Trigger

- Trigger: implementing self-hosted team storage, database migrations, active storage target routing, workspace import, or deployment packaging.
- Goal: preserve the current browser IndexedDB workflow by default while adding one explicit PostgreSQL team mode for LAN/self-hosted deployments.

#### 2. Signatures

- Runtime mode: `WorkspaceStorageMode = "browser" | "postgres"`.
- Runtime target kind: `WorkspaceRuntimeStorageTargetKind = "indexeddb" | "postgres"`.
- Environment selector: `IMAGINE_STORAGE_TARGET`; empty/undefined means `"browser"`, and the only non-default accepted value is `"postgres"`.
- PostgreSQL connection: `DATABASE_URL`, server-only. Pool settings are explicit server env values with safe defaults: `IMAGINE_POSTGRES_POOL_MAX` defaults to `5`, `IMAGINE_POSTGRES_CONNECTION_TIMEOUT_MS` defaults to `3000`, `IMAGINE_POSTGRES_IDLE_TIMEOUT_MS` defaults to `1000`, and `IMAGINE_POSTGRES_QUERY_TIMEOUT_MS` defaults to `30000`.
- Media volume: `IMAGINE_MEDIA_DIR`, server-only, used only by PostgreSQL team mode's local payload store.
- Media usage warning: optional `IMAGINE_MEDIA_USAGE_WARNING_BYTES`, server-only, positive integer bytes. When configured, Settings -> Data shows an aggregate warning after total media-volume bytes reach the threshold.
- Team setup token: `IMAGINE_TEAM_SETUP_TOKEN`, server-only, required by explicit PostgreSQL migration routes.
- Team secret encryption key: `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY`, server-only, required before saving encrypted workspace secrets in PostgreSQL.
- Trusted browser origins: `APP_URL` is required for team mutating request checks, and `IMAGINE_TRUSTED_ORIGINS` may add explicit comma-separated origins for reverse proxies.
- Team session cookie: `imagine_team_session`, HTTP-only, stores an opaque raw token; the database stores only `sha256:<hex>` session ids.
- Team CSRF boundary: non-HTTP-only `imagine_team_csrf` cookie must match the `x-imagine-csrf-token` request header for mutating routes.
- Node-only first-owner bootstrap API: `POST /api/storage/team/bootstrap`, `runtime = "nodejs"`, requires `x-imagine-setup-token`, trusted origin, valid JSON body, no existing owner, and returns only non-secret ids while setting session/CSRF cookies.
- Node-only team session API: `GET/POST/DELETE /api/storage/team/session`, `runtime = "nodejs"`; `POST` validates trusted origin and credentials, creates hashed session/CSRF rows, and sets cookies; `GET` returns only current session context; `DELETE` validates trusted origin + CSRF, deletes the current hashed session, and expires cookies.
- Node-only health API: `GET /api/storage/team/health`, `runtime = "nodejs"`, returns mode, target kind, reachability, and migration status without exposing secrets. It must verify `IMAGINE_MEDIA_DIR` exists, is a directory, and is readable/writable before reporting `reachable: true`; failures return only generic env-name errors, never absolute media paths.
- Node-only migration API: `POST /api/storage/team/migrations`, `runtime = "nodejs"`, requires `x-imagine-setup-token` matching `IMAGINE_TEAM_SETUP_TOKEN`; invalid setup-token attempts use the shared setup-token rate-limit policy and return generic migration failures before database access.
- Node-only backup API: `GET/POST /api/storage/team/backup`, `runtime = "nodejs"`. `GET` requires a valid team session with at least `admin`, exports a ZIP using `lib/workspace-backup-format.ts` manifest/index constants inside a `repeatable read read only` transaction, includes non-secret team settings, and includes decrypted team secret values only when `includeCredentials=1` is explicitly requested with `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY` configured. `POST` requires trusted origin, CSRF, a valid admin session, multipart backup `file`, and replaces assets/boards/library/tasks/voice profiles/non-secret team settings after creating a team safety snapshot; imported team secrets require explicit credential restore and are re-encrypted before storage. Portable browser backup `localStorage` restore is supported only through the shared managed-key classifier: classified provider settings/model options/custom prompt templates/RunningHub saved targets convert to team stores, local-only keys are skipped with counts, credential-bearing keys require explicit opt-in, and unknown keys reject before writes.
- Node-only asset metadata API: `GET/POST /api/storage/team/assets`, `runtime = "nodejs"`; `GET` requires a valid team session with at least `viewer`, parses `boardId`, repeated `id`, repeated `status`, `limit`, and `offset`, scopes the query to the session workspace, and returns asset metadata plus safe `mediaUrl`/`downloadUrl` and payload summaries. `boardId` preserves the distinction between missing and empty: missing means no board filter, while `boardId=` means workspace-global assets (`meta.boardId === ""`). `POST` requires trusted origin, CSRF, at least `editor`, a `StorageItem` JSON body under `asset`, and saves/upserts the team asset plus local-file payload when `asset.url` is a supported base64 data URI.
- Node-only asset document API: `DELETE /api/storage/team/assets/[assetId]`, `runtime = "nodejs"`, requires trusted origin, CSRF, a valid team session with at least `editor`, scopes lookup/delete to the session workspace, and returns `{ ok: true }`.
- Node-only asset media API: `GET /api/storage/team/assets/[assetId]/media`, `runtime = "nodejs"`, requires a valid team session with at least `viewer`, scopes the asset lookup to the session workspace, and serves the local payload without exposing `IMAGINE_MEDIA_DIR` or raw storage keys. `?download=1` returns an attachment disposition with a safe filename derived from asset id plus stored MIME type.
- Node-only generation task collection API: `GET/POST /api/storage/team/generation-tasks`, `runtime = "nodejs"`; `GET` requires a valid team session with at least `viewer`, parses `boardId`, repeated `sourceBoardNodeId`, repeated `status`, `limit`, and `offset`, scopes the query to the session workspace, and returns `GenerationTask[]`. `POST` requires trusted origin, CSRF, at least `editor`, and a complete `GenerationTask` JSON body under `task`.
- Node-only generation task document API: `PATCH/DELETE /api/storage/team/generation-tasks/[taskId]`, `runtime = "nodejs"`; `PATCH` requires trusted origin, CSRF, at least `editor`, a valid `GenerationTaskUpdate` body under `update`, loads the existing workspace-scoped task, applies the same update normalization as browser mode, returns the updated task, and records `team_generation_task.cancel` only when the requested update sets `status: "canceled"`. `DELETE` requires trusted origin, CSRF, at least `editor`, verifies the task exists in the caller workspace, deletes it, and records `team_generation_task.delete` with non-secret task/status/media/board metadata.
- Node-only custom prompt template APIs: `GET/POST /api/storage/team/prompt-templates` and `DELETE /api/storage/team/prompt-templates/[templateId]`, `runtime = "nodejs"`; `GET` requires a valid team session with at least `viewer` and returns workspace-scoped `CustomPromptTemplate[]`. `POST` requires trusted origin, CSRF, at least `editor`, a valid custom template JSON body under `template`, and records `team_prompt_template.save` with non-secret template-id/category metadata. `DELETE` requires trusted origin, CSRF, at least `editor`, deletes only a prompt template in the caller workspace, and records `team_prompt_template.delete` with non-secret template-id metadata.
- Node-only voice profile APIs: `GET/POST /api/storage/team/voice-profiles` and `DELETE /api/storage/team/voice-profiles/[profileId]`, `runtime = "nodejs"`; `GET` requires a valid team session with at least `viewer` and returns workspace-scoped `VoiceProfile[]`. `POST` requires trusted origin, CSRF, at least `editor`, a valid user-created voice profile JSON body under `profile`, and records `team_voice_profile.save` with non-secret profile/source/reference-count metadata. `DELETE` requires trusted origin, CSRF, at least `editor`, deletes only a voice profile in the caller workspace, and records `team_voice_profile.delete` with non-secret profile id and reference-count metadata.
- Node-only board collection API: `GET/POST/DELETE /api/storage/team/boards`, `runtime = "nodejs"`; `GET` requires a valid team session with at least `viewer`, parses repeated `id`, `limit`, and `offset`, scopes the query to the session workspace, and returns `BoardSummary[]` only. `POST` requires trusted origin, CSRF, at least `editor`, a valid board document body, and creates a new board with PostgreSQL board `version = 1`. Collection `DELETE` requires trusted origin, CSRF, at least `admin`, deletes all workspace boards, recreates the default board `main`, returns the new board/summary/version plus deleted count, and records `team_boards.reset`.
- Node-only board document API: `GET/PUT/DELETE /api/storage/team/boards/[boardId]`, `runtime = "nodejs"`; `GET` requires at least `viewer`, returns a redacted `BoardDocument`, `BoardSummary`, workspace id, and PostgreSQL board `version`; `PUT` requires trusted origin, CSRF, at least `editor`, a matching route/body board id, and an `If-Match` integer version header for optimistic concurrency; `DELETE` requires trusted origin, CSRF, at least `editor`, deletes only a board in the caller's workspace, and records `team_board.delete` with non-secret board-id metadata.
- Node-only team member collection API: `GET/POST /api/storage/team/members`, `runtime = "nodejs"`; `GET` requires a valid team session with at least `admin` and returns public member rows for the caller's team. `POST` requires trusted origin, CSRF, at least `admin`, normalized email, password, and a manageable role (`admin`, `editor`, or `viewer`), creates a user plus membership, stores only a `scrypt:v1` password hash, and rejects duplicate emails.
- Node-only team member document API: `PATCH/DELETE /api/storage/team/members/[userId]`, `runtime = "nodejs"`; both require trusted origin, CSRF, and at least `admin`. `PATCH` updates only manageable roles for non-owner, non-current-user memberships. `DELETE` removes only non-owner, non-current-user memberships and clears that user's sessions.
- Node-only workspace secret APIs: `GET/POST /api/storage/team/secrets` and `DELETE /api/storage/team/secrets/[key]`, `runtime = "nodejs"`; all routes require at least `admin`. `GET` returns masked configured statuses only. `POST` requires trusted origin, CSRF, a valid setting group/key/value body, `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY`, stores only encrypted ciphertext in `settings`, and records `team_secret.save` in the same transaction as the encrypted write. `DELETE` requires trusted origin and CSRF, and records `team_secret.delete` in the same transaction as the secret delete.
- Node-only non-secret workspace setting APIs: `GET/POST /api/storage/team/settings` and `DELETE /api/storage/team/settings/[key]`, `runtime = "nodejs"`; all routes require at least `admin`. `GET` returns only non-secret workspace settings, with optional repeated `group` and `key` filters. `POST` requires trusted origin, CSRF, a valid setting group/key/value body, stores `isSecret: false`, and records `team_setting.save` in the same transaction as the setting write. `DELETE` requires trusted origin and CSRF, loads the workspace-scoped setting first, rejects secret records so callers cannot bypass `/api/storage/team/secrets`, and records `team_setting.delete` in the same transaction as the setting delete.
- Client API wrapper: `lib/storage/team-client.ts` fetches `/api/storage/local/status`, `/api/storage/team/health`, `/api/storage/team/migrations`, `/api/storage/team/backup`, `/api/storage/team/bootstrap`, `/api/storage/team/session`, `/api/storage/team/assets`, `/api/storage/team/assets/[assetId]`, `/api/storage/team/asset-library`, `/api/storage/team/asset-library/[itemId]`, `/api/storage/team/generation-tasks`, `/api/storage/team/generation-tasks/[taskId]`, `/api/storage/team/prompt-templates`, `/api/storage/team/prompt-templates/[templateId]`, `/api/storage/team/voice-profiles`, `/api/storage/team/voice-profiles/[profileId]`, `/api/storage/team/boards`, `/api/storage/team/boards/[boardId]`, `/api/storage/team/members`, `/api/storage/team/members/[userId]`, `/api/storage/team/settings`, `/api/storage/team/settings/[key]`, `/api/storage/team/secrets`, and `/api/storage/team/secrets/[key]`, builds authenticated asset media URLs, sends CSRF headers for mutating asset/asset-library/board/task/member/prompt-template/voice-profile/setting/secret calls, and maps safe public team asset records into `StorageItem` values with app-server media URLs; it must not expose server-only config values, raw payload refs, secret ciphertext, secret plaintext, or secret-bearing board fields. `saveTeamAsset(item, csrfToken)` posts `{ asset: item }`, requires non-empty CSRF, parses `TeamAssetMutationResult`, and returns a `StorageItem` whose `url` is the safe `mediaUrl`. `resetTeamBoards(csrfToken)` deletes the team board collection, requires non-empty CSRF, parses `TeamBoardResetResult`, and never calls browser board persistence. `downloadTeamWorkspaceBackup(includeCredentials)` calls the team backup route, parses count headers, triggers a browser file download, and surfaces server errors; `includeCredentials=true` includes team setting secrets only through the explicit credential checkbox. `restoreTeamWorkspaceBackup(file, includeCredentials, csrfToken)` uploads multipart form data to the same route, requires non-empty CSRF, parses restore counts plus `safetySnapshotId`, and surfaces server errors; credential-bearing `teamSecrets` require `includeCredentials=true` and are rejected otherwise. Team asset-library client calls parse list/mutation envelopes, requires non-empty CSRF for save/delete, rejects leaked payload `uri` fields, and encodes item ids in document URLs. Team generation-task client calls parse list/mutation result envelopes, require non-empty CSRF for save/update/cancel/delete, and encode task ids in document URLs. Team prompt-template client calls parse `CustomPromptTemplate` values through the shared custom-template parser, requires non-empty CSRF for save/delete, and encodes template ids in document URLs. Team voice-profile client calls parse `VoiceProfile` values, requires non-empty CSRF for save/delete, posts `{ profile }`, preserves `referenceAudioAssetIds` and `sourceAssetIds`, and encodes profile ids in document URLs. Team setting client calls parse non-secret setting envelopes, requires non-empty CSRF for save/delete, and rejects responses that contain `isSecret` or secret-status fields. Team secret client calls parse only masked status envelopes and reject responses that contain a `value` field.
- Provider API key secret key format: `provider:${provider}:apiKey`, stored through `POST /api/storage/team/secrets` with `group: "provider"` in PostgreSQL mode.
- Team-aware provider config resolver: `resolveProviderConfigForRequest(req, provider, { ignoredBearerToken?, apiKeyOverride?, baseUrlOverride?, providerLabelOverride?, minimumTeamRole? })` in `lib/providers/team-config.ts` is the only server-side path that may decrypt a stored team provider API key. It defaults `minimumTeamRole` to `editor`, reads `provider:${provider}:apiKey`, `provider:${provider}:baseUrl`, and custom provider metadata from the caller's workspace through `createTeamWorkspaceStorageContext()`, decrypts API keys with `IMAGINE_TEAM_SECRET_ENCRYPTION_KEY`, requires base URL/custom-provider records to be non-secret settings, and passes them to `resolveProviderConfig()` as request-lower-priority overrides. Explicit request credentials and request base URL headers still take precedence.
- Provider-executing app routes that may read team secrets must run in `runtime = "nodejs"`: `/api/media/generate-*`, `/api/media/status`, `/api/media/*-download`, `/api/media/cancel`, `/api/image/edit`, `/api/models`, `/api/prompts/optimize`, `/api/runninghub/ai-app-schema`, `/api/agent/respond`, `/api/chat/completions`, and the `/v1/*` OpenAI-compatible wrappers. Edge routes must not import PostgreSQL, `pg`, or Node crypto secret-decryption modules.
- Provider settings hook: `useProviderSettings()` reads `/api/storage/local/status` before restoring provider credentials. In browser mode it preserves localStorage credential behavior. In PostgreSQL mode it must not restore plaintext API keys from `imagine_provider_credentials`; it initializes API key state empty, loads masked configured statuses from `fetchTeamSecrets({ groups: ["provider"] })`, commits API key field blur to `saveTeamSecret({ group: "provider", key, value })`, and clears keys through `deleteTeamSecret(key)`.
- Prompt template picker: `PromptTemplatePicker` reads `/api/storage/local/status` before loading custom templates. Browser mode preserves `imagine_custom_prompt_templates` localStorage behavior. PostgreSQL mode loads custom templates from `fetchTeamPromptTemplates()`, saves the client-created/updated `CustomPromptTemplate` through `saveTeamPromptTemplate(template, csrfToken)`, deletes through `deleteTeamPromptTemplate(templateId, csrfToken)`, and fails visibly when the CSRF cookie is missing instead of falling back to localStorage.
- Voice profiles: `lib/voice-profiles.ts` reads `/api/storage/local/status` before list/get/save/delete. Browser mode preserves `ImagineWorkbenchVoiceDB.voice_profiles`. PostgreSQL mode loads profiles from `fetchTeamVoiceProfiles()`, saves user-created cloned/designed/imported profiles through `saveTeamVoiceProfile(profile, csrfToken)`, deletes through `deleteTeamVoiceProfile(profileId, csrfToken)`, and fails visibly when the CSRF cookie is missing instead of falling back to IndexedDB. Built-in profiles remain client constants and are not written to PostgreSQL.
- Main workspace gallery loading: `app/page.tsx` reads `/api/storage/local/status` and keeps browser mode on `listWorkspaceGalleryMetas()` + IndexedDB hydration. When `targetKind` is `"postgres"`, it calls `fetchTeamWorkspaceGalleryItems()`, which requests `/api/storage/team/assets?boardId=&limit=200`, filters hidden library backing records (`meta.libraryItemId`), and uses `mediaUrl` as `StorageItem.url`.
- Main workspace gallery deletion: `app/page.tsx` injects `deleteWorkspaceAssetById()` into gallery and `useAssetActions` deletion paths. Browser mode calls IndexedDB `deleteFromDB()`. PostgreSQL team mode reads `imagine_team_csrf`, calls `deleteTeamAsset()`, and fails visibly when the CSRF cookie is missing.
- Main workspace asset saving: `app/page.tsx` injects active-store save functions into `useGenerationActions`, `useMediaPolling`, and `useAssetActions`. Browser mode preserves the existing `saveItemWithPreview()` / `saveToDB()` split. PostgreSQL team mode reads `imagine_team_csrf`, calls `saveTeamAsset()`, and stores returned app-server media URLs in local UI state.
- Main workspace generation tasks: `app/page.tsx` builds an active `GenerationTaskStorage`. Browser mode uses IndexedDB `list/save/update/cancel/delete` functions. PostgreSQL team mode uses the team generation-task APIs with the `imagine_team_csrf` cookie for mutations, and injects that storage into `useGenerationTaskStore`, `useGenerationActions`, `useMediaPolling`, and gallery cancel/delete task paths.
- Board UI storage adapter: `lib/board/storage-adapter.ts` defines the active board document boundary. Browser mode uses IndexedDB. PostgreSQL team mode uses team board APIs, caches board versions returned by read/create/save responses, creates missing client-side boards through `POST /api/storage/team/boards`, saves known boards through versioned `PUT`, and deletes through `DELETE`.
- Board asset loading: `useBoardAssetStore(boardId, nodes, storageTarget)` uses IndexedDB scoped asset metadata/previews in browser mode. In PostgreSQL team mode it loads board-scoped and explicitly referenced assets through `/api/storage/team/assets`, merges the results client-side, and stores `mediaUrl` in `StorageItem.url` so preview, reference handoff, fullscreen, and download code can reuse existing URL-based paths.
- Board generation asset saving: `BoardPageClient` injects active-store save/delete functions into shared generation and polling hooks. Browser mode keeps IndexedDB preview behavior; PostgreSQL team mode calls `saveTeamAsset()` / `deleteTeamAsset()` for generated/derived assets handled by those hooks and preserves existing team media payloads during metadata-only updates.
- Board generation tasks: `BoardPageClient` builds the same active `GenerationTaskStorage` shape for the current board. Browser mode lists and mutates IndexedDB tasks by `boardId`; PostgreSQL team mode lists and mutates `/api/storage/team/generation-tasks` by `boardId`, and routes board task cancel/dismiss plus shared generation/polling updates through the team APIs.
- Direct browser-to-PostgreSQL migration: `previewBrowserToPostgresMigration()` in `lib/data-management.ts` is browser-only and read-only. In PostgreSQL mode, Settings -> Data calls it after loading the team summary and shows counts for current browser assets, payload records, previews, library records, generation tasks, boards, voice profiles, safety snapshot presence, managed localStorage, credential-bearing optional settings, and local-only exclusions. It blocks the direct import action when `indexedDB.databases()` is unavailable, when an `ImagineWorkbench*` IndexedDB database/store is not in the known migration inventory, or when an `imagine_*` localStorage key is not classified by `buildManagedLocalStorageInventory()`. When preview is unblocked, owner/admin users may confirm "Import to Team"; the client re-runs the preview, creates a full browser backup `File` with `createCompleteWorkspaceBackupFile(includeCredentials)`, and posts it through `restoreTeamWorkspaceBackup()`. This keeps direct import on the same `/api/storage/team/backup` CSRF, admin-role, safety snapshot, transaction, media payload restore, localStorage conversion, and explicit credential opt-in contract as portable ZIP restore.
- Shared public team asset response types live in `lib/storage/team-asset-types.ts`; server-only listing logic stays in `lib/storage/team-assets.ts` so browser client bundles do not import PostgreSQL modules.
- Shared public team asset-library response types live in `lib/storage/team-asset-library-types.ts`; server-only library listing/mutation logic stays in `lib/storage/team-asset-library.ts`.
- Shared public team board response types live in `lib/storage/team-board-types.ts`; server-only listing logic stays in `lib/storage/team-boards.ts`.
- Shared public team member response types live in `lib/storage/team-member-types.ts`; server-only member management logic stays in `lib/storage/team-members.ts`.
- Server team storage context: `createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole })` in `lib/storage/team-context.ts` resolves the current team session, enforces the requested minimum role, and returns the workspace-scoped PostgreSQL repository for that session.
- App/session security: deployment must define an app URL/trusted origin plus session, CSRF/setup, and secret-encryption configuration before enabling team mode.
- Repository boundary: `WorkspaceStorageRepository` remains the app-facing storage contract; implementations are browser IndexedDB and PostgreSQL.
- PostgreSQL repository factory: `createPostgresWorkspaceStorageRepository(queryable, config, workspaceId)`; the `workspaceId` argument is required so team data access stays workspace-scoped.
- Payload boundary: browser mode uses IndexedDB blob/content-hash stores; PostgreSQL mode uses `LocalFilePayloadStore` under `IMAGINE_MEDIA_DIR` and app-server payload refs such as `originals/image/ab/cd/<hash>.png`.
- Schema version table: `schema_migrations` records ordered migration id, checksum, applied timestamp, and app version metadata.
- Team tables include at least `workspaces`, `users`, `teams`, `team_memberships`, `sessions`, `assets`, `asset_payloads`, `asset_previews`, `asset_library`, `boards`, `board_summaries`, `generation_tasks`, `settings`, `user_preferences`, `prompt_templates`, `agent_chats`, `saved_provider_targets`, `safety_snapshots`, `voice_profiles`, and `audit_events`.
- Asset metadata stored in PostgreSQL must preserve current browser fields, including board scope, source board node/result stack ids, library backing ids, preview status, content hash, and crop derivative metadata (`sourceAssetId`, source dimensions, split index/count, and crop rect).

#### 3. Contracts

- Browser mode is the default and stays login-free. It must continue using IndexedDB/localStorage and must not require PostgreSQL, `DATABASE_URL`, or `IMAGINE_MEDIA_DIR`.
- PostgreSQL mode is opt-in only. If selected, failures in config, connection, migrations, auth bootstrap, or media-volume access must fail visibly instead of falling back to browser storage.
- Health and migration status responses must report booleans, enum values, versions, and migration ids only. They must not return `DATABASE_URL`, `IMAGINE_MEDIA_DIR`, setup tokens, encryption secrets, or provider credentials.
- Migration routes are explicit mutating operations and must fail closed when `IMAGINE_TEAM_SETUP_TOKEN` is missing or the request header does not match it.
- PostgreSQL repository methods must scope reads/writes/deletes by workspace id. Do not create a repository with implicit global workspace access.
- Supported storage modes are exactly `browser` and `postgres` for the first team-storage implementation. Do not expose SQLite, local-folder, or remote-api targets as product modes.
- All PostgreSQL access stays server-side. Browsers fetch metadata/media through authenticated app routes and never receive database credentials, media volume paths, setup tokens, or encryption secrets.
- Team asset metadata responses may expose `StorageItemMeta`, safe `mediaUrl`/`downloadUrl`, and payload summary fields (`kind`, `mimeType`, `sizeBytes`, `contentHash`) only. They must not expose `WorkspaceAssetPayloadRef.uri`, raw `storage_key`, `IMAGINE_MEDIA_DIR`, or absolute filesystem paths.
- Team asset-library responses may expose `LibraryAssetRecord`, `PublicTeamAssetRecord | null`, and the PostgreSQL workspace envelope only. They must not expose raw payload refs or delete promoted source assets when removing a library record.
- Team board summary responses may expose `BoardSummary` only. Team board document responses may expose full `BoardDocument` only after removing secret-bearing fields such as `runninghub-app.accessPassword`.
- Team board document writes must reject secret-bearing fields until board/RunningHub nodes explicitly route those fields through encrypted workspace-secret APIs. Do not silently strip secrets on write because that would lose user data without an explicit secret migration path.
- Team board document writes must use PostgreSQL `boards.version` as an optimistic concurrency token. If the `If-Match` version does not match the current row, return `409 team_board_version_conflict` instead of overwriting another member's changes.
- Team generation task cancellations must write `team_generation_task.cancel` with non-secret task id, previous/next status, media type, and optional board id. Do not audit every polling/progress update, and do not expose prompts, model ids, request snapshots, reference media, result asset ids, error messages, or operation names in cancellation audit metadata.
- Team generation task deletes must write `team_generation_task.delete` without exposing prompts, model ids, request snapshots, reference media, result asset ids, error messages, or operation names in audit metadata.
- Team prompt template saves and deletes must write `team_prompt_template.save` / `team_prompt_template.delete` without exposing template titles, scenes, positive/negative prompt text, parameter hints, or timestamps in audit metadata.
- Team voice profile responses may expose only `VoiceProfile` JSON and the PostgreSQL workspace envelope. Voice profile API input must require non-empty `id`, `name`, and `provider`; allow only user-created sources (`designed`, `cloned`, `imported`); preserve `referenceAudioAssetIds`, `sourceAssetIds`, and `previewAudioAssetId`; and reject malformed request JSON with `400 invalid_team_voice_profile_request`.
- Team voice profile saves must write `team_voice_profile.save` without exposing voice names, descriptions, tags, provider ids, provider voice ids, asset ids, media paths, design prompts, consent timestamps, or preview asset ids in audit metadata.
- Team voice profile deletes must write `team_voice_profile.delete` without exposing voice names, provider ids, asset ids, media paths, or prompt/text contents in audit metadata.
- A workspace has one active authoritative store. Do not dual-write workspace data to IndexedDB and PostgreSQL.
- Main workspace gallery reads, generated/local asset writes, and single/batch/status deletes must follow the active storage target. In PostgreSQL mode these paths must not keep listing, saving, or deleting IndexedDB `boardId === ""` assets after the runtime status reports `targetKind: "postgres"`. Until explicit IndexedDB/localStorage import, remaining data repair mutations, and operational hardening are implemented, those remaining paths must not be described as PostgreSQL-complete.
- Team asset DELETE removes the workspace-scoped metadata row and relies on database cascades for related payload/preview/library rows. Physical media-file cleanup is a separate explicit consistency/cleanup slice because content-hash payload files may be shared by multiple asset records.
- Team asset POST accepts supported base64 data URI payloads for new media bytes and writes them through `LocalFilePayloadStore` before upserting metadata. If a save request carries an existing app-server media URL instead of a data URI, the service may update metadata only after finding an existing workspace-scoped asset payload; missing existing payload is `400 invalid_team_asset_request`.

### Scenario: Clear Team Assets in PostgreSQL Mode

#### 1. Scope / Trigger

- Trigger: Settings -> Data -> Clear assets while `fetchWorkspaceStorageRuntimeStatus()` reports `targetKind: "postgres"`.
- Goal: match browser `clearAllDB()` asset-surface semantics without mutating IndexedDB: clear workspace assets, asset payload refs, previews, asset-library rows, and generation tasks; keep boards, voice profiles, settings, prompt templates, members, sessions, and safety snapshots.

#### 2. Signatures

- API: `DELETE /api/storage/team/assets`
- Client: `clearTeamAssets(csrfToken): Promise<{ deletedAssetCount; deletedGenerationTaskCount; deletedLibraryAssetCount; targetKind: "postgres"; workspaceId: string }>`
- UI: `SettingsModal` must route `onClearAssets` to `clearTeamAssets(readTeamCsrfToken())` only in PostgreSQL mode; browser mode keeps the existing `onClearAssets()` handler.

#### 3. Contracts

- The route is Node-only and must call `assertTrustedTeamRequestOrigin()` plus `assertTeamCsrf()` before opening PostgreSQL.
- The service requires at least `admin` role because this is a workspace-wide destructive action.
- The service must run in a transaction: count matching `assets`, `generation_tasks`, and `asset_library` rows; delete `generation_tasks`; delete `assets`; rely on DB cascades for `asset_payloads`, `asset_previews`, and `asset_library`; write one `team_assets.clear` audit event with counts only; commit.
- Physical media files are not deleted by this route; file cleanup remains under explicit media maintenance actions.

#### 4. Validation & Error Matrix

- Missing/blank CSRF token -> client rejects before fetch or route returns `403 invalid_csrf`; no database client is opened.
- Viewer/editor session -> role check fails before deletes; no workspace rows are removed.
- Any delete/audit failure -> rollback and surface the API error to Settings -> Data.

#### 5. Good/Base/Bad Cases

- Good: admin clears assets in PostgreSQL mode; summary refresh shows zero assets/tasks/library asset rows; audit metadata contains only numeric counts.
- Base: browser mode clear assets still uses IndexedDB `clearAllDB()` and local safety snapshot behavior.
- Bad: Settings -> Data in PostgreSQL mode calls browser `clearAllDB()` or deletes media files directly from the clear-assets route.

#### 6. Tests Required

- Service: `clearTeamAssets()` requires admin, opens a transaction, deletes `generation_tasks` and `assets` by `workspace_id`, returns counts, and writes `team_assets.clear` audit metadata without secrets.
- Route: missing CSRF is rejected before PostgreSQL access.
- Client: `clearTeamAssets()` sends `DELETE /api/storage/team/assets`, sends CSRF only as `x-imagine-csrf-token`, parses the count result, and rejects blank CSRF tokens before fetch.

#### 7. Wrong vs Correct

##### Wrong

```ts
if (storageTarget === "postgres") await clearAllDB();
```

##### Correct

```ts
if (storageTarget === "postgres") await clearTeamAssets(readTeamCsrfToken());
```

### Scenario: Reset Team Boards in PostgreSQL Mode

#### 1. Scope / Trigger

- Trigger: Settings -> Data -> Reset boards while `fetchWorkspaceStorageRuntimeStatus()` reports `targetKind: "postgres"`.
- Goal: match browser `resetBoardsToDefault()` board-surface semantics without mutating IndexedDB: delete workspace board documents and summaries, then recreate the default board document with id `main`.

#### 2. Signatures

- API: `DELETE /api/storage/team/boards`
- Client: `resetTeamBoards(csrfToken): Promise<{ board; summary; version; deletedBoardCount; targetKind: "postgres"; workspaceId: string }>`
- UI: `SettingsModal` must route `onResetBoards` to `resetTeamBoards(readTeamCsrfToken())` only in PostgreSQL mode; browser mode keeps the existing `onResetBoards()` handler.

#### 3. Contracts

- The route is Node-only and must call `assertTrustedTeamRequestOrigin()` plus `assertTeamCsrf()` before opening PostgreSQL.
- The service requires at least `admin` role because this is a workspace-wide destructive action.
- The service must run in a transaction: count matching `boards`; delete workspace `boards`; rely on cascades for `board_summaries`; insert `createEmptyBoard(DEFAULT_BOARD_ID)`; write one `team_boards.reset` audit event with `deletedBoardCount` and `defaultBoardId`; commit.
- The response returns the new default board, its summary, PostgreSQL version, and deleted-board count. It must not expose secret-bearing board fields.

#### 4. Validation & Error Matrix

- Missing/blank CSRF token -> client rejects before fetch or route returns `403 invalid_csrf`; no database client is opened.
- Viewer/editor session -> role check fails before deletes; no workspace rows are removed.
- Any delete/insert/audit failure -> rollback and surface the API error to Settings -> Data.

#### 5. Good/Base/Bad Cases

- Good: admin resets boards in PostgreSQL mode; summary refresh shows one default board; audit metadata contains only the default board id and deleted count.
- Base: browser mode reset boards still uses IndexedDB board persistence and local safety snapshot behavior.
- Bad: Settings -> Data in PostgreSQL mode calls browser `resetBoardsToDefault()` or leaves the workspace with zero boards after reset.

#### 6. Tests Required

- Service: `resetTeamBoards()` requires admin, opens a transaction, deletes `boards` by `workspace_id`, recreates `DEFAULT_BOARD_ID`, returns the default board/version/count, and writes `team_boards.reset` audit metadata without secrets.
- Route: missing CSRF is rejected before PostgreSQL access.
- Client: `resetTeamBoards()` sends `DELETE /api/storage/team/boards`, sends CSRF only as `x-imagine-csrf-token`, parses the reset result, and rejects blank CSRF tokens before fetch.

#### 7. Wrong vs Correct

##### Wrong

```ts
if (storageTarget === "postgres") await resetBoardsToDefault();
```

##### Correct

```ts
if (storageTarget === "postgres") await resetTeamBoards(readTeamCsrfToken());
```

- Board UI load/list/create/save/delete must go through the active `BoardStorageAdapter`. When runtime status reports `targetKind: "postgres"`, `/board` reloads board documents and board summaries from the team APIs instead of continuing to list or save IndexedDB boards. A missing team board may initialize as a client-created board, but PostgreSQL failures must remain visible through board save/list errors.
- Board asset side panels/result stacks must read from the same active storage target as the board document. PostgreSQL mode must not continue to list IndexedDB board assets after the board document switches to team APIs.
- Large generated media payloads stay outside PostgreSQL rows by default. PostgreSQL stores metadata and safe relative payload refs.
- Local file payload writes must stage bytes under `tmp/`, validate non-empty bytes, MIME/category, configured `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES`, and optional caller-provided SHA-256 hash, then rename into an `originals/<category>/<hash-prefix>/<hash>.<ext>` storage key. Reads/deletes must reject non-`local-file` refs and unsafe relative keys.
- Browser IndexedDB -> PostgreSQL migration is explicit user action only; no startup migration.
- Backup, restore, cleanup, health summaries, generation tasks, boards, asset library, prompt templates, voice profiles, and settings must route through the active storage boundary once PostgreSQL mode is implemented.
- PostgreSQL full workspace export and ZIP restore route through `/api/storage/team/backup`; non-secret team settings are included in normal backup/restore, and team secrets are included/restored only with the explicit credential checkbox. Portable browser backup `settings.localStorage` restore is allowed only through the shared managed-key inventory: provider settings/model options convert to team settings, custom prompt templates convert to team prompt-template rows, provider credentials and RunningHub target passwords require the credential checkbox and are encrypted into team secret/provider-target stores, local-only keys are skipped with counts, and unknown keys reject the restore. Direct current-browser migration uses the same backup/restore path after preview proves the source inventory is classified. Broader DB-row repair and unsupported browser-local mutation routes are still unsupported. Settings -> Data actions without a PostgreSQL implementation must fail fast in PostgreSQL mode with a visible notice instead of mutating or exporting browser IndexedDB/localStorage.
- The persisted-data inventory in `lib/data-management.ts` is the source of truth for localStorage classification. PostgreSQL import must not maintain a second drifting key list.
- Provider selection/custom provider definitions are `provider-settings` localStorage entries, separate from optional secret-bearing `provider-credentials`.
- In PostgreSQL mode, Settings -> Connections treats provider API keys as encrypted team secrets and displays only a masked saved status when `fetchTeamSecrets()` reports a configured `provider:${provider}:apiKey`. Base URLs, provider selection, custom provider definitions, and manually fetched model lists are non-secret settings; their UI wiring should use `/api/storage/team/settings` once that surface is moved off browser-local storage.
- PostgreSQL non-secret workspace settings must use `/api/storage/team/settings`, not `/api/storage/team/secrets`. Secret-bearing values such as API keys and RunningHub access passwords must stay on encrypted secret/provider-target routes. The settings route must reject secret-shaped delete attempts after loading the existing workspace-scoped record.
- PostgreSQL mode provider API key saves and clears must use the `imagine_team_csrf` cookie as `x-imagine-csrf-token`. Missing CSRF is a visible settings notice; never silently write plaintext API keys to localStorage as a fallback.
- PostgreSQL mode custom prompt templates are shared workspace records, not browser-local templates. After `/api/storage/local/status` reports `targetKind: "postgres"`, `PromptTemplatePicker` must not read/write `imagine_custom_prompt_templates` for custom template list/save/delete; browser mode keeps the existing localStorage behavior.
- Browser clients may keep a newly typed provider API key in React state for the current session so existing generation headers continue to work after typing. Stored encrypted team secrets are never returned to the browser. In PostgreSQL mode, provider execution uses this precedence: explicit `x-ai-api-key` or non-ignored Bearer credential from the request wins, then the authenticated workspace's encrypted team secret, then provider environment variables. If no team session cookie is present, the resolver must not open PostgreSQL and must preserve header/env behavior for external-compatible API clients.
- Owner/admin clients may save, list, and delete RunningHub AI App/workflow saved targets through `/api/storage/team/provider-targets`. The route stores `saved_provider_targets.target.accessPasswordEncrypted` only when an access password is provided, preserves existing ciphertext when password updates are omitted, returns only public target metadata plus `accessPasswordConfigured`, and records provider-target save/delete audit metadata in the same transaction as the target mutation.
- RunningHub board nodes route saved target list/save/delete through the active storage target: browser mode keeps `imagine_runninghub_saved_targets` in localStorage, while PostgreSQL mode uses `/api/storage/team/provider-targets` and never falls back to localStorage after team storage is detected. In PostgreSQL mode, access-password input is a component-local draft used only for saving the provider target; it is cleared after save/apply and must not be written to the team board document.
- RunningHub image, video, and audio-workflow generation routes resolve saved target access passwords server-side in PostgreSQL mode. Explicit request `runningHubAccessPassword` still wins for browser/current-session flows; otherwise, an authenticated team request may decrypt `saved_provider_targets.target.accessPasswordEncrypted` for the current virtual model id (`ai-app-*:<id>` / `workflow-*:<id>`) and pass it only in memory to the provider adapter.
- Board generated-media viewed markers (`imagine_board_viewed_generated_asset_ids:<boardId>`) are local/per-user attention state. They must not become shared board document or asset fields in the first team-storage implementation.
- Settings -> Data must show the active storage target. Browser mode should show IndexedDB as the default and avoid migration prompts. PostgreSQL mode may show database/media configured booleans, the configured max media payload size, aggregate media usage warnings, migration status, pending migration ids, a setup-token-gated migration action, setup-token-gated first-owner bootstrap controls, and the current team session state with explicit login/logout controls.
- Board result ownership must stay distinct from plain asset derivation. Connected `result` nodes represent generated provenance; ordinary asset nodes and split/crop asset references do not recreate source result ownership.
- Team mode requires local account/session auth, CSRF/origin checks for mutating routes, role-based authorization, encrypted workspace secrets, and audit events for sensitive actions. `settings.is_secret = true` records must be encrypted before repository storage; repository writes must fail if a secret value is plaintext.
- Team secret save/delete and RunningHub provider target save/delete mutations must write `audit_events` rows with workspace id, actor user id, event type, and non-secret metadata only. The audit row must be committed in the same transaction as the secret or provider-target mutation.
- Team bootstrap owner, team session login/logout, team member create/update-role/delete, team secret save/delete, RunningHub provider target save/delete, and PostgreSQL schema migration mutations must write `audit_events` rows. Event metadata may include ids, emails, roles, provider names, target ids, app version, and migration ids, but must never include passwords, session tokens, CSRF tokens, setup tokens, secret plaintext, encrypted secret payloads, database URLs, or media paths.
- Team password hashes use the server-side `scrypt:v1:<salt>:<hash>` format. Plaintext passwords must never be stored.
- Role checks rank `owner > admin > editor > viewer`. Server routes must call the role check before shared workspace reads/writes instead of relying on UI affordances.
- Team member management is owner/admin-only. Owner memberships are immutable through the basic member-management UI/API, and a member cannot change or delete their own membership through these routes.
- `requireTeamSession(queryable, req, workspaceId?)` resolves the session token through `sessions -> users -> team_memberships -> teams`, rejects missing/expired sessions with `401`, and scopes by workspace id when provided.
- Team shared-data routes should use `createTeamWorkspaceStorageContext()` rather than repeating `requireTeamSession()` + `assertTeamRole()` + `createPostgresWorkspaceStorageRepository()` inline.
- `createTeamSession(queryable, input)` must normalize email, verify the stored `scrypt:v1` password hash, store only hashed session/CSRF tokens, and return non-secret session context plus raw tokens for cookie serialization.
- `deleteTeamSession(queryable, req)` must resolve the current session, write a non-secret logout audit event, hash the current session cookie token, and delete only that `sessions.id`.
- `bootstrapFirstTeamOwner()` must run inside a transaction, create the initial workspace, user, team, owner membership, hashed session, hashed CSRF token, and owner-bootstrap audit event, commit on success, and roll back if an owner already exists.

#### 4. Validation & Error Matrix

- `IMAGINE_STORAGE_TARGET` empty/undefined -> browser mode.
- `IMAGINE_STORAGE_TARGET` is not `"browser"` or `"postgres"` -> throw an explicit config error.
- `IMAGINE_STORAGE_TARGET=postgres` and `DATABASE_URL` missing -> fail startup or health check visibly.
- `IMAGINE_STORAGE_TARGET=postgres` and `IMAGINE_MEDIA_DIR` missing/unwritable -> fail startup or health check visibly.
- `IMAGINE_STORAGE_TARGET=postgres` and missing/invalid `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES` -> fail startup or health check visibly.
- `IMAGINE_STORAGE_TARGET=postgres` and invalid `IMAGINE_MEDIA_USAGE_WARNING_BYTES` -> fail startup or health check visibly.
- `IMAGINE_STORAGE_TARGET=postgres` and invalid PostgreSQL pool/timeout env values -> fail config/health visibly.
- PostgreSQL pool/database connection failure or query timeout -> `/api/storage/team/health` returns `reachable: false` with `503`, never falling back to browser storage.
- PostgreSQL media write larger than `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES` -> fail visibly before writing a local-file payload ref.
- PostgreSQL media directory bytes greater than or equal to configured `IMAGINE_MEDIA_USAGE_WARNING_BYTES` -> `summary.teamStorage.mediaUsageWarning` is true and Settings -> Data shows an attention issue with only aggregate byte counts.
- `POST /api/storage/team/migrations` with missing `IMAGINE_TEAM_SETUP_TOKEN` -> `400` with explicit setup-token config error.
- `POST /api/storage/team/migrations` with missing/invalid `x-imagine-setup-token` -> `400` and no migration query execution.
- Database schema older than app requires -> run documented migrations or fail with migration instructions.
- Successful schema migration -> insert a `team_migrations.apply` audit row with null workspace/user ids and non-secret migration metadata.
- Database schema newer than app supports -> refuse to start in PostgreSQL mode.
- Hosted/edge deployment (`CF_PAGES=1`, `VERCEL=1`, `NETLIFY=true`, or `NEXT_RUNTIME=edge`) with `postgres` selected -> fail visibly unless the deployment path explicitly supports the Node server runtime.
- Unauthenticated PostgreSQL shared-data request -> reject before repository access.
- Login with unknown user or wrong password -> `401 invalid_credentials` and no session row insert.
- Login success -> insert hashed session/CSRF rows and `team_session.login` audit metadata without raw password or tokens.
- Authenticated user without required role -> reject before repository access.
- Logout with invalid CSRF -> `403` before session deletion.
- Logout success -> insert `team_session.logout` audit metadata before deleting the hashed session row.
- Authenticated media request for an asset outside the user's workspace or without a payload -> `404`.
- Authenticated media request with a payload missing its MIME type -> fail explicitly instead of guessing content type.
- `GET /api/storage/team/assets` with invalid `limit`, `offset`, or `status` -> `400 invalid_team_asset_query` before opening a database client.
- `GET /api/storage/team/assets?boardId=` -> preserve the empty board id and query `meta->>'boardId' = ''`; do not coerce it to an unfiltered query.
- `fetchTeamAssets()` receives a response whose payload summary includes `uri` -> reject the response as invalid.
- `POST /api/storage/team/assets` with invalid CSRF/origin -> reject before repository access.
- `POST /api/storage/team/assets` with malformed JSON, missing `asset`, missing required `StorageItem` fields, unsupported MIME, or no data URI/existing payload -> `400 invalid_team_asset_request`.
- `POST /api/storage/team/assets` as a viewer -> reject before write.
- `GET /api/storage/team/generation-tasks` with invalid `limit`, `offset`, or `status` -> `400 invalid_team_generation_task_query` before opening a database client.
- `POST /api/storage/team/generation-tasks` with invalid CSRF/origin -> reject before repository access.
- `POST /api/storage/team/generation-tasks` with malformed JSON, missing `task`, or missing required `GenerationTask` fields -> `400 invalid_team_generation_task_request`.
- `PATCH /api/storage/team/generation-tasks/[taskId]` with malformed JSON, missing `update`, invalid status/media type/progress/source, or forbidden `id`/`createdAt` update fields -> `400 invalid_team_generation_task_request`.
- `PATCH` or `DELETE /api/storage/team/generation-tasks/[taskId]` for a missing workspace task -> `404 team_generation_task_not_found`.
- Mutating team generation task requests as a viewer -> reject before write/delete.
- `POST /api/storage/team/prompt-templates` with malformed JSON, missing `template`, invalid id prefix, missing title/scene/prompt, or invalid timestamps -> `400 invalid_team_prompt_template_request`.
- Mutating team prompt template requests with invalid CSRF/origin -> reject before opening a database client.
- Mutating team prompt template requests as a viewer -> reject before write/delete.
- `fetchTeamPromptTemplates()` receives a malformed custom template -> reject the response as invalid through the shared custom-template parser.
- PostgreSQL custom prompt template save/delete with no `imagine_team_csrf` cookie -> visible prompt-template save/delete failure and no localStorage write fallback.
- `POST /api/storage/team/voice-profiles` with malformed JSON, missing `profile`, blank `id`/`name`/`provider`, `source: "builtin"`, malformed asset-ref arrays, or invalid timestamps -> `400 invalid_team_voice_profile_request`.
- Mutating team voice profile requests with invalid CSRF/origin -> reject before opening a database client.
- Mutating team voice profile requests as a viewer -> reject before write/delete.
- `fetchTeamVoiceProfiles()` receives a malformed profile or server response missing the PostgreSQL envelope -> reject the response as invalid.
- PostgreSQL voice profile save/delete with no `imagine_team_csrf` cookie -> visible voice-profile save/delete failure and no IndexedDB write fallback.
- `DELETE /api/storage/team/assets/[assetId]` with invalid CSRF/origin -> reject before repository access.
- `DELETE /api/storage/team/assets/[assetId]` for a missing workspace asset -> `404 team_asset_not_found`.
- Successful `DELETE /api/storage/team/assets/[assetId]` -> delete the workspace-scoped asset in a transaction and write `team_asset.delete` audit metadata containing only the asset id.
- `DELETE /api/storage/team/assets/[assetId]` as a viewer -> reject before delete.
- `GET /api/storage/team/boards` with invalid `limit` or `offset` -> `400 invalid_team_board_query` before opening a database client.
- `fetchTeamBoardSummaries()` receives a response whose board summaries are missing required fields -> reject the response as invalid.
- `POST /api/storage/team/boards` with a duplicate board id -> `409 team_board_already_exists`.
- `POST /api/storage/team/boards` with invalid CSRF/origin -> reject before repository access.
- `PUT /api/storage/team/boards/[boardId]` without `If-Match` -> `400 missing_team_board_version` before opening a database client.
- `PUT /api/storage/team/boards/[boardId]` with a stale version -> `409 team_board_version_conflict`.
- `PUT /api/storage/team/boards/[boardId]` with `runninghub-app.accessPassword` -> `400 team_board_secret_fields_unsupported`.
- `DELETE /api/storage/team/boards/[boardId]` for a missing workspace board -> `404 team_board_not_found`.
- Successful `DELETE /api/storage/team/boards/[boardId]` -> delete the workspace-scoped board in a transaction and write `team_board.delete` audit metadata containing only the board id.
- `fetchTeamBoardDocument()` receives a response containing `runninghub-app.accessPassword` -> reject the response as invalid.
- `POST /api/storage/team/members` with invalid email/body/role -> `400 invalid_team_member_request` or `400 invalid_team_member_role`.
- `POST /api/storage/team/members` with an existing email -> `409 team_member_email_exists` and rollback.
- `POST /api/storage/team/members` success -> insert `team_member.create` audit metadata in the same transaction, without password hash or raw password.
- `PATCH /api/storage/team/members/[userId]` for the current user -> `400 team_member_self_update_unsupported`.
- `PATCH /api/storage/team/members/[userId]` success -> update the role and insert `team_member.update_role` audit metadata in one transaction.
- `PATCH` or `DELETE /api/storage/team/members/[userId]` for an owner membership -> `400 team_owner_role_immutable`.
- `DELETE /api/storage/team/members/[userId]` for the current user -> `400 team_member_self_delete_unsupported`.
- `DELETE /api/storage/team/members/[userId]` success -> delete membership/sessions and insert `team_member.delete` audit metadata in one transaction.
- Mutating team member requests with invalid CSRF/origin -> reject before opening a database client.
- PostgreSQL provider API key save/clear with no `imagine_team_csrf` cookie -> visible Settings notice and no localStorage credential write.
- PostgreSQL provider secret status fetch fails because the user is unauthenticated or lacks admin role -> Settings may show no masked saved status, but it must not load plaintext localStorage credentials as a fallback.
- PostgreSQL provider execution with a valid team session but a role below the route's `minimumTeamRole` -> `403 forbidden` before decrypting or using the provider API key.
- PostgreSQL provider execution finds `provider:${provider}:apiKey` as a non-secret or plaintext setting -> explicit server error; do not silently treat it as usable provider credentials.
- PostgreSQL provider execution has no team session cookie -> do not query PostgreSQL for secrets; continue normal request-header/environment config resolution.
- PostgreSQL non-secret setting save/delete with no `imagine_team_csrf` cookie -> visible settings failure and no localStorage write fallback.
- `DELETE /api/storage/team/settings/[key]` for an existing secret record -> `400 team_setting_secret_unsupported`; delete it through `/api/storage/team/secrets/[key]` instead.
- PostgreSQL Settings -> Data asset cleanup/source repair/localStorage cleanup or other browser-only actions invoked before team routes exist -> visible unsupported-team-data-action notice and no browser storage mutation.
- Mutating request with invalid CSRF/origin -> reject before repository access.
- PostgreSQL team backup restore finds an unsupported `settings.localStorage` key -> `400 invalid_team_backup`; it must not write partial converted team settings.
- PostgreSQL team backup restore includes browser provider credentials or RunningHub saved-target access passwords without credential restore enabled -> `400 team_restore_credentials_required`.
- Import preview finds unknown IndexedDB store or `imagine_*` localStorage key -> block import until it is classified as required, optional, or excluded.

#### 5. Good/Base/Bad Cases

- Good: normal local dev and Cloudflare Pages builds run in browser mode with no login prompt and no database requirement.
- Good: self-hosted Docker Compose sets `IMAGINE_STORAGE_TARGET=postgres`, `DATABASE_URL`, `IMAGINE_MEDIA_DIR`, `IMAGINE_MAX_MEDIA_PAYLOAD_BYTES`, optional `IMAGINE_MEDIA_USAGE_WARNING_BYTES`, session/setup/encryption secrets, and app trusted origin, then uses PostgreSQL plus a media volume.
- Good: `GET /api/storage/team/health` in a configured Node deployment reports `reachable: true`, current schema version, max media payload bytes, and pending migration ids without returning raw config values, while PostgreSQL clients use a shared bounded `pg` pool with configured max connections and timeouts.
- Good: `GET /api/storage/team/assets` returns workspace-scoped asset metadata, safe media/download URLs, and payload summaries without returning raw storage keys or media-volume paths.
- Good: `GET /api/storage/team/assets/[assetId]/media` reads only assets visible in the caller's workspace and returns private, no-store media bytes with the stored MIME type; `?download=1` adds `Content-Disposition: attachment`.
- Good: `/` in PostgreSQL team mode uses `/api/storage/team/assets?boardId=&limit=200` for the main workspace gallery and hides library backing assets, while default browser mode still uses IndexedDB placeholders plus progressive hydration.
- Good: `/` in PostgreSQL team mode saves completed generated assets, async polling downloads, image quick-edit assets, retry updates, frame captures, panorama screenshots, and Settings local media imports through `POST /api/storage/team/assets`, then uses returned app-server media URLs in UI state.
- Good: `/` in PostgreSQL team mode lists, creates, updates, cancels, and deletes active generation tasks through `/api/storage/team/generation-tasks` while continuing to render pending/processing/failed task placeholders in the gallery.
- Good: Prompt template picker in PostgreSQL team mode loads custom templates from `/api/storage/team/prompt-templates`, saves edited templates with the CSRF cookie, and other picker instances refresh through the shared template-change event.
- Good: voice profile picker/helper code in PostgreSQL team mode lists saved cloned/designed/imported profiles from `/api/storage/team/voice-profiles`, saves new profiles with the CSRF cookie, preserves reference audio asset ids, and still merges built-in voice profiles from client constants.
- Good: `/` in PostgreSQL team mode deletes selected, individual, and status-filtered main gallery assets through `DELETE /api/storage/team/assets/[assetId]` with the CSRF cookie value in `x-imagine-csrf-token`, then updates the local UI state.
- Good: `GET /api/storage/team/boards` returns workspace-scoped board summaries for the board picker/list without returning full board documents.
- Good: `GET /api/storage/team/boards/[boardId]` returns a versioned board document with `runninghub-app.accessPassword` removed, `POST` creates new team boards, `PUT` saves only when `If-Match` equals the current row version, and `/board` uses the active storage adapter for board list/create/save/delete.
- Good: `/board` in PostgreSQL team mode uses `/api/storage/team/assets?boardId=...` plus referenced `id` lookups to populate media URLs for board asset side panels and downloads, while `/board` in default browser mode still uses IndexedDB.
- Good: `/board` in PostgreSQL team mode loads board-scoped generation tasks through `/api/storage/team/generation-tasks?boardId=...`, and shared generation/polling hooks persist task status changes through `PATCH /api/storage/team/generation-tasks/[taskId]`.
- Good: owner/admin users can list, create, update role, and remove non-owner team members from Settings -> Data in PostgreSQL mode, with all mutations using the `imagine_team_csrf` cookie value as the `x-imagine-csrf-token` header.
- Good: owner/admin clients save provider or RunningHub workspace secrets through `/api/storage/team/secrets`; the API writes encrypted `settings` records and returns only `{ configured, group, key, updatedAt }` status.
- Good: owner/admin clients save non-secret shared workspace settings through `/api/storage/team/settings`; the API writes `isSecret: false`, returns `{ group, key, value, updatedAt }`, and refuses to expose or delete secret records through this route.
- Good: Settings -> Connections in PostgreSQL mode shows the API key saved chip from masked `provider:${provider}:apiKey` status without rendering or restoring the plaintext secret from localStorage.
- Good: a logged-in editor in PostgreSQL mode can generate media without sending an API key header after an admin saved `provider:${provider}:apiKey`; the server decrypts the workspace-scoped team secret and provider adapters receive only the in-memory `ProviderConfig`.
- Good: `/v1/*` gateway requests with `Authorization: Bearer <gateway-key>` keep using `ignoredBearerToken`, so the gateway token is not mistaken for a provider API key; if the request also carries a team session, the stored team provider secret may supply the upstream credential.
- Good: owner/admin clients save RunningHub provider targets through `/api/storage/team/provider-targets`; access passwords are encrypted in PostgreSQL and responses never include plaintext or ciphertext password fields.
- Good: RunningHub board node saved-target controls use localStorage only in browser mode and use the team provider target API in PostgreSQL mode.
- Good: sensitive team secret and provider target mutations write audit events in the same transaction as the underlying mutation without including secret values or encrypted secret payloads in metadata.
- Good: bootstrap, login/logout, and team member create/update-role/delete mutations write audit events without including passwords, password hashes, session tokens, or CSRF tokens.
- Good: restoring a portable browser backup into PostgreSQL imports classified browser localStorage into team stores, skips local-only keys with a count, requires explicit credential restore for browser credentials, and refuses unknown settings before writes.
- Good: importing a browser workspace shows counts for asset DB, board DB, voice-profile DB, safety snapshot DB, managed localStorage, optional secrets, and excluded local-only keys before any write, then owner/admin confirmation builds a browser backup File in memory and restores it through the team backup route.
- Base: Settings -> Data continues to show existing browser backup/import/cleanup controls in browser mode.
- Bad: silently falling back to IndexedDB after `postgres` was explicitly selected.
- Bad: generation, retry, polling, quick-edit, or local media import paths call `saveToDB()` directly after the runtime status reports `targetKind: "postgres"`.
- Bad: generation task list/save/update/cancel/delete paths call IndexedDB `generation_tasks` directly after the runtime status reports `targetKind: "postgres"`.
- Bad: custom prompt template picker keeps reading or writing `imagine_custom_prompt_templates` after the runtime status reports `targetKind: "postgres"`.
- Bad: voice profile save/delete keeps writing `ImagineWorkbenchVoiceDB.voice_profiles` after the runtime status reports `targetKind: "postgres"`.
- Bad: main workspace gallery delete actions still call IndexedDB after the runtime status reports `targetKind: "postgres"`.
- Bad: Settings -> Data destructive actions clear or repair browser IndexedDB/localStorage while the active storage target is PostgreSQL.
- Bad: leaving `local-database`, SQLite labels, local-folder, or remote-api targets in active UI/config as if they are still product plans.
- Bad: exposing `DATABASE_URL`, `IMAGINE_MEDIA_DIR`, provider secrets, setup tokens, or encryption secrets to the browser.
- Bad: importing RunningHub saved targets or provider credentials through generic settings restore without an explicit secret opt-in.
- Bad: storing PostgreSQL-mode provider API keys back into `imagine_provider_credentials` after the user edits Settings -> Connections.
- Bad: importing `lib/providers/team-config.ts` from an Edge route; team secret resolution requires Node runtime because it uses PostgreSQL and Node crypto.
- Bad: returning decrypted `provider:${provider}:apiKey` to `useProviderSettings()` or any browser client so generation can keep using plaintext request headers.

#### 6. Tests Required

- Unit: storage mode parser accepts only empty/browser/postgres and rejects stale `local-database`, `local-folder`, and `remote-api` values.
- Unit: hosted/edge environment rejects PostgreSQL mode unless a Node server deployment path is explicitly configured.
- Unit/integration: missing `DATABASE_URL`, missing/unwritable `IMAGINE_MEDIA_DIR`, older schema, and newer schema produce explicit visible errors.
- Unit: Postgres config parsing requires explicit `postgres` mode, private database/media config, max media payload bytes, optional media usage warning bytes, and setup token for migration routes.
- Unit: Postgres migration status reports all migrations pending when `schema_migrations` is absent, flags unsupported newer schemas, and records a non-secret `team_migrations.apply` audit event when applying pending migrations.
- Unit: team data summary reports aggregate media directory bytes and sets `mediaUsageWarning` when the configured media warning threshold is reached.
- Unit: team data summary reports total and failed PostgreSQL generation task counts separately from failed asset counts.
- Unit: initial PostgreSQL migration SQL contains the team foundation tables listed in this scenario.
- Unit: localStorage inventory covers every current managed key, including provider selection/custom providers, default generation models, image-edit feature models, custom prompt templates, price visibility, RunningHub saved targets, Resolve toggle, Agent/board preferences, and board generated-media viewed markers as local/per-user state.
- Unit: team-storage client parses browser status, surfaces health errors, requires setup token for migrations/bootstrap, and sends the setup token only as a request header.
- Unit: team-storage client builds encoded asset media URLs, parses team session responses, reads the `imagine_team_csrf` browser cookie, sends login JSON, and sends logout CSRF only as the `x-imagine-csrf-token` header.
- Unit: team-storage client fetches team assets with `boardId`, repeated `id`, repeated `status`, `limit`, and `offset`, parses safe payload summaries, and rejects response payloads containing `uri`.
- Unit: team-storage client maps public team asset records to `StorageItem` values using `mediaUrl` for the browser-visible URL.
- Unit: team-storage client fetches main workspace gallery items with `boardId=&limit=200`, excludes `libraryItemId` backing records, and preserves the media URL mapping.
- Unit: team-storage client saves team assets by posting `{ asset }` to `/api/storage/team/assets`, sends CSRF only as `x-imagine-csrf-token`, rejects blank CSRF before fetch, and maps the mutation response `mediaUrl` into the returned `StorageItem.url`.
- Unit: team-storage client deletes team assets through encoded asset URLs, sends CSRF only as the `x-imagine-csrf-token` header, and rejects blank CSRF tokens before fetch.
- Unit: team-storage client fetches team generation tasks with `boardId`, repeated `sourceBoardNodeId`, repeated `status`, `limit`, and `offset`; save/update/cancel/delete send CSRF only as `x-imagine-csrf-token`, encode task ids, reject blank CSRF before fetch, and parse returned `GenerationTask` records.
- Unit: team-storage client fetches team prompt templates, parses each value through `readCustomPromptTemplate()`, saves `{ template }` with CSRF only as `x-imagine-csrf-token`, encodes template ids for delete, and rejects blank CSRF tokens before fetch.
- Unit: team-storage client fetches team voice profiles, validates profile shape, saves `{ profile }` with CSRF only as `x-imagine-csrf-token`, encodes profile ids for delete, preserves audio asset-reference arrays, and rejects blank CSRF tokens before fetch.
- Unit: team-storage client fetches team settings with repeated `group` and `key` filters, saves non-secret `{ group, key, value, expectedUpdatedAt? }` with CSRF only as `x-imagine-csrf-token`, sends setting delete concurrency tokens as `If-Match`, encodes setting keys for delete, rejects secret-shaped setting responses, and rejects blank CSRF tokens before fetch.
- Unit: team-storage client fetches team board summaries with repeated `id`, `limit`, and `offset`, parses summary fields, and rejects malformed summaries.
- Unit: team-storage client creates team boards with CSRF, fetches redacted team board documents, saves them with `If-Match` and CSRF headers, deletes single boards with CSRF, resets the board collection with CSRF, requires CSRF tokens for mutating board calls, and rejects responses containing `runninghub-app.accessPassword`.
- Unit: team-storage client lists team members, creates members, updates roles, deletes members, sends CSRF headers for mutating member calls, and requires non-empty CSRF tokens.
- UI/unit: `useProviderSettings` in PostgreSQL mode does not restore plaintext API keys from `imagine_provider_credentials`, loads masked provider secret status through `fetchTeamSecrets({ groups: ["provider"] })`, saves non-empty API keys to `provider:${provider}:apiKey`, deletes empty API keys on commit/clear, and surfaces missing-CSRF errors without localStorage fallback.
- UI/unit: `ProviderCredentialCard` can show the saved-key chip from `apiKeyConfigured` without a plaintext `apiKey` value.
- Unit: `resolveProviderConfig()` accepts `apiKeyOverride`, `baseUrlOverride`, and `providerLabelOverride` but still gives explicit request credentials/base URL headers precedence, including MiMo token-plan base URL routing.
- Unit: `readTeamProviderApiKey()` enforces team session/workspace scope and the requested role, reads `provider:${provider}:apiKey`, rejects plaintext/non-secret settings, and decrypts encrypted team secrets only server-side.
- Unit: `readTeamProviderConfigOverrides()` enforces team session/workspace scope and the requested role, decrypts provider API keys, reads non-secret `provider:${provider}:baseUrl`, falls back to non-secret `provider:customProviders` metadata for custom provider label/base URL, and rejects secret base URL/custom-provider records.
- Build/type: provider-executing routes that import `resolveProviderConfigForRequest()` must compile as `runtime = "nodejs"`, including `/api/*` and `/v1/*` wrappers.
- Unit: `LocalFilePayloadStore` writes/reads/deletes local-file refs, rejects unsafe keys and unsupported locations, validates MIME type, rejects configured byte-limit overages, and rejects mismatched content hashes.
- Unit: PostgreSQL payload repository writes through `LocalFilePayloadStore` and records matching `asset_payloads` refs.
- Unit: PostgreSQL settings repository rejects plaintext `isSecret` records, team secret crypto round-trips ciphertext, and team secret service/API/client tests prove only masked statuses are returned.
- Unit: authenticated team setting list/save/delete scopes repository access to the session workspace, enforces admin access, writes only `isSecret: false`, records non-secret audit metadata for save/delete, rejects invalid CSRF before database client access, refuses to delete existing secret settings, requires `updatedAt` tokens for existing setting updates/deletes, and rejects stale tokens with `409 team_setting_version_conflict`.
- Database tests: migrations create deterministic tables/indexes and record checksums in `schema_migrations`.
- Authz/security tests: unauthenticated, wrong-role, and invalid CSRF/origin requests cannot read/write shared workspace data.
- Unit: team auth core hashes/verifies passwords, serializes HTTP-only session cookies, serializes CSRF cookies, rejects untrusted origins, rejects invalid CSRF, resolves hashed sessions, and fails closed on missing sessions or insufficient roles.
- Unit: team workspace storage context scopes repository reads by the authenticated session workspace and rejects sessions below the requested minimum role.
- Unit: first-owner bootstrap creates workspace/team/user/session/CSRF records in one transaction, refuses a second owner with rollback, rejects malformed route JSON with `400`, and fails before database access when the setup token is missing.
- Unit: first-owner bootstrap also writes a non-secret `team_bootstrap.owner` audit event in the successful transaction.
- Unit: team session login verifies credentials, stores only hashed session/CSRF tokens, writes a non-secret `team_session.login` audit event, rejects invalid credentials before inserts, deletes the hashed current session on logout after writing `team_session.logout`, rejects malformed login JSON with `400`, and rejects invalid logout CSRF before database access.
- Unit: team member create/update/delete services write `team_member.create`, `team_member.update_role`, and `team_member.delete` audit events with only non-secret actor/target metadata.
- Unit: authenticated team media reading serves a workspace-scoped local-file payload for viewers, marks `?download=1` responses as attachments, rejects missing sessions, returns `404` for missing workspace assets, and fails explicitly when payload MIME type is missing.
- Unit: authenticated team asset metadata listing scopes repository queries to the session workspace, enforces viewer access, returns safe media/download URLs and payload summaries, and rejects invalid query params with `400 invalid_team_asset_query`.
- Unit: authenticated team asset save scopes repository writes to the session workspace, enforces editor access, writes supported data URI bytes through the local payload store, strips browser data URLs from persisted metadata, preserves existing payload refs for metadata-only updates, and rejects invalid CSRF before database client access.
- Unit: authenticated team setting/secret save/delete services enforce admin access, write non-secret `team_setting.*` / `team_secret.*` audit metadata in the same transaction as the settings table mutation, never audit plaintext secret values, and reject invalid CSRF before database client access.
- Unit: authenticated RunningHub provider target save/delete services enforce admin access, encrypt access passwords before storage, preserve existing ciphertext when password updates are omitted, return only public target metadata, and write `team_provider_target.*` audit metadata in the same transaction as the target table mutation without plaintext or ciphertext password values.
- Unit: authenticated team asset delete scopes lookup/delete to the session workspace, enforces editor access, writes `team_asset.delete` audit metadata in the delete transaction, returns `404 team_asset_not_found` for missing assets, and rejects invalid CSRF/origin before repository access.
- Unit: authenticated team asset-library save verifies the referenced asset in the session workspace, writes the library record and `team_asset_library.save` audit metadata in one transaction, and excludes titles, notes, tags, payload refs, media paths, prompts, and source metadata from audit metadata.
- Unit: authenticated team asset source-link repair scopes asset/board reads to the session workspace, enforces admin access, clears only stale `sourceBoardNodeId` metadata, writes `team_assets.repair_source_links` audit metadata, returns repaired ids, and rejects invalid CSRF before database client access.
- Unit: authenticated team generation task list/save/update/delete scopes repository access to the session workspace, enforces viewer/editor roles, normalizes task updates through the shared browser update helper, returns `404 team_generation_task_not_found` for missing tasks, records `team_generation_task.cancel` only for explicit canceled-status updates, records `team_generation_task.delete` metadata without prompt/request/result details, and rejects invalid CSRF before database client access.
- Unit: authenticated team prompt template list/save/delete scopes repository access to the session workspace, enforces viewer/editor roles, validates custom-template payload shape through `readCustomPromptTemplate()`, writes only the caller workspace row, records `team_prompt_template.save` / `team_prompt_template.delete` metadata without prompt-template details, and rejects invalid CSRF before database client access.
- Unit: authenticated team voice profile list/save/delete scopes repository access to the session workspace, enforces viewer/editor roles, validates voice-profile payload shape, preserves reference audio/source asset ids, writes only the caller workspace row, records `team_voice_profile.save` and `team_voice_profile.delete` metadata without voice details or asset ids, and rejects invalid CSRF before database client access.
- Unit: PostgreSQL voice profile repository stores `profile` JSON in `voice_profiles`, orders lists by `updated_at desc`, and scopes get/list/put/delete by workspace id.
- Unit: PostgreSQL team backup restore converts classified portable browser localStorage into team settings, encrypted provider secrets, custom prompt templates, and RunningHub saved provider targets; rejects unknown keys; and enforces credential opt-in for secret-bearing browser settings.
- Unit/UI: direct browser migration preview has both blocked and unblocked states; Settings -> Data disables direct import for blocked previews or non-admin roles, re-runs preview before import, and routes the generated browser backup File through `restoreTeamWorkspaceBackup()`.
- Unit: PostgreSQL asset repository treats empty `boardId` as a real board filter for workspace-global gallery queries.
- Unit: authenticated team board summary listing scopes repository queries to the session workspace, enforces viewer access, returns summaries only, and rejects invalid query params with `400 invalid_team_board_query`.
- Unit: authenticated team board document read redacts `runninghub-app.accessPassword`, returns the PostgreSQL version, enforces viewer access, and returns `404` for missing workspace boards.
- Unit: authenticated team board document create enforces editor access, trusted origin, CSRF, secret-field rejection, and duplicate-id conflict handling.
- Unit: authenticated team board document save enforces editor access, trusted origin, CSRF, matching route/body ids, `If-Match` optimistic concurrency, and rejects secret-bearing board writes until encrypted secret storage exists.
- Unit: authenticated team board document delete enforces editor access, trusted origin, CSRF, workspace scoping, writes `team_board.delete` audit metadata in the delete transaction, and returns `404` for missing workspace boards.
- Unit: authenticated team board collection reset enforces admin access, trusted origin, CSRF, workspace scoping, transactional delete/default-board recreate, and `team_boards.reset` audit metadata.
- Unit: authenticated team member list/create/update/delete enforces admin access, team scoping, duplicate-email rejection, owner immutability, current-user self-update/self-delete rejection, password hashing, session cleanup on delete, and invalid-CSRF rejection before database client access.
- UI/unit: `useBoardState` persists through an injected `BoardStorageAdapter`, and `BoardPageClient` switches board list/create/save/delete to the team adapter when `/api/storage/local/status` reports `targetKind: "postgres"`.
- UI/unit: `useBoardAssetStore` switches board asset loading from IndexedDB to team asset APIs when `/api/storage/local/status` reports `targetKind: "postgres"`.
- UI/unit: `app/page.tsx` switches main workspace gallery loading from IndexedDB to `fetchTeamWorkspaceGalleryItems()` when `/api/storage/local/status` reports `targetKind: "postgres"`.
- UI/unit: `app/page.tsx` injects the active storage delete function into gallery delete paths and `useAssetActions`, using `deleteTeamAsset()` in PostgreSQL mode and IndexedDB `deleteFromDB()` in browser mode.
- UI/unit: `app/page.tsx` and `BoardPageClient` inject active storage save/delete functions into shared generation, polling, retry, and derived-asset paths so PostgreSQL mode uses `saveTeamAsset()`/`deleteTeamAsset()` instead of direct `saveToDB()`/`deleteFromDB()` for those assets.
- UI/unit: `app/page.tsx`, `BoardPageClient`, `useGenerationTaskStore`, `useGenerationActions`, and `useMediaPolling` inject an active `GenerationTaskStorage` so PostgreSQL mode uses team task APIs instead of direct IndexedDB `generation_tasks` access for task list/save/update/cancel/delete.
- UI/unit: `/` and `/board` Settings -> Data handlers fail fast in PostgreSQL mode for browser-only cleanup/localStorage operations without team equivalents, while backup/restore/clear-assets/reset-boards/stale-source repair route through team APIs.
- Storage tests: PostgreSQL repository covers CRUD and payload refs for assets, crop derivative metadata, previews, library records, boards, generation tasks, settings, prompt templates, voice profiles, and safety snapshots.
- UI/e2e: Settings -> Data in default browser mode shows `浏览器 IndexedDB`, no data-stats error, and no team login/bootstrap prompt. PostgreSQL mode shows the team session card, allows first-owner bootstrap through `/api/storage/team/bootstrap`, allows refresh/login/logout through `/api/storage/team/session`, and `/api/storage/team/health` returns JSON config/health errors without leaking secrets.
- Deployment: `docker compose --env-file .env.team.example -f docker-compose.team.yml config` must parse; docs must keep team mode opt-in and state that auth/import slices are not complete.
- Type/lint/build: `pnpm run lint`, `pnpm run typecheck`, and `pnpm run build`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
if (env.IMAGINE_STORAGE_TARGET === "local-database") {
  return { kind: "local-database", engine: "sqlite" };
}
```

##### Correct

```typescript
const mode = parseWorkspaceStorageMode(env.IMAGINE_STORAGE_TARGET);
if (mode === "postgres") {
  return resolvePostgresStorageConfig(env);
}
return { mode: "browser", targetKind: "indexeddb" };
```

### Scenario: Destructive Workspace Safety Snapshot

#### 1. Scope / Trigger

- Trigger: any user-confirmed action that deletes or overwrites workspace assets/boards through settings or clear-all controls.
- Goal: preserve one last-resort workspace ZIP before destructive actions without mixing it into the asset or board stores being cleared.

#### 2. Signatures

- IndexedDB: `ImagineWorkbenchSafetyDB` version `1`.
- Object store: `workspace_safety_snapshots`, `keyPath: "id"`.
- Latest record ID: `"latest"`; only the latest snapshot is retained.
- `createWorkspaceSafetySnapshot(reason: WorkspaceSafetySnapshotReason): Promise<WorkspaceSafetySnapshotSummary>`.
- `getLatestWorkspaceSafetySnapshotSummary(): Promise<WorkspaceSafetySnapshotSummary | null>`.
- `downloadLatestWorkspaceSafetySnapshot(): Promise<WorkspaceSafetySnapshotSummary>`.

#### 3. Contracts

- `WorkspaceSafetySnapshotReason`: `"clear-assets" | "restore-workspace" | "reset-boards" | "cleanup-assets"`.
- Snapshot record stores a generated backup `Blob`, `origin`, `createdAt`, `fileName`, reason, counts, and ZIP size.
- Snapshot backup must include assets, boards, and managed settings, but never provider credentials.
- Safety snapshots are stored in `ImagineWorkbenchSafetyDB`, not `ImagineWorkbenchDB` or `ImagineWorkbenchBoardDB`.
- Settings data tab surfaces `summary.safety.origin` and `summary.safety.latestSnapshot`.

#### 4. Validation & Error Matrix

- IndexedDB unavailable -> snapshot creation rejects and the destructive action must not continue.
- No latest snapshot -> `downloadLatestWorkspaceSafetySnapshot()` rejects with a visible error.
- Clear assets -> create snapshot before `clearAllDB()`.
- Restore workspace backup -> parse the incoming ZIP first, then create snapshot before clearing existing DBs.
- Reset boards -> create snapshot before `clearBoardsFromDB()`.
- Cleanup assets -> create snapshot only when the cleanup target set is non-empty.

#### 5. Good/Base/Bad Cases

- Good: user clicks "清空资产"; current workspace ZIP is written to `ImagineWorkbenchSafetyDB/latest`, then asset DB is cleared.
- Base: user opens Settings with no dangerous actions yet; summary shows current origin and no latest snapshot.
- Bad: storing the safety ZIP in the asset DB; `clearAllDB()` would delete the rescue snapshot too.

#### 6. Tests Required

- Type/lint: `pnpm run typecheck` and `pnpm run lint`.
- Build: `pnpm run build`.
- Browser integration when available: perform a destructive action with at least one asset, then confirm `ImagineWorkbenchSafetyDB.workspace_safety_snapshots/latest` contains a downloadable ZIP.

#### 7. Wrong vs Correct

##### Wrong

```typescript
await clearAllDB();
await createWorkspaceSafetySnapshot("clear-assets");
```

##### Correct

```typescript
await createWorkspaceSafetySnapshot("clear-assets");
await clearAllDB();
```

### URL state

- `/board/[boardId]` — active board document ID via Next.js dynamic segment

---

## When to Use Global State

**Do not promote state to context or a global store** unless:

1. Many distant leaves need the same **UX primitive** (today: confirm dialogs only), or
2. The data is already **persisted** — read/write through `lib/db` or `lib/board`, not a new global atom

Theme is intentionally **not** React global state: `persistThemeMode` updates `document.documentElement` and CSS classes to avoid re-rendering the full workstation (`AGENTS.md`).

Provider credentials: localStorage via settings hooks — not React context.

---

## Server State

- API routes are **stateless** (Edge runtime on many `app/api/media/*` routes)
- Client polls or awaits completion via `useMediaPolling` and generation hooks
- Board generation resolves connected asset nodes against **current** IndexedDB before submitting URLs (`AGENTS.md` Board Surface)
- Agent route validates body with **Zod** (`app/api/agent/respond/route.ts`); image routes often use manual `optionalText` / `requireText` helpers from `lib/providers/utils.ts`

No SWR cache invalidation patterns — after generation, write to IndexedDB and update local hook state.

---

## Derived state

- Use `useMemo` for expensive lists (filtered assets, board → React Flow **projections**)
- Board canvas uses a **two-layer** node list (`flowNodes` from document + `reactFlowNodes` via `useNodesState`) — see [Board React Flow](./board-react-flow.md)
- Transient drag positions live in RF state until `onNodeDragStop`, then `updateNodesPositions` in `useBoardState`
- Edge kinds: recompute with `resolveBoardConnectionKind` from `lib/board/ports.ts` when loading or reconnecting

---

## Common Mistakes

| Mistake | Why |
|---------|-----|
| `themeMode` in `app/page.tsx` or `BoardPageClient` | Forces full-tree re-render |
| Treating board node URLs as permanent | Resolve asset ID → latest store URL before API calls |
| Using board edges as a DAG execution engine | Edges are organization/reference only |
| Broad `try/catch` swallowing provider errors | Prefer explicit error messages; JSON errors only where route already does |
| Extending `StorageItem["type"]` without updating all asset consumers | Main gallery, fullscreen, compare, retry, backup, board nodes, and filters must handle each media type explicitly; avoid `image` vs "everything else is video" branches |
| Auto cleanup of `sourceBoardNodeId` on load | Must be explicit user data action |
| Clearing provider credential keys during backup restore when credentials are not imported | Preserve existing credentials unless the user explicitly includes provider credentials in the restore |
| `useMemo` as sole `<ReactFlow nodes>` + `setState` on `dimensions` / filtered `select` | Causes maximum update depth; use `useNodesState` + [board-react-flow.md](./board-react-flow.md) |
| Putting `selected` on `flowEdges` while controlling node `selected` | Selection feedback loops; edge highlight via `strokeWidth` only |

Reference: `hooks/useBoardState.ts`, `lib/db.ts`, `lib/board/persistence.ts`, `components/board/BoardWorkspace.tsx`.
