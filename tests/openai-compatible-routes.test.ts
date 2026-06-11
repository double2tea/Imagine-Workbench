import assert from "node:assert/strict";
import test from "node:test";
import { GET as listOpenAiModels } from "../lib/api/openai-models";

test("OpenAI-compatible model list returns provider-prefixed model ids", async () => {
  const response = await listOpenAiModels(new Request("http://local.test/v1/models?provider=mimo&kind=chat", {
    headers: { Authorization: "Bearer mimo_key" },
  }));

  assert.equal(response.status, 200);
  const body = await response.json() as {
    object?: unknown;
    data?: Array<{ id?: unknown; object?: unknown; owned_by?: unknown }>;
  };
  assert.equal(body.object, "list");
  assert.ok(body.data?.some(model => (
    model.id === "mimo:mimo-v2.5" &&
    model.object === "model" &&
    model.owned_by === "mimo"
  )));
});

test("OpenAI-compatible model list defaults to v1-callable provider models", async () => {
  const response = await listOpenAiModels(new Request("http://local.test/v1/models?kind=all"));

  assert.equal(response.status, 200);
  const body = await response.json() as {
    object?: unknown;
    data?: Array<{ id?: unknown; owned_by?: unknown }>;
  };
  assert.equal(body.object, "list");
  assert.ok(body.data?.some(model => model.id === "12ai:gemini-3.1-flash-image-preview"));
  assert.ok(body.data?.some(model => model.id === "mimo:mimo-v2.5-tts"));
  assert.ok(body.data?.some(model => model.id === "runninghub:qwen/qwen3.7-max"));
  assert.equal(body.data?.some(model => model.id === "12ai:veo_3_1-fast"), false);
  assert.equal(body.data?.some(model => typeof model.id === "string" && model.id.startsWith("12ai-async:")), false);
  assert.equal(body.data?.some(model => typeof model.id === "string" && model.id.startsWith("modelscope:")), false);
  assert.equal(body.data?.some(model => typeof model.id === "string" && model.id.startsWith("runninghub:ai-app-")), false);
  assert.equal(body.data?.some(model => typeof model.id === "string" && model.id.startsWith("runninghub:api:/openapi/v2/")), false);
  assert.equal(body.data?.some(model => typeof model.id === "string" && model.id.includes("<webappId>")), false);
  assert.equal(body.data?.some(model => typeof model.id === "string" && model.id.includes("<workflowId>")), false);
});

test("OpenAI-compatible model list does not advertise unsupported v1 video models", async () => {
  const response = await listOpenAiModels(new Request("http://local.test/v1/models?provider=all&kind=video"));

  assert.equal(response.status, 200);
  const body = await response.json() as { data?: Array<{ id?: unknown }> };
  assert.deepEqual(body.data, []);
});

test("OpenAI-compatible model list accepts provider=all explicitly", async () => {
  const response = await listOpenAiModels(new Request("http://local.test/v1/models?provider=all&kind=audio"));

  assert.equal(response.status, 200);
  const body = await response.json() as { data?: Array<{ id?: unknown; owned_by?: unknown }> };
  assert.ok(body.data?.some(model => model.id === "mimo:mimo-v2.5-asr" && model.owned_by === "mimo"));
});

test("OpenAI-compatible model list validates provider keys", async () => {
  const response = await listOpenAiModels(new Request("http://local.test/v1/models?provider=bad provider"));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /provider must be all or a valid provider key/);
});

test("OpenAI-compatible model list separates gateway auth from provider auth", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";

  try {
    const response = await listOpenAiModels(new Request("http://local.test/v1/models?provider=mimo&kind=chat", {
      headers: {
        Authorization: "Bearer gateway_key",
        "x-ai-api-key": "mimo_key",
      },
    }));

    assert.equal(response.status, 200);
    const body = await response.json() as { data?: Array<{ id?: unknown }> };
    assert.ok(body.data?.some(model => model.id === "mimo:mimo-v2.5"));
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
  }
});

test("OpenAI-compatible model list rejects missing gateway auth when configured", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";

  try {
    const response = await listOpenAiModels(new Request("http://local.test/v1/models?provider=mimo&kind=chat", {
      headers: { "x-ai-api-key": "mimo_key" },
    }));

    assert.equal(response.status, 401);
    assert.match(await response.text(), /gateway API key/);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
