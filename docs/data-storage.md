# Data Storage

[English](data-storage.md) | [简体中文](zh-CN/data-storage.md)

Imagine Workbench is local-first. A deployed instance serves the app and provider proxy routes, but each user's workspace data lives in that user's browser by default.

## Active Default Storage

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

## Backup And Restore

Use Settings -> Data to:

- export the whole workspace as a ZIP;
- import a workspace ZIP;
- export the current board;
- import local media files;
- include or exclude provider credentials explicitly;
- inspect and clean failed, stale, broken, or orphaned records.

Provider credentials are not included in exports unless the user explicitly enables credential export.

## Local Database Status

The codebase contains storage-target types and runtime status helpers for a future local SQLite workspace target:

- `IMAGINE_STORAGE_TARGET`
- `IMAGINE_LOCAL_WORKSPACE_DIR`
- `imagine-workbench.sqlite`
- local asset, preview, export, and trash folder names

That local database path is not the current default production storage path. The active supported path is still browser IndexedDB plus explicit ZIP backup/restore. Local folder, local database, and remote database adapters are marked as planned storage targets in the codebase.

## Hosted Deployment Implications

For Cloudflare Pages, Vercel, Netlify, or other hosted deployments:

- serverless routes can call providers and return media results;
- user workspaces remain in the browser by default;
- the server does not provide per-user asset browsing or sync;
- `/v1/*` should be protected with `OPENAI_COMPAT_API_KEY` if exposed to others;
- provider keys should be treated as secrets and should not be committed or exposed in client-visible code.

## Current Limitations

- No built-in user accounts.
- No built-in cross-device sync.
- No shared team workspace database.
- No default SQLite database startup.
- No public API for reading another browser's IndexedDB assets.
- No automatic migration from IndexedDB to a server database.
