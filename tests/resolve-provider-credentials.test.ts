import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseResolveProviderCredentialsJson,
  readResolveProviderCredentials,
  resolveProviderCredentialsPath,
  writeResolveProviderCredential,
} from "../lib/api/resolve-provider-credentials";

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

test("Resolve provider credential writes serialize concurrent updates", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "imagine-resolve-credentials-"));
  try {
    await Promise.all([
      writeResolveProviderCredential("12ai", {
        apiKey: "sk-12ai",
        baseUrl: "",
        providerLabel: "12AI",
      }, { homeDir }),
      writeResolveProviderCredential("grok2api", {
        apiKey: "sk-grok",
        baseUrl: "http://localhost:8000",
        providerLabel: "Grok2API",
      }, { homeDir }),
    ]);

    assert.deepEqual(await readResolveProviderCredentials({ homeDir }), {
      "12ai": {
        apiKey: "sk-12ai",
        baseUrl: "",
        providerLabel: "12AI",
      },
      grok2api: {
        apiKey: "sk-grok",
        baseUrl: "http://localhost:8000",
        providerLabel: "Grok2API",
      },
    });

    const raw = await readFile(resolveProviderCredentialsPath({ homeDir }), "utf8");
    assert.doesNotThrow(() => JSON.parse(raw));
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
