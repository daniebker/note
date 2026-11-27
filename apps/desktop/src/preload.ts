import { contextBridge, ipcRenderer } from "electron";
import type { NoteApi } from "@repo/notes/api";

const api: NoteApi = {
  getConnection: () => ipcRenderer.invoke("connection:get"),
  connect: (connection) => ipcRenderer.invoke("connection:set", connection),
  disconnect: () => ipcRenderer.invoke("connection:clear"),
  chooseFolder: (current) =>
    ipcRenderer.invoke("connection:choose-folder", current),
  listNotes: () => ipcRenderer.invoke("notes:list"),
  createNote: (data) => ipcRenderer.invoke("notes:create", data),
  updateNote: (id, changes) => ipcRenderer.invoke("notes:update", id, changes),
  deleteNote: (id) => ipcRenderer.invoke("notes:delete", id),
  onBeforeClose(handler) {
    const listener = async () => {
      const saved = await handler().catch(() => false);
      ipcRenderer.send("app:close-reply", saved);
    };
    ipcRenderer.on("app:before-close", listener);
    return () => ipcRenderer.removeListener("app:before-close", listener);
  },
};

contextBridge.exposeInMainWorld("noteApi", api);
