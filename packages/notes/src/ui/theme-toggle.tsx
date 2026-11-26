import { useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggle() {
  // main.tsx applies the saved theme before the first render.
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

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
