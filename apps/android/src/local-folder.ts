import { FolderNotFoundError, type NoteFolder } from "@repo/notes/folder";
import type { LocalFile, NotePlugin } from "./native";
import { fromBase64, toBase64 } from "./base64.ts";

function fileInfo({ name, modified, size }: LocalFile) {
  return {
    name,
    version: `${modified}|${size}`,
    modifiedAt: new Date(modified),
  };
}

/**
 * A notes folder in the app's own storage, reached through native code: the
 * one for notes kept on the device, or the copy of a server's named `mirror`.
 */
export function createLocalFolder(
  native: NotePlugin,
  mirror?: string,
): NoteFolder {
  return {
    attachments: {
      async list() {
        return (await native.attachmentList({ mirror })).files.map(fileInfo);
      },
      async stat(name) {
        const { file } = await native.attachmentStat({ mirror, name });
        return file ? fileInfo(file) : null;
      },
      async read(name) {
        const { data } = await native.attachmentRead({ mirror, name });
        return data === undefined ? null : fromBase64(data);
      },
      write: (name, data) =>
        native.attachmentWrite({ mirror, name, data: toBase64(data) }),
      remove: (name) => native.attachmentRemove({ mirror, name }),
    },

    prepare: () => native.localPrepare({ mirror }),

    async list() {
      try {
        const { files } = await native.localList({ mirror });
        return files.map(fileInfo);
      } catch (error) {
        if ((error as { code?: string } | null)?.code === "NOT_FOUND") {
          throw new FolderNotFoundError();
        }
        throw error;
      }
    },

    async stat(name) {
      const { file } = await native.localStat({ mirror, name });
      return file ? fileInfo(file) : null;
    },

    async read(name) {
      const { value } = await native.localRead({ mirror, name });
      return value ?? null;
    },

    write: (name, value, modifiedAt) =>
      native.localWrite({
        mirror,
        name,
        value,
        modified: modifiedAt?.getTime(),
      }),
    remove: (name) => native.localRemove({ mirror, name }),
  };
}
