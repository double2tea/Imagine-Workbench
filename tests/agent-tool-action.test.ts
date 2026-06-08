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
  }), "当前音频模式需要至少 1 个音频参考");

  assert.equal(validateAgentToolAction({
    type: "generate_audio",
    params: {
      audioMode: "asr",
      model: "mimo:mimo-v2.5-asr",
    },
  }, {
    references: [{ id: "audio-ref", type: "audio", url: "data:audio/wav;base64,AAA=" }],
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

test("agent audio action validation rejects non-audio models", () => {
  assert.equal(validateAgentToolAction({
    type: "generate_audio",
    params: {
      model: "12ai:gemini-3.1-flash-image-preview",
      prompt: "Read this line",
    },
  }), "请先选择音频模型");
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
  }), "当前音频模式需要至少 1 个音频参考");

  assert.equal(validateAgentToolAction({
    type: "create_board_audio_flow",
    params: {
      audioMode: "voice_clone",
      model: "mimo:mimo-v2.5-tts-voiceclone",
      prompt: "Read this line",
      voiceCloneConsentAccepted: true,
    },
  }, {
    references: [{ id: "image-ref", type: "image", url: "data:image/png;base64,AAA=" }],
  }), "当前音频模型不支持图片参考");

  assert.equal(validateAgentToolAction({
    type: "create_board_audio_flow",
    params: {
      audioMode: "voice_clone",
      model: "mimo:mimo-v2.5-tts-voiceclone",
      prompt: "Read this line",
      voiceCloneConsentAccepted: true,
    },
  }, {
    references: [
      { id: "audio-ref-1", type: "audio", url: "data:audio/wav;base64,AAA=" },
      { id: "audio-ref-2", type: "audio", url: "data:audio/wav;base64,BBB=" },
    ],
  }), "当前音频模型最多支持 1 个参考媒体");

  assert.equal(validateAgentToolAction({
    type: "create_board_audio_flow",
    params: {
      audioMode: "voice_clone",
      model: "mimo:mimo-v2.5-tts-voiceclone",
      prompt: "Read this line",
      voiceCloneConsentAccepted: true,
    },
  }, {
    references: [{ id: "audio-ref", type: "audio", url: "data:audio/wav;base64,AAA=" }],
  }), null);
});
