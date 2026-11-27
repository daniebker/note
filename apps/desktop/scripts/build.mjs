import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";

process.chdir(path.join(import.meta.dirname, ".."));
rmSync("dist", { recursive: true, force: true });

const common = { bundle: true, sourcemap: false, logLevel: "warning" };

// Everything is bundled, so the packaged app ships without node_modules.
await Promise.all([
  build({
    ...common,
    entryPoints: { main: "src/main/index.ts", preload: "src/preload.ts" },
    outdir: "dist",
    outExtension: { ".js": ".cjs" },
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: { renderer: "src/renderer/main.tsx" },
    outdir: "dist",
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
  }),
]);

const require = createRequire(import.meta.url);
const tailwindPackage = require.resolve("@tailwindcss/cli/package.json");
const tailwindBin = path.join(
  path.dirname(tailwindPackage),
  require(tailwindPackage).bin.tailwindcss,
);
execFileSync(
  process.execPath,
  [tailwindBin, "-i", require.resolve("@repo/notes/styles.css"), "-o", "dist/styles.css", "--minify"],
  { stdio: "inherit" },
);

cpSync("src/renderer/index.html", "dist/index.html");
cpSync("assets/icon.png", "dist/icon.png");
