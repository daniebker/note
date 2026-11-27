// Combines two sets of changes to a note file, for when it was edited both on
// this device and on the server since they last matched.
import type { Note } from "./note";
import { parseNote, serializeNote } from "./markdown.ts";

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

type Parsed = ReturnType<typeof parseNote>;

// Everything but when it was last saved.
function sameNote(a: Parsed, b: Parsed) {
  return same(
    { ...a.note, updatedAt: "", extra: a.extra },
    { ...b.note, updatedAt: "", extra: b.extra },
  );
}

/**
 * The merged file, or null if the changes can't be combined without losing
 * some of the writing. `base` is the file both versions started from, or null
 * if that isn't known.
 */
export function mergeNotes({
  base,
  local,
  remote,
  file,
}: {
  base: string | null;
  local: string;
  remote: string;
  file: { id: string; modifiedAt: Date };
}): string | null {
  const l = parseNote(local, file);
  const r = parseNote(remote, file);
  if (sameNote(l, r)) return remote;
  if (base === null) return null;
  const b = parseNote(base, file);

  let clash = false;
  // The side that changed something wins. If both did, this device's choice is
  // kept, which is only acceptable for settings like the color.
  function pick<T>(was: T, here: T, there: T, writing: boolean): T {
    if (same(here, was)) return there;
    if (writing && !same(there, was) && !same(here, there)) clash = true;
    return here;
  }

  const field = <K extends keyof Note>(key: K, writing = false) =>
    pick(b.note[key], l.note[key], r.note[key], writing);

  // Files added on either side are kept, and ones removed on either are gone.
  const attachments = [
    ...new Set([...r.note.attachments, ...l.note.attachments]),
  ].filter((name) =>
    b.note.attachments.includes(name)
      ? l.note.attachments.includes(name) && r.note.attachments.includes(name)
      : true,
  );

  const keys = new Set([...Object.keys(l.extra), ...Object.keys(r.extra)]);
  const extra = Object.fromEntries(
    [...keys]
      .map((key) => [
        key,
        pick(b.extra[key], l.extra[key], r.extra[key], true),
      ])
      .filter(([, value]) => value !== undefined),
  );

  const note: Note = {
    id: file.id,
    title: field("title", true),
    content: field("content", true),
    color: field("color"),
    pinned: field("pinned"),
    archived: field("archived"),
    createdAt: r.note.createdAt,
    updatedAt: [l.note.updatedAt, r.note.updatedAt].sort()[1]!,
    attachments,
  };
  if (clash) return null;
  const merged = { note, extra };
  // Keeps a file as it was written when nothing needs adding to it.
  if (sameNote(merged, r)) return remote;
  if (sameNote(merged, l)) return local;
  return serializeNote(note, extra);
}

/** This device's version of a note, labelled to be kept beside the server's. */
export function conflictCopy(
  source: string,
  file: { id: string; modifiedAt: Date },
): string {
  const { note, extra } = parseNote(source, file);
  const title = note.title
    ? `${note.title} (conflicted copy)`
    : "Conflicted copy";
  return serializeNote({ ...note, title }, extra);
}
