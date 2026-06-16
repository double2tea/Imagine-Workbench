# 供应商与模型指南

[English](../providers.md) | [简体中文](providers.md)

Imagine Workbench 通过供应商适配层转发模型调用。大多数 UI 模型列表由模型能力目录驱动，供应商密钥和默认 URL 集中在 provider registry 中管理。

## 内置供应商类型

- 12AI：chat、image、async image 和 video 适配器。
- grok2api：OpenAI 兼容 chat、image 和 video 端点。
- xstx：OpenAI 兼容 chat、image 和模型列表。
- Agnes AI：OpenAI 兼容 chat、image、video 和模型列表。
- ModelScope：API-Inference 图像生成和异步任务轮询。
- RunningHub：Standard Model API、AI App、Workflow 和 LLM chat。
- MiMo：直接音频 speech/transcription 目标。

## 模型 ID 形式

带供应商前缀的模型 ID 可以让路由保持明确：

```text
12ai:gemini-3.1-flash-lite-preview
12ai:gemini-3.1-flash-image-preview
grok2api:grok-4.20-auto
grok2api:grok-imagine-image
xstx:gpt-image-2
agnes:agnes-video-v2.0
modelscope:Qwen/Qwen-Image
runninghub:api:/openapi/v2/bytedance/jimeng-4.6/text-to-image
runninghub:ai-app-image:<webappId>
runninghub:workflow-video:<workflowId>
```

## 添加供应商

供应商元数据从 `lib/providers/registry.ts` 开始：

```typescript
{
  key: "newprovider",
  label: "Display Name",
  envApiKey: "NEWPROVIDER_API_KEY",
  envBaseUrl: "NEWPROVIDER_BASE_URL",
  defaultBaseUrl: "https://api.example.com",
  defaultVideoBaseUrl: "https://api.example.com",
  apiKeyPlaceholder: "sk_your_key",
  hasEditableBaseUrl: true,
  supportsImage: true,
  supportsVideo: false,
  supportsChat: true,
}
```

然后在 `lib/providers/catalog/data/model-capabilities.json` 中添加模型能力。

如果供应商使用 OpenAI 兼容的 chat、模型列表或即时单图端点，通常不需要自定义适配分支。只有供应商媒体 API 不兼容时，才在 `lib/providers/image.ts`、`lib/providers/video.ts` 或 `lib/providers/audio.ts` 添加适配逻辑。

## RunningHub 边界

RunningHub 是任务导向的：

- Standard Model API 目标使用 `runninghub:api:/openapi/v2/...`，并通过 `/openapi/v2/query` 轮询。
- AI App 使用 `runninghub:ai-app-*:<webappId>`。
- Workflow 使用 `runninghub:workflow-*:<workflowId>`。
- Audio AI App 和 workflow 保持在 `/api/media/generate-audio-workflow`。

本项目不提供本地 ComfyUI 图编辑，也不执行本地 workflow。
