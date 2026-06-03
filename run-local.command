#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
chmod +x scripts/run-local.sh 2>/dev/null || true
exec ./scripts/run-local.sh