import { BrowserWindow, dialog, ipcMain } from "electron";
import { z } from "zod";
import { createLocalFolder } from "@repo/notes/local-folder";
import { createNoteService } from "@repo/notes/service";
import {
  canSavePassword,
  clearSettings,
  defaultNotesFolder,
  loadSettings,
  saveSettings,
} from "./settings";

export function registerIpc() {
  const service = createNoteService(
    {
      load: loadSettings,
      save: saveSettings,
      clear: clearSettings,
      canSavePassword,
    },
    {
      open: createLocalFolder,
      defaultPath: async () => defaultNotesFolder(),
      canChooseFolder: true,
    },
  );

  // The service validates its input, as it comes from the renderer.
  ipcMain.handle("connection:get", () => service.getConnection());
  ipcMain.handle("connection:set", (_event, connection) =>
    service.connect(connection),
  );
  ipcMain.handle("connection:clear", () => service.disconnect());
  ipcMain.handle("connection:choose-folder", async (event, current) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: "Choose a folder for your notes",
      defaultPath: z.string().catch(defaultNotesFolder()).parse(current),
      properties: ["openDirectory", "createDirectory"],
    };
    const { canceled, filePaths } = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return canceled ? null : (filePaths[0] ?? null);
  });
  ipcMain.handle("notes:list", () => service.listNotes());
  ipcMain.handle("notes:create", (_event, data) => service.createNote(data));
  ipcMain.handle("notes:update", (_event, id, changes) =>
    service.updateNote(id, changes),
  );
  ipcMain.handle("notes:delete", (_event, id) => service.deleteNote(id));
}
