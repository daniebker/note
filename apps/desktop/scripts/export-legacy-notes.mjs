// Exports the notes from the retired web app's SQLite database to markdown
// files, one folder per user. Existing files are never overwritten.
//
//   node apps/desktop/scripts/export-legacy-notes.mjs <note.db> <output-folder>
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { stringify } from "yaml";

const [database, output] = process.argv.slice(2);
if (!database || !output) {
  console.error("Usage: export-legacy-notes.mjs <note.db> <output-folder>");
  process.exit(1);
}

const db = new DatabaseSync(database, { readOnly: true });
const rows = db
  .prepare(
    `SELECT Note.*, User.username FROM Note JOIN User ON User.id = Note.userId`,
  )
  .all();

let written = 0;
for (const row of rows) {
  const frontmatter = stringify({
    title: row.title,
    color: row.color,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    created: new Date(row.createdAt).toISOString(),
    updated: new Date(row.updatedAt).toISOString(),
  });
  const folder = path.join(output, row.username);
  const file = path.join(folder, `${row.id}.md`);
  mkdirSync(folder, { recursive: true });
  try {
    writeFileSync(file, `---\n${frontmatter}---\n\n${row.content}`, {
      flag: "wx",
    });
    written++;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.warn(`Skipped, already exists: ${file}`);
  }
}
console.log(`Exported ${written} of ${rows.length} note(s) to ${output}`);
