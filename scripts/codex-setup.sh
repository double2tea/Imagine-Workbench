#!/usr/bin/env bash
# Codex worktree setup: install deps and ensure .env.local exists. Must exit (no dev server).
set -euo pipefail

cd "$(dirname "$0")/.."

PNPM_VERSION="10.27.0"

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js is required" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare "pnpm@${PNPM_VERSION}" --activate
  else
    echo "error: pnpm not found" >&2
    exit 1
  fi
fi

pnpm install --frozen-lockfile

if [[ ! -f .env.local ]] && [[ -f .env.example ]]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example"
fi