const { contextBridge, ipcRenderer } = require("electron");

// Small bridge between the transparent shell UI and the Electron main process, signed dnlumis.
function subscribe(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("ytmShell", {
  getState: () => ipcRenderer.invoke("window:get-state"),
  toggleCompact: () => ipcRenderer.invoke("window:toggle-compact"),
  enterCompactVariant: (variant) => ipcRenderer.invoke("window:enter-compact-variant", variant),
  togglePin: () => ipcRenderer.invoke("window:toggle-pin"),
  toggleFlexible: () => ipcRenderer.invoke("window:toggle-flexible"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  openExternal: (url) => ipcRenderer.invoke("window:open-external", url),
  playerAction: (action) => ipcRenderer.invoke("player:action", action),
  onWindowState: (handler) => subscribe("window:state", handler),
  onPlayerMetadata: (handler) => subscribe("player:metadata", handler),
  onPlayerLoading: (handler) => subscribe("player:loading", handler),
  onPlayerHealth: (handler) => subscribe("player:health", handler),
});
