// Runs the note store over the native fetch adapter, with Node's fetch standing
// in for the native request. Needs `rclone` on the PATH.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { getPatcher } from "webdav";
import { createNoteStore } from "../../../packages/notes/src/note-store.ts";
import { createNativeFetch } from "../src/native-fetch.ts";

const ADDRESS = "127.0.0.1:18092";

test("the note store works through the native fetch adapter", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "note-android-"));
  const server = spawn(
    "rclone",
    ["serve", "webdav", root, "--addr", ADDRESS, "--user", "u", "--pass", "p"],
    { stdio: "ignore" },
  );
  t.after(async () => {
    server.kill();
    await rm(root, { recursive: true, force: true });
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`http://${ADDRESS}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const methods = new Set<string>();
  getPatcher().patch(
    "fetch",
    createNativeFetch(async ({ url, ...request }) => {
      methods.add(request.method);
      const response = await fetch(url, request);
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      };
    }),
  );

  const store = createNoteStore({
    url: `http://${ADDRESS}/notes`,
    username: "u",
    password: "p",
  });
  await store.prepare();
  const note = await store.create({ title: "Phone", content: "ünï 🎉" });
  assert.deepEqual(await store.list(), [note]);
  await store.update(note.id, { pinned: true });
  assert.equal((await store.list())[0]?.pinned, true);
  await store.remove(note.id);
  await store.remove(note.id);
  assert.deepEqual(await store.list(), []);
  for (const method of ["PROPFIND", "MKCOL", "PUT", "GET", "DELETE"]) {
    assert.ok(methods.has(method), method);
  }
});
