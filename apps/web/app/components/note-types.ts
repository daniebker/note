export type NoteData = {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  public: boolean;
  createdAt: string;
  updatedAt: string;
};

// Google Keep's note palette; light/dark values live in globals.css
export const NOTE_COLOR_NAMES = [
  "default",
  "coral",
  "peach",
  "sand",
  "mint",
  "sage",
  "fog",
  "storm",
  "dusk",
  "blossom",
  "clay",
  "chalk",
] as const;

export function colorValue(name: string): string {
  const known = (NOTE_COLOR_NAMES as readonly string[]).includes(name)
    ? name
    : "default";
  return `var(--note-${known})`;
}
