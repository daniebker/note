"use client";

import { useEffect, useRef, useState } from "react";
import { ColorPicker } from "./color-picker";
import { PaletteIcon } from "./icons";
import { colorValue } from "./note-types";

export function Composer({
  onCreate,
}: {
  onCreate: (note: { title: string; content: string; color: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState("default");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setExpanded(false);
    setTitle("");
    setContent("");
    setColor("default");
    setPaletteOpen(false);
  }

  function save() {
    if (title.trim() || content.trim()) {
      onCreate({ title: title.trim(), content, color });
    }
    reset();
  }

  useEffect(() => {
    if (!expanded) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        save();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  });

  // Auto-grow the textarea as the user types
  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    }
  }, [content, expanded]);

  return (
    <div
      className="mx-auto mb-8 w-full max-w-xl rounded-lg border border-[#e0e0e0] shadow-md"
      ref={containerRef}
      style={{ backgroundColor: colorValue(color) }}
    >
      {expanded ? (
        <div className="p-3">
          <input
            className="w-full bg-transparent text-base font-medium text-[#202124] placeholder-[#5f6368] outline-none"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            value={title}
          />
          <textarea
            autoFocus
            className="mt-2 w-full resize-none bg-transparent text-sm text-[#202124] placeholder-[#5f6368] outline-none"
            onChange={(e) => setContent(e.target.value)}
            placeholder="Take a note… (markdown supported)"
            ref={contentRef}
            rows={3}
            value={content}
          />
          <div className="mt-1 flex items-center justify-between">
            <div className="relative">
              <button
                aria-label="Change color"
                className="rounded-full p-1.5 text-[#5f6368] hover:bg-black/10"
                onClick={() => setPaletteOpen((o) => !o)}
                title="Background options"
                type="button"
              >
                <PaletteIcon className="h-5 w-5" />
              </button>
              {paletteOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-max max-w-[16rem]">
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
              className="rounded px-5 py-1.5 text-sm font-medium text-[#202124] hover:bg-black/10"
              onClick={save}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <button
          className="w-full cursor-text px-4 py-3 text-left text-sm font-medium text-[#5f6368]"
          onClick={() => setExpanded(true)}
          type="button"
        >
          Take a note…
        </button>
      )}
    </div>
  );
}
