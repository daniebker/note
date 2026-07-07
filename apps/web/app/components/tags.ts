// A tag is "#" immediately followed by word characters (e.g. #work,
// #2024-plans), at the start of a line or after whitespace/"(". Because a
// space is required after "#" for a markdown heading, "# heading" is never a
// tag and "#tag" is never a heading.
export const TAG_RE = /(?<=^|[\s(])#([\p{L}\p{N}_-]+)/gmu;

// Purely numeric candidates like "#123" read as issue/list references, not tags.
export function isTag(name: string): boolean {
  return !/^\d+$/.test(name);
}

// Fenced blocks and inline code spans are dropped so things like
// `#include <stdio.h>` don't become tags.
function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ");
}

// Distinct tags across the given texts, first-seen casing, in order of
// appearance. Matching elsewhere is case-insensitive.
export function extractTags(...texts: string[]): string[] {
  const seen = new Map<string, string>();
  for (const text of texts) {
    for (const match of stripCode(text).matchAll(TAG_RE)) {
      const name = match[1]!;
      if (!isTag(name)) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return [...seen.values()];
}
