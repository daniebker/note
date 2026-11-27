// Runs against a local folder and a real WebDAV server; the latter needs
// `rclone` on the PATH.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { createLocalFolder } from "../src/local-folder.ts";
import { createNoteStore, type NoteStore } from "../src/note-store.ts";
import { createWebdavFolder } from "../src/webdav-folder.ts";

const ADDRESS = "127.0.0.1:18089";

// Tests that hold for any kind of folder. The store's notes folder must be
// `<root>/my notes`, and not exist yet.
function storeTests(
  setup: (root: string) => Promise<NoteStore>,
  teardown: () => void = () => {},
) {
  let root: string;
  let store: NoteStore;
  const fileFor = (id: string) => path.join(root, "my notes", `${id}.md`);

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "note-test-"));
    store = await setup(root);
  });

  after(async () => {
    teardown();
    await rm(root, { recursive: true, force: true });
  });

  test("a missing folder is an error until it is prepared", async () => {
    await assert.rejects(store.list());
    await store.prepare();
    assert.deepEqual(await store.list(), []);
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
    await rm(fileFor(".hidden"));
  });

  test("rejects ids that leave the folder", async () => {
    await assert.rejects(store.update("../x", { title: "x" }));
    await assert.rejects(store.remove("a/b"));
  });
}

describe("local folder", () => {
  let root: string;

  storeTests(async (dir) => {
    root = dir;
    return createNoteStore(createLocalFolder(path.join(dir, "my notes")));
  });

  test("creates missing parent folders", async () => {
    const nested = createNoteStore(
      createLocalFolder(path.join(root, "a", "b", "notes")),
    );
    await nested.prepare();
    assert.deepEqual(await nested.list(), []);
  });

  test("leaves no temporary files and keeps permissions", async () => {
    const folder = path.join(root, "my notes");
    const store = createNoteStore(createLocalFolder(folder));
    const note = await store.create({ title: "x" });
    const file = path.join(folder, `${note.id}.md`);
    await chmod(file, 0o640);
    await store.update(note.id, { title: "y" });
    assert.equal((await stat(file)).mode & 0o777, 0o640);
    assert.deepEqual(await readdir(folder), [`${note.id}.md`]);
    await store.remove(note.id);
  });

  test("needs a full path", () => {
    assert.throws(() => createLocalFolder("relative/notes"));
  });
});

describe("WebDAV folder", () => {
  let server: ChildProcess;

  storeTests(
    async (root) => {
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
      return createNoteStore(
        createWebdavFolder({
          url: `http://${ADDRESS}/my%20notes`,
          username: "u",
          password: "p",
        }),
      );
    },
    () => server.kill(),
  );

  test("a wrong password is rejected", async () => {
    const bad = createNoteStore(
      createWebdavFolder({
        url: `http://${ADDRESS}/`,
        username: "u",
        password: "wrong",
      }),
    );
    await assert.rejects(bad.prepare());
  });
});
