import type { NoteApi } from "./api";

declare global {
  interface Window {
    noteApi: NoteApi;
  }
}
