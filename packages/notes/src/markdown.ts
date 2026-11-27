import { parse, parseDocument, stringify } from "yaml";
import type { Note } from "./note";
import { ATTACHMENTS_FOLDER, isValidFileName } from "./file-names.ts";

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

// Attachments are listed by their path relative to the note, so that other
// tools can follow them.
const PREFIX = `${ATTACHMENTS_FOLDER}/`;

const attachmentPath = (name: string) => PREFIX + name;

function attachmentName(path: unknown) {
  if (typeof path !== "string" || !path.startsWith(PREFIX)) return null;
  const name = path.slice(PREFIX.length);
  return isValidFileName(name) ? name : null;
}

// Null if another tool is using the property for something else.
function parseAttachments(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const names = value.map(attachmentName);
  return names.every((name) => name !== null) ? [...new Set(names)] : null;
}

/** Points a note file's attachments at their new names. */
export function renameAttachments(
  source: string,
  renames: ReadonlyMap<string, string>,
): string {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) return source;
  const { data } = splitFrontmatter(source);
  const names = parseAttachments(data.attachments);
  if (!names?.some((name) => renames.has(name))) return source;
  // Edits the one property, leaving the rest as it was written.
  const document = parseDocument(match[1]!);
  document.set(
    "attachments",
    names.map((name) => attachmentPath(renames.get(name) ?? name)),
  );
  const body = source.slice(match[0].length);
  return `---\n${document.toString()}---\n\n${body}`;
}

type FileInfo = { id: string; modifiedAt: Date };

export function parseNote(source: string, file: FileInfo) {
  const { data, content } = splitFrontmatter(source);
  const { title, color, pinned, archived, created, updated, ...extra } = data;
  const attachments = parseAttachments(extra.attachments);
  if (attachments) delete extra.attachments;

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
    attachments: attachments ?? [],
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
    ...(note.attachments.length > 0 && {
      attachments: note.attachments.map(attachmentPath),
    }),
  });
  return `---\n${frontmatter}---\n\n${note.content}`;
}
