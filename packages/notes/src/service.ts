// Implements the app's API on top of the note store. Each app supplies a way to
// keep the connection settings, and to reach a folder on the device.
import { z } from "zod";
import type {
  Connection,
  ConnectResult,
  NoteApi,
  Result,
  SavedConnection,
} from "./api";
import { copyNotes } from "./copy-notes.ts";
import { FolderNotFoundError, type NoteFolder } from "./folder.ts";
import { createNoteStore, type NoteStore } from "./note-store.ts";
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
};

export type NoteService = Omit<NoteApi, "onBeforeClose" | "chooseFolder">;

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

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Invalid input";
  }
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403) {
    return "The server rejected the username or password";
  }
  if (status === 404) return "The notes folder was not found on the server";
  if (error instanceof FolderNotFoundError) return error.message;
  const code = (error as { code?: string } | null)?.code;
  if (code === "EACCES" || code === "EPERM") {
    return "You don't have permission to use the notes folder";
  }
  if (code === "ENOSPC") return "The disk is full";
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
  // The open notes folder, and where it is.
  let active: {
    location: string;
    folder: NoteFolder;
    store: NoteStore;
  } | null = null;

  function requireStore() {
    if (!active) throw new Error("No notes folder has been chosen");
    return active.store;
  }

  function open(connection: Connection) {
    const folder =
      connection.type === "local"
        ? local.open(connection.path)
        : createWebdavFolder(connection);
    return {
      location: locationOf(connection),
      folder,
      store: createNoteStore(folder),
    };
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
            active = open(saved);
          } else if (saved.password !== null) {
            active = open({ ...saved, password: saved.password });
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
        const next = open(connection);
        await next.store.prepare();

        const saved = await settings.load();
        let copy: ConnectResult["copy"];
        if (active && active.location !== next.location) {
          try {
            copy = await copyNotes(active.folder, next.folder, {
              move: removeOld,
            });
          } catch (error) {
            throw new Error(
              `Couldn't ${removeOld ? "move" : "copy"} your notes from the old location (${errorMessage(error)}). To switch without them, disconnect first.`,
            );
          }
        } else if (!active && saved && locationOf(saved) !== next.location) {
          copy = null;
        }

        await settings.save(connection);
        active = next;
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
        active = null;
        return null;
      }),

    listNotes: () => attempt(async () => requireStore().list()),
    createNote: (data) =>
      attempt(async () => requireStore().create(noteSchema.parse(data))),
    updateNote: (id, changes) =>
      attempt(async () =>
        requireStore().update(z.string().parse(id), noteSchema.parse(changes)),
      ),
    deleteNote: (id) =>
      attempt(async () => {
        await requireStore().remove(z.string().parse(id));
        return null;
      }),
  };
}
