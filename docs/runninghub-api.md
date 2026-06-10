# RunningHub API

Reviewed against RunningHub API docs on 2026-06-10.

Imagine Workbench treats RunningHub as a task-oriented provider, not as a single OpenAI-compatible media provider. RunningHub LLM chat can use OpenAI-compatible endpoints, while image, video, audio AI Apps, workflows, and Standard Model APIs remain Workbench-native async media operations.

## Route Layout

### LLM Chat

- Workbench route: `POST /api/chat/completions` or `POST /v1/chat/completions`
- Model IDs: `runninghub:<llm-model-id>`, for example `runninghub:qwen/qwen3.7-max`
- Upstream host: `https://llm.runninghub.cn/v1/chat/completions`
- Upstream model list: `https://llm.runninghub.cn/v1/models`

### Standard Model API

- Workbench model IDs: `runninghub:api:/openapi/v2/<provider>/<model>/<operation>`
- Upstream submit endpoint: `POST {RUNNINGHUB_BASE_URL}/openapi/v2/...`
- Upstream status endpoint: `POST {RUNNINGHUB_BASE_URL}/openapi/v2/query`
- Workbench route: `POST /api/media/generate-image` or `POST /api/media/generate-video`

Standard Model endpoints are async. They must not be wrapped as synchronous `/v1/images/generations` responses.

### AI App / Workflow

- Image AI App: `runninghub:ai-app-image:<webappId>`
- Video AI App: `runninghub:ai-app-video:<webappId>`
- Audio AI App: `runninghub:ai-app-audio:<webappId>`
- Image workflow: `runninghub:workflow-image:<workflowId>`
- Video workflow: `runninghub:workflow-video:<workflowId>`
- Audio workflow: `runninghub:workflow-audio:<workflowId>`

AI Apps submit to `/task/openapi/ai-app/run`. Workflows submit to `/task/openapi/create`. Both poll through `/task/openapi/outputs`.

## Audio Boundary

Some RunningHub AI Apps and workflows generate audio. Use:

```text
POST /api/media/generate-audio-workflow
```

with `runninghub:ai-app-audio:*` or `runninghub:workflow-audio:*`.

Do not expose these targets through generic `AUDIO_MODEL_OPTIONS` or `/api/media/generate-audio`. They are workflow execution targets with `nodeInfoList` bindings, not direct audio-operation models like MiMo TTS or ASR.

## Upload Boundary

RunningHub upload responses expose two different values:

- `download_url`: pass to Standard Model API fields such as `imageUrls`, `videoUrls`, or `audioUrls`.
- `fileName`: pass into ComfyUI / AI App / Workflow node fields such as `LoadImage`, `LoadAudio`, or `LoadVideo`.

Do not collapse these into one generic URL. Uploaded links are temporary and RunningHub documents them as inputs for task execution, not long-term asset storage.

## Errors

RunningHub provider errors should preserve structured meaning:

- Invalid parameters or nodeInfoList mismatch -> `400`
- API key missing/invalid -> `401`
- Enterprise-only Standard Model API -> `403`
- Insufficient funds -> `402`
- Task/workflow/app not found -> `404`
- Queue or request rate limit -> `429`
- Capacity, queued, busy, or timeout states -> `503`
- Unknown provider failure -> `502`

Routes should return these through `apiErrorResponse()` rather than flattening every RunningHub failure into `500`.

## Not Included In `/v1/*`

The OpenAI-compatible gateway intentionally excludes:

- RunningHub Standard Model async image/video endpoints.
- RunningHub AI App / Workflow image, video, or audio execution.
- RunningHub public resource/model directory.
- RunningHub price preview.
- RunningHub account and API key management.

Those are provider-native capabilities and should stay in Workbench `/api/media/*` or dedicated RunningHub configuration routes.
