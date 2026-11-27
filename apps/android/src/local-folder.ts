import { FolderNotFoundError, type NoteFolder } from "@repo/notes/folder";
import type { LocalFile, NotePlugin } from "./native";

function fileInfo({ name, modified, size }: LocalFile) {
  return {
    name,
    version: `${modified}|${size}`,
    modifiedAt: new Date(modified),
  };
}

/** The notes folder in the app's own storage, reached through native code. */
export function createLocalFolder(native: NotePlugin): NoteFolder {
  return {
    prepare: () => native.localPrepare(),

    async list() {
      try {
        const { files } = await native.localList();
        return files.map(fileInfo);
      } catch (error) {
        if ((error as { code?: string } | null)?.code === "NOT_FOUND") {
          throw new FolderNotFoundError();
        }
        throw error;
      }
    },

    async stat(name) {
      const { file } = await native.localStat({ name });
      return file ? fileInfo(file) : null;
    },

    async read(name) {
      const { value } = await native.localRead({ name });
      return value ?? null;
    },

    write: (name, value) => native.localWrite({ name, value }),
    remove: (name) => native.localRemove({ name }),
  };
}
