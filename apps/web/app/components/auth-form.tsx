"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Turnstile, type TurnstileHandle } from "./turnstile";

const inputClass =
  "w-full rounded-md border border-edge bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const body: Record<string, string> = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      turnstileToken: turnstileToken ?? "",
    };
    if (mode === "register") {
      body.name = String(form.get("name") ?? "");
      body.username = String(form.get("username") ?? "");
    }
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong");
        turnstileRef.current?.reset();
        setSubmitting(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error, please try again");
      turnstileRef.current?.reset();
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-dim px-4">
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <PenIcon className="h-10 w-10" />
          <h1 className="text-xl font-medium text-ink">
            {mode === "login" ? "Sign in to Note" : "Create your account"}
          </h1>
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          {mode === "register" && (
            <input
              autoComplete="name"
              className={inputClass}
              name="name"
              placeholder="Name"
              required
              type="text"
            />
          )}
          {mode === "register" && (
            <input
              autoComplete="username"
              className={inputClass}
              minLength={2}
              name="username"
              pattern="[a-zA-Z0-9_-]+"
              placeholder="Username"
              required
              title="Letters, numbers, underscores, and hyphens only"
              type="text"
            />
          )}
          <input
            autoComplete="email"
            className={inputClass}
            name="email"
            placeholder="Email"
            required
            type="email"
          />
          <input
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            className={inputClass}
            minLength={mode === "register" ? 8 : undefined}
            name="password"
            placeholder={
              mode === "register" ? "Password (8+ characters)" : "Password"
            }
            required
            type="password"
          />

          <Turnstile
            onToken={setTurnstileToken}
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            className="mt-2 rounded-md bg-[#1a73e8] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1765cc] disabled:opacity-60"
            disabled={submitting || !turnstileToken}
            type="submit"
          >
            {submitting
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {mode === "login" ? (
            <>
              No account?{" "}
              <Link className="text-accent hover:underline" href="/register">
                Create one
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link className="text-accent hover:underline" href="/login">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

export function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z"
        fill="#fbbc04"
      />
      <path
        d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"
        fill="var(--ink-muted)"
      />
    </svg>
  );
}
