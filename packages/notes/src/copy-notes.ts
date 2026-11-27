// Copies the notes in one folder to another, for when the user switches where
// their notes are kept.
import type { NoteFolder } from "./folder";
import { copiesOf, freeName, isValidFileName } from "./file-names.ts";
import { renameAttachments } from "./markdown.ts";
import { isValidId } from "./note-store.ts";

export type CopyOptions = {
  /** Delete the notes from `from` once they are all safely in `to`. */
  move?: boolean;
};

export type CopySummary = {
  /** Notes written to the new folder. */
  copied: number;
  /**
   * Of those, notes whose name was already taken by a different file there,
   * and that were saved under a new name instead of replacing it.
   */
  renamed: number;
  /** Notes deleted from the old folder, when moving. */
  removed: number;
};

function isNoteFile(name: string) {
  return name.endsWith(".md") && isValidId(name.slice(0, -3));
}

// Two different-looking locations can be the same folder (a trailing slash,
// or a local folder that a WebDAV server also serves). Moving a folder onto
// itself would find every note already there and then delete it, so this
// checks with a hidden file written to one and looked for in the other.
async function isSameFolder(from: NoteFolder, to: NoteFolder) {
  const probe = `.note-probe-${crypto.randomUUID()}`;
  await to.write(probe, "");
  try {
    return (await from.stat(probe)) !== null;
  } finally {
    await to.remove(probe);
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

// One file at a time, as they can be large.
async function copyAttachments(from: NoteFolder, to: NoteFolder) {
  const names = async (folder: NoteFolder) =>
    (await folder.attachments.list()).map((file) => file.name);
  const [sources, targets] = await Promise.all([names(from), names(to)]);
  const taken = new Set(targets);
  // Files saved under a different name in `to`.
  const renames = new Map<string, string>();
  const done: string[] = [];

  for (const name of sources.filter(isValidFileName)) {
    const data = await from.attachments.read(name);
    if (data === null) continue;
    let target: string | undefined;
    // Only files already in `to` count, not ones just copied from `from`.
    for (const candidate of copiesOf(name, targets)) {
      const existing = await to.attachments.read(candidate);
      if (existing && sameBytes(existing, data)) {
        target = candidate;
        break;
      }
    }
    if (target === undefined) {
      const lower = name.toLowerCase();
      const clash = [...taken].some((other) => other.toLowerCase() === lower);
      // A new name mustn't be one that's still to be copied.
      target = clash ? freeName(name, [...taken, ...sources]) : name;
      taken.add(target);
      await to.attachments.write(target, data);
    }
    if (target !== name) renames.set(name, target);
    done.push(name);
  }
  return { renames, done };
}

/**
 * Nothing is overwritten: a note that is already in `to` with the same
 * contents is skipped, so copying again is safe, and one that differs is kept
 * alongside under a new name. Attached files are treated the same way, and the
 * notes updated to match. When moving, nothing is deleted from `from` until
 * everything is in `to`.
 */
export async function copyNotes(
  from: NoteFolder,
  to: NoteFolder,
  { move = false }: CopyOptions = {},
): Promise<CopySummary> {
  if (move && (await isSameFolder(from, to))) {
    throw new Error("The new location is the same folder as the old one");
  }
  // Attachments go first, so no note arrives before its files.
  const attachments = await copyAttachments(from, to);
  const [sources, targets] = await Promise.all([from.list(), to.list()]);
  const taken = new Set(targets.map((file) => file.name));
  const summary: CopySummary = { copied: 0, renamed: 0, removed: 0 };
  // Notes now in `to`, whether copied or already there.
  const done: string[] = [];

  await Promise.all(
    sources
      .filter((file) => isNoteFile(file.name))
      .map(async ({ name }) => {
        const source = await from.read(name);
        if (source === null) return;
        const contents = renameAttachments(source, attachments.renames);
        // The note may be there already, under its own name or, from an
        // earlier copy, a new one.
        const copies = taken.has(name) ? copiesOf(name, taken) : [];
        const existing = await Promise.all(copies.map((copy) => to.read(copy)));
        if (existing.includes(contents)) {
          done.push(name);
          return;
        }
        // Decided without awaiting in between, so that two notes can't be
        // given the same new name.
        const target = taken.has(name) ? freeName(name, taken) : name;
        taken.add(target);
        await to.write(target, contents);
        summary.copied++;
        if (target !== name) summary.renamed++;
        done.push(name);
      }),
  );

  if (move) {
    await Promise.all(done.map((name) => from.remove(name)));
    summary.removed = done.length;
    await Promise.all(
      attachments.done.map((name) => from.attachments.remove(name)),
    );
  }
  return summary;
}
