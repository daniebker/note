/** Dates are ISO 8601 strings so notes pass unchanged between processes. */
export type Note = {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Names of files in the attachments folder. */
  attachments: string[];
};

/** The largest file that can be attached to a note. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** A file to attach to a note. */
export type NewAttachment = { name: string; data: Uint8Array };

export type NoteInput = Partial<
  Pick<Note, "title" | "content" | "color" | "pinned" | "archived">
>;
