// Copies the notes in one folder to another, for when the user switches where
// their notes are kept.
import type { NoteFolder } from "./folder";
import { isValidId } from "./note-store.ts";

export type CopySummary = {
  /** Notes written to the new folder. */
  copied: number;
  /**
   * Of those, notes whose name was already taken by a different file there,
   * and that were saved under a new name instead of replacing it.
   */
  renamed: number;
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

/**
 * Nothing is overwritten or deleted: a note that is already in `to` with the
 * same contents is skipped, so copying again is safe, and one that differs is
 * kept alongside under a new name.
 */
export async function copyNotes(
  from: NoteFolder,
  to: NoteFolder,
): Promise<CopySummary> {
  const [sources, targets] = await Promise.all([from.list(), to.list()]);
  const taken = new Set(targets.map((file) => file.name));
  const summary: CopySummary = { copied: 0, renamed: 0 };

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
        if (existing.includes(contents)) return;
        // Decided without awaiting in between, so that two notes can't be
        // given the same new name.
        const target = taken.has(name) ? freeName(name, taken) : name;
        taken.add(target);
        await to.write(target, contents);
        summary.copied++;
        if (target !== name) summary.renamed++;
      }),
  );
  return summary;
}
