// Strips markdown syntax down to plain text for use in <meta description> and OG tags.
export function noteExcerpt(content: string, length = 160): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "A shared note.";
  return plain.length > length
    ? `${plain.slice(0, length - 1).trimEnd()}…`
    : plain;
}
