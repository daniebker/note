// A notes folder on this device's filesystem. Needs Node.js, so it can only be
// used where the service runs in Node (the desktop app's main process).
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { type FileInfo, FolderNotFoundError, type NoteFolder } from "./folder.ts";

function code(error: unknown) {
  return (error as { code?: string } | null)?.code;
}

async function nullIfMissing<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (code(error) === "ENOENT") return null;
    throw error;
  }
}

function fileInfo(name: string, stats: Stats): FileInfo {
  return {
    name,
    version: `${stats.mtimeMs}|${stats.size}|${stats.ino}`,
    modifiedAt: stats.mtime,
  };
}

export function createLocalFolder(folder: string): NoteFolder {
  if (!path.isAbsolute(folder)) {
    throw new Error("Choose a full path to a folder");
  }
  const filePath = (name: string) => path.join(folder, name);

  async function requireFolder() {
    const stats = await nullIfMissing(stat(folder));
    if (!stats) throw new FolderNotFoundError();
    if (!stats.isDirectory()) throw new Error(`${folder} is not a folder`);
  }

  return {
    async prepare() {
      await mkdir(folder, { recursive: true });
      await requireFolder();
      await readdir(folder);
    },

    async list() {
      const entries = await nullIfMissing(
        readdir(folder, { withFileTypes: true }),
      );
      if (!entries) throw new FolderNotFoundError();
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const stats = await nullIfMissing(stat(filePath(entry.name)));
            return stats ? fileInfo(entry.name, stats) : null;
          }),
      );
      return files.filter((file) => file !== null);
    },

    async stat(name) {
      const stats = await nullIfMissing(stat(filePath(name)));
      return stats?.isFile() ? fileInfo(name, stats) : null;
    },

    read(name) {
      return nullIfMissing(readFile(filePath(name), "utf8"));
    },

    // Written to a hidden file first and moved into place, so that a crash
    // or full disk can't leave a note half written.
    async write(name, contents) {
      await requireFolder();
      const existing = await nullIfMissing(stat(filePath(name)));
      const temporary = filePath(`.${name}.${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, contents);
        // Keeps the permissions of the file being replaced.
        if (existing) await chmod(temporary, existing.mode & 0o7777);
        await rename(temporary, filePath(name));
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },

    async remove(name) {
      await rm(filePath(name), { force: true });
    },
  };
}
