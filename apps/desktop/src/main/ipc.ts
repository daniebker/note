import { ipcMain } from "electron";
import { createNoteService } from "@repo/notes/service";
import {
  canSavePassword,
  clearSettings,
  loadSettings,
  saveSettings,
} from "./settings";

export function registerIpc() {
  const service = createNoteService({
    load: loadSettings,
    save: saveSettings,
    clear: clearSettings,
    canSavePassword,
  });

  // The service validates its input, as it comes from the renderer.
  ipcMain.handle("connection:get", () => service.getConnection());
  ipcMain.handle("connection:set", (_event, connection) =>
    service.connect(connection),
  );
  ipcMain.handle("connection:clear", () => service.disconnect());
  ipcMain.handle("notes:list", () => service.listNotes());
  ipcMain.handle("notes:create", (_event, data) => service.createNote(data));
  ipcMain.handle("notes:update", (_event, id, changes) =>
    service.updateNote(id, changes),
  );
  ipcMain.handle("notes:delete", (_event, id) => service.deleteNote(id));
}
