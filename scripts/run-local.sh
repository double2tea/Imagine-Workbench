#!/usr/bin/env bash
# Imagine Workbench — macOS local dev (install deps, env, start next dev).
# Usage: ./scripts/run-local.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PNPM_VERSION="10.27.0"

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "→ $*"
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  die "This script targets macOS. Current: $(uname -s)"
fi

if ! command -v node >/dev/null 2>&1; then
  die "Node.js is required. Install from https://nodejs.org/ or: brew install node"
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    info "Enabling pnpm via corepack ($PNPM_VERSION)"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare "pnpm@${PNPM_VERSION}" --activate
  else
    die "pnpm not found. Install: npm install -g pnpm@${PNPM_VERSION}"
  fi
fi

if [[ ! -f pnpm-lock.yaml ]]; then
  die "Missing pnpm-lock.yaml — run from the project root"
fi

if [[ ! -f .env.local ]]; then
  if [[ ! -f .env.example ]]; then
    die "Missing .env.example — cannot create .env.local"
  fi
  cp .env.example .env.local
  info "Created .env.local from .env.example — edit provider API keys before generating."
fi

info "Installing dependencies (pnpm)"
pnpm install --frozen-lockfile

port="${PORT:-3000}"
url="http://127.0.0.1:${port}"
if command -v open >/dev/null 2>&1; then
  (sleep 2 && open "$url") >/dev/null 2>&1 &
fi
info "Starting dev server at $url"

exec pnpm run dev