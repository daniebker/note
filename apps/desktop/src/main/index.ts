import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import { registerIpc } from "./ipc";

// How long to wait for unsaved notes to be written when closing.
const CLOSE_TIMEOUT_MS = 15_000;

function openExternal(url: string) {
  if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
}

function saveBeforeClose(window: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (saved: boolean) => {
      clearTimeout(timer);
      ipcMain.removeListener("app:close-reply", onReply);
      resolve(saved);
    };
    const onReply = (_event: unknown, saved: unknown) => finish(saved === true);
    const timer = setTimeout(() => finish(false), CLOSE_TIMEOUT_MS);
    ipcMain.on("app:close-reply", onReply);
    window.webContents.send("app:before-close");
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 420,
    minHeight: 400,
    title: "Note",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Links in notes open in the browser; the app window never navigates away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    openExternal(url);
  });

  let closing = false;
  window.on("close", (event) => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    void saveBeforeClose(window).then(async (saved) => {
      if (!saved) {
        const { response } = await dialog.showMessageBox(window, {
          type: "warning",
          message: "Some changes haven't been saved",
          detail: "Quitting now will discard them.",
          buttons: ["Keep open", "Discard and quit"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response === 0) {
          closing = false;
          return;
        }
      }
      window.destroy();
    });
  });

  void window.loadFile(path.join(__dirname, "index.html"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });

  void app.whenReady().then(() => {
    // The default menu's reload shortcuts would throw away unsaved drafts.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { label: "File", submenu: [{ role: "quit" }] },
        { role: "editMenu" },
        {
          label: "View",
          submenu: [
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { role: "togglefullscreen" },
          ],
        },
      ]),
    );
    registerIpc();
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
