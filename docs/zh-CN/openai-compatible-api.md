# OpenAI 兼容 API

[English](../openai-compatible-api.md) | [简体中文](openai-compatible-api.md)

Imagine Workbench 提供一组小型 OpenAI 风格 API，供插件和外部脚本调用。它不是完整的 OpenAI 或 12AI API 克隆。Workbench 特有的异步媒体工作流、下载、取消和 RunningHub workflow 执行仍保留在 `/api/media/*` 下。

RunningHub 的异步任务、AI App、workflow、上传和音频 AI App 目标见：[RunningHub API](runninghub-api.md)。

## 认证

仅本地使用时，`/v1/*` 路由可以直接使用已配置的供应商环境变量。

公共或团队部署请设置：

```bash
OPENAI_COMPAT_API_KEY="your_gateway_key"
```

设置后，每个 `/v1/*` 请求都必须包含：

```http
Authorization: Bearer your_gateway_key
```

这个 bearer token 会被视为 Workbench 网关密钥，而不是上游供应商密钥。上游供应商凭证来自服务端环境变量，或来自 `x-ai-api-key`。

可选供应商凭证请求头：

```http
x-ai-api-key: provider_key
x-ai-base-url: https://provider.example/v1
x-ai-provider-label: Provider Name
```

对 `/v1/chat/completions`、`/v1/images/*` 和 `/v1/audio/*` 等执行路由，通过 `provider:model` 模型 ID 前缀选择供应商。`GET /v1/models` 也可以通过 `x-ai-provider` 指定供应商，它等价于 `provider` 查询参数。

## 模型 ID

当一个路由可以指向多个供应商时，使用带供应商前缀的模型 ID：

```text
12ai:gpt-image-2
mimo:mimo-v2.5-asr
newapi:image-model
runninghub:qwen/qwen3.7-max
```

未加前缀的 chat 和 image 模型默认使用 `12ai`。未加前缀的 audio speech/transcription 模型默认使用 `mimo`。

## 已支持的 `/v1/*` 路由

### `GET /v1/models`

返回 OpenAI 风格模型列表。

查询参数：

- `provider`：`all` 或供应商 key，默认 `all`
- `kind`：`chat`、`image`、`video`、`audio` 或 `all`，默认 `chat`

当 `provider` 省略或为 `all` 时，路由返回 Workbench 已知且可通过 `/v1/*` facade 直接调用的模型：chat、即时 image 和 direct audio 模型。它包含 ModelScope chat 模型，但排除 video、async image、ModelScope API-Inference image、RunningHub Standard Model API media、AI App 和 Workflow 目标。需要供应商动态模型列表时，使用 `provider=<key>`。应用 UI 使用的完整目录请调用 `/api/models`。

示例：

```bash
curl "http://localhost:3000/v1/models?kind=all" \
  -H "Authorization: Bearer $OPENAI_COMPAT_API_KEY"
```

### `POST /v1/chat/completions`

将 OpenAI 兼容 chat completions 转发到所选供应商。

必需 body 字段：

- `model`
- `messages`

其他 OpenAI 兼容字段会透传。

### `POST /v1/images/generations`

仅支持即时单图生成。

支持字段：

- `model`
- `prompt`
- `n`：仅 `1`
- `size`
- `quality`
- `response_format`：`b64_json` 或 `url`

异步和 workflow 图像目标会被拒绝。此类任务请使用 `/api/media/generate-image` 和 `/api/media/status`。

当 `response_format` 为 `b64_json` 时，供应商结果 URL 会在服务端下载。会拒绝本地/私有网络目标，以及超过 24MB 的图片响应。

### `POST /v1/images/edits`

将 multipart 图像编辑映射到 Workbench 编辑操作。

支持字段：

- `model`
- `image` 或 `image[]`；第一张图是源图，后续图片是视觉参考
- `mask`
- `prompt`
- `operation`：`redraw`、`erase`、`outpaint` 或 `cutout`，默认 `redraw`
- `n`：仅 `1`
- `size`
- `quality`
- `response_format`：`b64_json` 或 `url`

这是 OpenAI 风格 facade，但语义仍是 Workbench 的编辑操作，并不是每个 OpenAI image edit 功能的完整克隆。多图请求会以 OpenAI 风格 `image[]` 上传方式转发到即时 OpenAI 兼容图像编辑供应商。

multipart 图像编辑 payload，包括字符串 data URI 字段，在调用供应商前限制为 24MB。

### `POST /v1/audio/speech`

直接 MiMo 兼容 TTS。

支持字段：

- `model`
- `input`
- `voice`
- `instructions`
- `response_format`：`wav` 或 `pcm16`

这里不支持 RunningHub workflow audio。请使用 `/api/media/generate-audio-workflow`。

### `POST /v1/audio/transcriptions`

直接 MiMo 兼容 ASR。

multipart 字段：

- `model`
- `file`：`wav` 或 `mp3`
- `language`：`auto`、`zh` 或 `en`
- `prompt`
- `response_format`：省略或 `json`

MiMo ASR 输入必须是 `wav` 或 `mp3`，发送给上游的 base64 payload 不得超过 10MB。

multipart transcription payload，包括字符串 data URI 字段，在调用供应商前限制为 24MB。

## Workbench 媒体路由

当操作不适合做成同步 OpenAI 风格 request/response 时，使用 `/api/media/*`：

- `POST /api/media/generate-image`
- `POST /api/media/generate-video`
- `POST /api/media/generate-audio`
- `POST /api/media/generate-audio-workflow`
- `POST /api/media/status`
- `POST /api/media/image-download`
- `POST /api/media/video-download`
- `POST /api/media/audio-download`
- `POST /api/media/cancel`

这些路由面向 Workbench 客户端，支持供应商特定异步任务、轮询、下载和 workflow 执行。

## 暂未实现

以下 12AI/OpenAI 风格 API 暂未暴露：

- `/v1/responses`
- `/v1/messages`
- `/v1/videos`
- `/v1/audio/translations`
- `/v1/images/variations`
- Files、Vector Stores、Batch、Fine-tuning 和 Realtime

只有在先定义能够真实表达行为的供应商映射后，才应添加这些 API。
