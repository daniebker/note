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
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { ATTACHMENTS_FOLDER } from "./file-names.ts";
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

  const attachments = path.join(folder, ATTACHMENTS_FOLDER);
  const attachmentPath = (name: string) => path.join(attachments, name);

  // Written to a hidden file first and moved into place, so that a crash or
  // full disk can't leave a file half written.
  async function replaceFile(target: string, contents: string | Uint8Array) {
    const existing = await nullIfMissing(stat(target));
    const temporary = path.join(
      path.dirname(target),
      `.${path.basename(target)}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporary, contents);
      // Keeps the permissions of the file being replaced.
      if (existing) await chmod(temporary, existing.mode & 0o7777);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async function statFile(parent: string, name: string) {
    const stats = await nullIfMissing(stat(path.join(parent, name)));
    return stats?.isFile() ? fileInfo(name, stats) : null;
  }

  // Null if the folder doesn't exist.
  async function listFiles(parent: string) {
    const entries = await nullIfMissing(
      readdir(parent, { withFileTypes: true }),
    );
    if (!entries) return null;
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map((entry) => statFile(parent, entry.name)),
    );
    return files.filter((file) => file !== null);
  }

  return {
    attachments: {
      async list() {
        return (await listFiles(attachments)) ?? [];
      },

      stat: (name) => statFile(attachments, name),

      async read(name) {
        const data = await nullIfMissing(readFile(attachmentPath(name)));
        // A copy, as a Buffer may be a view of a larger shared one.
        return data && new Uint8Array(data);
      },

      async write(name, data) {
        await requireFolder();
        // Not recursive, so the notes folder is never recreated here.
        try {
          await mkdir(attachments);
        } catch (error) {
          if (code(error) !== "EEXIST") throw error;
        }
        await replaceFile(attachmentPath(name), data);
      },

      async remove(name) {
        await rm(attachmentPath(name), { force: true });
      },
    },

    async prepare() {
      await mkdir(folder, { recursive: true });
      await requireFolder();
      await readdir(folder);
    },

    async list() {
      const files = await listFiles(folder);
      if (!files) throw new FolderNotFoundError();
      return files;
    },

    stat: (name) => statFile(folder, name),

    read(name) {
      return nullIfMissing(readFile(filePath(name), "utf8"));
    },

    async write(name, contents, modifiedAt) {
      await requireFolder();
      await replaceFile(filePath(name), contents);
      if (modifiedAt) await utimes(filePath(name), modifiedAt, modifiedAt);
    },

    async remove(name) {
      await rm(filePath(name), { force: true });
    },
  };
}
