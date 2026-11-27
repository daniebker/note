import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteInput } from "../note";
import { useCheckOnClose } from "./flush";

export function useNotes() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(0);
  // Edits that failed to save, kept until a retry succeeds.
  const failed = useRef(new Map<string, NoteInput>());
  const inFlight = useRef(new Set<Promise<unknown>>());
  const writes = useRef(0);

  function track<T>(promise: Promise<T>): Promise<T> {
    writes.current++;
    inFlight.current.add(promise);
    void promise.finally(() => inFlight.current.delete(promise));
    return promise;
  }

  const refresh = useCallback(async () => {
    const before = writes.current;
    // A list read while a save is under way could be out of date.
    if (inFlight.current.size > 0) return;
    const result = await window.noteApi.listNotes();
    if (writes.current !== before) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotes(
      result.value.map((n) => ({ ...n, ...failed.current.get(n.id) })),
    );
    if (failed.current.size === 0) setError(null);
  }, []);

  useEffect(() => {
    void refresh();
    // Picks up files changed elsewhere.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    // Mobile apps are resumed without necessarily receiving focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  async function createNote(data: NoteInput) {
    const result = await track(window.noteApi.createNote(data));
    if (!result.ok) {
      setError(`Couldn't save the note: ${result.error}`);
      return false;
    }
    setNotes((prev) => [result.value, ...(prev ?? [])]);
    setError(null);
    return true;
  }

  async function updateNote(id: string, changes: NoteInput) {
    setNotes(
      (prev) =>
        prev?.map((n) => (n.id === id ? { ...n, ...changes } : n)) ?? null,
    );
    // Include anything still unsaved for this note.
    const all = { ...failed.current.get(id), ...changes };
    failed.current.delete(id);
    const result = await track(window.noteApi.updateNote(id, all));
    if (!result.ok) {
      failed.current.set(id, { ...all, ...failed.current.get(id) });
      setError(`Couldn't save your changes: ${result.error}`);
    } else if (failed.current.size === 0) {
      setError(null);
    }
    setUnsaved(failed.current.size);
  }

  async function deleteNote(id: string) {
    const result = await track(window.noteApi.deleteNote(id));
    if (!result.ok) {
      setError(`Couldn't delete the note: ${result.error}`);
      return;
    }
    failed.current.delete(id);
    setUnsaved(failed.current.size);
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? null);
  }

  async function retry() {
    await Promise.all(
      [...failed.current.keys()].map((id) => updateNote(id, {})),
    );
    await refresh();
  }

  useCheckOnClose(async () => {
    await Promise.all(inFlight.current);
    return failed.current.size === 0;
  });

  return {
    notes,
    error,
    unsaved,
    createNote,
    updateNote,
    deleteNote,
    retry,
  };
}
