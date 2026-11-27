import { useRef } from "react";
import { AttachIcon, CloseIcon, FileIcon } from "./icons";
import { isImage, useAttachmentUrl } from "./attachment-files";

export function AttachButton({
  className,
  onFiles,
  onPickingChange,
}: {
  className: string;
  onFiles: (files: File[]) => void;
  /** True while the file picker is open. */
  onPickingChange?: (picking: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        aria-label="Attach files"
        className={className}
        onClick={() => {
          onPickingChange?.(true);
          inputRef.current?.click();
        }}
        title="Attach images or files"
        type="button"
      >
        <AttachIcon className="h-5 w-5" />
      </button>
      <input
        className="hidden"
        multiple
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          // So that picking the same file again is still a change.
          e.target.value = "";
          onPickingChange?.(false);
          if (files.length > 0) onFiles(files);
        }}
        ref={(input) => {
          inputRef.current = input;
          // React has no prop for a file input's cancel event.
          const cancelled = () => onPickingChange?.(false);
          input?.addEventListener("cancel", cancelled);
          return () => input?.removeEventListener("cancel", cancelled);
        }}
        type="file"
      />
    </>
  );
}

function Thumbnail({ name }: { name: string }) {
  const url = useAttachmentUrl(name);
  if (url) {
    return <img alt={name} className="block max-h-64 w-full rounded object-contain" src={url} />;
  }
  return (
    <span className="block truncate rounded bg-ink/5 px-3 py-4 text-center text-xs text-ink-muted">
      {url === null ? `Couldn't load ${name}` : `Loading ${name}…`}
    </span>
  );
}

function RemoveButton({
  name,
  onClick,
}: {
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`Delete ${name}`}
      className="shrink-0 rounded-full bg-surface/80 p-1 text-ink-muted hover:bg-surface hover:text-ink"
      onClick={onClick}
      title="Delete attachment"
      type="button"
    >
      <CloseIcon className="h-4 w-4" />
    </button>
  );
}

/** A note's attached files: images as pictures, everything else by name. */
export function Attachments({
  names,
  limit,
  onOpen,
  onRemove,
}: {
  names: string[];
  /** Shows at most this many, and how many more there are. */
  limit?: number;
  onOpen?: (name: string) => void;
  onRemove?: (name: string) => void;
}) {
  if (names.length === 0) return null;
  const shown = names.slice(0, limit);
  const images = shown.filter(isImage);
  const files = shown.filter((name) => !isImage(name));

  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <ul className={images.length > 1 ? "grid grid-cols-2 gap-2" : ""}>
          {images.map((name) => (
            <li className="relative" key={name}>
              {onOpen ? (
                <button
                  className="block w-full"
                  onClick={() => onOpen(name)}
                  title={name}
                  type="button"
                >
                  <Thumbnail name={name} />
                </button>
              ) : (
                <Thumbnail name={name} />
              )}
              {onRemove && (
                <span className="absolute right-1 top-1 flex">
                  <RemoveButton name={name} onClick={() => onRemove(name)} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((name) => (
            <li
              className="flex items-center gap-2 rounded border border-ink/15 px-2 py-1 text-xs text-ink"
              key={name}
            >
              <FileIcon className="h-4 w-4 shrink-0 text-ink-muted" />
              {onOpen ? (
                <button
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() => onOpen(name)}
                  title={name}
                  type="button"
                >
                  {name}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate">{name}</span>
              )}
              {onRemove && (
                <RemoveButton name={name} onClick={() => onRemove(name)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {shown.length < names.length && (
        <p className="text-xs text-ink-muted">
          +{names.length - shown.length} more
        </p>
      )}
    </div>
  );
}
