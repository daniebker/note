import type { Note, NoteInput } from "./note";

/** Notes kept in a folder on a WebDAV server. */
export type WebdavConnection = {
  type: "webdav";
  url: string;
  username: string;
  password: string;
};

/** Notes kept in a folder on this device, with no syncing. */
export type LocalConnection = { type: "local"; path: string };

export type Connection = WebdavConnection | LocalConnection;

export type StorageType = Connection["type"];

export type SavedConnection = {
  type: StorageType;
  url: string;
  username: string;
  /** The local notes folder: the one in use, or else the suggested one. */
  path: string;
  /** False when the password couldn't be stored and must be typed again. */
  connected: boolean;
  /** False when there is no system keyring to encrypt the password with. */
  canSavePassword: boolean;
  /** False when the app decides where local notes are kept. */
  canChooseFolder: boolean;
};

/** Notes copied from the previous location when the location changes. */
export type NoteCopy = {
  copied: number;
  /** Notes saved under a new name, as a different file had theirs. */
  renamed: number;
};

export type ConnectResult = SavedConnection & {
  /**
   * Set when the notes location changed. Null if there were notes elsewhere
   * that couldn't be copied, because the old location wasn't connected.
   */
  copy?: NoteCopy | null;
};

/** Errors are returned as values to keep their messages intact over IPC. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type NoteApi = {
  getConnection(): Promise<Result<SavedConnection>>;
  /**
   * Switches to `connection`, first copying the notes from the current
   * location if it is a different one. The old copies are left in place.
   */
  connect(connection: Connection): Promise<Result<ConnectResult>>;
  disconnect(): Promise<Result<null>>;
  /** Asks for a local notes folder; null if the user cancelled. */
  chooseFolder?(current: string): Promise<string | null>;
  listNotes(): Promise<Result<Note[]>>;
  createNote(data: NoteInput): Promise<Result<Note>>;
  updateNote(id: string, changes: NoteInput): Promise<Result<Note>>;
  deleteNote(id: string): Promise<Result<null>>;
  /** `handler` saves any drafts and resolves true if nothing would be lost. */
  onBeforeClose(handler: () => Promise<boolean>): () => void;
};
