import test from "node:test";
import assert from "node:assert/strict";
import { audioOperationFormatOptions, audioOperationRequiresTextInput, readOptionalAudioFormat } from "../lib/audio-operation-rules";
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
    maxReferenceMedia: 1,
    minReferenceMedia: 1,
    modes: ["asr"],
    outputKinds: ["transcript"],
    referenceMediaTypes: ["audio"],
  };

  assert.equal(audioOperationRequiresTextInput("asr"), false);
  assert.equal(audioOperationRequiresTextInput("tts"), true);
  assert.deepEqual(audioOperationFormatOptions(transcriptCapabilities), []);
});
