# Contributing

[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

Thanks for your interest in improving Imagine Workbench.

## Before You Start

- Open an issue for larger behavior changes or provider integrations.
- Keep changes focused and avoid unrelated refactors.
- Follow the existing module boundaries in `docs/development.md`.
- Never commit provider credentials, local `.env*` files, generated build output, or private planning/workflow directories.

## Local Development

```bash
corepack enable
corepack prepare pnpm@10.27.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm run dev
```

## Quality Checks

Run the smallest relevant checks before opening a pull request:

```bash
pnpm run lint
pnpm run typecheck
pnpm run check
```

Provider adapter changes should also run:

```bash
pnpm run test:providers
```

## Pull Request Checklist

- The change is scoped to the requested behavior.
- README/docs are updated when public behavior changes.
- No secrets, local caches, or private workflow files are included.
- New provider behavior stays inside `lib/providers/*` unless the UI needs a direct surface change.
- Destructive or irreversible UI actions use the existing confirm/alert pattern.
