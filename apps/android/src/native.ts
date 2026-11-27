import { registerPlugin } from "@capacitor/core";

export type HttpRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type LocalFile = { name: string; modified: number; size: number };

export type NotePlugin = {
  request(request: HttpRequest): Promise<HttpResponse>;
  /** The saved settings, encrypted at rest with an Android Keystore key. */
  loadSettings(): Promise<{ value?: string }>;
  saveSettings(options: { value: string }): Promise<void>;
  clearSettings(): Promise<void>;
  /** The folder in app storage that local notes are kept in. */
  localPath(): Promise<{ path: string }>;
  localPrepare(): Promise<void>;
  /** Rejects with code NOT_FOUND if the folder is missing. */
  localList(): Promise<{ files: LocalFile[] }>;
  localStat(options: { name: string }): Promise<{ file?: LocalFile }>;
  localRead(options: { name: string }): Promise<{ value?: string }>;
  localWrite(options: { name: string; value: string }): Promise<void>;
  localRemove(options: { name: string }): Promise<void>;
};

// Implemented in android/app/src/main/java/.../NotePlugin.java
export const Native = registerPlugin<NotePlugin>("NoteNative");
