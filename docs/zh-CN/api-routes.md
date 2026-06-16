# API 路由

[English](../api-routes.md) | [简体中文](api-routes.md)

Imagine Workbench 是一个 Next.js App Router 应用。它暴露两类 API：

- `/v1/*`：小型 OpenAI 兼容网关，面向插件和外部脚本。
- `/api/*`：Workbench 原生路由，主要供应用 UI 和集成使用。

## 远程调用建议

给用户或外部脚本远程调用时，优先使用 `/v1/*`。它的外部契约最清晰，也可以通过 `OPENAI_COMPAT_API_KEY` 保护。

公共或团队部署：

```bash
OPENAI_COMPAT_API_KEY="your_gateway_key"
```

调用时发送：

```http
Authorization: Bearer your_gateway_key
```

这个 bearer token 用于保护 Workbench 网关。上游供应商凭证来自服务端环境变量，或来自 `x-ai-api-key` 等可选供应商请求头。

不要把未保护的部署直接作为公开 API 服务暴露。大多数 `/api/*` 路由是应用路由，不是带用户、账号、限流和按用户存储的多租户 SaaS 后端。

## 公开兼容路由

| Route | 用途 |
| --- | --- |
| `GET /v1/models` | OpenAI 风格模型列表，覆盖可直接调用的 chat、image 和 audio 模型。 |
| `POST /v1/chat/completions` | OpenAI 兼容 chat completions 代理。 |
| `POST /v1/images/generations` | 即时单图生成。 |
| `POST /v1/images/edits` | 基于 Workbench 编辑操作的 multipart 图像编辑 facade。 |
| `POST /v1/audio/speech` | 直接 MiMo 兼容 TTS。 |
| `POST /v1/audio/transcriptions` | 直接 MiMo 兼容 ASR。 |

详细说明见：[OpenAI 兼容 API](openai-compatible-api.md)。

## Workbench 原生路由

这些路由主要供 Workbench UI 使用。如果你理解 Workbench 原生请求/响应形态，也可以通过 HTTP 调用，但它们不是稳定的 OpenAI 兼容 facade。

| 路由族 | 用途 |
| --- | --- |
| `/api/media/*` | 图像、视频、音频、异步任务轮询、下载、取消和参考图本地化。 |
| `/api/chat/completions` | Workbench 和 Agent 流程使用的内部 chat completions 代理。 |
| `/api/agent/respond` | Agent Mode 规划/动作响应路由。 |
| `/api/prompts/optimize` | 提示词优化。 |
| `/api/models` | 应用 UI 使用的供应商模型列表。 |
| `/api/model-capabilities` | 应用 UI 使用的静态模型能力目录。 |
| `/api/model-vision-support` | 模型视觉支持信息查询。 |
| `/api/runninghub/ai-app-schema` | RunningHub AI App schema 查询。 |
| `/api/resolve/*` | DaVinci Resolve Workflow Integration bridge 路由。 |
| `/api/board/import-image` | Board 图像导入辅助。 |
| `/api/storage/local/status` | 公开本地存储运行状态。 |

大多数供应商相关路由通过模型 ID 或请求字段选择供应商，并从服务端环境变量或 `x-ai-api-key` / `x-ai-base-url` 等请求头读取供应商凭证。

## 当前不提供什么

Imagine Workbench 目前不提供：

- 用户账号或多用户鉴权；
- 每个远程用户的服务端工作区持久化；
- 用于浏览其他用户 IndexedDB 资产的通用 REST API；
- 默认启用的托管数据库层；
- 用于公开 API 转售的限流或计费控制。

如果你将它部署给其他用户使用，请把 `/v1/*` 视为外部 API 面，并使用 `OPENAI_COMPAT_API_KEY` 保护。
