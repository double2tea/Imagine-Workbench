const { app, BrowserWindow } = require("electron");
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

app.on("ready", createWindow);
app.on("window-all-closed", function () {
  app.quit();
});
