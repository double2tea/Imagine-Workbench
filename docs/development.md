# Development Guide

[English](development.md) | [简体中文](zh-CN/development.md)

## Project Layout

```text
app/                         Next.js App Router pages and API routes
components/                  Workbench, board, settings, asset, and creation UI
hooks/                       Client-side workflow state and action hooks
lib/                         Provider adapters, IndexedDB, board persistence, helpers
docs/                        Public project documentation
public/                      Static assets
tests/                       Node tests for helpers and provider behavior
```

Key boundaries:

- `app/page.tsx` owns the main workstation shell.
- `app/board/*`, `components/board/*`, `hooks/useBoardState.ts`, and `lib/board/*` own board workflows.
- `app/api/*` routes should stay thin; provider-specific behavior belongs in `lib/providers/*`.
- Generated media uses the active storage boundary: browser IndexedDB by default, PostgreSQL metadata plus server media payload refs in team mode.
- Theme persistence lives in `lib/theme-mode.ts`.

## Quality Gates

```bash
pnpm run lint
pnpm run typecheck
pnpm run check
pnpm run test:providers
```

`pnpm run check` includes lint, typecheck, app version validation, and model capability catalog validation.

## Cloudflare Pages

```bash
pnpm run pages:build
pnpm run pages:preview
pnpm run pages:deploy
```

The GitHub Actions workflow deploys `main` to Cloudflare Pages only when `ENABLE_CLOUDFLARE_PAGES_DEPLOY=true`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` are configured.

Cloudflare Pages builds only browser-first routes. The build hides team-local PostgreSQL routes under `/api/storage/team/*` and fails fast if any other Node runtime API route would be omitted from the Pages deployment.
Treat `pnpm run pages:build` as the compatibility gate before enabling the workflow or running a manual Pages deploy.

## Dependency Notes

- Use `pnpm install --frozen-lockfile` in CI.
- Do not commit local `.env*`, `.next/`, `.vercel/`, `.tmp/`, or workflow/private planning directories.
