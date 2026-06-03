import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAgentReferenceHint,
  getSendableAgentImageReferences,
  isSendableAgentImageUrl,
} from "../lib/agent-chat-model";

test("isSendableAgentImageUrl accepts http(s) and data:image only", () => {
  assert.equal(isSendableAgentImageUrl("https://example.com/a.png"), true);
  assert.equal(isSendableAgentImageUrl("data:image/png;base64,abc"), true);
  assert.equal(isSendableAgentImageUrl(""), false);
  assert.equal(isSendableAgentImageUrl("file:///tmp/a.png"), false);
});

test("reference id without url does not count as sendable image", () => {
  const sendable = getSendableAgentImageReferences([], "asset_1", null);
  assert.equal(sendable.length, 0);
});

test("legacy single reference url is included when sendable", () => {
  const sendable = getSendableAgentImageReferences(
    [],
    "asset_1",
    "https://example.com/a.png",
  );
  assert.equal(sendable.length, 1);
  assert.equal(sendable[0]?.id, "asset_1");
});

test("formatAgentReferenceHint reflects OpenRouter vision lookup when provided", () => {
  assert.equal(formatAgentReferenceHint([]), undefined);
  assert.match(
    formatAgentReferenceHint([{ id: "a", url: "https://example.com/a.png" }], false) ?? "",
    /不支持图片输入/,
  );
  assert.match(
    formatAgentReferenceHint([{ id: "a", url: "https://example.com/a.png" }], true) ?? "",
    /支持图片输入/,
  );
});