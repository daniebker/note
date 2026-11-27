// Notes are markdown files in one folder: `<folder>/<noteId>.md`.
import type { Note, NoteInput } from "./note";
import type { FileInfo, NoteFolder } from "./folder";
import { type Frontmatter, parseNote, serializeNote } from "./markdown.ts";

type StoredNote = { note: Note; extra: Frontmatter };

// Ids are file names, so anything that could leave the folder is rejected.
// Hidden files (editor swap files and the like) are ignored.
export function isValidId(id: string) {
  return id !== "" && !id.startsWith(".") && !/[/\\\0]/.test(id);
}

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

  return {
    prepare: () => folder.prepare(),

    // A missing folder is an error here, not an empty list: showing no notes
    // would look like they had been lost.
    async list(): Promise<Note[]> {
      const files = await folder.list();
      const loaded = await Promise.all(
        files.map((file) => {
          const id = file.name.replace(/\.md$/, "");
          const isNote = file.name.endsWith(".md") && isValidId(id);
          return isNote ? load(id, file) : null;
        }),
      );
      return loaded
        .flatMap((stored) => (stored ? [stored.note] : []))
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
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      await write({ note, extra: {} });
      return note;
    },

    update(id: string, changes: NoteInput): Promise<Note> {
      return withLock(id, async () => {
        const stored = await read(id);
        if (!stored) throw new Error("This note no longer exists");
        const note: Note = {
          ...stored.note,
          ...changes,
          updatedAt: new Date().toISOString(),
        };
        await write({ note, extra: stored.extra });
        return note;
      });
    },

    /** Deleting a note that is already gone is not an error. */
    remove(id: string): Promise<void> {
      return withLock(id, async () => {
        if (!isValidId(id)) throw new Error("Invalid note id");
        await folder.remove(fileName(id));
        cache.delete(id);
      });
    },
  };
}

export type NoteStore = ReturnType<typeof createNoteStore>;
