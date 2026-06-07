import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const STARTUP_TIMEOUT_MS = 90_000;

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server did not bind to a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

async function getAvailablePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise(resolve => server.close(resolve));
  return port;
}

function startMimoMock() {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      calls.push({
        url: req.url,
        apiKey: req.headers["api-key"],
        body: bodyText ? JSON.parse(bodyText) : null,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { audio: { data: "e2e_audio_base64" } } }] }));
    });
  });
  return { calls, server };
}

function startNext(port) {
  const child = spawn("pnpm", ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, DISABLE_HMR: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => {
    output += chunk.toString();
  });
  child.stderr.on("data", chunk => {
    output += chunk.toString();
  });
  return { child, getOutput: () => output };
}

async function waitForOk(url, getOutput) {
  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}\n${getOutput()}`);
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise(resolve => server.close(resolve));
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const mock = startMimoMock();
const mockPort = await listen(mock.server);
const nextPort = await getAvailablePort();
const next = startNext(nextPort);
const baseUrl = `http://127.0.0.1:${nextPort}`;

try {
  await waitForOk(`${baseUrl}/`, next.getOutput);
  const boardRes = await fetch(`${baseUrl}/board`);
  assert.equal(boardRes.ok, true, "Board surface should respond");

  const cloneWithoutConsentRes = await fetch(`${baseUrl}/api/audio/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "runninghub:ai-app-audio:test-app",
      mode: "voice_clone",
      prompt: "Clone this voice without consent.",
      referenceMedia: [],
    }),
  });
  assert.equal(cloneWithoutConsentRes.status, 400);
  assert.match(await cloneWithoutConsentRes.text(), /音色克隆需要先确认参考音频授权/);

  const unresolvedVoiceProfileRes = await fetch(`${baseUrl}/api/audio/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mimo:mimo-v2.5-tts",
      mode: "tts",
      prompt: "Read this with an unresolved profile.",
      voiceProfileId: "voice_profile_only_in_indexeddb",
    }),
  });
  assert.equal(unresolvedVoiceProfileRes.status, 400);
  assert.match(await unresolvedVoiceProfileRes.text(), /Voice profile IDs must be resolved/);

  const audioRes = await fetch(`${baseUrl}/api/audio/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-api-key": "mimo_e2e_key",
      "x-ai-base-url": `http://127.0.0.1:${mockPort}`,
    },
    body: JSON.stringify({
      model: "mimo:mimo-v2.5-tts-voicedesign",
      mode: "voice_design",
      prompt: "Read this line for the audio smoke test.",
      stylePrompt: "Warm documentary narrator",
      format: "wav",
    }),
  });
  if (!audioRes.ok) {
    throw new Error(await audioRes.text());
  }
  const audioJson = await audioRes.json();
  assert.equal(audioJson.type, "direct");
  assert.equal(audioJson.audioBase64, "e2e_audio_base64");
  assert.equal(audioJson.model, "mimo-v2.5-tts-voicedesign");

  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, "/v1/chat/completions");
  assert.equal(mock.calls[0].apiKey, "mimo_e2e_key");
  assert.deepEqual(mock.calls[0].body, {
    model: "mimo-v2.5-tts-voicedesign",
    messages: [
      { role: "user", content: "Warm documentary narrator" },
      { role: "assistant", content: "Read this line for the audio smoke test." },
    ],
    audio: { format: "wav" },
    stream: false,
  });

  console.log("Audio workflow E2E smoke passed");
} finally {
  await stopChild(next.child);
  await closeServer(mock.server);
}
