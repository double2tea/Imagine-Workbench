import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAgentReferenceHint,
  getSendableAgentImageReferences,
  getSendableAgentMediaReferences,
  isSendableAgentImageUrl,
  parseAgentAudioDataUrl,
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

test("getSendableAgentMediaReferences accepts image video and base64 audio references", () => {
  const sendable = getSendableAgentMediaReferences([
    { id: "image_1", type: "image", url: "data:image/png;base64,abc" },
    { id: "video_1", type: "video", url: "data:video/mp4;base64,abc" },
    { id: "audio_1", type: "audio", url: "data:audio/mpeg;base64,abc" },
    { id: "audio_url", type: "audio", url: "https://example.com/a.mp3" },
  ]);

  assert.deepEqual(sendable.map(reference => reference.id), ["image_1", "video_1", "audio_1"]);
});

test("parseAgentAudioDataUrl extracts OpenRouter-compatible base64 audio fields", () => {
  assert.deepEqual(parseAgentAudioDataUrl("data:audio/mpeg;base64,abc"), {
    data: "abc",
    format: "mp3",
  });
  assert.equal(parseAgentAudioDataUrl("https://example.com/a.mp3"), null);
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

test("formatAgentReferenceHint reflects OpenRouter media input support", () => {
  const references = [
    { id: "v", type: "video" as const, url: "data:video/mp4;base64,abc" },
    { id: "a", type: "audio" as const, url: "data:audio/wav;base64,abc" },
  ];

  assert.match(
    formatAgentReferenceHint(references, { audio: true, image: false, video: true }) ?? "",
    /支持视频\/音频输入/,
  );
  assert.match(
    formatAgentReferenceHint(references, { audio: false, image: true, video: true }) ?? "",
    /不支持音频输入/,
  );
});
