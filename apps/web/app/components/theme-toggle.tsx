"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggle() {
  // Resolved after mount to match whatever the inline script in layout.tsx
  // applied before hydration.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-full p-2 text-ink-muted hover:bg-ink/10"
      onClick={toggle}
      title={dark ? "Light theme" : "Dark theme"}
      type="button"
    >
      {dark ? (
        <SunIcon className="h-5 w-5" />
      ) : (
        <MoonIcon className="h-5 w-5" />
      )}
    </button>
  );
}
