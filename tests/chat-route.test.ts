import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../lib/api/chat-completions";

test("chat completions proxies MiMo chat requests through provider-neutral route", async () => {
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://api.xiaomimimo.com/v1/chat/completions");
    assert.equal(readHeader(init?.headers, "api-key"), "mimo_key");
    assert.equal(readHeader(init?.headers, "Authorization"), undefined);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "mimo-v2.5",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    });
    return jsonResponse({ choices: [{ message: { content: "hi" } }] });
  });

  try {
    const response = await POST(jsonRequest({
      model: "mimo:mimo-v2.5",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    }, { "x-ai-api-key": "mimo_key" }));

    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
    assert.deepEqual(await response.json(), { choices: [{ message: { content: "hi" } }] });
  } finally {
    mock.restore();
  }
});

test("chat completions proxies RunningHub chat requests through LLM host", async () => {
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://llm.runninghub.cn/v1/chat/completions");
    assert.equal(readHeader(init?.headers, "Authorization"), "Bearer runninghub_key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "qwen/qwen3.7-max",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "none",
    });
    return jsonResponse({ choices: [{ message: { content: "ok" } }] });
  });

  try {
    const response = await POST(jsonRequest({
      model: "runninghub:qwen/qwen3.7-max",
      messages: [{ role: "user", content: "hello" }],
    }, { "x-ai-api-key": "runninghub_key" }));

    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
    assert.deepEqual(await response.json(), { choices: [{ message: { content: "ok" } }] });
  } finally {
    mock.restore();
  }
});

test("v1 chat completions treats Authorization as gateway auth when configured", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://newapi.example.test/v1/chat/completions");
    assert.equal(readHeader(init?.headers, "Authorization"), "Bearer provider_key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "chat-model",
      messages: [{ role: "user", content: "hello" }],
    });
    return jsonResponse({ choices: [{ message: { content: "ok" } }] });
  });

  try {
    const response = await POST(jsonRequest({
      model: "newapi:chat-model",
      messages: [{ role: "user", content: "hello" }],
    }, {
      Authorization: "Bearer gateway_key",
      "x-ai-api-key": "provider_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }, "/v1/chat/completions"));

    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
    assert.deepEqual(await response.json(), { choices: [{ message: { content: "ok" } }] });
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
    mock.restore();
  }
});

test("v1 chat completions rejects missing gateway auth when configured", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";
  const mock = withFetchMock(async () => {
    throw new Error("Gateway auth failure must be rejected before fetch");
  });

  try {
    const response = await POST(jsonRequest({
      model: "newapi:chat-model",
      messages: [{ role: "user", content: "hello" }],
    }, {
      "x-ai-api-key": "provider_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }, "/v1/chat/completions"));

    assert.equal(response.status, 401);
    assert.match(await response.text(), /gateway API key/);
    assert.equal(mock.calls.count, 0);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
    mock.restore();
  }
});

test("v1 chat completions checks gateway auth before parsing JSON", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";

  try {
    const response = await POST(new Request("http://local.test/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }));

    assert.equal(response.status, 401);
    assert.match(await response.text(), /gateway API key/);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
  }
});

test("provider-neutral app chat route does not require v1 gateway auth", async () => {
  const originalGatewayKey = process.env.OPENAI_COMPAT_API_KEY;
  process.env.OPENAI_COMPAT_API_KEY = "gateway_key";
  const mock = withFetchMock(async (url, init) => {
    assert.equal(url, "https://newapi.example.test/v1/chat/completions");
    assert.equal(readHeader(init?.headers, "Authorization"), "Bearer provider_key");
    return jsonResponse({ choices: [{ message: { content: "ok" } }] });
  });

  try {
    const response = await POST(jsonRequest({
      model: "newapi:chat-model",
      messages: [{ role: "user", content: "hello" }],
    }, {
      "x-ai-api-key": "provider_key",
      "x-ai-base-url": "https://newapi.example.test/v1",
    }));

    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
  } finally {
    restoreEnv("OPENAI_COMPAT_API_KEY", originalGatewayKey);
    mock.restore();
  }
});

test("chat completions rejects invalid request bodies", async () => {
  const response = await POST(jsonRequest({ model: "mimo:mimo-v2.5", messages: [] }));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /messages/);
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}, pathname = "/api/chat/completions"): Request {
  return new Request(`http://local.test${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function readHeader(headers: HeadersInit | undefined, name: string): string | undefined {
  return new Headers(headers).get(name) ?? undefined;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function withFetchMock(handler: typeof fetch): { calls: { count: number }; restore: () => void } {
  const originalFetch = globalThis.fetch;
  const calls = { count: 0 };
  globalThis.fetch = (async (input, init) => {
    calls.count += 1;
    return handler(input, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
