// The storage the note store keeps its markdown files in: one flat folder,
// either on a WebDAV server or on this device.

export type FileInfo = {
  name: string;
  /** Changes whenever the file's contents may have changed. */
  version: string;
  modifiedAt: Date;
};

export type NoteFolder = {
  /**
   * Checks the folder is reachable, creating it if it doesn't exist. A missing
   * folder is an error everywhere else.
   */
  prepare(): Promise<void>;
  /** The regular files directly in the folder. */
  list(): Promise<FileInfo[]>;
  /** Null if the file doesn't exist. */
  stat(name: string): Promise<FileInfo | null>;
  /** Null if the file doesn't exist. */
  read(name: string): Promise<string | null>;
  write(name: string, contents: string): Promise<void>;
  /** Removing a file that is already gone is not an error. */
  remove(name: string): Promise<void>;
};

/** Thrown when the notes folder itself is missing. */
export class FolderNotFoundError extends Error {
  constructor() {
    super("The notes folder was not found");
    this.name = "FolderNotFoundError";
  }
}
