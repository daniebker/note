// Notes are markdown files in one folder: `<folder>/<noteId>.md`. Attached
// files are in `<folder>/attachments/`.
import type { NewAttachment, Note, NoteInput } from "./note";
import type { FileInfo, NoteFolder } from "./folder";
import { type Frontmatter, parseNote, serializeNote } from "./markdown.ts";

type StoredNote = { note: Note; extra: Frontmatter };

import { freeName, isValidFileName, safeFileName } from "./file-names.ts";

// Ids are file names.
export const isValidId = isValidFileName;

const fileName = (id: string) => `${id}.md`;

export function createNoteStore(folder: NoteFolder) {
  // Parsed files, so listing only reads what changed since the last read.
  const cache = new Map<string, { version: string; stored: StoredNote }>();

  async function load(id: string, file: FileInfo): Promise<StoredNote | null> {
    const cached = cache.get(id);
    if (cached?.version === file.version) return cached.stored;

    const source = await folder.read(fileName(id));
    if (source === null) return null;

    const stored = parseNote(source, { id, modifiedAt: file.modifiedAt });
    cache.set(id, { version: file.version, stored });
    return stored;
  }

  async function read(id: string): Promise<StoredNote | null> {
    if (!isValidId(id)) return null;
    const file = await folder.stat(fileName(id));
    return file ? load(id, file) : null;
  }

  async function write({ note, extra }: StoredNote): Promise<void> {
    cache.delete(note.id);
    await folder.write(fileName(note.id), serializeNote(note, extra));
  }

  // Runs changes to one note one at a time, so that two quick edits (say,
  // pin then recolor) can't overwrite each other's read-modify-write.
  const locks = new Map<string, Promise<unknown>>();

  async function withLock<T>(id: string, run: () => Promise<T>): Promise<T> {
    const result = (locks.get(id) ?? Promise.resolve()).then(run);
    const settled = result.catch(() => {});
    locks.set(id, settled);
    try {
      return await result;
    } finally {
      if (locks.get(id) === settled) locks.delete(id);
    }
  }

  async function loadAll(): Promise<StoredNote[]> {
    const files = await folder.list();
    const loaded = await Promise.all(
      files.map((file) => {
        const id = file.name.replace(/\.md$/, "");
        const isNote = file.name.endsWith(".md") && isValidId(id);
        return isNote ? load(id, file) : null;
      }),
    );
    return loaded.flatMap((stored) => (stored ? [stored] : []));
  }

  // Deletes the files of attachments being taken off a note, apart from any
  // that another note (say, a copy made by hand) also has.
  async function removeFiles(id: string, names: string[]) {
    if (names.length === 0) return;
    const shared = new Set(
      (await loadAll())
        .filter(({ note }) => note.id !== id)
        .flatMap(({ note }) => note.attachments),
    );
    await Promise.all(
      names
        .filter((name) => !shared.has(name))
        .map((name) => folder.attachments.remove(name)),
    );
  }

  // Saves a file under a name no other attachment has. One at a time, so that
  // two files can't be given the same name.
  function saveFile({ name, data }: NewAttachment): Promise<string> {
    // A key that can't be a note's id.
    return withLock("/attachments", async () => {
      const taken = await folder.attachments.list();
      const free = freeName(safeFileName(name), taken);
      await folder.attachments.write(free, data);
      return free;
    });
  }

  // Applies a change to a note as it currently is on disk.
  async function change(
    id: string,
    edit: (stored: StoredNote) => Partial<Note>,
  ): Promise<Note> {
    const stored = await read(id);
    if (!stored) throw new Error("This note no longer exists");
    const note: Note = {
      ...stored.note,
      ...edit(stored),
      updatedAt: new Date().toISOString(),
    };
    await write({ note, extra: stored.extra });
    return note;
  }

  return {
    prepare: () => folder.prepare(),

    // A missing folder is an error here, not an empty list: showing no notes
    // would look like they had been lost.
    async list(): Promise<Note[]> {
      const loaded = await loadAll();
      return loaded
        .map((stored) => stored.note)
        .filter((note) => !note.archived)
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            b.updatedAt.localeCompare(a.updatedAt),
        );
    },

    async create(data: NoteInput): Promise<Note> {
      const now = new Date().toISOString();
      const note: Note = {
        title: "",
        content: "",
        color: "default",
        pinned: false,
        archived: false,
        attachments: [],
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      await write({ note, extra: {} });
      return note;
    },

    update(id: string, changes: NoteInput): Promise<Note> {
      return withLock(id, () => change(id, () => changes));
    },

    /**
     * Deletes a note and its attached files. Deleting a note that is already
     * gone is not an error.
     */
    remove(id: string): Promise<void> {
      return withLock(id, async () => {
        if (!isValidId(id)) throw new Error("Invalid note id");
        // The files go first: if that fails, the note is still there to retry.
        const stored = await read(id);
        if (stored) await removeFiles(id, stored.note.attachments);
        await folder.remove(fileName(id));
        cache.delete(id);
      });
    },

    async addAttachment(id: string, file: NewAttachment): Promise<Note> {
      if (!(await read(id))) throw new Error("This note no longer exists");
      // Uploaded without locking the note, so its text can still be saved.
      const name = await saveFile(file);
      try {
        return await withLock(id, () =>
          change(id, ({ note, extra }) => {
            if (extra.attachments !== undefined) {
              throw new Error(
                "This note's file already has an unrecognised attachments property",
              );
            }
            return { attachments: [...note.attachments, name] };
          }),
        );
      } catch (error) {
        // Best effort: the original error is the one worth reporting.
        await folder.attachments.remove(name).catch(() => {});
        throw error;
      }
    },

    /** Takes a file off a note and deletes it. */
    removeAttachment(id: string, name: string): Promise<Note> {
      return withLock(id, async () => {
        const stored = await read(id);
        if (!stored) throw new Error("This note no longer exists");
        if (!stored.note.attachments.includes(name)) return stored.note;
        // The file goes first: if that fails, it can be removed again.
        await removeFiles(id, [name]);
        return change(id, ({ note }) => ({
          attachments: note.attachments.filter((other) => other !== name),
        }));
      });
    },

    async readAttachment(name: string): Promise<Uint8Array> {
      if (!isValidFileName(name)) throw new Error("Invalid attachment name");
      const data = await folder.attachments.read(name);
      if (!data) throw new Error(`The file ${name} is missing`);
      return data;
    },
  };
}

export type NoteStore = ReturnType<typeof createNoteStore>;
