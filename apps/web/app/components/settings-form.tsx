"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenIcon } from "./auth-form";

const inputClass =
  "w-full rounded-md border border-edge bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

const labelClass = "text-sm font-medium text-ink-muted";

const buttonClass =
  "mt-2 rounded-md bg-[#1a73e8] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1765cc] disabled:opacity-60";

type SubmitResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function patchJson<T>(
  url: string,
  body: unknown,
): Promise<SubmitResult<T>> {
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
      (T & { error?: string }) | null;
    if (!res.ok || !data) {
      return { ok: false, error: data?.error ?? "Something went wrong" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error, please try again" };
  }
}

function UsernameForm({ currentUsername }: { currentUsername: string }) {
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
    const result = await patchJson<{ username: string }>("/api/user/username", {
      username,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUsername(result.data.username);
    setSuccess(true);
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <label className={labelClass} htmlFor="username">
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
      {success && <p className="text-sm text-accent">Username updated.</p>}

      <button className={buttonClass} disabled={submitting} type="submit">
        {submitting ? "Saving…" : "Save username"}
      </button>
    </form>
  );
}

function EmailForm({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(currentEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const result = await patchJson<{ email: string }>("/api/user/email", {
      email,
      password,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail(result.data.email);
    setPassword("");
    setSuccess(true);
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <label className={labelClass} htmlFor="email">
        Email
      </label>
      <input
        autoComplete="email"
        className={inputClass}
        id="email"
        name="email"
        onChange={(e) => setEmail(e.target.value)}
        required
        type="email"
        value={email}
      />

      <label className={labelClass} htmlFor="current-password">
        Current password
      </label>
      <input
        autoComplete="current-password"
        className={inputClass}
        id="current-password"
        name="password"
        onChange={(e) => setPassword(e.target.value)}
        required
        type="password"
        value={password}
      />

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-accent">Email updated.</p>}

      <button className={buttonClass} disabled={submitting} type="submit">
        {submitting ? "Saving…" : "Save email"}
      </button>
    </form>
  );
}

export function SettingsForm({
  currentEmail,
  currentUsername,
}: {
  currentEmail: string;
  currentUsername: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-dim px-4">
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <PenIcon className="h-10 w-10" />
          <h1 className="text-xl font-medium text-ink">Account settings</h1>
        </div>

        <UsernameForm currentUsername={currentUsername} />

        <hr className="my-6 border-edge" />

        <EmailForm currentEmail={currentEmail} />

        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link className="text-accent hover:underline" href="/">
            Back to notes
          </Link>
        </p>
      </div>
    </main>
  );
}
