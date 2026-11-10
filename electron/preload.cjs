// Bridge between the page and the main process. Exposes only what the coach and chess.com import need.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chessLab", {
  getSettings: () => ipcRenderer.invoke("ai:get-settings"),
  setSettings: (patch) => ipcRenderer.invoke("ai:set-settings", patch),
  listModels: (provider) => ipcRenderer.invoke("ai:models", provider),
  cancel: (id) => ipcRenderer.invoke("ai:cancel", id),
  chesscom: (apiPath) => ipcRenderer.invoke("net:chesscom", apiPath),
  warm: () => ipcRenderer.invoke("ai:warm"),
  maiaLevels: () => ipcRenderer.invoke("maia:levels"),
  maiaMove: (fen, elo) => ipcRenderer.invoke("maia:move", fen, elo),
  cliStatus: (cli) => ipcRenderer.invoke("ai:cli-status", cli),
  cliLogin: (cli) => ipcRenderer.invoke("ai:cli-login", cli),
  cliLogout: (cli) => ipcRenderer.invoke("ai:cli-logout", cli),
  openInstall: (cli) => ipcRenderer.invoke("ai:open-install", cli),
  /** Streams text to onText; resolves { ok, error? } when finished. */
  chat: async (id, system, messages, onText) => {
    const listener = (_e, msg) => msg.id === id && onText(msg.text);
    ipcRenderer.on("ai:chunk", listener);
    try {
      return await ipcRenderer.invoke("ai:chat", { id, system, messages });
    } finally {
      ipcRenderer.removeListener("ai:chunk", listener);
    }
  },
});
