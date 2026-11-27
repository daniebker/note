// Names of the files in the notes folder and its attachments folder.

/** The folder inside the notes folder that attached files are kept in. */
export const ATTACHMENTS_FOLDER = "attachments";

// Room for a " (2)" suffix and the local folder's temporary file name within
// the usual limit of 255 bytes.
const MAX_NAME_BYTES = 180;

// Anything that could leave the folder is rejected, and hidden files (editor
// swap files and the like) are ignored.
export function isValidFileName(name: string) {
  return name !== "" && !name.startsWith(".") && !/[/\\\0]/.test(name);
}

function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Makes the name of a picked file safe to use on any of the storages. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\p{Cc}/\\:*?"<>|]/gu, "-")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  let [base, extension] = splitExtension(cleaned || "attachment");
  if (byteLength(extension) > 20) [base, extension] = [base + extension, ""];
  // By code point, so that a character is never cut in half.
  const characters = Array.from(base);
  while (byteLength(characters.join("") + extension) > MAX_NAME_BYTES) {
    characters.pop();
  }
  return characters.join("") + extension;
}

/**
 * `name` if no file has it, otherwise "a (2).png", "a (3).png", ... Case is
 * ignored, as some filesystems and servers don't distinguish it.
 */
export function freeName(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (other) => other.toLowerCase()));
  const [base, extension] = splitExtension(name);
  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    candidate = `${base} (${n})${extension}`;
  }
  return candidate;
}

/** The files among `names` that are `name` or a renamed copy of it. */
export function copiesOf(name: string, names: Iterable<string>): string[] {
  const [base, extension] = splitExtension(name.toLowerCase());
  return Array.from(names).filter((other) => {
    const [otherBase, otherExtension] = splitExtension(other.toLowerCase());
    return (
      otherExtension === extension &&
      otherBase.startsWith(base) &&
      /^( \(\d+\))?$/.test(otherBase.slice(base.length))
    );
  });
}
