"use client";

import { useEffect, useRef, useState } from "react";
import { ColorPicker } from "./color-picker";
import { NoteMarkdown } from "./note-markdown";
import { downloadNoteAsMarkdown } from "./note-download";
import {
  ArchiveIcon,
  MoreIcon,
  PaletteIcon,
  PinIcon,
  TrashIcon,
  UnarchiveIcon,
} from "./icons";
import { colorValue, type NoteData } from "./note-types";

export function NoteCard({
  note,
  authorEmail,
  onOpen,
  onTogglePin,
  onToggleArchive,
  onColorChange,
  onDelete,
  onTagClick,
}: {
  note: NoteData;
  authorEmail: string;
  onOpen: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!paletteRef.current?.contains(e.target as Node)) {
        setPaletteOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [paletteOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const isColored = note.color !== "default";

  return (
    <div
      className={`group relative mb-3 break-inside-avoid rounded-lg border p-4 transition-shadow hover:shadow-md ${
        isColored ? "border-transparent" : "border-edge"
      }`}
      style={{ backgroundColor: colorValue(note.color) }}
    >
      <button
        aria-label={note.pinned ? "Unpin note" : "Pin note"}
        className={`absolute right-2 top-2 rounded-full p-1.5 text-ink-muted transition-opacity hover:bg-ink/10 ${
          note.pinned ? "" : "opacity-0 group-hover:opacity-100"
        }`}
        onClick={onTogglePin}
        title={note.pinned ? "Unpin" : "Pin"}
        type="button"
      >
        <PinIcon className="h-4.5 w-4.5" filled={note.pinned} />
      </button>

      <div className="cursor-pointer" onClick={onOpen}>
        {note.title && (
          <h3 className="mb-2 pr-7 text-sm font-semibold text-ink">
            {note.title}
          </h3>
        )}
        <div className="note-markdown max-h-[26rem] overflow-hidden text-ink">
          <NoteMarkdown content={note.content} onTagClick={onTagClick} />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="relative" ref={paletteRef}>
          <button
            aria-label="Change color"
            className="rounded-full p-1.5 text-ink-muted hover:bg-ink/10"
            onClick={() => setPaletteOpen((o) => !o)}
            title="Background options"
            type="button"
          >
            <PaletteIcon className="h-4.5 w-4.5" />
          </button>
          {paletteOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-max max-w-[16rem]">
              <ColorPicker
                onSelect={(c) => {
                  onColorChange(c);
                  setPaletteOpen(false);
                }}
                selected={note.color}
              />
            </div>
          )}
        </div>
        <button
          aria-label={note.archived ? "Unarchive note" : "Archive note"}
          className="rounded-full p-1.5 text-ink-muted hover:bg-ink/10"
          onClick={onToggleArchive}
          title={note.archived ? "Unarchive" : "Archive"}
          type="button"
        >
          {note.archived ? (
            <UnarchiveIcon className="h-4.5 w-4.5" />
          ) : (
            <ArchiveIcon className="h-4.5 w-4.5" />
          )}
        </button>
        <button
          aria-label="Delete note"
          className="rounded-full p-1.5 text-ink-muted hover:bg-ink/10"
          onClick={onDelete}
          title="Delete"
          type="button"
        >
          <TrashIcon className="h-4.5 w-4.5" />
        </button>
        <div className="relative ml-auto" ref={menuRef}>
          <button
            aria-label="More options"
            className="rounded-full p-1.5 text-ink-muted hover:bg-ink/10"
            onClick={() => setMenuOpen((o) => !o)}
            title="More options"
            type="button"
          >
            <MoreIcon className="h-4.5 w-4.5" />
          </button>
          {menuOpen && (
            <div className="absolute bottom-full right-0 z-20 mb-1 w-max min-w-[10rem] rounded-lg border border-edge bg-surface py-1 shadow-lg">
              <button
                className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm text-ink hover:bg-ink/10"
                onClick={() => {
                  downloadNoteAsMarkdown(note, authorEmail);
                  setMenuOpen(false);
                }}
                type="button"
              >
                Download as Markdown
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
