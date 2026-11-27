import { useMemo, useState } from "react";
import { Composer } from "./composer";
import { EditModal } from "./edit-modal";
import { NoteCard } from "./note-card";
import { PenIcon, SearchIcon } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { extractTags } from "./tags";
import { useNotes } from "./use-notes";
import { saveAll } from "./flush";
import type { Note } from "./note-types";

export function NotesApp({
  canDownload,
  onOpenSettings,
}: {
  canDownload: boolean;
  onOpenSettings: () => void;
}) {
  const {
    notes: loaded,
    error,
    unsaved,
    createNote,
    updateNote,
    deleteNote: removeNote,
    retry,
  } = useNotes();
  const notes = useMemo(() => loaded ?? [], [loaded]);
  const [query, setQuery] = useState("");
  // A copy, so the editor stays open if the file disappears during a refresh.
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    // "#foo" searches by tag; anything else is a plain text search.
    if (q.startsWith("#") && q.length > 1) {
      const tag = q.slice(1);
      return notes.filter((n) =>
        extractTags(n.title, n.content).some((t) =>
          t.toLowerCase().startsWith(tag),
        ),
      );
    }
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [notes, query]);

  const allTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of notes) {
      for (const t of extractTags(n.title, n.content)) {
        const key = t.toLowerCase();
        if (!seen.has(key)) seen.set(key, t);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const activeTag = query.trim().toLowerCase().startsWith("#")
    ? query.trim().slice(1).toLowerCase()
    : null;

  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);

  function deleteNote(id: string) {
    if (editingNote?.id === id) setEditingNote(null);
    void removeNote(id);
  }

  // Leaving this screen would drop drafts and edits waiting for a retry.
  async function openSettings() {
    if (await saveAll()) onOpenSettings();
  }

  function grid(list: Note[]) {
    return (
      <div className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
        {list.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            canDownload={canDownload}
            onColorChange={(color) => updateNote(note.id, { color })}
            onDelete={() => deleteNote(note.id)}
            onOpen={() => setEditingNote(note)}
            onTagClick={(tag) => setQuery(`#${tag}`)}
            onTogglePin={() => updateNote(note.id, { pinned: !note.pinned })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-edge bg-surface px-3 pb-2 pt-[calc(var(--safe-top)+0.5rem)] sm:gap-4 sm:px-6">
        <div className="flex items-center gap-2">
          <PenIcon className="h-8 w-8" />
          <span className="hidden text-xl text-ink-muted sm:inline">Note</span>
        </div>
        <div className="mx-auto flex w-full min-w-0 max-w-2xl items-center gap-3 rounded-lg bg-field px-4 py-2.5 focus-within:bg-surface focus-within:shadow-md">
          <SearchIcon className="h-5 w-5 text-ink-muted" />
          <input
            className="w-full bg-transparent text-sm text-ink placeholder-ink-muted outline-none"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            value={query}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <ThemeToggle />
          <button
            className="rounded-md px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10"
            onClick={openSettings}
            type="button"
          >
            Settings
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {error && (
          <div
            className="mx-auto mb-4 flex max-w-xl items-center justify-between gap-3 rounded-lg border border-danger px-4 py-2 text-sm text-danger"
            role="alert"
          >
            <span>{error}</span>
            <button
              className="shrink-0 rounded-md px-3 py-1 font-medium hover:bg-ink/10"
              onClick={retry}
              type="button"
            >
              {unsaved > 0 ? "Retry saving" : "Retry"}
            </button>
          </div>
        )}

        <Composer onCreate={createNote} />

        {allTags.length > 0 && (
          <div className="mb-6 flex flex-wrap justify-center gap-2">
            {allTags.map((tag) => {
              const active = activeTag === tag.toLowerCase();
              return (
                <button
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-edge text-ink-muted hover:bg-ink/10"
                  }`}
                  key={tag}
                  onClick={() => setQuery(active ? "" : `#${tag}`)}
                  type="button"
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}

        {loaded === null ? (
          <p className="mt-16 text-center text-sm text-ink-muted">
            {error ? "Notes couldn't be loaded" : "Loading notes…"}
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-16 text-center text-sm text-ink-muted">
            {notes.length === 0
              ? "Notes you add appear here"
              : "No matching notes"}
          </p>
        ) : pinned.length > 0 ? (
          <>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Pinned
            </h2>
            {grid(pinned)}
            {others.length > 0 && (
              <>
                <h2 className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Others
                </h2>
                {grid(others)}
              </>
            )}
          </>
        ) : (
          grid(others)
        )}
      </main>

      {editingNote && (
        <EditModal
          key={editingNote.id}
          note={editingNote}
          onClose={() => setEditingNote(null)}
          onDelete={() => deleteNote(editingNote.id)}
          onSave={(changes) => updateNote(editingNote.id, changes)}
        />
      )}
    </div>
  );
}
