# Data Storage

[English](data-storage.md) | [简体中文](zh-CN/data-storage.md)

Imagine Workbench is browser-first by default and can also run an explicit PostgreSQL-backed team workspace for LAN or self-hosted deployments.

## Storage Modes

| Mode | Use case | Workspace authority |
| --- | --- | --- |
| `browser` | Hosted preview, single-user local use, and normal development | Browser IndexedDB + `localStorage` |
| `postgres` | Opt-in LAN/self-hosted team workspace | App server + PostgreSQL + server media volume |

Browser mode remains the default. PostgreSQL mode is enabled only when `IMAGINE_STORAGE_TARGET=postgres` and the required team storage environment variables are configured.

## Browser Mode

| Data | Storage |
| --- | --- |
| Generated asset metadata | IndexedDB `ImagineWorkbenchDB` |
| Generated media payloads and previews | IndexedDB blob/payload stores |
| Board documents | IndexedDB board store |
| Generation task snapshots | IndexedDB generation task store |
| Asset library records | IndexedDB library store |
| Provider credentials saved in Settings | Browser `localStorage` |
| Model caches, UI preferences, Agent chat snapshots | Browser `localStorage` |
| Safety snapshots | Separate browser IndexedDB safety database |

This means the hosted preview does not have a shared server database containing every user's assets. Clearing browser data can remove the local workspace unless the user exported a backup.

## PostgreSQL Team Mode

PostgreSQL team mode stores shared workspace records in PostgreSQL and stores media bytes in a server-side media volume referenced by safe payload refs.

Implemented team-mode storage includes:

- first-owner bootstrap, login sessions, CSRF/origin checks, and role-based access for owner/admin/editor/viewer;
- shared assets, payload refs, previews, asset library records, boards, generation tasks, prompt templates, voice profiles, safety snapshots, and non-secret settings;
- encrypted team workspace secrets and saved RunningHub/provider targets;
- versioned schema migrations, schema health, bounded PostgreSQL pool settings, and unsupported-newer-schema refusal;
- Settings -> Data team summary, migration status, team member controls, backup/restore, browser IndexedDB -> PostgreSQL import, clear-assets/reset-boards, media maintenance, missing-payload cleanup, missing-preview cleanup, and stale source-link repair;
- preservation of rich generation metadata, including cinematic profiles, reference media snapshots, board/result-stack links, crop derivative metadata, library backing links, preview status, voice profile refs, and transcript assets.

Generated results, imported assets, and asset-library entries all resolve through `assets` plus `asset_payloads`; `asset_library` stores curation metadata that references backing assets instead of creating a separate media storage path.

## Backup And Restore

Use Settings -> Data to:

- export the whole workspace as a ZIP;
- import a workspace ZIP;
- export the current board;
- import local media files;
- include or exclude provider credentials explicitly;
- inspect and clean failed, stale, broken, or orphaned records.

Provider credentials are not included in exports unless the user explicitly enables credential export.

In PostgreSQL mode, full workspace export uses the team backup route and packages PostgreSQL records with referenced media bytes. Restore creates a safety snapshot first, replaces workspace records in a transaction, and imports secrets only when credential restore is explicitly enabled.

## Team Deployment

Use [Local team deployment](deployment/team-local.md) for Docker Compose setup, environment variables, migrations, first-owner bootstrap, backup, restore, upgrade, and rollback steps.

## Hosted Deployment Implications

For Cloudflare Pages, Vercel, Netlify, or other hosted deployments:

- browser BYOK mode can call providers directly when the provider allows browser CORS;
- user workspaces remain in the browser by default;
- the server does not provide per-user asset browsing or sync;
- `/v1/*` should be protected with `OPENAI_COMPAT_API_KEY` if exposed to others;
- provider keys should be treated as secrets and should not be committed or exposed in client-visible code.

Cloudflare Pages builds enable browser BYOK mode (`NEXT_PUBLIC_IMAGINE_BROWSER_BYOK=1`) and hide classified Node runtime API routes before generating the Pages output. Browser-first Pages deployments can update successfully and call providers directly with the user's local provider credentials when the provider allows browser CORS. Team-mode saved provider secrets are not available there.

## Current Limitations

- Browser mode has no built-in user accounts or cross-device sync.
- PostgreSQL mode is opt-in and intended for trusted LAN/self-hosted access.
- No public API for reading another browser's IndexedDB assets.
- Browser IndexedDB -> PostgreSQL migration is explicit and user-triggered, not automatic.
