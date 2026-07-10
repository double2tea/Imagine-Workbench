import test from "node:test";
import assert from "node:assert/strict";
import {
  audioFunctionOptionsForProvider,
  audioFunctionValue,
  audioOperationFormatOptions,
  audioOperationReferenceValidationMessage,
  audioOperationRequiresStylePrompt,
  audioOperationRequiresTextInput,
  audioProviderOptions,
  parseAudioFunctionValue,
  readOptionalAudioFormat,
  resolveAudioFunctionSelection,
} from "../lib/audio-operation-rules";
import { getAudioModelCapabilities } from "../lib/providers/model-catalog";
import type { AudioModelCapabilities } from "../lib/providers/model-catalog";

test("audio operation rules normalize empty format as absent", () => {
  assert.equal(readOptionalAudioFormat(""), undefined);
  assert.equal(readOptionalAudioFormat("   "), undefined);
  assert.equal(readOptionalAudioFormat(" wav "), "wav");
});

test("audio operation rules separate text and transcript output contracts", () => {
  const transcriptCapabilities: AudioModelCapabilities = {
    defaultMode: "asr",
    durations: [],
    formats: [{ value: "wav", label: "WAV" }],
    inputModalities: {
      text: { required: false },
      audio: { minCount: 1, maxCount: 1, delivery: "rawDataUri" },
    },
    maxReferenceMedia: 1,
    minReferenceMedia: 1,
    modes: ["asr"],
    outputKinds: ["transcript"],
    parameterDescriptors: [],
    referenceSlots: [],
    referenceMediaTypes: ["audio"],
  };

  assert.equal(audioOperationRequiresTextInput("asr"), false);
  assert.equal(audioOperationRequiresTextInput("generate"), true);
  assert.equal(audioOperationRequiresTextInput("tts"), true);
  assert.equal(audioOperationRequiresStylePrompt("voice_design"), true);
  assert.equal(audioOperationRequiresStylePrompt("voice_clone"), false);
  assert.deepEqual(audioOperationFormatOptions(transcriptCapabilities), []);
});

test("audio operation rules count speaker voice profile as an audio reference", () => {
  const capabilities = getAudioModelCapabilities("volcengine:seed-audio-1.0");

  assert.equal(
    audioOperationReferenceValidationMessage(
      capabilities,
      [{ type: "image" }],
      { extraReferenceTypes: ["audio"] },
    ),
    "当前模型不支持混用这些参考媒体类型",
  );
  assert.equal(
    audioOperationReferenceValidationMessage(
      capabilities,
      [
        { type: "audio" },
        { type: "audio" },
        { type: "audio" },
      ],
      { extraReferenceTypes: ["audio"] },
    ),
    "当前音频模型最多支持 3 个参考媒体",
  );
});

test("audio function options derive provider functions from model groups", () => {
  const groups = [{
    provider: "mimo",
    label: "MiMo",
    options: [
      { value: "mimo:mimo-v2.5-tts", label: "MiMo V2.5 TTS" },
      { value: "mimo:mimo-v2.5-tts-voicedesign", label: "MiMo V2.5 Voice Design" },
      { value: "mimo:mimo-v2.5-tts-voiceclone", label: "MiMo V2.5 Voice Clone" },
      { value: "mimo:mimo-v2.5-asr", label: "MiMo V2.5 ASR" },
    ],
  }];

  assert.deepEqual(audioProviderOptions(groups), [{ value: "mimo", label: "MiMo" }]);
  assert.deepEqual(
    audioFunctionOptionsForProvider(groups, "mimo", getAudioModelCapabilities).map(option => ({
      label: option.label,
      mode: option.mode,
      model: option.model,
    })),
    [
      { label: "朗读", mode: "tts", model: "mimo:mimo-v2.5-tts" },
      { label: "设计音色", mode: "voice_design", model: "mimo:mimo-v2.5-tts-voicedesign" },
      { label: "克隆", mode: "voice_clone", model: "mimo:mimo-v2.5-tts-voiceclone" },
      { label: "转写", mode: "asr", model: "mimo:mimo-v2.5-asr" },
    ],
  );
});

test("Seed Audio exposes one generic generation function", () => {
  const groups = [{
    provider: "volcengine",
    label: "Volcengine Ark",
    options: [{ value: "volcengine:seed-audio-1.0", label: "Seed Audio 1.0" }],
  }];

  assert.deepEqual(
    audioFunctionOptionsForProvider(groups, "volcengine", getAudioModelCapabilities).map(option => ({
      label: option.label,
      mode: option.mode,
      model: option.model,
    })),
    [{ label: "音频生成", mode: "generate", model: "volcengine:seed-audio-1.0" }],
  );
});

test("audio function value round trips model and mode", () => {
  const value = audioFunctionValue("mimo:mimo-v2.5-asr", "asr");
  assert.deepEqual(parseAudioFunctionValue(value), {
    model: "mimo:mimo-v2.5-asr",
    mode: "asr",
  });
  assert.equal(parseAudioFunctionValue("mimo:mimo-v2.5-asr"), null);
  assert.deepEqual(parseAudioFunctionValue("volcengine:seed-audio-1.0::generate"), {
    model: "volcengine:seed-audio-1.0",
    mode: "generate",
  });
});

test("audio function selection resolves mode-specific MiMo models", () => {
  assert.deepEqual(
    pickAudioFunctionSelection(resolveAudioFunctionSelection({
      fallbackModel: "mimo:mimo-v2.5-tts",
      mode: "voice_design",
    })),
    { mode: "voice_design", model: "mimo:mimo-v2.5-tts-voicedesign" },
  );
  assert.deepEqual(
    pickAudioFunctionSelection(resolveAudioFunctionSelection({
      fallbackModel: "mimo:mimo-v2.5-tts",
      mode: "asr",
    })),
    { mode: "asr", model: "mimo:mimo-v2.5-asr" },
  );
});

function pickAudioFunctionSelection(selection: ReturnType<typeof resolveAudioFunctionSelection>): {
  mode: ReturnType<typeof resolveAudioFunctionSelection>["mode"];
  model: string;
} {
  return { mode: selection.mode, model: selection.model };
}
