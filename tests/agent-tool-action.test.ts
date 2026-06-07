import assert from "node:assert/strict";
import test from "node:test";

import { validateAgentToolAction } from "../lib/agent-tool-action";

test("agent audio action validation allows ASR without prompt", () => {
  assert.equal(validateAgentToolAction({
    type: "generate_audio",
    params: {
      audioMode: "asr",
      model: "mimo:mimo-v2.5-asr",
    },
  }), null);
});

test("agent audio action validation still requires text for TTS", () => {
  assert.equal(validateAgentToolAction({
    type: "generate_audio",
    params: {
      audioMode: "tts",
      model: "mimo:mimo-v2.5-tts",
    },
  }), "请先填写提示词");
});

test("agent audio action validation requires voice clone consent", () => {
  assert.equal(validateAgentToolAction({
    type: "create_board_audio_flow",
    params: {
      audioMode: "voice_clone",
      model: "mimo:mimo-v2.5-tts-voiceclone",
      prompt: "Read this line",
    },
  }), "音色克隆需要先确认参考音频授权");

  assert.equal(validateAgentToolAction({
    type: "create_board_audio_flow",
    params: {
      audioMode: "voice_clone",
      model: "mimo:mimo-v2.5-tts-voiceclone",
      prompt: "Read this line",
      voiceCloneConsentAccepted: true,
    },
  }), null);
});
