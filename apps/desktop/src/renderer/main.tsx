/// <reference types="@repo/notes/window" />
import { createRoot } from "react-dom/client";
import { applySavedTheme } from "@repo/notes/theme";
import { App } from "@repo/notes/ui/app";

applySavedTheme();

createRoot(document.getElementById("root")!).render(<App canDownload />);
