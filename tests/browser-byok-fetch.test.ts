import assert from "node:assert/strict";
import test from "node:test";
import { API_ROUTES } from "../lib/api/routes";
import { browserByokFetch, normalizeBrowserImageResultUrl } from "../lib/browser-byok-fetch";

test("browser BYOK image result normalization keeps remote URLs without fetching", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Remote image result URLs must not be downloaded by the browser shim");
  }) as typeof fetch;

  try {
    assert.equal(
      normalizeBrowserImageResultUrl("https://cdn.example.test/result.png?signature=abc"),
      "https://cdn.example.test/result.png?signature=abc",
    );
    assert.equal(
      normalizeBrowserImageResultUrl("data:image/png;base64,abc"),
      "data:image/png;base64,abc",
    );
    assert.throws(
      () => normalizeBrowserImageResultUrl("http://127.0.0.1/result.png"),
      /local or private network/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser BYOK agent provider errors return assistant failure payload", async () => {
  const originalByokFlag = process.env.NEXT_PUBLIC_IMAGINE_BROWSER_BYOK;
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  process.env.NEXT_PUBLIC_IMAGINE_BROWSER_BYOK = "1";
  const calls = { count: 0 };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "http://local.test" } },
  });
  globalThis.fetch = (async () => {
    calls.count += 1;
    return Response.json({ error: { message: "bad provider key" } }, { status: 401 });
  }) as typeof fetch;

  try {
    const response = await browserByokFetch(API_ROUTES.agent.respond, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-api-key": "bad-key",
      },
      body: JSON.stringify({
        locale: "en",
        surface: "workbench",
        model: "mimo:mimo-v2.5",
        messages: [{ role: "user", content: "hello" }],
        gallerySummary: [],
        agentReferences: [],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.count, 1);
    const body = await response.json() as {
      thought?: unknown;
      text?: unknown;
      recommendedAction?: { type?: unknown };
      suggestedFollowUps?: unknown[];
    };
    assert.equal(body.thought, "Agent provider request failed.");
    assert.match(String(body.text), /bad provider key/);
    assert.equal(body.recommendedAction?.type, "none");
    assert.ok(Array.isArray(body.suggestedFollowUps));
  } finally {
    restoreEnv("NEXT_PUBLIC_IMAGINE_BROWSER_BYOK", originalByokFlag);
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
