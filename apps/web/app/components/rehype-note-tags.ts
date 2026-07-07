import type { Element, ElementContent, Root, Text } from "hast";
import { isTag, TAG_RE } from "./tags";

// Elements whose text should never be turned into tags.
const SKIP = new Set(["code", "pre", "a"]);

// Wraps #tag occurrences in text nodes with
// <span class="note-tag" data-tag="tag">#tag</span> so the renderer can style
// them and make them clickable.
export function rehypeNoteTags() {
  return (tree: Root) => {
    walk(tree);
  };
}

function walk(node: Root | Element) {
  const next: ElementContent[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      next.push(...splitTags(child));
      continue;
    }
    if (child.type === "element" && !SKIP.has(child.tagName)) {
      walk(child);
    }
    next.push(child as ElementContent);
  }
  node.children = next;
}

function splitTags(node: Text): ElementContent[] {
  const value = node.value;
  const out: ElementContent[] = [];
  let last = 0;
  for (const match of value.matchAll(TAG_RE)) {
    const name = match[1]!;
    if (!isTag(name)) continue;
    if (match.index > last) {
      out.push({ type: "text", value: value.slice(last, match.index) });
    }
    out.push({
      type: "element",
      tagName: "span",
      properties: { className: ["note-tag"], dataTag: name },
      children: [{ type: "text", value: match[0] }],
    });
    last = match.index + match[0].length;
  }
  if (out.length === 0) return [node];
  if (last < value.length) {
    out.push({ type: "text", value: value.slice(last) });
  }
  return out;
}
