import { useEffect, useRef, useState } from "react";
import { ColorPicker } from "./color-picker";
import { AttachButton } from "./attachments";
import { CloseIcon, FileIcon, PaletteIcon } from "./icons";
import { colorValue } from "./note-types";
import { useFlushOnClose } from "./flush";

export function Composer({
  onCreate,
}: {
  /** Resolves false if the note couldn't be saved. */
  onCreate: (
    note: { title: string; content: string; color: string },
    files: File[],
  ) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState("default");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const picking = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setExpanded(false);
    setTitle("");
    setContent("");
    setColor("default");
    setFiles([]);
    setPaletteOpen(false);
    picking.current = false;
  }

  const saving = useRef<Promise<boolean> | null>(null);

  // The draft is only cleared once it has been saved.
  function save(): Promise<boolean> {
    if (saving.current) return saving.current;
    if (!title.trim() && !content.trim() && files.length === 0) {
      reset();
      return Promise.resolve(true);
    }
    saving.current = onCreate(
      { title: title.trim(), content, color },
      files,
    ).then((ok) => {
      saving.current = null;
      if (ok) reset();
      return ok;
    });
    setPending(true);
    void saving.current.finally(() => setPending(false));
    return saving.current;
  }

  // Android's file picker sends the app to the background, which mustn't save
  // and close the draft that the files are being picked for.
  useFlushOnClose(() => (picking.current ? Promise.resolve(true) : save()));

  useEffect(() => {
    if (!expanded) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        void save();
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
      className="mx-auto mb-8 w-full max-w-xl rounded-lg border border-edge shadow-md"
      ref={containerRef}
      style={{ backgroundColor: colorValue(color) }}
    >
      {expanded ? (
        <fieldset
          className="p-3"
          disabled={pending}
          // In case the picker closed without saying so.
          onInput={() => (picking.current = false)}
        >
          {files.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1">
              {files.map((file, index) => (
                <li
                  className="flex items-center gap-2 rounded border border-ink/15 px-2 py-1 text-xs text-ink"
                  key={index}
                >
                  <FileIcon className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <button
                    aria-label={`Don't attach ${file.name}`}
                    className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-ink/10"
                    onClick={() =>
                      setFiles((prev) => prev.filter((f) => f !== file))
                    }
                    title="Don't attach"
                    type="button"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            className="w-full bg-transparent text-base font-medium text-ink placeholder-ink-muted outline-none"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            value={title}
          />
          <textarea
            autoFocus
            className="mt-2 w-full resize-none bg-transparent text-sm text-ink placeholder-ink-muted outline-none"
            onChange={(e) => setContent(e.target.value)}
            placeholder="Take a note… (markdown supported)"
            ref={contentRef}
            rows={3}
            value={content}
          />
          <div className="mt-1 flex items-center gap-1">
            <div className="relative">
              <button
                aria-label="Change color"
                className="rounded-full p-1.5 text-ink-muted hover:bg-ink/10"
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
            <AttachButton
              className="rounded-full p-1.5 text-ink-muted hover:bg-ink/10"
              onFiles={(added) => setFiles((prev) => [...prev, ...added])}
              onPickingChange={(open) => (picking.current = open)}
            />
            <button
              className="ml-auto rounded px-5 py-1.5 text-sm font-medium text-ink hover:bg-ink/10"
              onClick={save}
              type="button"
            >
              Close
            </button>
          </div>
        </fieldset>
      ) : (
        <button
          className="w-full cursor-text px-4 py-3 text-left text-sm font-medium text-ink-muted"
          onClick={() => setExpanded(true)}
          type="button"
        >
          Take a note…
        </button>
      )}
    </div>
  );
}
