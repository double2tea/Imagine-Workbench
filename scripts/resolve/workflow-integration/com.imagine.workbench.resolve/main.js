const { app, BrowserWindow, ipcMain, net } = require("electron");
const path = require("path");

const ALLOWED_HTTP_METHODS = new Set(["GET", "POST"]);
const ALLOWED_HTTP_PATHS = new Set([
  "/api/resolve/capabilities",
  "/v1/images/generations",
  "/v1/images/edits",
  "/api/media/generate-video",
  "/api/media/status",
  "/api/media/video-download",
  "/v1/audio/speech",
  "/v1/audio/transcriptions"
]);
const ALLOWED_HTTP_HEADERS = new Set([
  "accept",
  "authorization",
  "content-type",
  "x-ai-api-key",
  "x-ai-base-url",
  "x-ai-provider-label"
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 760,
    minWidth: 420,
    minHeight: 620,
    title: "Imagine Workbench",
    backgroundColor: "#111214",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("imagine-http", async function (_event, request) {
  const safeRequest = validateHttpRequest(request);
  const response = await net.fetch(safeRequest.url, {
    method: safeRequest.method,
    headers: safeRequest.headers,
    body: safeRequest.body
  });
  const headers = {};
  response.headers.forEach(function (value, name) {
    headers[name.toLowerCase()] = value;
  });
  return {
    ok: response.ok,
    status: response.status,
    headers,
    bodyBase64: Buffer.from(await response.arrayBuffer()).toString("base64")
  };
});

function validateHttpRequest(request) {
  if (!request || typeof request !== "object") {
    throw new Error("Invalid Workbench request");
  }
  const parsedUrl = new URL(String(request.url || ""));
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Workbench request protocol must be http or https");
  }
  if (!ALLOWED_HTTP_PATHS.has(parsedUrl.pathname)) {
    throw new Error("Workbench request path is not allowed: " + parsedUrl.pathname);
  }
  const method = String(request.method || "GET").toUpperCase();
  if (!ALLOWED_HTTP_METHODS.has(method)) {
    throw new Error("Workbench request method is not allowed: " + method);
  }
  return {
    url: parsedUrl.toString(),
    method,
    headers: sanitizeHeaders(request.headers),
    body: request.bodyBase64 ? Buffer.from(String(request.bodyBase64), "base64") : undefined
  };
}

function sanitizeHeaders(headers) {
  const safeHeaders = {};
  if (!headers || typeof headers !== "object") {
    return safeHeaders;
  }
  Object.entries(headers).forEach(function ([name, value]) {
    const lowerName = String(name).toLowerCase();
    if (ALLOWED_HTTP_HEADERS.has(lowerName) && typeof value === "string" && value.length > 0) {
      safeHeaders[lowerName] = value;
    }
  });
  return safeHeaders;
}

app.on("ready", createWindow);
app.on("window-all-closed", function () {
  app.quit();
});
