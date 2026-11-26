// Runs against a real WebDAV server; needs `rclone` on the PATH.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createNoteStore, type NoteStore } from "../src/note-store.ts";

const ADDRESS = "127.0.0.1:18089";
let root: string;
let server: ChildProcess;
let store: NoteStore;

const fileFor = (id: string) => path.join(root, "my notes", `${id}.md`);

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "note-test-"));
  server = spawn(
    "rclone",
    ["serve", "webdav", root, "--addr", ADDRESS, "--user", "u", "--pass", "p", "--dir-cache-time", "0s"],
    { stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`http://${ADDRESS}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  store = createNoteStore({
    url: `http://${ADDRESS}/my%20notes`,
    username: "u",
    password: "p",
  });
});

after(async () => {
  server.kill();
  await rm(root, { recursive: true, force: true });
});

test("a missing folder is an error until it is prepared", async () => {
  await assert.rejects(store.list());
  await store.prepare();
  assert.deepEqual(await store.list(), []);
});

test("a wrong password is rejected", async () => {
  const bad = createNoteStore({
    url: `http://${ADDRESS}/`,
    username: "u",
    password: "wrong",
  });
  await assert.rejects(bad.prepare());
});

test("creates, updates and deletes a note", async () => {
  const content = "---\nnot frontmatter\n\n  ünï 🎉  \n";
  const note = await store.create({ title: 'A: "title" #x', content });
  assert.deepEqual(await store.list(), [note]);

  await Promise.all([
    store.update(note.id, { pinned: true }),
    store.update(note.id, { color: "mint" }),
  ]);
  const [updated] = await store.list();
  assert.equal(updated?.pinned, true);
  assert.equal(updated?.color, "mint");
  assert.equal(updated?.content, content);

  await store.remove(note.id);
  await store.remove(note.id);
  assert.deepEqual(await store.list(), []);
  await assert.rejects(store.update(note.id, { title: "gone" }));
});

test("handles files written by hand", async () => {
  const id = "My note #1 (100%)";
  await writeFile(fileFor(id), "just text");
  await writeFile(fileFor(".hidden"), "ignored");

  const [note, ...others] = await store.list();
  assert.equal(others.length, 0);
  assert.equal(note?.id, id);
  assert.equal(note?.title, id);

  await writeFile(fileFor(id), "---\ntags: [a]\n---\n\nedited");
  await store.update(id, { color: "fog" });
  const source = await readFile(fileFor(id), "utf8");
  assert.match(source, /tags:/);
  assert.match(source, /edited$/);
  await store.remove(id);
});

test("rejects ids that leave the folder", async () => {
  await assert.rejects(store.update("../x", { title: "x" }));
  await assert.rejects(store.remove("a/b"));
});
