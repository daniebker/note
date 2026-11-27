// Copying notes when the user switches where they're kept. Runs against local
// folders and a real WebDAV server; the latter needs `rclone` on the PATH.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { Connection } from "../src/api";
import { copyNotes } from "../src/copy-notes.ts";
import { createLocalFolder } from "../src/local-folder.ts";
import {
  createNoteService,
  type NoteService,
  type StoredConnection,
} from "../src/service.ts";
import { createWebdavFolder } from "../src/webdav-folder.ts";

const ADDRESS = "127.0.0.1:18090";
let root: string;
let server: ChildProcess;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "note-switch-"));
  await mkdir(path.join(root, "dav"));
  server = spawn(
    "rclone",
    [
      "serve",
      "webdav",
      path.join(root, "dav"),
      "--addr",
      ADDRESS,
      "--dir-cache-time",
      "0s",
    ],
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
});

after(async () => {
  server.kill();
  await rm(root, { recursive: true, force: true });
});

async function folderWith(name: string, files: Record<string, string>) {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    await writeFile(path.join(dir, file), contents);
  }
  return dir;
}

test("copies notes, skipping identical ones and keeping both of a clash", async () => {
  const from = await folderWith("copy-from", {
    "a.md": "same",
    "b.md": "new b",
    "c.md": "only here",
    "notes.txt": "not a note",
    ".hidden.md": "ignored",
  });
  const to = await folderWith("copy-to", {
    "a.md": "same",
    "b.md": "old b",
    "b (2).md": "taken",
  });

  const summary = await copyNotes(
    createLocalFolder(from),
    createLocalFolder(to),
  );
  assert.deepEqual(summary, { copied: 2, renamed: 1, removed: 0 });
  assert.deepEqual((await readdir(to)).sort(), [
    "a.md",
    "b (2).md",
    "b (3).md",
    "b.md",
    "c.md",
  ]);
  assert.equal(await readFile(path.join(to, "b.md"), "utf8"), "old b");
  assert.equal(await readFile(path.join(to, "b (3).md"), "utf8"), "new b");
  // The originals are untouched.
  assert.equal((await readdir(from)).length, 5);

  // Copying again changes nothing.
  assert.deepEqual(
    await copyNotes(createLocalFolder(from), createLocalFolder(to)),
    { copied: 0, renamed: 0, removed: 0 },
  );
});

function memorySettings(initial: StoredConnection | null = null) {
  let saved = initial;
  return {
    load: async () => saved,
    save: async (connection: Connection) => {
      saved =
        connection.type === "webdav"
          ? { ...connection, password: connection.password }
          : connection;
    },
    clear: async () => {
      saved = null;
    },
    canSavePassword: async () => true,
  };
}

// Each service stands for a different device, with its own copies.
let services = 0;

function serviceWith(settings = memorySettings()): NoteService {
  const device = String(++services);
  return createNoteService(settings, {
    open: createLocalFolder,
    defaultPath: async () => path.join(root, "default"),
    canChooseFolder: true,
    openMirror: (key) =>
      createLocalFolder(path.join(root, "mirrors", device, key)),
  });
}

function ok<T>(result: { ok: true; value: T } | { ok: false; error: string }) {
  if (!result.ok) assert.fail(result.error);
  return result.value;
}

test("switching between local and WebDAV takes the notes along", async () => {
  const service = serviceWith();
  const local: Connection = { type: "local", path: path.join(root, "mine") };
  const webdav: Connection = {
    type: "webdav",
    url: `http://${ADDRESS}/notes`,
    username: "",
    password: "",
  };

  assert.equal(ok(await service.connect(local)).copy, undefined);
  const note = ok(await service.createNote({ title: "Kept", content: "ü" }));

  assert.deepEqual(ok(await service.connect(webdav)).copy, {
    copied: 1,
    renamed: 0,
    removed: 0,
  });
  ok(await service.sync());
  assert.deepEqual(ok(await service.listNotes()), [note]);

  // Back again: the local copy is already there and identical.
  ok(await service.updateNote(note.id, { pinned: true }));
  const back = ok(await service.connect(local));
  assert.deepEqual(back.copy, { copied: 1, renamed: 1, removed: 0 });
  const notes = ok(await service.listNotes());
  assert.equal(notes.length, 2);
  assert.equal(notes.filter((n) => n.pinned).length, 1);

  // Reconnecting to the same place copies nothing.
  assert.equal(ok(await service.connect(local)).copy, undefined);
});

test("a failed copy doesn't switch; disconnecting first skips it", async () => {
  const service = serviceWith();
  const from = path.join(root, "vanishing");
  ok(await service.connect({ type: "local", path: from }));
  ok(await service.createNote({ title: "x" }));
  await rm(from, { recursive: true });

  const target: Connection = { type: "local", path: path.join(root, "next") };
  const failed = await service.connect(target);
  assert.equal(failed.ok, false);
  assert.match(!failed.ok ? failed.error : "", /disconnect first/);
  assert.equal(ok(await service.getConnection()).path, from);

  ok(await service.disconnect());
  assert.equal(ok(await service.connect(target)).copy, undefined);
});

test("says so when the old location couldn't be read", async () => {
  const service = serviceWith(
    memorySettings({
      type: "webdav",
      url: `http://${ADDRESS}/notes`,
      username: "u",
      password: null,
    }),
  );
  assert.equal(ok(await service.getConnection()).connected, false);
  const result = ok(
    await service.connect({ type: "local", path: path.join(root, "fresh") }),
  );
  assert.equal(result.copy, null);
});

test("copies from WebDAV to a local folder", async () => {
  const dav = createWebdavFolder({
    url: `http://${ADDRESS}/notes`,
    username: "",
    password: "",
  });
  const to = await folderWith("from-dav", {});
  const summary = await copyNotes(dav, createLocalFolder(to));
  assert.equal(summary.copied, (await readdir(to)).length);
  assert.ok(summary.copied > 0);
});

test("moving deletes the notes from the old location", async () => {
  const from = await folderWith("move-from", {
    "a.md": "same",
    "b.md": "new b",
    "c.md": "only here",
    "keep.txt": "not a note",
  });
  const to = await folderWith("move-to", { "a.md": "same", "b.md": "old b" });

  const summary = await copyNotes(
    createLocalFolder(from),
    createLocalFolder(to),
    {
      move: true,
    },
  );
  assert.deepEqual(summary, { copied: 2, renamed: 1, removed: 3 });
  assert.deepEqual(await readdir(from), ["keep.txt"]);
  assert.deepEqual((await readdir(to)).sort(), [
    "a.md",
    "b (2).md",
    "b.md",
    "c.md",
  ]);
});

test("won't move a folder onto itself", async () => {
  const dir = await folderWith("same", { "a.md": "only copy" });
  await assert.rejects(
    copyNotes(createLocalFolder(dir), createLocalFolder(`${dir}/`), {
      move: true,
    }),
    /same folder/,
  );
  // Served over WebDAV, it's still the same folder.
  const davDir = await folderWith("dav/shared", { "a.md": "only copy" });
  const dav = createWebdavFolder({
    url: `http://${ADDRESS}/shared`,
    username: "",
    password: "",
  });
  await assert.rejects(
    copyNotes(createLocalFolder(davDir), dav, { move: true }),
    /same folder/,
  );
  assert.deepEqual(await readdir(dir), ["a.md"]);
  assert.deepEqual(await readdir(davDir), ["a.md"]);
});

test("the service moves notes when asked", async () => {
  const service = serviceWith();
  const first = path.join(root, "svc-first");
  ok(await service.connect({ type: "local", path: first }));
  const note = ok(await service.createNote({ title: "Moving" }));
  const result = ok(
    await service.connect(
      { type: "local", path: path.join(root, "svc-second") },
      { removeOld: true },
    ),
  );
  assert.deepEqual(result.copy, { copied: 1, renamed: 0, removed: 1 });
  assert.deepEqual(await readdir(first), []);
  assert.deepEqual(
    ok(await service.listNotes()).map((n) => n.id),
    [note.id],
  );
});

const attached = (name: string, body: string) =>
  `---\ntitle: T\nattachments:\n  - attachments/${name}\n---\n\n${body}`;

for (const kind of ["local", "WebDAV"] as const) {
  test(`moves attachments into a ${kind} folder, renaming clashes`, async () => {
    const from = await folderWith(`attach-from-${kind}`, {
      "a.md": attached("pic.png", "a"),
      "b.md": attached("same.txt", "b"),
    });
    await folderWith(`attach-from-${kind}/attachments`, {
      "pic.png": "new picture",
      "same.txt": "same",
    });
    const name = kind === "local" ? `attach-to-${kind}` : `dav/attach-to`;
    const to = await folderWith(name, {});
    await folderWith(`${name}/attachments`, {
      "pic.png": "old picture",
      "same.txt": "same",
    });
    const target =
      kind === "local"
        ? createLocalFolder(to)
        : createWebdavFolder({
            url: `http://${ADDRESS}/attach-to`,
            username: "",
            password: "",
          });

    // Copying first checks that doing it again changes nothing.
    await copyNotes(createLocalFolder(from), target);
    const summary = await copyNotes(createLocalFolder(from), target, {
      move: true,
    });
    assert.deepEqual(summary, { copied: 0, renamed: 0, removed: 2 });
    assert.deepEqual((await readdir(path.join(to, "attachments"))).sort(), [
      "pic (2).png",
      "pic.png",
      "same.txt",
    ]);
    const read = (file: string) => readFile(path.join(to, file), "utf8");
    assert.equal(await read("attachments/pic.png"), "old picture");
    assert.equal(await read("attachments/pic (2).png"), "new picture");
    assert.equal(await read("a.md"), attached("pic (2).png", "a"));
    assert.equal(await read("b.md"), attached("same.txt", "b"));
    assert.deepEqual(await readdir(path.join(from, "attachments")), []);
  });
}
