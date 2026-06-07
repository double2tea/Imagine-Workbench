import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunningHubStandardBody,
  getRunningHubStandardEndpoint,
  getRunningHubStandardModel,
  resolveRunningHubStandardModelForReferenceMedia,
  resolveRunningHubStandardModelForReferences,
} from "../lib/providers/runninghub";
import { parseRunningHubBindingsFromJsonText } from "../lib/board/runninghub-bindings";
import { ChatJsonParseError, createChatCompletionText, createChatCompletionWithTools, parseJsonObjectText } from "../lib/providers/chat";
import { generateAudio, getAudioStatus } from "../lib/providers/audio";
import { downloadRunningHubMedia, generateRunningHubMedia, getRunningHubMediaStatus } from "../lib/providers/image";
import { listProviderModels } from "../lib/providers/models";
import { fetchRunningHubAiAppSchema } from "../lib/providers/runninghub-app";
import type { ProviderConfig } from "../lib/providers/types";

const runningHubConfig: ProviderConfig = {
  provider: "runninghub",
  apiKey: "rh_test_key",
  baseUrl: "https://www.runninghub.cn",
  videoBaseUrl: "https://www.runninghub.cn",
};

test("runninghub standard image model builds documented node field body", () => {
  const model = getRunningHubStandardModel("api:/openapi/v2/rhart-image/f-2-dev/text-to-image", "image");
  assert.ok(model);

  assert.equal(getRunningHubStandardEndpoint(model), "/openapi/v2/rhart-image/f-2-dev/text-to-image");
  assert.deepEqual(
    buildRunningHubStandardBody(model, {
      prompt: "a cinematic lion",
      imageResolution: "1280x720",
      referenceImages: [],
    }),
    {
      "12##text": "a cinematic lion",
      "30##value": 1280,
      "29##value": 720,
      "41##select": "1",
      "43##file_type": "PNG",
    },
  );
});

test("runninghub standard video model validates duration", () => {
  const model = getRunningHubStandardModel("api:/openapi/v2/minimax/hailuo-02/standard", "video");
  assert.ok(model);

  assert.deepEqual(
    buildRunningHubStandardBody(model, {
      prompt: "waterfall camera pan",
      durationSeconds: "10",
      referenceImages: [],
    }),
    {
      prompt: "waterfall camera pan",
      enablePromptExpansion: true,
      duration: "10",
    },
  );

  assert.throws(
    () =>
      buildRunningHubStandardBody(model, {
        prompt: "waterfall camera pan",
        durationSeconds: "12",
        referenceImages: [],
      }),
    /duration must be 6 or 10 seconds/,
  );
});

test("runninghub standard image-to-image models use uploaded reference urls", () => {
  const seedream = getRunningHubStandardModel("api:/openapi/v2/seedream-v5-lite/image-to-image", "image");
  const grok = getRunningHubStandardModel("api:/openapi/v2/rhart-image-g/image-to-image", "image");
  assert.ok(seedream);
  assert.ok(grok);

  assert.deepEqual(
    buildRunningHubStandardBody(seedream, {
      prompt: "edit this image",
      imageResolution: "1024x1024",
      referenceImages: [{ dataUri: "data:image/png;base64,abc" }],
      referenceUrls: ["https://runninghub.example/input.png"],
    }),
    {
      prompt: "edit this image",
      width: 1024,
      height: 1024,
      sequentialImageGeneration: "disabled",
      maxImages: 1,
      imageUrls: ["https://runninghub.example/input.png"],
    },
  );

  assert.deepEqual(
    buildRunningHubStandardBody(grok, {
      prompt: "polish this sketch",
      referenceImages: [{ dataUri: "data:image/png;base64,abc" }],
      referenceUrls: ["https://runninghub.example/sketch.png"],
    }),
    {
      model: "g-4.2",
      prompt: "polish this sketch",
      imageUrl: "https://runninghub.example/sketch.png",
    },
  );
});

test("runninghub standard reference video model maps first and last frame urls", () => {
  const model = getRunningHubStandardModel("api:/openapi/v2/minimax/hailuo-02/i2v-standard", "video");
  assert.ok(model);

  assert.deepEqual(
    buildRunningHubStandardBody(model, {
      prompt: "animate between frames",
      durationSeconds: "6",
      referenceImages: [
        { dataUri: "data:image/png;base64,first" },
        { dataUri: "data:image/png;base64,last" },
      ],
      referenceUrls: ["https://runninghub.example/first.png", "https://runninghub.example/last.png"],
    }),
    {
      prompt: "animate between frames",
      enablePromptExpansion: true,
      duration: "6",
      firstImageUrl: "https://runninghub.example/first.png",
      lastImageUrl: "https://runninghub.example/last.png",
    },
  );
});

test("runninghub seedance text video maps ratio resolution and duration", () => {
  const model = getRunningHubStandardModel("api:/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video", "video");
  assert.ok(model);

  assert.deepEqual(
    buildRunningHubStandardBody(model, {
      prompt: "fast cinematic scene",
      aspectRatio: "9:16",
      resolutionName: "720p",
      durationSeconds: "15",
      referenceImages: [],
    }),
    {
      prompt: "fast cinematic scene",
      resolution: "720p",
      duration: "15",
      generateAudio: true,
      ratio: "9:16",
      returnLastFrame: false,
      seed: -1,
    },
  );
});

test("runninghub seedance 1.5 text video uses documented aspectRatio field", () => {
  const model = getRunningHubStandardModel("api:/openapi/v2/seedance-v1.5-pro/text-to-video", "video");
  assert.ok(model);

  assert.deepEqual(
    buildRunningHubStandardBody(model, {
      prompt: "cinematic detective",
      aspectRatio: "3:4",
      resolutionName: "720p",
      durationSeconds: "5",
      referenceImages: [],
    }),
    {
      prompt: "cinematic detective",
      resolution: "720p",
      duration: "5",
      aspectRatio: "3:4",
      generateAudio: "true",
      cameraFixed: "false",
    },
  );
});

test("runninghub seedance 2.0 image and multimodal videos map uploaded image urls", () => {
  const fastAuto = getRunningHubStandardModel("api:/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video", "video");
  const i2v = getRunningHubStandardModel("api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video", "video");
  const fastMultimodal = getRunningHubStandardModel(
    "api:/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video",
    "video",
  );
  const multimodal = getRunningHubStandardModel(
    "api:/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
    "video",
  );
  assert.ok(fastAuto);
  assert.ok(i2v);
  assert.ok(fastMultimodal);
  assert.ok(multimodal);
  assert.equal(resolveRunningHubStandardModelForReferences(fastAuto, 1).model, i2v.model);
  assert.equal(resolveRunningHubStandardModelForReferenceMedia(fastAuto, [{ type: "image" }], "reference").model, fastMultimodal.model);
  assert.equal(resolveRunningHubStandardModelForReferenceMedia(fastAuto, [{ type: "image" }], "firstLast").model, i2v.model);
  assert.equal(resolveRunningHubStandardModelForReferenceMedia(fastAuto, [{ type: "audio" }]).model, fastMultimodal.model);

  assert.deepEqual(
    buildRunningHubStandardBody(i2v, {
      prompt: "animate start and end",
      aspectRatio: "auto",
      resolutionName: "720p",
      durationSeconds: "12",
      referenceImages: [
        { dataUri: "data:image/png;base64,first" },
        { dataUri: "data:image/png;base64,last" },
      ],
      referenceUrls: ["https://runninghub.example/first.png", "https://runninghub.example/last.png"],
    }),
    {
      prompt: "animate start and end",
      resolution: "720p",
      duration: "12",
      ratio: "adaptive",
      firstFrameUrl: "https://runninghub.example/first.png",
      lastFrameUrl: "https://runninghub.example/last.png",
      generateAudio: true,
      realPersonMode: true,
      conversionSlots: ["all"],
      returnLastFrame: false,
      seed: -1,
    },
  );

  const multimodalInput = {
      prompt: "@Image 1 and @Image 2 move together",
      aspectRatio: "16:9",
      resolutionName: "720p",
      durationSeconds: "5",
      referenceImages: [
        { dataUri: "data:image/png;base64,a" },
        { dataUri: "data:image/png;base64,b" },
      ],
      referenceMediaUrls: {
        imageUrls: ["https://runninghub.example/a.png"],
        videoUrls: ["https://runninghub.example/motion.mp4"],
        audioUrls: ["https://runninghub.example/voice.mp3"],
      },
    };
  const multimodalBody = {
      prompt: "@Image 1 and @Image 2 move together",
      resolution: "720p",
      duration: "5",
      ratio: "16:9",
      imageUrls: ["https://runninghub.example/a.png"],
      videoUrls: ["https://runninghub.example/motion.mp4"],
      audioUrls: ["https://runninghub.example/voice.mp3"],
      generateAudio: true,
      realPersonMode: true,
      conversionSlots: ["all"],
      returnLastFrame: false,
      seed: -1,
    };

  assert.deepEqual(buildRunningHubStandardBody(fastMultimodal, multimodalInput), multimodalBody);
  assert.deepEqual(buildRunningHubStandardBody(multimodal, multimodalInput), multimodalBody);
});

test("runninghub omni flash video edit maps image and video references", () => {
  const model = getRunningHubStandardModel("api:/openapi/v2/gemini-omni-flash/video-edit", "video");
  assert.ok(model);

  assert.deepEqual(
    buildRunningHubStandardBody(model, {
      prompt: "cat copies the reference motion",
      aspectRatio: "16:9",
      resolutionName: "720p",
      durationSeconds: "6",
      referenceImages: [{ dataUri: "data:image/png;base64,cat" }],
      referenceMediaUrls: {
        imageUrls: ["https://runninghub.example/cat.png"],
        videoUrls: ["https://runninghub.example/motion.mp4"],
        audioUrls: [],
      },
    }),
    {
      prompt: "cat copies the reference motion",
      resolution: "720p",
      duration: "6",
      aspectRatio: "16:9",
      imageUrls: ["https://runninghub.example/cat.png"],
      videoUrl: "https://runninghub.example/motion.mp4",
    },
  );
});

test("runninghub omni flash video models map resolution duration and references", () => {
  const textVideo = getRunningHubStandardModel("api:/openapi/v2/gemini-omni-flash/text-to-video", "video");
  const imageVideo = getRunningHubStandardModel("api:/openapi/v2/gemini-omni-flash/image-to-video", "video");
  assert.ok(textVideo);
  assert.ok(imageVideo);

  assert.deepEqual(
    buildRunningHubStandardBody(textVideo, {
      prompt: "sunset ocean",
      aspectRatio: "16:9",
      resolutionName: "1080p",
      durationSeconds: "8",
      referenceImages: [],
    }),
    {
      prompt: "sunset ocean",
      resolution: "1080p",
      duration: "8",
      aspectRatio: "16:9",
    },
  );

  assert.deepEqual(
    buildRunningHubStandardBody(imageVideo, {
      prompt: "make it cinematic",
      aspectRatio: "9:16",
      resolutionName: "4k",
      durationSeconds: "10",
      referenceImages: [{ dataUri: "data:image/png;base64,input" }],
      referenceUrls: ["https://runninghub.example/input.png"],
    }),
    {
      prompt: "make it cinematic",
      resolution: "4k",
      duration: "10",
      aspectRatio: "9:16",
      imageUrls: ["https://runninghub.example/input.png"],
    },
  );
});

test("runninghub veo 3.1 and gpt image 2 variants map documented fields", () => {
  const veo = getRunningHubStandardModel("api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video", "video");
  const gptImage = getRunningHubStandardModel("api:/openapi/v2/rhart-image-g-2-official/text-to-image", "image");
  assert.ok(veo);
  assert.ok(gptImage);

  assert.deepEqual(
    buildRunningHubStandardBody(veo, {
      prompt: "dialogue scene",
      aspectRatio: "9:16",
      resolutionName: "720p",
      durationSeconds: "8",
      referenceImages: [],
    }),
    {
      prompt: "dialogue scene",
      resolution: "720p",
      duration: "8",
      aspectRatio: "9:16",
      generateAudio: true,
    },
  );

  assert.deepEqual(
    buildRunningHubStandardBody(resolveRunningHubStandardModelForReferences(gptImage, 0), {
      prompt: "new product photo",
      aspectRatio: "16:9",
      referenceImages: [],
    }),
    {
      prompt: "new product photo",
      aspectRatio: "16:9",
      resolution: "2k",
      quality: "medium",
    },
  );

  assert.deepEqual(
    buildRunningHubStandardBody(resolveRunningHubStandardModelForReferences(gptImage, 1), {
      prompt: "edit product photo",
      aspectRatio: "16:9",
      imageResolution: "3840x2160",
      imageQuality: "high",
      referenceImages: [{ dataUri: "data:image/png;base64,input" }],
      referenceUrls: ["https://runninghub.example/product.png"],
    }),
    {
      prompt: "edit product photo",
      aspectRatio: "16:9",
      resolution: "4k",
      quality: "high",
      imageUrls: ["https://runninghub.example/product.png"],
    },
  );
});

test("runninghub gemini 3 flash and pro image models map documented fields", () => {
  const flashOfficial = getRunningHubStandardModel("api:/openapi/v2/rhart-image-n-g31-flash-official/text-to-image", "image");
  const proUltra = getRunningHubStandardModel("api:/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra", "image");
  assert.ok(flashOfficial);
  assert.ok(proUltra);

  assert.deepEqual(
    buildRunningHubStandardBody(resolveRunningHubStandardModelForReferences(flashOfficial, 1), {
      prompt: "turn sketch into neon manga",
      aspectRatio: "1:8",
      imageResolution: "4k",
      referenceImages: [{ dataUri: "data:image/png;base64,input" }],
      referenceUrls: ["https://runninghub.example/sketch.png"],
    }),
    {
      prompt: "turn sketch into neon manga",
      aspectRatio: "1:8",
      resolution: "4k",
      imageUrls: ["https://runninghub.example/sketch.png"],
    },
  );

  assert.deepEqual(
    buildRunningHubStandardBody(resolveRunningHubStandardModelForReferences(proUltra, 0), {
      prompt: "ultra detailed product photo",
      aspectRatio: "3:4",
      imageResolution: "8k",
      referenceImages: [],
    }),
    {
      prompt: "ultra detailed product photo",
      aspectRatio: "3:4",
      resolution: "8k",
    },
  );
});

test("runninghub veo 3.1 auto routes non-text variants", () => {
  const fastChannel = getRunningHubStandardModel("api:/openapi/v2/rhart-video-v3.1-fast/text-to-video", "video");
  const fastOfficial = getRunningHubStandardModel("api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video", "video");
  const liteOfficial = getRunningHubStandardModel("api:/openapi/v2/rhart-video-v3.1-lite-official/text-to-video", "video");
  assert.ok(fastChannel);
  assert.ok(fastOfficial);
  assert.ok(liteOfficial);

  assert.equal(
    getRunningHubStandardEndpoint(resolveRunningHubStandardModelForReferences(fastChannel, 1)),
    "/openapi/v2/rhart-video-v3.1-fast/image-to-video",
  );
  assert.deepEqual(
    buildRunningHubStandardBody(resolveRunningHubStandardModelForReferences(fastChannel, 2), {
        prompt: "start to end",
        aspectRatio: "16:9",
        resolutionName: "720p",
        durationSeconds: "8",
      referenceImages: [],
      referenceMediaUrls: {
        imageUrls: ["https://runninghub.example/start.png", "https://runninghub.example/end.png"],
        videoUrls: [],
        audioUrls: [],
      },
    }),
    {
        prompt: "start to end",
        resolution: "720p",
        duration: "8",
      aspectRatio: "16:9",
      firstFrameUrl: "https://runninghub.example/start.png",
      lastFrameUrl: "https://runninghub.example/end.png",
    },
  );
  assert.deepEqual(
    buildRunningHubStandardBody(resolveRunningHubStandardModelForReferences(fastOfficial, 3), {
      prompt: "three references",
      aspectRatio: "9:16",
      resolutionName: "1080p",
      referenceImages: [],
      referenceMediaUrls: {
        imageUrls: [
          "https://runninghub.example/one.png",
          "https://runninghub.example/two.png",
          "https://runninghub.example/three.png",
        ],
        videoUrls: [],
        audioUrls: [],
      },
    }),
    {
      prompt: "three references",
      resolution: "1080p",
      aspectRatio: "9:16",
      imageUrls: [
        "https://runninghub.example/one.png",
        "https://runninghub.example/two.png",
        "https://runninghub.example/three.png",
      ],
      generateAudio: false,
    },
  );
  assert.deepEqual(
    buildRunningHubStandardBody(resolveRunningHubStandardModelForReferences(liteOfficial, 2), {
      prompt: "lite start end",
      aspectRatio: "16:9",
      resolutionName: "720p",
      durationSeconds: "4",
      referenceImages: [],
      referenceMediaUrls: {
        imageUrls: ["https://runninghub.example/start.png", "https://runninghub.example/end.png"],
        videoUrls: [],
        audioUrls: [],
      },
    }),
      {
        prompt: "lite start end",
        resolution: "720p",
        aspectRatio: "16:9",
        firstImageUrl: "https://runninghub.example/start.png",
      lastImageUrl: "https://runninghub.example/end.png",
    },
  );
});

test("runninghub advertised first-last modes route to first-last request shapes", () => {
  const seedance = getRunningHubStandardModel("api:/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video", "video");
  const veoLite = getRunningHubStandardModel("api:/openapi/v2/rhart-video-v3.1-lite-official/text-to-video", "video");
  const veoOfficial = getRunningHubStandardModel("api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video", "video");
  const omniFlash = getRunningHubStandardModel("api:/openapi/v2/gemini-omni-flash/text-to-video", "video");
  assert.ok(seedance);
  assert.ok(veoLite);
  assert.ok(veoOfficial);
  assert.ok(omniFlash);

  assert.deepEqual(veoOfficial.videoReferenceModes, ["reference", "firstLast"]);
  assert.deepEqual(omniFlash.videoReferenceModes, undefined);

  assert.equal(resolveRunningHubStandardModelForReferenceMedia(seedance, [{ type: "image" }, { type: "image" }], "firstLast").model, "api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video");
  assert.equal(resolveRunningHubStandardModelForReferenceMedia(veoLite, [{ type: "image" }, { type: "image" }], "firstLast").model, "api:/openapi/v2/rhart-video-v3.1-lite-official/start-end-to-video");
  assert.equal(resolveRunningHubStandardModelForReferenceMedia(veoOfficial, [{ type: "image" }, { type: "image" }], "firstLast").model, "api:/openapi/v2/rhart-video-v3.1-fast-official/image-to-video");
});

test("runninghub youchuan image models map version-specific defaults", () => {
  const v7 = getRunningHubStandardModel("api:/openapi/v2/youchuan/text-to-image-v7", "image");
  const v81 = getRunningHubStandardModel("api:/openapi/v2/youchuan/text-to-image-v81", "image");
  assert.ok(v7);
  assert.ok(v81);

  assert.deepEqual(
    buildRunningHubStandardBody(v7, {
      prompt: "forest deer",
      referenceImages: [],
    }),
    {
      prompt: "forest deer",
      chaos: 0,
      quality: "1",
      stylize: 0,
      weird: 0,
      raw: false,
      iw: 1,
      sw: 100,
      sv: 4,
      ow: 100,
      tile: false,
    },
  );

  assert.deepEqual(
    buildRunningHubStandardBody(v81, {
      prompt: "coffee poster",
      referenceImages: [],
    }),
    {
      prompt: "coffee poster",
      chaos: 0,
      quality: "1",
      stylize: 0,
      raw: false,
      iw: 1,
      sw: 100,
      sv: 6,
      hd: false,
    },
  );
});

test("runninghub ai app tasks use task output polling endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/task/openapi/ai-app/run")) {
      return Response.json({ code: 0, msg: "success", data: { taskId: "task_123", taskStatus: "RUNNING" } });
    }
    if (url.endsWith("/task/openapi/outputs")) {
      return Response.json({
        code: 0,
        msg: "success",
        data: [{ fileUrl: "https://runninghub.example/output.png", fileType: "png" }],
      });
    }
    return Response.json({ code: 999, msg: "unexpected endpoint" }, { status: 500 });
  };

  try {
    const created = await generateRunningHubMedia(
      runningHubConfig,
      {
        prompt: "ai app prompt",
        model: "ai-app-image:1877265245566922753",
        aspectRatio: "1:1",
        imageResolution: "1024x1024",
        referenceImages: [],
      },
      "image",
    );
    assert.equal(created.operationName, "runninghub:image:task-output:task_123");

    const status = await getRunningHubMediaStatus(runningHubConfig, "image", "task-output:task_123");
    assert.deepEqual(status, {
      done: true,
      mediaType: "image",
      progress: 100,
      status: "success",
      url: "https://runninghub.example/output.png",
    });
    assert.equal(calls[0]?.url, "https://www.runninghub.cn/task/openapi/ai-app/run");
    assert.deepEqual(calls[0]?.body, {
      apiKey: "rh_test_key",
      webappId: "1877265245566922753",
    });
    assert.equal(calls[1]?.url, "https://www.runninghub.cn/task/openapi/outputs");
    assert.deepEqual(calls[1]?.body, { apiKey: "rh_test_key", taskId: "task_123" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub ai app audio tasks use task output polling endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/task/openapi/ai-app/run")) {
      return Response.json({ code: 0, msg: "success", data: { taskId: "audio_task_123", taskStatus: "RUNNING" } });
    }
    return Response.json({ code: 999, msg: "unexpected endpoint" }, { status: 500 });
  };

  try {
    const created = await generateRunningHubMedia(
      runningHubConfig,
      {
        prompt: "audio app prompt",
        model: "ai-app-audio:2061323800511344642",
        aspectRatio: "auto",
        imageResolution: "auto",
        referenceImages: [],
      },
      "audio",
    );
    assert.equal(created.operationName, "runninghub:audio:task-output:audio_task_123");
    assert.deepEqual(calls[0]?.body, {
      apiKey: "rh_test_key",
      webappId: "2061323800511344642",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generic audio adapter routes runninghub ai app audio tasks", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = input.toString();
    if (url.endsWith("/task/openapi/ai-app/run")) {
      return Response.json({ code: 0, msg: "success", data: { taskId: "generic_audio_123" } });
    }
    return Response.json({ code: 999, msg: "unexpected endpoint" }, { status: 500 });
  };

  try {
    const created = await generateAudio(runningHubConfig, {
      prompt: "generic audio",
      model: "ai-app-audio:2061323800511344642",
      referenceMedia: [],
    });
    assert.equal(created.operationName, "runninghub:audio:task-output:generic_audio_123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub ai app tasks map custom nodeInfoList bindings", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    if (url.endsWith("/openapi/v2/media/upload/binary")) {
      calls.push({ url, body: init?.body instanceof FormData ? "form-data" : init?.body });
      return Response.json({
        code: 200,
        message: "success",
        data: {
          download_url: "https://runninghub.example/uploaded.png",
          filename: "api/uploaded.png",
        },
      });
    }
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/task/openapi/ai-app/run")) {
      return Response.json({ code: 0, msg: "success", data: { taskId: "task_custom", taskStatus: "RUNNING" } });
    }
    return Response.json({ code: 999, msg: "unexpected endpoint" }, { status: 500 });
  };

  try {
    const created = await generateRunningHubMedia(
      runningHubConfig,
      {
        prompt: "node prompt",
        model: "ai-app-image:1877265245566922753",
        aspectRatio: "auto",
        imageResolution: "auto",
        referenceImages: [{ dataUri: "data:image/png;base64,AA==" }],
        runningHubAccessPassword: "secret",
        runningHubNodeInfoList: [
          { nodeId: "122", fieldName: "prompt", source: "prompt", deliveryMode: "raw" },
          { nodeId: "14", fieldName: "image", source: "reference", referenceIndex: 0, referenceType: "image", deliveryMode: "url" },
          { nodeId: "15", fieldName: "optionalImage", source: "reference", referenceIndex: 4, referenceType: "image", deliveryMode: "url" },
          { nodeId: "16", fieldName: "disabled", source: "literal", value: "skip", enabled: false, deliveryMode: "raw" },
          { nodeId: "3", fieldName: "seed", source: "literal", value: "12345", valueType: "number", deliveryMode: "raw" },
          { nodeId: "4", fieldName: "randomSeed", source: "randomSeed", valueType: "number", deliveryMode: "raw" },
        ],
      },
      "image",
    );

    assert.equal(created.operationName, "runninghub:image:task-output:task_custom");
    assert.equal(calls[0]?.url, "https://www.runninghub.cn/openapi/v2/media/upload/binary");
    assert.equal(calls[1]?.url, "https://www.runninghub.cn/task/openapi/ai-app/run");
    const body = calls[1]?.body;
    assert.equal(typeof body, "object");
    assert.notEqual(body, null);
    const nodeInfoList = body && typeof body === "object" && "nodeInfoList" in body && Array.isArray(body.nodeInfoList)
      ? body.nodeInfoList as Array<{ fieldValue: unknown }>
      : [];
    assert.equal(typeof nodeInfoList[3]?.fieldValue, "number");
    assert.deepEqual(calls[1]?.body, {
      apiKey: "rh_test_key",
      webappId: "1877265245566922753",
      accessPassword: "secret",
      nodeInfoList: [
        { nodeId: "122", fieldName: "prompt", fieldValue: "node prompt" },
        { nodeId: "14", fieldName: "image", fieldValue: "https://runninghub.example/uploaded.png" },
        { nodeId: "3", fieldName: "seed", fieldValue: 12345 },
        { nodeId: "4", fieldName: "randomSeed", fieldValue: nodeInfoList[3]?.fieldValue },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub ai app schema reads official apiCallDemo curl nodeInfoList", async () => {
  const originalFetch = globalThis.fetch;
  const demoCurl = `curl --location 'https://www.runninghub.cn/task/openapi/ai-app/run' \\
--header 'Content-Type: application/json' \\
--data '{
  "webappId": "2013570680079523842",
  "nodeInfoList": [
    {
      "nodeId": "173",
      "nodeName": "上传手稿",
      "fieldName": "image",
      "fieldValue": "api/example.png",
      "fieldType": "IMAGE",
      "description": "手稿图片"
    },
    {
      "nodeId": "221",
      "nodeName": "模型参数",
      "fieldName": "ratio",
      "fieldValue": "3:4",
      "fieldType": "LIST",
      "fieldData": "[{\\"index\\":\\"1:1\\",\\"name\\":\\"1:1\\"},{\\"index\\":\\"3:4\\",\\"name\\":\\"3:4\\"}]",
      "description": "输出比例"
    }
  ]
}'`;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    assert.equal(url, "https://www.runninghub.cn/api/webapp/apiCallDemo?apiKey=rh_test_key&webappId=2013570680079523842");
    assert.equal(init?.headers && typeof init.headers === "object" && "Authorization" in init.headers, true);
    return Response.json({ code: 0, data: { curl: demoCurl } });
  };

  try {
    const schema = await fetchRunningHubAiAppSchema(runningHubConfig, "2013570680079523842");
    assert.equal(schema.webappId, "2013570680079523842");
    assert.equal(schema.nodeInfoList.length, 2);
    assert.equal(schema.nodeInfoList[0]?.fieldType, "IMAGE");

    const bindings = parseRunningHubBindingsFromJsonText(JSON.stringify({ nodeInfoList: schema.nodeInfoList }));
    assert.equal(bindings[0]?.source, "reference");
    assert.equal(bindings[0]?.deliveryMode, "fileName");
    assert.equal(bindings[0]?.required, true);
    assert.equal(bindings[1]?.source, "literal");
    assert.deepEqual(bindings[1]?.options?.map(option => option.value), ["1:1", "3:4"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub task creation reads documented and aliased task id fields", async () => {
  const originalFetch = globalThis.fetch;
  const responses: Array<{ response: unknown; expected: string }> = [
    { response: { taskId: "root_task" }, expected: "root_task" },
    { response: { code: 0, data: { task_id: "data_task" } }, expected: "data_task" },
    { response: { code: 0, data: "string_task" }, expected: "string_task" },
    { response: { code: 0, data: { task: { id: 998877 } } }, expected: "998877" },
    { response: { code: 0, result: { taskID: "result_task" } }, expected: "result_task" },
  ];

  try {
    for (const item of responses) {
      globalThis.fetch = async (): Promise<Response> => Response.json(item.response);

      const created = await generateRunningHubMedia(
        runningHubConfig,
        {
          prompt: "task id shapes",
          model: "api:/openapi/v2/seedream-v5-lite/text-to-image",
          aspectRatio: "1:1",
          imageResolution: "1024x1024",
          referenceImages: [],
        },
        "image",
      );

      assert.equal(created.operationName, `runninghub:image:${item.expected}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub task output polling handles failed output objects", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => Response.json({
    code: 0,
    msg: "success",
    data: { failedReason: "node failed" },
  });

  try {
    const status = await getRunningHubMediaStatus(runningHubConfig, "image", "task-output:failed_123");
    assert.deepEqual(status, {
      done: true,
      mediaType: "image",
      progress: 100,
      status: "failed",
      errorMessage: "node failed",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub polling selects output url by requested media type", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => Response.json({
    code: 0,
    msg: "success",
    data: [
      { fileUrl: "https://runninghub.example/thumb.png", fileType: "png" },
      { fileUrl: "https://runninghub.example/output.mp4", fileType: "mp4" },
    ],
  });

  try {
    const status = await getRunningHubMediaStatus(runningHubConfig, "video", "task-output:video_123");
    assert.deepEqual(status, {
      done: true,
      mediaType: "video",
      progress: 100,
      status: "success",
      url: "https://runninghub.example/output.mp4",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub polling selects audio output url by requested media type", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => Response.json({
    code: 0,
    msg: "success",
    data: [
      { fileUrl: "https://runninghub.example/thumb.png", fileType: "png" },
      { fileUrl: "https://runninghub.example/output.mp4", fileType: "mp4" },
      { fileUrl: "https://runninghub.example/output.wav", fileType: "wav" },
    ],
  });

  try {
    const status = await getRunningHubMediaStatus(runningHubConfig, "audio", "task-output:audio_123");
    assert.deepEqual(status, {
      done: true,
      mediaType: "audio",
      progress: 100,
      status: "success",
      url: "https://runninghub.example/output.wav",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub audio download preserves upstream audio extension", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = input.toString();
    if (url.endsWith("/task/openapi/outputs")) {
      return Response.json({
        code: 0,
        msg: "success",
        data: [{ fileUrl: "https://runninghub.example/output.wav", fileType: "wav" }],
      });
    }
    if (url === "https://runninghub.example/output.wav") {
      return new Response("audio-data", { headers: { "Content-Type": "audio/wav" } });
    }
    return Response.json({ code: 999, msg: "unexpected endpoint" }, { status: 500 });
  };

  try {
    const response = await downloadRunningHubMedia(runningHubConfig, "audio", "task-output:audio_123");
    assert.equal(response.headers.get("Content-Type"), "audio/wav");
    assert.match(response.headers.get("Content-Disposition") ?? "", /^inline; filename="audio_\d+\.wav"$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generic audio status uses runninghub task output polling", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => Response.json({
    code: 0,
    msg: "success",
    data: [{ fileUrl: "https://runninghub.example/output.mp3", fileType: "mp3" }],
  });

  try {
    const status = await getAudioStatus(runningHubConfig, "task-output:audio_456");
    assert.deepEqual(status, {
      done: true,
      mediaType: "audio",
      progress: 100,
      status: "success",
      url: "https://runninghub.example/output.mp3",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub task creation error includes response summary when id is absent", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => Response.json({ code: 0, data: { status: "created" } });

  try {
    await assert.rejects(
      () =>
        generateRunningHubMedia(
          runningHubConfig,
          {
            prompt: "missing task id",
            model: "api:/openapi/v2/seedream-v5-lite/text-to-image",
            aspectRatio: "1:1",
            imageResolution: "1024x1024",
            referenceImages: [],
          },
          "image",
        ),
      /RunningHub response did not include a taskId: .*"status":"created"/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub task creation surfaces standard model access errors before task id parsing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => Response.json({
    taskId: "",
    status: "",
    errorCode: "1014",
    errorMessage: "Access Denied: Standard Model API is restricted to Enterprise-Shared API Keys only.|访问被拒绝：标准模型API仅限企业级-共享API Key调用。",
    results: null,
  });

  try {
    await assert.rejects(
      () =>
        generateRunningHubMedia(
          runningHubConfig,
          {
            prompt: "enterprise only",
            model: "api:/openapi/v2/seedream-v5-lite/text-to-image",
            aspectRatio: "1:1",
            imageResolution: "1024x1024",
            referenceImages: [],
          },
          "image",
        ),
      /Access Denied: Standard Model API is restricted to Enterprise-Shared API Keys only.*errorCode 1014/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub standard tasks keep v2 query polling endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/openapi/v2/query")) {
      return Response.json({
        taskId: "standard_123",
        status: "SUCCESS",
        errorCode: "",
        errorMessage: "",
        results: [{ url: "https://runninghub.example/output.mp4", outputType: "mp4" }],
      });
    }
    return Response.json({ code: 999, msg: "unexpected endpoint" }, { status: 500 });
  };

  try {
    const status = await getRunningHubMediaStatus(runningHubConfig, "video", "standard_123");
    assert.deepEqual(status, {
      done: true,
      mediaType: "video",
      progress: 100,
      status: "success",
      url: "https://runninghub.example/output.mp4",
    });
    assert.equal(calls[0]?.url, "https://www.runninghub.cn/openapi/v2/query");
    assert.deepEqual(calls[0]?.body, { taskId: "standard_123" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub model listing filters standard models by metadata kind", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(input.toString());
    return Response.json({
      data: [
        { id: "qwen/qwen3.7-max" },
        { id: "deepseek/deepseek-v4-flash" },
      ],
    });
  };

  try {
    const chatModels = await listProviderModels(runningHubConfig, "chat");
    const allModels = await listProviderModels(runningHubConfig, "all");
    const imageModels = await listProviderModels(runningHubConfig, "image");
    const videoModels = await listProviderModels(runningHubConfig, "video");
    const audioModels = await listProviderModels(runningHubConfig, "audio");

    assert.equal(calls[0], "https://llm.runninghub.cn/v1/models");
    assert.equal(chatModels.some(option => option.value === "runninghub:qwen/qwen3.7-max"), true);
    assert.equal(allModels.some(option => option.value === "runninghub:qwen/qwen3.7-max"), true);
    assert.equal(allModels.some(option => option.value === "runninghub:ai-app-audio:<webappId>"), true);
    assert.equal(audioModels.some(option => option.value === "runninghub:ai-app-audio:<webappId>"), true);
    assert.equal(
      imageModels.some(option => option.value === "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video"),
      false,
    );
    assert.equal(
      imageModels.some(option => option.value === "runninghub:api:/openapi/v2/seedream-v5-lite/image-to-image"),
      false,
    );
    assert.equal(
      videoModels.some(option => option.value === "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video"),
      false,
    );
    assert.equal(
      videoModels.some(option => option.value === "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video"),
      false,
    );
    assert.equal(
      videoModels.some(option => option.value === "runninghub:api:/openapi/v2/gemini-omni-flash/image-to-video"),
      false,
    );
    assert.equal(
      videoModels.some(option => option.value === "runninghub:api:/openapi/v2/rhart-image-g-2/image-to-image"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub chat completions use llm endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input.toString(), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ choices: [{ message: { content: "hello" } }] });
  };

  try {
    const text = await createChatCompletionText(
      runningHubConfig,
      "qwen/qwen3.7-max",
      [{ role: "user", content: "Hi there!" }],
      1,
    );

    assert.equal(text, "hello");
    assert.equal(calls[0]?.url, "https://llm.runninghub.cn/v1/chat/completions");
    assert.deepEqual(calls[0]?.body, {
      model: "qwen/qwen3.7-max",
      messages: [{ role: "user", content: "Hi there!" }],
      temperature: 1,
      stream: false,
      reasoning_effort: "none",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat completions can request json object responses", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ body: unknown }> = [];
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ choices: [{ message: { content: "{\"ok\":true}" } }] });
  };

  try {
    const response = await createChatCompletionWithTools(
      runningHubConfig,
      "qwen/qwen3.7-max",
      [{ role: "user", content: "Return JSON" }],
      [{
        type: "function",
        function: {
          name: "noop",
          description: "No operation",
          parameters: { type: "object", properties: {} },
        },
      }],
      0,
      { responseFormat: { type: "json_object" } },
    );

    assert.equal(response.choices[0]?.message.content, "{\"ok\":true}");
    assert.deepEqual(calls[0]?.body, {
      model: "qwen/qwen3.7-max",
      messages: [{ role: "user", content: "Return JSON" }],
      tools: [{
        type: "function",
        function: {
          name: "noop",
          description: "No operation",
          parameters: { type: "object", properties: {} },
        },
      }],
      tool_choice: "auto",
      temperature: 0,
      stream: false,
      response_format: { type: "json_object" },
      reasoning_effort: "none",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat json parser reports plain text as a json parse error", () => {
  assert.throws(
    () => parseJsonObjectText("plain response"),
    ChatJsonParseError,
  );
});

test("runninghub v2 query business errors fail fast", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => Response.json({ code: 800, msg: "task not found" });

  try {
    await assert.rejects(
      () => getRunningHubMediaStatus(runningHubConfig, "image", "missing_task"),
      /task not found/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runninghub custom v2 api uploads references before submit", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    calls.push({ url, body: init?.body instanceof FormData ? "form" : init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/openapi/v2/media/upload/binary")) {
      return Response.json({ code: 0, data: { download_url: "https://runninghub.example/uploaded.png" } });
    }
    if (url.endsWith("/openapi/v2/custom/image-to-image")) {
      return Response.json({ code: 0, data: { taskId: "custom_123", taskStatus: "RUNNING" } });
    }
    return Response.json({ code: 999, msg: "unexpected endpoint" }, { status: 500 });
  };

  try {
    const created = await generateRunningHubMedia(
      runningHubConfig,
      {
        prompt: "custom endpoint",
        model: "api:/openapi/v2/custom/image-to-image",
        aspectRatio: "1:1",
        imageResolution: "1024x1024",
        referenceImages: [{ dataUri: "data:image/png;base64,aW1hZ2U=" }],
      },
      "image",
    );

    assert.equal(created.operationName, "runninghub:image:custom_123");
    assert.equal(calls[0]?.url, "https://www.runninghub.cn/openapi/v2/media/upload/binary");
    assert.equal(calls[1]?.url, "https://www.runninghub.cn/openapi/v2/custom/image-to-image");
    assert.deepEqual(calls[1]?.body, {
      prompt: "custom endpoint",
      size: "1024x1024",
      image_url: "https://runninghub.example/uploaded.png",
      image_urls: ["https://runninghub.example/uploaded.png"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
