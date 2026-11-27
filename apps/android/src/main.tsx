/// <reference types="@repo/notes/window" />
import { createRoot } from "react-dom/client";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { getPatcher } from "webdav";
import { goBack } from "@repo/notes/back";
import { createNoteService } from "@repo/notes/service";
import { applySavedTheme } from "@repo/notes/theme";
import { App } from "@repo/notes/ui/app";
import { Native } from "./native";
import { createNativeFetch } from "./native-fetch";
import { createLocalFolder } from "./local-folder";
import { createSettingsStorage } from "./settings";

getPatcher().patch(
  "fetch",
  createNativeFetch((request) => Native.request(request)),
);

window.noteApi = {
  ...createNoteService(createSettingsStorage(Native), {
    // Notes always go in the app's own storage.
    open: () => createLocalFolder(Native),
    defaultPath: async () => (await Native.localPath()).path,
    canChooseFolder: false,
  }),
  // Android may kill a backgrounded app without warning, so drafts are saved
  // as soon as it leaves the foreground.
  onBeforeClose(handler) {
    const listener = NativeApp.addListener("pause", () => void handler());
    return () => void listener.then((handle) => handle.remove());
  },
};

void NativeApp.addListener("backButton", () => {
  if (!goBack()) void NativeApp.minimizeApp();
});

applySavedTheme();

// Keeps the status bar icons readable in both themes.
function styleSystemBars() {
  const dark = document.documentElement.classList.contains("dark");
  void SystemBars.setStyle({
    style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  });
}
new MutationObserver(styleSystemBars).observe(document.documentElement, {
  attributeFilter: ["class"],
});
styleSystemBars();

createRoot(document.getElementById("root")!).render(<App />);
