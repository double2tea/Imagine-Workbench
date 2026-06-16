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
- Generated media lives in the browser IndexedDB asset store.
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

The GitHub Actions workflow deploys `main` to Cloudflare Pages when `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are configured.

## Dependency Notes

- Use `pnpm install --frozen-lockfile` in CI.
- Keep `.npmrc` and lockfile pnpm settings aligned.
- Do not commit local `.env*`, `.next/`, `.vercel/`, `.tmp/`, or workflow/private planning directories.
