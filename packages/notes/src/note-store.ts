// Notes are markdown files in one WebDAV folder: `<url>/<noteId>.md`.
import { createClient, type FileStat } from "webdav";
import type { Connection } from "./api";
import type { Note, NoteInput } from "./note";
import { type Frontmatter, parseNote, serializeNote } from "./markdown.ts";

type StoredNote = { note: Note; extra: Frontmatter };

const MAX_CONCURRENT_REQUESTS = 8;

// Ids are file names, so anything that could leave the folder is rejected.
// Hidden files (editor swap files and the like) are ignored.
function isValidId(id: string) {
  return id !== "" && !id.startsWith(".") && !/[/\\\0]/.test(id);
}

function isNotFound(error: unknown) {
  return (error as { status?: number } | null)?.status === 404;
}

async function nullIfNotFound<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function createNoteStore({ url, username, password }: Connection) {
  // The client is rooted at the server so that `prepare` can create the notes
  // folder itself.
  const { origin, pathname } = new URL(url);
  const dav = createClient(origin, {
    username: username || undefined,
    password: password || undefined,
  });
  const folder = pathname.split("/").map(decodeURIComponent).join("/");
  const root = folder.replace(/\/+$/, "");
  const notePath = (id: string) => `${root}/${id}.md`;

  let activeRequests = 0;
  const waiting: (() => void)[] = [];

  async function request<T>(run: () => Promise<T>): Promise<T> {
    if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      // The finishing request hands its slot straight to us.
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      activeRequests++;
    }
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else activeRequests--;
    }
  }

  // Parsed files, so listing only downloads what changed since the last read.
  const cache = new Map<string, { version: string; stored: StoredNote }>();

  async function load(id: string, stat: FileStat): Promise<StoredNote | null> {
    const path = notePath(id);
    const version = `${stat.etag}|${stat.lastmod}|${stat.size}`;
    const cached = cache.get(path);
    if (cached?.version === version) return cached.stored;

    const source = await nullIfNotFound(
      request(() => dav.getFileContents(path, { format: "text" })),
    );
    if (source === null) return null;

    const stored = parseNote(source as string, {
      id,
      modifiedAt: new Date(stat.lastmod),
    });
    cache.set(path, { version, stored });
    return stored;
  }

  async function read(id: string): Promise<StoredNote | null> {
    if (!isValidId(id)) return null;
    const stat = await nullIfNotFound(
      request(() => dav.stat(notePath(id)) as Promise<FileStat>),
    );
    return stat ? load(id, stat) : null;
  }

  async function write({ note, extra }: StoredNote): Promise<void> {
    const path = notePath(note.id);
    const written = await request(() =>
      dav.putFileContents(path, serializeNote(note, extra)),
    );
    cache.delete(path);
    if (!written) throw new Error(`Failed to write ${path}`);
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
    /**
     * Checks the folder is reachable, creating it if it doesn't exist. Its
     * parent folder must already be there.
     */
    async prepare() {
      if (!(await dav.exists(root || "/"))) await dav.createDirectory(root);
      await dav.getDirectoryContents(root || "/");
    },

    // A missing folder is an error here, not an empty list: showing no notes
    // would look like they had been lost.
    async list(): Promise<Note[]> {
      const entries = await request(
        () => dav.getDirectoryContents(root || "/") as Promise<FileStat[]>,
      );
      const loaded = await Promise.all(
        entries.map((entry) => {
          const id = entry.basename.replace(/\.md$/, "");
          const isNote =
            entry.type === "file" &&
            entry.basename.endsWith(".md") &&
            isValidId(id);
          return isNote ? load(id, entry) : null;
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
        await nullIfNotFound(request(() => dav.deleteFile(notePath(id))));
        cache.delete(notePath(id));
      });
    },
  };
}

export type NoteStore = ReturnType<typeof createNoteStore>;
