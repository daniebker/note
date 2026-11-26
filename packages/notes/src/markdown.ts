import { parse, stringify } from "yaml";
import type { Note } from "./note";

// A note on disk is a markdown file with YAML frontmatter holding everything
// that isn't the body. The body is stored byte for byte.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)(?:\r?\n)?/;

// Frontmatter keys this app doesn't own (e.g. added by another markdown
// editor) are carried through so that saving a note doesn't drop them.
export type Frontmatter = Record<string, unknown>;

function splitFrontmatter(source: string) {
  const match = FRONTMATTER_RE.exec(source);
  if (match) {
    try {
      const data: unknown = parse(match[1]!);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return {
          data: data as Frontmatter,
          content: source.slice(match[0].length),
        };
      }
    } catch {
      // Not valid YAML: treat the whole file as the body.
    }
  }
  return { data: {} as Frontmatter, content: source };
}

function dateFrom(value: unknown, fallback: Date): string {
  const date = typeof value === "string" ? new Date(value) : fallback;
  return (Number.isNaN(date.getTime()) ? fallback : date).toISOString();
}

type FileInfo = { id: string; modifiedAt: Date };

export function parseNote(source: string, file: FileInfo) {
  const { data, content } = splitFrontmatter(source);
  const { title, color, pinned, archived, created, updated, ...extra } = data;

  const note: Note = {
    id: file.id,
    // A hand-written file with no title is named after its filename.
    title: title === undefined ? file.id : String(title ?? ""),
    content,
    color: typeof color === "string" ? color : "default",
    pinned: pinned === true,
    archived: archived === true,
    createdAt: dateFrom(created, file.modifiedAt),
    updatedAt: dateFrom(updated, file.modifiedAt),
  };

  return { note, extra };
}

export function serializeNote(note: Note, extra: Frontmatter = {}): string {
  const frontmatter = stringify({
    ...extra,
    title: note.title,
    color: note.color,
    pinned: note.pinned,
    archived: note.archived,
    created: note.createdAt,
    updated: note.updatedAt,
  });
  return `---\n${frontmatter}---\n\n${note.content}`;
}
