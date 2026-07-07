"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ColorPicker } from "./color-picker";
import { PaletteIcon, TrashIcon } from "./icons";
import { colorValue, type NoteData } from "./note-types";

export function EditModal({
  note,
  onSave,
  onDelete,
  onClose,
}: {
  note: NoteData;
  onSave: (changes: { title: string; content: string; color: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [color, setColor] = useState(note.color);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function saveAndClose() {
    onSave({ title: title.trim(), content, color });
    onClose();
  }

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[10vh]"
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
            className="w-full bg-transparent text-lg font-medium text-[#202124] placeholder-[#5f6368] outline-none"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            value={title}
          />
          {showPreview ? (
            <div className="note-markdown mt-3 text-[#202124]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              autoFocus
              className="mt-3 w-full resize-none bg-transparent font-mono text-sm text-[#202124] placeholder-[#5f6368] outline-none"
              onChange={(e) => setContent(e.target.value)}
              placeholder="Take a note… (markdown supported)"
              ref={contentRef}
              rows={6}
              value={content}
            />
          )}
        </div>

        <div className="flex items-center gap-1 border-t border-black/10 px-3 py-2">
          <div className="relative">
            <button
              aria-label="Change color"
              className="rounded-full p-2 text-[#5f6368] hover:bg-black/10"
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
            className="rounded-full p-2 text-[#5f6368] hover:bg-black/10"
            onClick={onDelete}
            title="Delete"
            type="button"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
          <button
            className="ml-1 rounded px-3 py-1.5 text-sm font-medium text-[#5f6368] hover:bg-black/10"
            onClick={() => setShowPreview((p) => !p)}
            type="button"
          >
            {showPreview ? "Edit" : "Preview"}
          </button>
          <button
            className="ml-auto rounded px-5 py-1.5 text-sm font-medium text-[#202124] hover:bg-black/10"
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
