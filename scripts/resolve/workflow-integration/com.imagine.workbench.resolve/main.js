const { app, BrowserWindow, ipcMain, net } = require("electron");
const path = require("path");

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
  const response = await net.fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.bodyBase64 ? Buffer.from(request.bodyBase64, "base64") : undefined
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

app.on("ready", createWindow);
app.on("window-all-closed", function () {
  app.quit();
});
