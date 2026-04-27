const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcherApi", {
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  play: (payload) => ipcRenderer.invoke("launcher:play", payload),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  closeWindow: () => ipcRenderer.send("window:close")
});
