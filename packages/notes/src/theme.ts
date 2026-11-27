/** Applies the saved (or system) theme; call before the first render. */
export function applySavedTheme() {
  const theme = localStorage.getItem("theme");
  if (
    theme === "dark" ||
    (!theme && matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.classList.add("dark");
  }
}
