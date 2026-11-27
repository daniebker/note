// Implements the app's API on top of the note store. Each app supplies a way to
// keep the connection settings, and to reach a folder on the device.
import { z } from "zod";
import type {
  Connection,
  ConnectResult,
  NoteApi,
  Result,
  SavedConnection,
  SyncStatus,
} from "./api";
import { copyNotes } from "./copy-notes.ts";
import { FolderNotFoundError, type NoteFolder } from "./folder.ts";
import { isValidFileName } from "./file-names.ts";
import { createNoteStore, type NoteStore } from "./note-store.ts";
import { MAX_ATTACHMENT_BYTES } from "./note.ts";
import { createSync, type Sync } from "./sync.ts";
import { createWebdavFolder } from "./webdav-folder.ts";

export type StoredConnection =
  | {
      type: "webdav";
      url: string;
      username: string;
      /** Null when it has to be typed again. */
      password: string | null;
    }
  | { type: "local"; path: string };

export type SettingsStorage = {
  /**
   * Settings saved before local folders were supported have no `type`, and
   * must be read as WebDAV.
   */
  load(): Promise<StoredConnection | null>;
  save(connection: Connection): Promise<void>;
  clear(): Promise<void>;
  canSavePassword(): Promise<boolean>;
};

export type LocalStorage = {
  open(path: string): NoteFolder;
  /** The folder suggested when none has been chosen. */
  defaultPath(): Promise<string>;
  /** False when notes always go in `defaultPath`. */
  canChooseFolder: boolean;
  /**
   * A folder private to the app, to hold the copy of a server's notes. `key`
   * is a different hex string for each server folder and user.
   */
  openMirror(key: string): NoteFolder;
};

export type NoteService = Omit<
  NoteApi,
  "onBeforeClose" | "chooseFolder" | "openAttachment"
>;

const connectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("webdav"),
    url: z
      .url({ protocol: /^https?$/, error: "Enter an http:// or https:// URL" })
      .trim(),
    username: z.string(),
    password: z.string(),
  }),
  z.object({
    type: z.literal("local"),
    path: z.string().trim().min(1, "Choose a folder for your notes"),
  }),
]);

const connectOptionsSchema = z.object({ removeOld: z.boolean().optional() });

const noteSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  color: z.string().max(30).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

const attachmentSchema = z.object({
  name: z.string(),
  data: z
    .instanceof(Uint8Array)
    .refine((data) => data.byteLength <= MAX_ATTACHMENT_BYTES, {
      error: "Attachments can be at most 25 MB",
    }),
});

const UNREACHABLE =
  /fetch failed|failed to fetch|^request to |reach the server|ECONN|ENOTFOUND|abort|timed? ?out/i;

const statusOf = (error: unknown) =>
  (error as { status?: number } | null)?.status;

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Invalid input";
  }
  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return "The server rejected the username or password";
  }
  if (status === 404) return "The notes folder was not found on the server";
  if (status === 413) return "The server says the file is too large";
  if (error instanceof FolderNotFoundError) return error.message;
  const code = (error as { code?: string } | null)?.code;
  if (code === "EACCES" || code === "EPERM") {
    return "You don't have permission to use the notes folder";
  }
  if (code === "ENOSPC") return "The disk is full";
  if (
    status === undefined &&
    error instanceof Error &&
    UNREACHABLE.test(error.message)
  ) {
    return "Couldn't reach the server";
  }
  return error instanceof Error ? error.message : String(error);
}

// Identifies where notes are kept, to tell whether a new connection moves them.
function locationOf(connection: StoredConnection): string {
  if (connection.type === "local") {
    return `local:${connection.path.replace(/(.)[/\\]+$/, "$1")}`;
  }
  try {
    const url = new URL(connection.url);
    url.pathname = url.pathname.replace(/\/+$/, "");
    return `webdav:${url.href}`;
  } catch {
    return `webdav:${connection.url}`;
  }
}

async function mirrorKey(location: string, username: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${location}\n${username}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    console.error(errorMessage(error));
    return { ok: false, error: errorMessage(error) };
  }
}

export function createNoteService(
  settings: SettingsStorage,
  local: LocalStorage,
): NoteService {
  type Open = {
    location: string;
    /** Where the notes are kept: a local folder, or one on a server. */
    source: NoteFolder;
    /** Works on `source`, or on this device's copy of it. */
    store: NoteStore;
    /** Keeps that copy in step with a server. */
    sync: { key: string; engine: Sync } | null;
  };

  let active: Open | null = null;
  const listeners = new Set<(status: SyncStatus | null) => void>();

  const syncStatus = () => active?.sync?.engine.status() ?? null;

  function announce() {
    const status = syncStatus();
    listeners.forEach((listener) => listener(status));
  }

  function requireActive() {
    if (!active) throw new Error("No notes folder has been chosen");
    return active;
  }

  const requireStore = () => requireActive().store;

  // Changes mustn't overlap with syncing's, and are sent on afterwards.
  async function change<T>(run: (store: NoteStore) => Promise<T>): Promise<T> {
    const { store, sync } = requireActive();
    if (!sync) return run(store);
    try {
      return await sync.engine.lock(() => run(store));
    } finally {
      sync.engine.schedule();
    }
  }

  async function open(connection: Connection): Promise<Open> {
    const location = locationOf(connection);
    if (connection.type === "local") {
      const source = local.open(connection.path);
      return { location, source, store: createNoteStore(source), sync: null };
    }
    const source = createWebdavFolder(connection);
    const key = await mirrorKey(location, connection.username);
    const mirror = local.openMirror(key);
    await mirror.prepare();
    const engine: Sync = createSync({
      local: mirror,
      remote: source,
      describeError: errorMessage,
      onStatus: () => {
        if (active?.sync?.engine === engine) announce();
      },
    });
    return {
      location,
      source,
      store: createNoteStore(mirror),
      sync: { key, engine },
    };
  }

  function start(next: Open) {
    active = next;
    announce();
    void next.sync?.engine.run();
  }

  // Stops syncing, and deletes the copy of the notes if the server has it all.
  // Otherwise it is kept, to be synced on connecting there again.
  async function close({ sync }: Open, keepKey?: string) {
    if (!sync) return;
    await sync.engine.stop();
    if (sync.key !== keepKey && !(await sync.engine.hasPendingChanges())) {
      await sync.engine.clear();
    }
  }

  // Whether a server that can't be reached has been synced with before, so
  // that its notes can be used from this device's copy.
  async function canResume(
    next: Open,
    saved: StoredConnection | null,
    error: unknown,
  ) {
    const status = statusOf(error);
    return (
      next.sync !== null &&
      status !== 401 &&
      status !== 403 &&
      saved !== null &&
      locationOf(saved) === next.location &&
      (await next.sync.engine.hasSynced())
    );
  }

  async function describe(
    saved: StoredConnection | null,
  ): Promise<SavedConnection> {
    const webdav = saved?.type === "webdav" ? saved : null;
    return {
      type: saved?.type ?? "local",
      url: webdav?.url ?? "",
      username: webdav?.username ?? "",
      path:
        saved?.type === "local" && local.canChooseFolder
          ? saved.path
          : await local.defaultPath(),
      connected: active !== null,
      canSavePassword: await settings.canSavePassword(),
      canChooseFolder: local.canChooseFolder,
    };
  }

  return {
    getConnection: () =>
      attempt(async () => {
        const saved = await settings.load();
        if (!active && saved) {
          if (saved.type === "local") {
            start(await open(saved));
          } else if (saved.password !== null) {
            start(await open({ ...saved, password: saved.password }));
          }
        }
        return describe(saved);
      }),

    connect: (input, options) =>
      attempt(async () => {
        let connection = connectionSchema.parse(input);
        const { removeOld } = connectOptionsSchema.parse(options ?? {});
        if (connection.type === "local" && !local.canChooseFolder) {
          connection = { type: "local", path: await local.defaultPath() };
        }
        const next = await open(connection);
        const saved = await settings.load();
        try {
          await next.source.prepare();
        } catch (error) {
          if (!(await canResume(next, saved, error))) throw error;
        }

        let copy: ConnectResult["copy"];
        const previous = active;
        if (previous && previous.location !== next.location) {
          try {
            // The server must be up to date before copying from it.
            await previous.sync?.engine.flush();
            copy = await copyNotes(previous.source, next.source, {
              move: removeOld,
            });
          } catch (error) {
            throw new Error(
              `Couldn't ${removeOld ? "move" : "copy"} your notes from the old location (${errorMessage(error)}). To switch without them, disconnect first.`,
            );
          }
        } else if (!previous && saved && locationOf(saved) !== next.location) {
          copy = null;
        }

        await settings.save(connection);
        if (previous) await close(previous, next.sync?.key);
        start(next);
        const result: ConnectResult = await describe(
          connection.type === "webdav"
            ? { ...connection, password: null }
            : connection,
        );
        if (copy !== undefined) result.copy = copy;
        return result;
      }),

    disconnect: () =>
      attempt(async () => {
        await settings.clear();
        const previous = active;
        active = null;
        announce();
        if (previous) await close(previous);
        return null;
      }),

    getSyncStatus: () => attempt(async () => syncStatus()),
    sync: () =>
      attempt(async () => {
        await active?.sync?.engine.run();
        return syncStatus();
      }),
    onSyncStatus(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    listNotes: () => attempt(async () => requireStore().list()),
    createNote: (data) =>
      attempt(async () => {
        const note = noteSchema.parse(data);
        return change((store) => store.create(note));
      }),
    updateNote: (id, changes) =>
      attempt(async () => {
        const noteId = z.string().parse(id);
        const parsed = noteSchema.parse(changes);
        return change((store) => store.update(noteId, parsed));
      }),
    deleteNote: (id) =>
      attempt(async () => {
        const noteId = z.string().parse(id);
        await change((store) => store.remove(noteId));
        return null;
      }),
    addAttachment: (id, file) =>
      attempt(async () => {
        const noteId = z.string().parse(id);
        const attachment = attachmentSchema.parse(file);
        return change((store) => store.addAttachment(noteId, attachment));
      }),
    removeAttachment: (id, name) =>
      attempt(async () => {
        const noteId = z.string().parse(id);
        const attachment = z.string().parse(name);
        return change((store) => store.removeAttachment(noteId, attachment));
      }),
    readAttachment: (name) =>
      attempt(async () => {
        const attachment = z.string().parse(name);
        const { store, source, sync } = requireActive();
        try {
          return await store.readAttachment(attachment);
        } catch (error) {
          if (!sync || !isValidFileName(attachment)) throw error;
          // It may not have been downloaded yet.
          const data = await source.attachments.read(attachment);
          if (!data) throw error;
          return data;
        }
      }),
  };
}
