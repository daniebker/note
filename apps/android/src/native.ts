import { registerPlugin } from "@capacitor/core";

export type HttpRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Base64 encoded. */
  body?: string;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  /** Base64 encoded. */
  body: string;
};

export type LocalFile = { name: string; modified: number; size: number };

/** `mirror` picks the copy of a server's notes, rather than local notes. */
export type InFolder = { mirror?: string };
export type NamedFile = InFolder & { name: string };

export type NotePlugin = {
  request(request: HttpRequest): Promise<HttpResponse>;
  /** The saved settings, encrypted at rest with an Android Keystore key. */
  loadSettings(): Promise<{ value?: string }>;
  saveSettings(options: { value: string }): Promise<void>;
  clearSettings(): Promise<void>;
  /** The folder in app storage that local notes are kept in. */
  localPath(): Promise<{ path: string }>;
  localPrepare(options: InFolder): Promise<void>;
  /** Rejects with code NOT_FOUND if the folder is missing. */
  localList(options: InFolder): Promise<{ files: LocalFile[] }>;
  localStat(options: NamedFile): Promise<{ file?: LocalFile }>;
  localRead(options: NamedFile): Promise<{ value?: string }>;
  localWrite(
    options: NamedFile & { value: string; modified?: number },
  ): Promise<void>;
  localRemove(options: NamedFile): Promise<void>;
  /** The folder of attached files; empty if there isn't one yet. */
  attachmentList(options: InFolder): Promise<{ files: LocalFile[] }>;
  attachmentStat(options: NamedFile): Promise<{ file?: LocalFile }>;
  /** `data` is base64 encoded, as in the other attachment methods. */
  attachmentRead(options: NamedFile): Promise<{ data?: string }>;
  attachmentWrite(options: NamedFile & { data: string }): Promise<void>;
  attachmentRemove(options: NamedFile): Promise<void>;
  /** Hands a copy of a file to an app that can show it. */
  openFile(options: { name: string; data: string }): Promise<void>;
};

// Implemented in android/app/src/main/java/.../NotePlugin.java
export const Native = registerPlugin<NotePlugin>("NoteNative");
