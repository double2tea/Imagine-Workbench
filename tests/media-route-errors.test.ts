import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import test, { after } from "node:test";
import { RUNNINGHUB_CONTROL_IMAGE_APP_MODEL } from "../lib/providers/runninghub";

test("media download routes return request errors for missing operation names", async () => {
  registerCompiledPathAlias();
  const { POST: postImageDownload } = await import("../app/api/media/image-download/route");
  const { POST: postAudioDownload } = await import("../app/api/media/audio-download/route");
  const { POST: postVideoDownload } = await import("../app/api/media/video-download/route");

  const imageResponse = await postImageDownload(jsonRequest({}) as Parameters<typeof postImageDownload>[0]);
  const audioResponse = await postAudioDownload(jsonRequest({}) as Parameters<typeof postAudioDownload>[0]);
  const videoResponse = await postVideoDownload(jsonRequest({}) as Parameters<typeof postVideoDownload>[0]);

  assert.equal(imageResponse.status, 400);
  assert.equal(audioResponse.status, 400);
  assert.equal(videoResponse.status, 400);
});

test("media download routes return request errors for wrong media operation type", async () => {
  registerCompiledPathAlias();
  const { POST: postImageDownload } = await import("../app/api/media/image-download/route");

  const response = await postImageDownload(jsonRequest({ operationName: "runninghub:video:task-output:123" }) as Parameters<typeof postImageDownload>[0]);

  assert.equal(response.status, 400);
  assert.match(await response.text(), /Only image operations/);
});

test("native image generation route preserves RunningHub structured provider errors", async () => {
  registerCompiledPathAlias();
  const { POST: postGenerateImage } = await import("../app/api/media/generate-image/route");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => Response.json({
    code: 1014,
    msg: "Standard Model API requires an enterprise key",
  });

  try {
    const response = await postGenerateImage(jsonRequest({
      model: "runninghub:api:/openapi/v2/seedream-v5-lite/text-to-image",
      prompt: "enterprise gated image",
      imageResolution: "1024x1024",
    }, { Authorization: "Bearer rh_key" }) as Parameters<typeof postGenerateImage>[0]);

    assert.equal(response.status, 403);
    assert.match(await response.text(), /runninghub_enterprise_key_required/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("native image generation route does not let empty nodeInfoList bypass prompt validation", async () => {
  registerCompiledPathAlias();
  const { POST: postGenerateImage } = await import("../app/api/media/generate-image/route");

  const response = await postGenerateImage(jsonRequest({
    model: "12ai:gemini-3.1-flash-image-preview",
    imageResolution: "1K",
    runningHubNodeInfoList: [],
  }, { Authorization: "Bearer test_key" }) as Parameters<typeof postGenerateImage>[0]);

  assert.equal(response.status, 400);
  assert.match(await response.text(), /Prompt is required/);
});

test("native video generation route does not let empty nodeInfoList bypass prompt validation", async () => {
  registerCompiledPathAlias();
  const { POST: postGenerateVideo } = await import("../app/api/media/generate-video/route");

  const response = await postGenerateVideo(jsonRequest({
    model: "12ai:veo_3_1-fast",
    runningHubNodeInfoList: [],
  }, { Authorization: "Bearer test_key" }) as Parameters<typeof postGenerateVideo>[0]);

  assert.equal(response.status, 400);
  assert.match(await response.text(), /Prompt is required/);
});

test("native image generation route injects registered RunningHub app bindings", async () => {
  registerCompiledPathAlias();
  const { POST: postGenerateImage } = await import("../app/api/media/generate-image/route");
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    if (url.endsWith("/openapi/v2/media/upload/binary")) {
      calls.push({ url, body: init?.body instanceof FormData ? "form-data" : init?.body });
      return Response.json({
        code: 0,
        message: "success",
        data: {
          download_url: "https://runninghub.example/uploaded.png",
          fileName: "api/uploaded.png",
        },
      });
    }
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/task/openapi/ai-app/run")) {
      return Response.json({ code: 0, msg: "success", data: { taskId: "route_control", taskStatus: "RUNNING" } });
    }
    return Response.json({ code: 999, msg: "unexpected endpoint" }, { status: 500 });
  };

  try {
    const response = await postGenerateImage(jsonRequest({
      model: `runninghub:${RUNNINGHUB_CONTROL_IMAGE_APP_MODEL}`,
      imageResolution: "auto",
      referenceImages: ["data:image/png;base64,AA=="],
    }, { Authorization: "Bearer rh_key" }) as Parameters<typeof postGenerateImage>[0]);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /runninghub:image:task-output:route_control/);
    assert.equal(calls[0]?.url, "https://www.runninghub.cn/openapi/v2/media/upload/binary");
    assert.deepEqual(calls[1]?.body, {
      apiKey: "rh_key",
      webappId: "1961345119528140802",
      nodeInfoList: [{ nodeId: "252", fieldName: "image", fieldValue: "api/uploaded.png" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://local.test/api/media/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: unknown,
) => string;

let aliasRegistered = false;
let restoreCompiledPathAlias: (() => void) | undefined;

after(() => {
  restoreCompiledPathAlias?.();
});

function registerCompiledPathAlias(): void {
  if (aliasRegistered) return;
  aliasRegistered = true;

  const moduleWithResolver = Module as unknown as {
    _resolveFilename: ResolveFilename;
  };
  const originalResolveFilename = moduleWithResolver._resolveFilename;
  const compiledRoot = path.resolve(__dirname, "..");

  moduleWithResolver._resolveFilename = (request, parent, isMain, options) => {
    if (request.startsWith("@/")) {
      return path.join(compiledRoot, `${request.slice(2)}.js`);
    }
    return originalResolveFilename(request, parent, isMain, options);
  };
  restoreCompiledPathAlias = () => {
    moduleWithResolver._resolveFilename = originalResolveFilename;
    aliasRegistered = false;
    restoreCompiledPathAlias = undefined;
  };
}
