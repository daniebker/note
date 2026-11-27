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

  test("uploads attachments and deletes their files", async () => {
    const attachments = path.join(root, "my notes", "attachments");
    // Every byte value, so any text decoding along the way would show.
    const data = Uint8Array.from({ length: 70_000 }, (_, i) => i % 256);
    const note = await store.create({ title: "files" });

    await Promise.all([
      store.addAttachment(note.id, { name: "my pic #1.png", data }),
      store.addAttachment(note.id, { name: "my pic #1.png", data }),
    ]);
    // Either upload may finish last, so the note is read back.
    const [added] = await store.list();
    assert.deepEqual([...added!.attachments].sort(), [
      "my pic #1 (2).png",
      "my pic #1.png",
    ]);
    const escaped = await store.addAttachment(note.id, {
      name: "../../.évil?.txt",
      data: new Uint8Array(),
    });
    const odd = escaped.attachments[2]!;
    assert.equal(odd, "-..-.évil-.txt");
    assert.deepEqual(
      (await readdir(attachments)).sort(),
      [...escaped.attachments].sort(),
    );
    assert.deepEqual(await store.readAttachment("my pic #1.png"), data);
    assert.equal((await store.readAttachment(odd)).length, 0);
    // The attachments folder isn't a note, and edits keep the list.
    const edited = await store.update(note.id, { color: "mint" });
    assert.deepEqual(edited.attachments, escaped.attachments);
    assert.deepEqual(await store.list(), [edited]);
    assert.match(
      await readFile(fileFor(note.id), "utf8"),
      /attachments:\n {2}- "attachments\/my pic #1\.png"/,
    );

    const removed = await store.removeAttachment(note.id, "my pic #1.png");
    assert.deepEqual(removed.attachments, ["my pic #1 (2).png", odd]);
    assert.deepEqual(
      (await readdir(attachments)).sort(),
      [...removed.attachments].sort(),
    );
    await assert.rejects(store.readAttachment("my pic #1.png"));

    // Deleting the note deletes what's left.
    await store.remove(note.id);
    assert.deepEqual(await readdir(attachments), []);
  });

  test("keeps files that another note also has", async () => {
    const note = await store.create({ title: "original" });
    const { attachments } = await store.addAttachment(note.id, {
      name: "shared.txt",
      data: new TextEncoder().encode("shared"),
    });
    const source = await readFile(fileFor(note.id), "utf8");
    await writeFile(fileFor("duplicate"), source);

    await store.remove(note.id);
    assert.equal((await store.readAttachment("shared.txt")).length, 6);
    await store.removeAttachment("duplicate", attachments[0]!);
    await assert.rejects(store.readAttachment("shared.txt"));
    await store.remove("duplicate");
  });

  test("leaves a file no note lists alone", async () => {
    const note = await store.create({ title: "x" });
    const file = path.join(root, "my notes", "attachments", "mine.txt");
    await writeFile(file, "mine");
    await store.removeAttachment(note.id, "mine.txt");
    assert.equal(await readFile(file, "utf8"), "mine");
    await rm(file);
    await store.remove(note.id);
  });

  test("doesn't overwrite another tool's attachments property", async () => {
    const source = "---\nattachments: [https://example.com/a]\n---\n\nbody";
    await writeFile(fileFor("foreign"), source);
    await assert.rejects(
      store.addAttachment("foreign", {
        name: "orphan.txt",
        data: new Uint8Array(1),
      }),
    );
    await assert.rejects(store.readAttachment("orphan.txt"));
    await store.update("foreign", { color: "fog" });
    assert.match(
      await readFile(fileFor("foreign"), "utf8"),
      /https:\/\/example\.com\/a/,
    );
    await store.remove("foreign");
  });

  test("rejects ids that leave the folder", async () => {
    await assert.rejects(store.update("../x", { title: "x" }));
    await assert.rejects(store.remove("a/b"));
    await assert.rejects(store.readAttachment("../x"));
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
    // Left by the tests above.
    await rm(path.join(folder, "attachments"), { recursive: true });
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
