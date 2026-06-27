import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProviderCredentialCard } from "../components/settings/ProviderCredentialCard";

test("provider credential card shows masked saved status without a plaintext API key", () => {
  const html = renderToStaticMarkup(React.createElement(ProviderCredentialCard, {
    apiKey: "",
    apiKeyConfigured: true,
    apiPlaceholder: "sk-...",
    baseUrl: "",
    baseUrlPlaceholder: "https://api.example.com",
    clearLabel: "Clear",
    provider: "12ai",
    providerTest: {
      message: "",
      provider: "12ai",
      status: "idle",
    },
    showBaseUrl: false,
    title: "12AI credentials",
    onClear: () => undefined,
    onSaveApiKey: () => undefined,
    onSaveBaseUrl: () => undefined,
    onTest: () => undefined,
  }));

  assert.match(html, /Key (saved|已保存)/);
  assert.doesNotMatch(html, /sk-secret/);
});
