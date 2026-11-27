// Two devices keeping their own copies of one WebDAV folder; needs `rclone` on
// the PATH.
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
import type { NoteFolder } from "../src/folder";
import { createLocalFolder } from "../src/local-folder.ts";
import { createNoteStore } from "../src/note-store.ts";
import { createNoteService, type StoredConnection } from "../src/service.ts";
import { createSync } from "../src/sync.ts";
import { createWebdavFolder } from "../src/webdav-folder.ts";

const ADDRESS = "127.0.0.1:18093";
let root: string;
let server: ChildProcess | undefined;

async function startServer() {
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
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function stopServer() {
  const exited = new Promise((resolve) => server!.once("exit", resolve));
  server!.kill();
  await exited;
}

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "note-sync-"));
  await mkdir(path.join(root, "dav"));
  await startServer();
});

after(async () => {
  server?.kill();
  await rm(root, { recursive: true, force: true });
});

const text = (value: string) => new TextEncoder().encode(value);

let setups = 0;

/** A new, empty server folder and a way to add devices that sync with it. */
async function setup() {
  const name = `s${++setups}`;
  const onServer = path.join(root, "dav", name);
  await mkdir(onServer);
  let devices = 0;

  function device(wrap = (folder: NoteFolder) => folder) {
    const dir = path.join(root, "devices", name, String(++devices));
    const mirror = createLocalFolder(dir);
    const remote = createWebdavFolder({
      url: `http://${ADDRESS}/${name}`,
      username: "",
      password: "",
    });
    const engine = createSync({
      local: mirror,
      remote: wrap(remote),
      describeError: (error) => (error as Error).message,
    });
    const store = createNoteStore(mirror);
    return {
      dir,
      engine,
      store,
      async sync() {
        await engine.run();
        assert.equal(engine.status().error, null);
      },
    };
  }

  return { onServer, device };
}

// Every note and attachment, by name.
async function contents(dir: string) {
  const files: Record<string, string> = {};
  for (const folder of ["", "attachments"]) {
    const entries = await readdir(path.join(dir, folder), {
      withFileTypes: true,
    }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      const file = path.join(folder, entry.name);
      files[file] = await readFile(path.join(dir, file), "utf8");
    }
  }
  return files;
}

test("notes, attachments and deletions reach the other device", async () => {
  const { onServer, device } = await setup();
  const a = device();
  const b = device();
  await a.engine.lock(() => a.store.prepare());
  await a.sync();

  const note = await a.store.create({ title: "Hello", content: "ü" });
  await a.store.addAttachment(note.id, {
    name: "my file #1.txt",
    data: text("attached"),
  });
  assert.equal(await a.engine.hasPendingChanges(), true);
  await a.sync();
  assert.equal(await a.engine.hasPendingChanges(), false);
  await b.sync();
  assert.deepEqual(await contents(b.dir), await contents(a.dir));
  assert.deepEqual(await contents(onServer), await contents(a.dir));

  await b.store.removeAttachment(note.id, "my file #1.txt");
  await b.sync();
  await a.sync();
  assert.deepEqual((await a.store.list())[0]?.attachments, []);
  assert.deepEqual(Object.keys(await contents(a.dir)), [`${note.id}.md`]);

  await a.store.remove(note.id);
  await a.sync();
  await b.sync();
  assert.deepEqual(await contents(onServer), {});
  assert.deepEqual(await contents(b.dir), {});
});

test("nothing is downloaded again unless it changed", async () => {
  const { device } = await setup();
  const reads: string[] = [];
  const a = device();
  const b = device((remote) => ({
    ...remote,
    read: (name) => (reads.push(name), remote.read(name)),
    attachments: {
      ...remote.attachments,
      read: (name) => (reads.push(name), remote.attachments.read(name)),
    },
  }));
  const note = await mkdir(a.dir, { recursive: true }).then(() =>
    a.store.create({ title: "x" }),
  );
  await a.store.addAttachment(note.id, { name: "a.bin", data: text("a") });
  await a.sync();
  await b.sync();
  assert.deepEqual(reads.sort(), [`${note.id}.md`, "a.bin"].sort());
  reads.length = 0;
  await b.sync();
  assert.deepEqual(reads, []);
});

// Two devices that both have one note, with an attachment.
async function shared() {
  const { onServer, device } = await setup();
  const a = device();
  const b = device();
  await mkdir(a.dir, { recursive: true });
  const { id } = await a.store.create({ title: "T", content: "original" });
  await a.store.addAttachment(id, { name: "first.txt", data: text("1") });
  await a.sync();
  await b.sync();
  return { onServer, a, b, id };
}

test("changes to different parts of a note are merged", async () => {
  const { onServer, a, b, id } = await shared();
  await a.store.update(id, { content: "rewritten" });
  await a.store.addAttachment(id, { name: "from a.txt", data: text("a") });
  await b.store.update(id, { pinned: true, color: "mint" });
  await b.store.addAttachment(id, { name: "from b.txt", data: text("b") });
  await b.store.removeAttachment(id, "first.txt");
  await a.sync();
  await b.sync();
  await a.sync();

  const notes = await a.store.list();
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.content, "rewritten");
  assert.equal(notes[0]?.pinned, true);
  assert.equal(notes[0]?.color, "mint");
  assert.deepEqual([...(notes[0]?.attachments ?? [])].sort(), [
    "from a.txt",
    "from b.txt",
  ]);
  assert.deepEqual(await contents(a.dir), await contents(onServer));
  assert.deepEqual(await contents(b.dir), await contents(onServer));
  assert.equal(Object.keys(await contents(onServer)).length, 3);
});

test("clashing edits are kept as two notes", async () => {
  const { onServer, a, b, id } = await shared();
  await a.store.update(id, { content: "from a" });
  await b.store.update(id, { content: "from b" });
  await a.sync();
  await b.sync();
  await a.sync();
  await b.sync();

  const notes = await b.store.list();
  const byTitle = Object.fromEntries(notes.map((n) => [n.title, n]));
  assert.equal(notes.length, 2);
  assert.equal(byTitle["T"]?.id, id);
  assert.equal(byTitle["T"]?.content, "from a");
  assert.equal(byTitle["T (conflicted copy)"]?.content, "from b");
  assert.deepEqual(await contents(a.dir), await contents(onServer));
  assert.deepEqual(await contents(b.dir), await contents(onServer));

  // The shared file outlives either copy.
  await b.store.remove(id);
  await b.sync();
  assert.ok("attachments/first.txt" in (await contents(onServer)));
});

test("an edit wins over a deletion, keeping its files", async () => {
  for (const editorSyncsFirst of [true, false]) {
    const { onServer, a, b, id } = await shared();
    await a.store.remove(id);
    await b.store.update(id, { content: "still wanted" });
    for (const side of editorSyncsFirst ? [b, a, b] : [a, b, a]) {
      await side.sync();
    }
    await a.sync();
    await b.sync();
    assert.equal((await a.store.list())[0]?.content, "still wanted");
    assert.equal((await contents(onServer))["attachments/first.txt"], "1");
    assert.deepEqual(await contents(a.dir), await contents(onServer));
    assert.deepEqual(await contents(b.dir), await contents(onServer));
  }
});

test("different files added under one name are both kept", async () => {
  const { onServer, a, b, id } = await shared();
  const other = (await b.store.create({ title: "other" })).id;
  await a.store.addAttachment(id, { name: "photo.jpg", data: text("a") });
  await b.store.addAttachment(other, { name: "photo.jpg", data: text("b") });
  await a.sync();
  await b.sync();
  await a.sync();

  for (const [noteId, expected] of [
    [id, "a"],
    [other, "b"],
  ] as const) {
    const note = (await a.store.list()).find((n) => n.id === noteId)!;
    const name = note.attachments.at(-1)!;
    assert.equal(
      new TextDecoder().decode(await a.store.readAttachment(name)),
      expected,
    );
  }
  assert.deepEqual(await contents(a.dir), await contents(onServer));
  assert.deepEqual(await contents(b.dir), await contents(onServer));
});

test("changes made offline are sent once the server is back", async () => {
  const { onServer, a, b, id } = await shared();
  await stopServer();
  await a.store.update(id, { content: "written offline" });
  const added = await a.store.create({ title: "new offline" });
  await a.store.addAttachment(added.id, { name: "o.txt", data: text("o") });
  await a.engine.run();
  assert.notEqual(a.engine.status().error, null);
  await assert.rejects(a.engine.flush());
  assert.equal(await a.engine.hasPendingChanges(), true);
  assert.equal((await a.store.list()).length, 2);

  await startServer();
  await a.sync();
  await b.sync();
  assert.deepEqual(await contents(b.dir), await contents(a.dir));
  assert.deepEqual(await contents(onServer), await contents(a.dir));
});

test("an emptied server folder doesn't empty the device", async () => {
  const { onServer, a } = await shared();
  for (const title of ["2", "3", "4"]) await a.store.create({ title });
  await a.sync();
  const before = await contents(a.dir);
  await rm(onServer, { recursive: true });
  await mkdir(onServer);
  await a.engine.run();
  assert.match(a.engine.status().error ?? "", /unexpectedly empty/);
  assert.deepEqual(await contents(a.dir), before);
});

test("an edit made while syncing isn't overwritten", async () => {
  const { device } = await setup();
  const a = device();
  let duringRead: (() => Promise<unknown>) | undefined;
  const b = device((remote) => ({
    ...remote,
    async read(name) {
      const value = await remote.read(name);
      const run = duringRead;
      duringRead = undefined;
      await run?.();
      return value;
    },
  }));
  await mkdir(a.dir, { recursive: true });
  const { id } = await a.store.create({ title: "T", content: "one" });
  await a.sync();
  await b.sync();
  await a.store.update(id, { content: "from a" });
  await a.sync();
  duringRead = () =>
    b.engine.lock(() => b.store.update(id, { content: "typed meanwhile" }));
  await b.sync();
  const written = (await b.store.list()).map((n) => n.content).sort();
  assert.deepEqual(written, ["from a", "typed meanwhile"]);
});

test("devices converge after any mix of changes", async () => {
  // A fixed sequence of "random" numbers, so failures can be repeated.
  let seed = 7;
  const random = (n: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  };
  const { onServer, device } = await setup();
  const devices = [device(), device()];
  await mkdir(devices[0]!.dir, { recursive: true });
  await mkdir(devices[1]!.dir, { recursive: true });

  for (let step = 0; step < 150; step++) {
    const { store, sync } = devices[random(2)]!;
    const notes = await store.list();
    const note = notes[random(notes.length || 1)];
    const action = random(8);
    if (action === 0 || !note) await store.create({ title: `n${step}` });
    else if (action === 1) await store.update(note.id, { content: `c${step}` });
    else if (action === 2) await store.update(note.id, { pinned: !note.pinned });
    else if (action === 3 && notes.length > 2) await store.remove(note.id);
    else if (action === 4) {
      await store.addAttachment(note.id, {
        name: `f${random(4)}.txt`,
        data: text(`data ${step}`),
      });
    } else if (action === 5 && note.attachments[0]) {
      await store.removeAttachment(note.id, note.attachments[0]);
    } else await sync();
  }
  for (let round = 0; round < 3; round++) {
    for (const side of devices) await side.sync();
  }

  const expected = await contents(onServer);
  for (const { dir, store, engine } of devices) {
    assert.deepEqual(await contents(dir), expected);
    assert.equal(await engine.hasPendingChanges(), false);
    // No note lists a file that isn't there.
    for (const note of await store.list()) {
      for (const name of note.attachments) await store.readAttachment(name);
    }
  }
});

test("the service works offline and keeps unsent changes", async () => {
  const { onServer } = await setup();
  const url = `http://${ADDRESS}/${path.basename(onServer)}`;
  const connection: Connection = {
    type: "webdav",
    url,
    username: "",
    password: "",
  };
  await writeFile(path.join(onServer, "there.md"), "from the server");
  let saved: StoredConnection | null = null;
  const settings = {
    load: async () => saved,
    save: async (next: Connection) => void (saved = next),
    clear: async () => void (saved = null),
    canSavePassword: async () => true,
  };
  const mirrors = path.join(root, "service-mirrors");
  const create = () =>
    createNoteService(settings, {
      open: createLocalFolder,
      defaultPath: async () => path.join(root, "service-default"),
      canChooseFolder: true,
      openMirror: (key) => createLocalFolder(path.join(mirrors, key)),
    });
  const ok = <T>(
    result: { ok: true; value: T } | { ok: false; error: string },
  ) => (result.ok ? result.value : assert.fail(result.error));
  const mirrored = async () =>
    contents(path.join(mirrors, (await readdir(mirrors))[0]!));

  const first = create();
  ok(await first.connect(connection));
  ok(await first.sync());
  assert.equal(ok(await first.listNotes()).length, 1);
  await stopServer();

  // Restarting offline still shows the notes, and they can be edited.
  const second = create();
  assert.equal(ok(await second.getConnection()).connected, true);
  ok(await second.updateNote("there", { content: "edited offline" }));
  assert.match(ok(await second.sync())?.error ?? "", /reach the server/);
  // As when the password has to be typed again.
  ok(await create().connect(connection));

  // Switching elsewhere would leave the edit behind, so it's refused.
  const elsewhere: Connection = {
    type: "local",
    path: path.join(root, "elsewhere"),
  };
  assert.equal((await second.connect(elsewhere)).ok, false);
  ok(await second.disconnect());
  assert.match((await mirrored())["there.md"]!, /edited offline/);

  await startServer();
  const third = create();
  ok(await third.connect(connection));
  ok(await third.sync());
  assert.match((await contents(onServer))["there.md"]!, /edited offline/);
  // With everything sent, disconnecting deletes the copy.
  ok(await third.disconnect());
  assert.deepEqual(await mirrored(), {});
});

test("devices converge when edited while syncing", async () => {
  let seed = 5;
  const random = (n: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  };
  const { onServer, device } = await setup();
  const devices = [device(), device()];
  for (const { dir } of devices) await mkdir(dir, { recursive: true });
  // The devices take turns on the server, as plain WebDAV can't stop two that
  // write one file at the same instant. Edits carry on during each sync.
  let turns = Promise.resolve();

  for (let step = 0; step < 150; step++) {
    const { store, engine } = devices[random(2)]!;
    const action = random(8);
    if (action >= 6) turns = turns.then(() => engine.run());
    // As the service does it.
    await engine.lock(async () => {
      const notes = await store.list();
      const note = notes[random(notes.length || 1)];
      if (action === 0 || !note) await store.create({ title: `n${step}` });
      else if (action === 1) {
        await store.update(note.id, { content: `c${step}` });
      } else if (action === 2) {
        await store.update(note.id, { pinned: !note.pinned });
      } else if (action === 3 && notes.length > 2) await store.remove(note.id);
      else if (action === 4) {
        await store.addAttachment(note.id, {
          name: `f${random(4)}.txt`,
          data: text(`data ${step}`),
        });
      } else if (action === 5 && note.attachments[0]) {
        await store.removeAttachment(note.id, note.attachments[0]);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, random(8)));
  }
  await turns;
  for (let round = 0; round < 3; round++) {
    for (const side of devices) await side.sync();
  }

  const expected = await contents(onServer);
  for (const { dir, store } of devices) {
    assert.deepEqual(await contents(dir), expected);
    for (const note of await store.list()) {
      for (const name of note.attachments) await store.readAttachment(name);
    }
  }
});
