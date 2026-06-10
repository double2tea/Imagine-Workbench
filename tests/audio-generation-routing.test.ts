import assert from "node:assert/strict";
import test from "node:test";

import { isRunningHubWorkflowAudioTarget } from "../lib/audio-generation-routing";

test("runninghub audio app targets use workflow audio routing", () => {
  assert.equal(isRunningHubWorkflowAudioTarget("runninghub:ai-app-audio:123"), true);
});

test("runninghub audio workflow targets use workflow audio routing", () => {
  assert.equal(isRunningHubWorkflowAudioTarget("runninghub:workflow-audio:123"), true);
});

test("runninghub standard provider models do not route by provider name alone", () => {
  assert.equal(
    isRunningHubWorkflowAudioTarget("runninghub:api:/openapi/v2/example/audio-model"),
    false,
  );
});

test("runninghub node bindings do not route without an audio workflow target", () => {
  assert.equal(
    isRunningHubWorkflowAudioTarget("mimo:mimo-v2.5-tts", [
      { nodeId: "1", fieldName: "prompt", source: "literal", value: "hello", deliveryMode: "raw" },
    ]),
    false,
  );
});

test("runninghub api models do not route to workflow audio by bindings alone", () => {
  assert.equal(
    isRunningHubWorkflowAudioTarget("runninghub:api:/openapi/v2/example/audio-model", [
      { nodeId: "1", fieldName: "prompt", source: "literal", value: "hello", deliveryMode: "raw" },
    ]),
    false,
  );
});

test("direct audio operation models use generic audio routing", () => {
  assert.equal(isRunningHubWorkflowAudioTarget("mimo:mimo-v2.5-tts"), false);
});
