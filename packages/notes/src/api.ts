import type { Note, NoteInput } from "./note";

export type Connection = { url: string; username: string; password: string };

export type SavedConnection = {
  url: string;
  username: string;
  /** False when the password couldn't be stored and must be typed again. */
  connected: boolean;
  /** False when there is no system keyring to encrypt the password with. */
  canSavePassword: boolean;
};

/** Errors are returned as values to keep their messages intact over IPC. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type NoteApi = {
  getConnection(): Promise<Result<SavedConnection>>;
  connect(connection: Connection): Promise<Result<SavedConnection>>;
  disconnect(): Promise<Result<null>>;
  listNotes(): Promise<Result<Note[]>>;
  createNote(data: NoteInput): Promise<Result<Note>>;
  updateNote(id: string, changes: NoteInput): Promise<Result<Note>>;
  deleteNote(id: string): Promise<Result<null>>;
  /** `handler` saves any drafts and resolves true if nothing would be lost. */
  onBeforeClose(handler: () => Promise<boolean>): () => void;
};
