// Implements the app's API on top of the note store. Each app supplies a way to
// keep the connection settings.
import { z } from "zod";
import type { Connection, NoteApi, Result, SavedConnection } from "./api";
import { createNoteStore, type NoteStore } from "./note-store.ts";

export type StoredConnection = {
  url: string;
  username: string;
  /** Null when it has to be typed again. */
  password: string | null;
};

export type SettingsStorage = {
  load(): Promise<StoredConnection | null>;
  save(connection: Connection): Promise<void>;
  clear(): Promise<void>;
  canSavePassword(): Promise<boolean>;
};

export type NoteService = Omit<NoteApi, "onBeforeClose">;

const connectionSchema = z.object({
  url: z
    .url({ protocol: /^https?$/, error: "Enter an http:// or https:// URL" })
    .trim(),
  username: z.string(),
  password: z.string(),
});

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
  return error instanceof Error ? error.message : String(error);
}

async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    console.error(errorMessage(error));
    return { ok: false, error: errorMessage(error) };
  }
}

export function createNoteService(settings: SettingsStorage): NoteService {
  let store: NoteStore | null = null;

  function requireStore() {
    if (!store) throw new Error("Not connected to a WebDAV server");
    return store;
  }

  return {
    getConnection: () =>
      attempt(async (): Promise<SavedConnection> => {
        const saved = await settings.load();
        if (!store && saved && saved.password !== null) {
          store = createNoteStore({ ...saved, password: saved.password });
        }
        return {
          url: saved?.url ?? "",
          username: saved?.username ?? "",
          connected: store !== null,
          canSavePassword: await settings.canSavePassword(),
        };
      }),

    connect: (input) =>
      attempt(async (): Promise<SavedConnection> => {
        const connection = connectionSchema.parse(input);
        const next = createNoteStore(connection);
        await next.prepare();
        await settings.save(connection);
        store = next;
        return {
          url: connection.url,
          username: connection.username,
          connected: true,
          canSavePassword: await settings.canSavePassword(),
        };
      }),

    disconnect: () =>
      attempt(async () => {
        await settings.clear();
        store = null;
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
