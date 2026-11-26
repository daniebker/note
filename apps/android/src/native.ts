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

export type NotePlugin = {
  request(request: HttpRequest): Promise<HttpResponse>;
  /** The saved settings, encrypted at rest with an Android Keystore key. */
  loadSettings(): Promise<{ value?: string }>;
  saveSettings(options: { value: string }): Promise<void>;
  clearSettings(): Promise<void>;
};

// Implemented in android/app/src/main/java/.../NotePlugin.java
export const Native = registerPlugin<NotePlugin>("NoteNative");
