import assert from "node:assert/strict";
import test from "node:test";

import { parseResolveProviderCredentialsJson } from "../lib/api/resolve-provider-credentials";

test("Resolve provider credentials tolerate stale trailing bytes after a valid object", () => {
  const credentials = parseResolveProviderCredentialsJson(`{
    "12ai": {
      "apiKey": "sk-test",
      "baseUrl": "",
      "providerLabel": "12AI"
    }
  }
  .workers.dev",
      "providerLabel": "Grok2API"
    }
  }`);

  assert.deepEqual(credentials, {
    "12ai": {
      apiKey: "sk-test",
      baseUrl: "",
      providerLabel: "12AI",
    },
  });
});
