import { useState, type FormEvent } from "react";
import type { SavedConnection } from "../api";
import { PenIcon } from "./icons";
import { BackHandler } from "./back-handler";

const inputClass =
  "w-full rounded-md border border-edge bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

export function ConnectionForm({
  connection,
  onConnected,
  onCancel,
  onDisconnect,
}: {
  connection: SavedConnection;
  onConnected: (connection: SavedConnection) => void;
  onCancel?: () => void;
  onDisconnect: () => void;
}) {
  const [url, setUrl] = useState(connection.url);
  const [username, setUsername] = useState(connection.username);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await window.noteApi.connect({ url, username, password });
    setSubmitting(false);
    if (result.ok) onConnected(result.value);
    else setError(result.error);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-dim px-4">
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <PenIcon className="h-10 w-10" />
          <h1 className="text-xl font-medium text-ink">Connect to WebDAV</h1>
          <p className="text-center text-sm text-ink-muted">
            Your notes are kept as markdown files in this folder.
          </p>
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
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
              No system keyring was found, so the password won&apos;t be saved.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            className="mt-2 rounded-md bg-[#1a73e8] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1765cc] disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Connecting…" : "Connect"}
          </button>
          {onCancel && <BackHandler onBack={onCancel} />}
          {onCancel && (
            <div className="flex justify-between">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-danger hover:bg-ink/10"
                onClick={onDisconnect}
                type="button"
              >
                Disconnect
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
