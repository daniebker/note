// Copies the notes in one folder to another, for when the user switches where
// their notes are kept.
import type { NoteFolder } from "./folder";
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

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renamedCopies(name: string, taken: Set<string>) {
  const pattern = new RegExp(
    `^${escapeRegExp(name.slice(0, -3))} \\(\\d+\\)\\.md$`,
  );
  return [...taken].filter((other) => pattern.test(other));
}

// "a.md" -> "a (2).md", "a (3).md", ...
function freeName(name: string, taken: Set<string>) {
  const base = name.slice(0, -3);
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n}).md`;
    if (!taken.has(candidate)) return candidate;
  }
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

/**
 * Nothing is overwritten: a note that is already in `to` with the same
 * contents is skipped, so copying again is safe, and one that differs is kept
 * alongside under a new name. When moving, notes are only deleted from `from`
 * after every one of them is in `to`.
 */
export async function copyNotes(
  from: NoteFolder,
  to: NoteFolder,
  { move = false }: CopyOptions = {},
): Promise<CopySummary> {
  if (move && (await isSameFolder(from, to))) {
    throw new Error("The new location is the same folder as the old one");
  }
  const [sources, targets] = await Promise.all([from.list(), to.list()]);
  const taken = new Set(targets.map((file) => file.name));
  const summary: CopySummary = { copied: 0, renamed: 0, removed: 0 };
  // Notes now in `to`, whether copied or already there.
  const done: string[] = [];

  await Promise.all(
    sources
      .filter((file) => isNoteFile(file.name))
      .map(async ({ name }) => {
        const contents = await from.read(name);
        if (contents === null) return;
        // The note may be there already, under its own name or, from an
        // earlier copy, a new one.
        const copies = taken.has(name)
          ? [name, ...renamedCopies(name, taken)]
          : [];
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
  }
  return summary;
}
