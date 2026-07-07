import type { NoteData } from "./note-types";

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim() || "Untitled";
}

export function downloadNoteAsMarkdown(note: NoteData, authorEmail: string) {
  const title = note.title.trim() || "Untitled";
  const frontmatter = [
    "---",
    `title: ${yamlString(title)}`,
    `author: ${yamlString(authorEmail)}`,
    `created: ${yamlString(note.createdAt)}`,
    `color: ${yamlString(note.color)}`,
    "---",
    "",
    "",
  ].join("\n");

  const blob = new Blob([frontmatter + note.content], {
    type: "text/markdown",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(title)}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
