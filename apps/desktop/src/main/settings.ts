import { app, safeStorage } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Connection } from "@repo/notes/api";
import type { StoredConnection } from "@repo/notes/service";

const settingsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("webdav"),
    url: z.string(),
    username: z.string(),
    // Encrypted with the system keyring, base64 encoded.
    password: z.string().optional(),
  }),
  z.object({ type: z.literal("local"), path: z.string() }),
]);

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

// Without a keyring, Electron on Linux falls back to a hard-coded key, which
// is no better than plain text. The password isn't stored in that case.
export async function canSavePassword() {
  return (
    (await safeStorage.isAsyncEncryptionAvailable()) &&
    (process.platform !== "linux" ||
      safeStorage.getSelectedStorageBackend() !== "basic_text")
  );
}

/** The folder suggested for notes kept on this computer. */
export function defaultNotesFolder() {
  return path.join(app.getPath("documents"), "Notes");
}

export async function loadSettings(): Promise<StoredConnection | null> {
  try {
    const json: unknown = JSON.parse(await readFile(settingsFile(), "utf8"));
    // Settings from before local folders were supported have no type.
    const settings = settingsSchema.parse(
      json && typeof json === "object" && !("type" in json)
        ? { ...json, type: "webdav" }
        : json,
    );
    if (settings.type === "local") return settings;
    let password: string | null = settings.username ? null : "";
    if (settings.password !== undefined && (await canSavePassword())) {
      try {
        const decrypted = await safeStorage.decryptStringAsync(
          Buffer.from(settings.password, "base64"),
        );
        password = decrypted.result;
      } catch {
        // The keyring changed: ask for the password again.
      }
    }
    return {
      type: "webdav",
      url: settings.url,
      username: settings.username,
      password,
    };
  } catch {
    return null;
  }
}

async function toSettings(
  connection: Connection,
): Promise<z.input<typeof settingsSchema>> {
  if (connection.type === "local") return connection;
  const { password, ...rest } = connection;
  if (!password || !(await canSavePassword())) return rest;
  const encrypted = await safeStorage.encryptStringAsync(password);
  return { ...rest, password: encrypted.toString("base64") };
}

export async function saveSettings(connection: Connection) {
  const settings = await toSettings(connection);
  await writeFile(settingsFile(), JSON.stringify(settings, null, 2), {
    mode: 0o600,
  });
}

export function clearSettings() {
  return rm(settingsFile(), { force: true });
}
