import { app, safeStorage } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Connection } from "@repo/notes/api";

const settingsSchema = z.object({
  url: z.string(),
  username: z.string(),
  // Encrypted with the system keyring, base64 encoded.
  password: z.string().optional(),
});

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

export async function loadSettings() {
  try {
    const settings = settingsSchema.parse(
      JSON.parse(await readFile(settingsFile(), "utf8")),
    );
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
    return { url: settings.url, username: settings.username, password };
  } catch {
    return null;
  }
}

export async function saveSettings({ url, username, password }: Connection) {
  const settings = {
    url,
    username,
    password:
      password && (await canSavePassword())
        ? (await safeStorage.encryptStringAsync(password)).toString("base64")
        : undefined,
  };
  await writeFile(settingsFile(), JSON.stringify(settings, null, 2), {
    mode: 0o600,
  });
}

export function clearSettings() {
  return rm(settingsFile(), { force: true });
}
