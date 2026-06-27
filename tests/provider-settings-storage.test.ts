import assert from "node:assert/strict";
import test from "node:test";

import { restoreProviderModelOptionsFromStored } from "../hooks/useProviderSettings";
import {
  CHAT_MODEL_OPTIONS,
  type AiProvider,
  type ModelOption,
} from "../lib/providers/model-catalog";

test("provider model option restore applies defaults for corrupt team settings", () => {
  const providerKeys: AiProvider[] = ["12ai", "custom-openai"];
  const restored = restoreProviderModelOptionsFromStored("{bad json", CHAT_MODEL_OPTIONS, providerKeys);

  assert.equal(restored["12ai"], CHAT_MODEL_OPTIONS["12ai"]);
  assert.deepEqual(restored["custom-openai"], []);
});

test("provider model option restore merges valid team settings for custom providers", () => {
  const providerKeys: AiProvider[] = ["12ai", "custom-openai"];
  const customOption: ModelOption = {
    label: "Custom Chat",
    value: "custom-openai:custom-chat",
  };
  const restored = restoreProviderModelOptionsFromStored(
    JSON.stringify({ "custom-openai": [customOption] }),
    CHAT_MODEL_OPTIONS,
    providerKeys,
  );

  assert.deepEqual(restored["custom-openai"], [customOption]);
});
