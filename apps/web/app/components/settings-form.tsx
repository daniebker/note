"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenIcon } from "./auth-form";

const inputClass =
  "w-full rounded-md border border-edge bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

export function SettingsForm({ currentUsername }: { currentUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(currentUsername);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        username?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      setUsername(data?.username ?? username);
      setSuccess(true);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Network error, please try again");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-dim px-4">
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <PenIcon className="h-10 w-10" />
          <h1 className="text-xl font-medium text-ink">Account settings</h1>
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-ink-muted" htmlFor="username">
            Username
          </label>
          <input
            autoComplete="username"
            className={inputClass}
            id="username"
            minLength={2}
            name="username"
            onChange={(e) => setUsername(e.target.value)}
            pattern="[a-zA-Z0-9_-]+"
            required
            title="Letters, numbers, underscores, and hyphens only"
            type="text"
            value={username}
          />

          {error && <p className="text-sm text-danger">{error}</p>}
          {success && (
            <p className="text-sm text-accent">Username updated.</p>
          )}

          <button
            className="mt-2 rounded-md bg-[#1a73e8] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1765cc] disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link className="text-accent hover:underline" href="/">
            Back to notes
          </Link>
        </p>
      </div>
    </main>
  );
}
