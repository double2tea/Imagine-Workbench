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

test("OpenAI-compatible model list validates provider keys", async () => {
  const response = await listOpenAiModels(new Request("http://local.test/v1/models?provider=bad provider"));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /provider must be a valid provider key/);
});
