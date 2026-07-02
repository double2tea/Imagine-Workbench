# Imagine Workbench

[English](README.md) | [简体中文](README.zh-CN.md)

Imagine Workbench is a browser-first creative workstation for AI image, video, audio, and agent-assisted visual ideation workflows.

- **Online Preview:** [imagine-workbench.pages.dev](https://imagine-workbench.pages.dev)
- **License:** [AGPL-3.0-or-later](LICENSE.md)
- **Author:** [double2tea](https://github.com/double2tea) · <double_tea@foxmail.com>

![Imagine Workbench preview](docs/assets/workbench-preview.png)

## Highlights

- Generate images from prompts, reference images, and masked edits.
- Generate videos from text, reference images, or first/last frames when supported by the selected model.
- Create audio through TTS, transcription, voice design, voice clone, and workflow-backed audio targets.
- Use Agent Mode to plan creative actions and trigger recommended generation steps.
- Arrange assets, notes, references, and generation nodes on `/board` canvases.
- Store generated assets locally in browser IndexedDB, with ZIP backup and restore tools.
- Run an opt-in PostgreSQL team workspace with login, roles, shared assets, boards, generation tasks, provider settings, backups, and media maintenance.
- Route model calls through provider adapters for 12AI, grok2api, Agnes AI, ModelScope, MiMo, and RunningHub.
- Expose a small OpenAI-compatible `/v1/*` API surface for plugins and scripts.

## Quick Start

Prerequisites:

- Node.js 24
- pnpm 10.27.0

```bash
corepack enable
corepack prepare pnpm@10.27.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm run dev
```

Open the local URL printed by Next.js, normally `http://localhost:3000`.

## Configuration

Provider credentials can be set in `.env.local` or through the in-app Settings panel.

Start from [.env.example](.env.example). The most common keys are:

```bash
TWELVE_AI_API_KEY="sk_your_12ai_key"
GROK2API_API_KEY="your_grok2api_key"
AGNES_AI_API_KEY="your_agnes_ai_key"
MODELSCOPE_API_KEY="ms_your_modelscope_token"
RUNNINGHUB_API_KEY="your_runninghub_api_key"
MIMO_API_KEY="your_mimo_api_key"
```

For hosted or shared deployments, set `OPENAI_COMPAT_API_KEY` to protect plugin-facing `/v1/*` routes.

More details: [Configuration](docs/configuration.md).

## Documentation

| English | 简体中文 |
| --- | --- |
| [Configuration](docs/configuration.md) | [配置说明](docs/zh-CN/configuration.md) |
| [API routes](docs/api-routes.md) | [API 路由](docs/zh-CN/api-routes.md) |
| [Data storage](docs/data-storage.md) | [数据存储](docs/zh-CN/data-storage.md) |
| [Provider and model guide](docs/providers.md) | [供应商与模型指南](docs/zh-CN/providers.md) |
| [OpenAI-compatible API](docs/openai-compatible-api.md) | [OpenAI 兼容 API](docs/zh-CN/openai-compatible-api.md) |
| [RunningHub API](docs/runninghub-api.md) | [RunningHub API](docs/zh-CN/runninghub-api.md) |
| [DaVinci Resolve Bridge](docs/resolve-bridge.md) | [DaVinci Resolve Bridge](docs/zh-CN/resolve-bridge.md) |
| [Local team deployment](docs/deployment/team-local.md) | [本地团队部署](docs/zh-CN/deployment/team-local.md) |
| [Development guide](docs/development.md) | [开发指南](docs/zh-CN/development.md) |
| [Security policy](SECURITY.md) | [安全策略](SECURITY.zh-CN.md) |
| [Contributing guide](CONTRIBUTING.md) | [贡献指南](CONTRIBUTING.zh-CN.md) |

## Common Commands

```bash
pnpm run dev
pnpm run lint
pnpm run typecheck
pnpm run check
pnpm run check:docker
pnpm run build
pnpm run test:providers
```

## Deployment

Personal Docker deployment uses the default browser IndexedDB storage mode:

```bash
docker compose up --build
```

Open `http://localhost:3000`. This mode does not start PostgreSQL; generated assets and boards remain in the current browser profile.
If port 3000 is already in use, run `APP_PORT=3010 docker compose up --build` and open `http://localhost:3010`.

The repository includes an opt-in Cloudflare Pages workflow. Pushes to `main` build and deploy to the `imagine-workbench` Cloudflare Pages project only when Pages deployment is explicitly enabled and the required GitHub settings are configured:

- `ENABLE_CLOUDFLARE_PAGES_DEPLOY=true`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Manual deploy:

```bash
pnpm run pages:deploy
```

Cloudflare Pages builds hide Node runtime API routes before running the Pages adapter, then restore them locally after the build. The Pages deployment is browser-first; Node-only provider/team APIs are not included in the Pages output.
Run `pnpm run pages:build` before enabling or manually running Pages deployment.

For opt-in LAN/self-hosted team workspaces backed by PostgreSQL and a server media volume, use `docker-compose.team.yml` and see [Local team deployment](docs/deployment/team-local.md). Browser IndexedDB remains the default storage mode.

## License

Imagine Workbench is licensed under the GNU Affero General Public License v3.0 or later.

Personal, internal, and commercial use are allowed. Modified versions and derivative works must follow the AGPL terms. If you distribute them or provide them as a network service, you must make the corresponding source code available under the same license and clearly credit the original author and source project.
