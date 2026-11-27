import { useState, type FormEvent } from "react";
import type {
  Connection,
  ConnectResult,
  SavedConnection,
  StorageType,
} from "../api";
import { PenIcon } from "./icons";
import { BackHandler } from "./back-handler";

const inputClass =
  "w-full rounded-md border border-edge bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

const storageOptions: { type: StorageType; label: string }[] = [
  { type: "local", label: "This device" },
  { type: "webdav", label: "WebDAV server" },
];

export function ConnectionForm({
  connection,
  onConnected,
  onCancel,
  onDisconnect,
}: {
  connection: SavedConnection;
  onConnected: (connection: ConnectResult) => void;
  onCancel?: () => void;
  onDisconnect: () => void;
}) {
  const [type, setType] = useState(connection.type);
  const [url, setUrl] = useState(connection.url);
  const [username, setUsername] = useState(connection.username);
  const [password, setPassword] = useState("");
  const [folder, setFolder] = useState(connection.path);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const chooseFolder = window.noteApi.chooseFolder;
  // Switching to another location copies the notes over.
  const moving =
    connection.connected &&
    (type !== connection.type ||
      (type === "local"
        ? folder.trim() !== connection.path
        : url.trim() !== connection.url));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const next: Connection =
      type === "local"
        ? { type, path: folder }
        : { type, url, username, password };
    const result = await window.noteApi.connect(next);
    setSubmitting(false);
    if (result.ok) onConnected(result.value);
    else setError(result.error);
  }

  async function handleChooseFolder() {
    const chosen = await chooseFolder?.(folder);
    if (chosen) setFolder(chosen);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-dim px-4">
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <PenIcon className="h-10 w-10" />
          <h1 className="text-xl font-medium text-ink">Where to keep notes</h1>
          <p className="text-center text-sm text-ink-muted">
            Your notes are kept as markdown files in a folder.
          </p>
        </div>

        <div
          aria-label="Storage"
          className="mb-4 grid grid-cols-2 rounded-md border border-edge p-1"
          role="radiogroup"
        >
          {storageOptions.map((option) => (
            <button
              aria-checked={type === option.type}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                type === option.type
                  ? "bg-accent/15 font-medium text-accent"
                  : "text-ink-muted hover:bg-ink/10"
              }`}
              key={option.type}
              onClick={() => {
                setType(option.type);
                setError(null);
              }}
              role="radio"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          {type === "local" ? (
            <>
              <p className="text-sm text-ink-muted">
                Notes are saved on this device only and aren&apos;t synced.
              </p>
              {connection.canChooseFolder ? (
                <div className="flex gap-2">
                  <input
                    aria-label="Folder"
                    className={inputClass}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="/home/you/Notes"
                    required
                    value={folder}
                  />
                  {chooseFolder && (
                    <button
                      className="shrink-0 rounded-md border border-edge px-3 text-sm text-ink hover:bg-ink/10"
                      onClick={handleChooseFolder}
                      type="button"
                    >
                      Choose…
                    </button>
                  )}
                </div>
              ) : (
                <p className="break-all rounded-md bg-ink/5 px-3 py-2 font-mono text-xs text-ink-muted">
                  {folder}
                </p>
              )}
            </>
          ) : (
            <>
              <input
                aria-label="Folder URL"
                className={inputClass}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/dav/notes"
                required
                type="url"
                value={url}
              />
              <input
                aria-label="Username"
                className={inputClass}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                value={username}
              />
              <input
                aria-label="Password"
                className={inputClass}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
                value={password}
              />

              {url.startsWith("http://") && (
                <p className="text-xs text-ink-muted">
                  Over http:// your password and notes are sent unencrypted.
                </p>
              )}
              {!connection.canSavePassword && (
                <p className="text-xs text-ink-muted">
                  No system keyring was found, so the password won&apos;t be
                  saved.
                </p>
              )}
            </>
          )}
          {moving && (
            <p className="text-xs text-ink-muted">
              Your notes will be copied here. The copies in the old location are
              kept.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            className="mt-2 rounded-md bg-[#1a73e8] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1765cc] disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting
              ? moving
                ? "Copying notes…"
                : type === "local"
                  ? "Opening…"
                  : "Connecting…"
              : type === "local"
                ? "Use this folder"
                : "Connect"}
          </button>
          {onCancel && <BackHandler onBack={onCancel} />}
          {onCancel && (
            <div className="flex justify-between">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-danger hover:bg-ink/10"
                onClick={onDisconnect}
                type="button"
              >
                {connection.type === "local" ? "Forget folder" : "Disconnect"}
              </button>
              <button
                className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-ink/10"
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
