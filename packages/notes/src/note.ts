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
};

export type NoteInput = Partial<
  Pick<Note, "title" | "content" | "color" | "pinned" | "archived">
>;
