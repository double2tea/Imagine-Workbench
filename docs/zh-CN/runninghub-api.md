# RunningHub API

[English](../runninghub-api.md) | [简体中文](runninghub-api.md)

已基于 RunningHub API 文档在 2026-06-10 进行核对。

Imagine Workbench 将 RunningHub 视为任务导向供应商，而不是单一 OpenAI 兼容媒体供应商。RunningHub LLM chat 可以使用 OpenAI 兼容端点；图像、视频、音频 AI App、workflow 和 Standard Model API 仍是 Workbench 原生异步媒体操作。

## 路由结构

### LLM Chat

- Workbench 路由：`POST /api/chat/completions` 或 `POST /v1/chat/completions`
- 模型 ID：`runninghub:<llm-model-id>`，例如 `runninghub:qwen/qwen3.7-max`
- 上游 host：`https://llm.runninghub.cn/v1/chat/completions`
- 上游模型列表：`https://llm.runninghub.cn/v1/models`

### Standard Model API

- Workbench 模型 ID：`runninghub:api:/openapi/v2/<provider>/<model>/<operation>`
- 上游提交端点：`POST {RUNNINGHUB_BASE_URL}/openapi/v2/...`
- 上游状态端点：`POST {RUNNINGHUB_BASE_URL}/openapi/v2/query`
- Workbench 路由：`POST /api/media/generate-image` 或 `POST /api/media/generate-video`

Standard Model 端点是异步的，不应包装成同步 `/v1/images/generations` 响应。

### AI App / Workflow

- Image AI App：`runninghub:ai-app-image:<webappId>`
- Video AI App：`runninghub:ai-app-video:<webappId>`
- Audio AI App：`runninghub:ai-app-audio:<webappId>`
- Image workflow：`runninghub:workflow-image:<workflowId>`
- Video workflow：`runninghub:workflow-video:<workflowId>`
- Audio workflow：`runninghub:workflow-audio:<workflowId>`

AI App 提交到 `/task/openapi/ai-app/run`。Workflow 提交到 `/task/openapi/create`。两者都通过 `/task/openapi/outputs` 轮询。

## 音频边界

部分 RunningHub AI App 和 workflow 会生成音频。使用：

```text
POST /api/media/generate-audio-workflow
```

并配合 `runninghub:ai-app-audio:*` 或 `runninghub:workflow-audio:*`。

不要把这些目标暴露到通用 `AUDIO_MODEL_OPTIONS` 或 `/api/media/generate-audio`。它们是带 `nodeInfoList` 绑定的 workflow 执行目标，不是 MiMo TTS 或 ASR 那种直接音频操作模型。

## 上传边界

RunningHub 上传响应会暴露两个不同值：

- `download_url`：传给 Standard Model API 字段，例如 `imageUrls`、`videoUrls` 或 `audioUrls`。
- `fileName`：传入 ComfyUI / AI App / Workflow 节点字段，例如 `LoadImage`、`LoadAudio` 或 `LoadVideo`。

不要把它们合并成一个通用 URL。上传链接是临时的，RunningHub 文档也将它们描述为任务执行输入，而不是长期素材存储。

## 错误

RunningHub 供应商错误应保留结构化含义：

- 参数无效或 nodeInfoList 不匹配 -> `400`
- API key 缺失或无效 -> `401`
- Standard Model API 仅企业版可用 -> `403`
- 余额不足 -> `402`
- 任务、workflow 或 app 不存在 -> `404`
- 队列或请求频率限制 -> `429`
- 容量、排队、繁忙或超时状态 -> `503`
- 未知供应商失败 -> `502`

路由应通过 `apiErrorResponse()` 返回这些错误，而不是把所有 RunningHub 失败都压成 `500`。

## 不包含在 `/v1/*`

OpenAI 兼容网关有意排除：

- RunningHub Standard Model 异步图像/视频端点。
- RunningHub AI App / Workflow 图像、视频或音频执行。
- RunningHub 公共资源/模型目录。
- RunningHub 价格预览。
- RunningHub 账号和 API key 管理。

这些属于供应商原生能力，应保留在 Workbench `/api/media/*` 或专门的 RunningHub 配置路由中。
