// The storage the note store keeps its files in: a folder of markdown files
// with a folder of attachments inside it, either on a WebDAV server or on this
// device.

export type FileInfo = {
  name: string;
  /** Changes whenever the file's contents may have changed. */
  version: string;
  modifiedAt: Date;
};

/** The folder of attached files. It is only created once there is a file. */
export type AttachmentFolder = {
  /** The names of the files in it; none if it doesn't exist. */
  list(): Promise<string[]>;
  /** Null if the file doesn't exist. */
  read(name: string): Promise<Uint8Array | null>;
  /** Creates the folder if needed, but not the notes folder around it. */
  write(name: string, data: Uint8Array): Promise<void>;
  /** Removing a file that is already gone is not an error. */
  remove(name: string): Promise<void>;
};

export type NoteFolder = {
  attachments: AttachmentFolder;
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
