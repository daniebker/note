import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";

process.chdir(path.join(import.meta.dirname, ".."));
rmSync("www", { recursive: true, force: true });

await build({
  entryPoints: { app: "src/main.tsx" },
  outdir: "www",
  bundle: true,
  platform: "browser",
  format: "iife",
  // The oldest WebView Capacitor supports by default.
  target: "chrome60",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

const require = createRequire(import.meta.url);
const tailwindPackage = require.resolve("@tailwindcss/cli/package.json");
const tailwindBin = path.join(
  path.dirname(tailwindPackage),
  require(tailwindPackage).bin.tailwindcss,
);
execFileSync(
  process.execPath,
  [tailwindBin, "-i", require.resolve("@repo/notes/styles.css"), "-o", "www/styles.css", "--minify"],
  { stdio: "inherit" },
);

cpSync("src/index.html", "www/index.html");
