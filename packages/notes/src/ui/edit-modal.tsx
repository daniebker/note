import { useEffect, useRef, useState } from "react";
import { ColorPicker } from "./color-picker";
import { NoteMarkdown } from "./note-markdown";
import { PaletteIcon, TrashIcon } from "./icons";
import { colorValue, type Note } from "./note-types";
import { useFlushOnClose } from "./flush";
import { useBack } from "./back";
import type { NoteInput } from "../note";

export function EditModal({
  note,
  onSave,
  onDelete,
  onClose,
}: {
  note: Note;
  onSave: (changes: NoteInput) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [color, setColor] = useState(note.color);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const saved = useRef({
    title: note.title,
    content: note.content,
    color: note.color,
  });

  // Only what was edited here is saved, so closing an untouched note doesn't
  // overwrite changes made to the file elsewhere.
  function save() {
    const changes: NoteInput = {};
    if (title !== saved.current.title) changes.title = title.trim();
    if (content !== saved.current.content) changes.content = content;
    if (color !== saved.current.color) changes.color = color;
    saved.current = { title, content, color };
    if (Object.keys(changes).length > 0) onSave(changes);
  }

  function saveAndClose() {
    save();
    onClose();
  }

  useBack(saveAndClose);

  useFlushOnClose(async () => {
    save();
    return true;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") saveAndClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 420)}px`;
    }
  }, [content, showPreview]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[max(10vh,var(--safe-top))] dark:bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) saveAndClose();
      }}
    >
      <div
        className="flex max-h-[75vh] w-full max-w-2xl flex-col rounded-lg shadow-2xl"
        style={{ backgroundColor: colorValue(color) }}
      >
        <div className="flex-1 overflow-y-auto p-4">
          <input
            className="w-full bg-transparent text-lg font-medium text-ink placeholder-ink-muted outline-none"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            value={title}
          />
          {showPreview ? (
            <div className="note-markdown mt-3 text-ink">
              <NoteMarkdown content={content} />
            </div>
          ) : (
            <textarea
              autoFocus
              className="mt-3 w-full resize-none bg-transparent font-mono text-sm text-ink placeholder-ink-muted outline-none"
              onChange={(e) => setContent(e.target.value)}
              placeholder="Take a note… (markdown supported)"
              ref={contentRef}
              rows={6}
              value={content}
            />
          )}
        </div>

        <div className="flex items-center gap-1 border-t border-black/10 px-3 py-2 dark:border-white/10">
          <div className="relative">
            <button
              aria-label="Change color"
              className="rounded-full p-2 text-ink-muted hover:bg-ink/10"
              onClick={() => setPaletteOpen((o) => !o)}
              title="Background options"
              type="button"
            >
              <PaletteIcon className="h-5 w-5" />
            </button>
            {paletteOpen && (
              <div className="absolute bottom-full left-0 z-20 mb-1 w-max max-w-[16rem]">
                <ColorPicker
                  onSelect={(c) => {
                    setColor(c);
                    setPaletteOpen(false);
                  }}
                  selected={color}
                />
              </div>
            )}
          </div>
          <button
            aria-label="Delete note"
            className="rounded-full p-2 text-ink-muted hover:bg-ink/10"
            onClick={onDelete}
            title="Delete"
            type="button"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
          <button
            className="ml-1 rounded px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-ink/10"
            onClick={() => setShowPreview((p) => !p)}
            type="button"
          >
            {showPreview ? "Edit" : "Preview"}
          </button>
          <button
            className="ml-auto rounded px-5 py-1.5 text-sm font-medium text-ink hover:bg-ink/10"
            onClick={saveAndClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
