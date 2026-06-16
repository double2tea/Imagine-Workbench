# Configuration

[English](configuration.md) | [简体中文](zh-CN/configuration.md)

Imagine Workbench can read provider credentials from `.env.local` or from the in-app Settings panel. Environment variables are useful for local development, server deployments, and plugin-facing API routes.

Copy the example file first:

```bash
cp .env.example .env.local
```

## Provider Credentials

```bash
TWELVE_AI_API_KEY="sk_your_12ai_key"
TWELVE_AI_BASE_URL="https://cdn.12ai.org"
TWELVE_AI_VIDEO_BASE_URL="https://new.12ai.org"

GROK2API_API_KEY="your_grok2api_key"
GROK2API_BASE_URL="http://localhost:8000"

AGNES_AI_API_KEY="your_agnes_ai_key"
AGNES_AI_BASE_URL="https://apihub.agnes-ai.com"

MODELSCOPE_API_KEY="ms_your_modelscope_token"
MODELSCOPE_BASE_URL="https://api-inference.modelscope.cn"

RUNNINGHUB_API_KEY="your_runninghub_api_key"
RUNNINGHUB_BASE_URL="https://www.runninghub.cn"

MIMO_API_KEY="your_mimo_api_key"
MIMO_BASE_URL="https://api.xiaomimimo.com"
```

## OpenAI-Compatible Gateway Protection

For hosted or shared deployments, set:

```bash
OPENAI_COMPAT_API_KEY="local_gateway_key"
```

When this is set, external callers must send:

```http
Authorization: Bearer local_gateway_key
```

This gateway key protects Workbench `/v1/*` routes. It is not forwarded as an upstream provider key.

## In-App Settings

The Settings panel has:

- `连接`: provider credentials, model lists, and connection checks.
- `功能模型`: per-feature model selections.
- `数据`: local workspace backup, restore, cleanup, and import actions.

Generated media and boards are stored in browser IndexedDB. Optional provider credential export is explicit and off by default.

## Storage Target

The supported default workspace storage is browser storage:

- generated media, media metadata, library items, generation tasks, and boards use IndexedDB;
- provider credentials, model caches, UI preferences, and agent chat snapshots use browser `localStorage`;
- workspace backup and restore use explicit ZIP export/import.

The codebase contains early storage-target metadata for a future local SQLite workspace, but it is not the default production storage path. See [Data storage](data-storage.md).
