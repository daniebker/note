"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Composer } from "./composer";
import { EditModal } from "./edit-modal";
import { PenIcon } from "./auth-form";
import { NoteCard } from "./note-card";
import { SearchIcon } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { extractTags } from "./tags";
import type { NoteData } from "./note-types";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function NotesApp({
  initialNotes,
  userName,
  userEmail,
}: {
  initialNotes: NoteData[];
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notes, setNotes] = useState<NoteData[]>(initialNotes);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingNote = notes.find((n) => n.id === editingId) ?? null;

  // Opens a note directly when arriving via a public note page's "Edit" link.
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && notes.some((n) => n.id === editId)) {
      setEditingId(editId);
      router.replace("/", { scroll: false });
    }
  }, [searchParams, notes, router]);

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

  async function createNote(data: {
    title: string;
    content: string;
    color: string;
  }) {
    const { note } = (await api("/api/notes", {
      method: "POST",
      body: JSON.stringify(data),
    })) as { note: NoteData };
    setNotes((prev) => [note, ...prev]);
  }

  async function updateNote(id: string, changes: Partial<NoteData>) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...changes } : n)),
    );
    await api(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
  }

  async function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (editingId === id) setEditingId(null);
    await api(`/api/notes/${id}`, { method: "DELETE" });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function grid(list: NoteData[]) {
    return (
      <div className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
        {list.map((note) => (
          <NoteCard
            key={note.id}
            authorEmail={userEmail}
            note={note}
            onColorChange={(color) => updateNote(note.id, { color })}
            onDelete={() => deleteNote(note.id)}
            onOpen={() => setEditingId(note.id)}
            onTagClick={(tag) => setQuery(`#${tag}`)}
            onTogglePin={() => updateNote(note.id, { pinned: !note.pinned })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-edge bg-surface px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2">
          <PenIcon className="h-8 w-8" />
          <span className="text-xl text-ink-muted">Note</span>
        </div>
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-lg bg-field px-4 py-2.5 focus-within:bg-surface focus-within:shadow-md">
          <SearchIcon className="h-5 w-5 text-ink-muted" />
          <input
            className="w-full bg-transparent text-sm text-ink placeholder-ink-muted outline-none"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            value={query}
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            className="hidden text-sm text-ink-muted hover:text-accent hover:underline sm:inline"
            href="/settings"
          >
            {userName}
          </Link>
          <ThemeToggle />
          <button
            className="rounded-md px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10"
            onClick={logout}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
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

        {filtered.length === 0 ? (
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
          onClose={() => setEditingId(null)}
          onDelete={() => deleteNote(editingNote.id)}
          onSave={(changes) => updateNote(editingNote.id, changes)}
          onTogglePublic={() =>
            updateNote(editingNote.id, { public: !editingNote.public })
          }
        />
      )}
    </div>
  );
}
