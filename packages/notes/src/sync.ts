// Keeps a copy of a server's notes folder on this device, so that notes can be
// read and edited without a connection.
//
// For every file, the state as of the last time both sides matched is recorded.
// Comparing each side with that shows which of them changed since, and so which
// way to copy. Nothing written on either side is discarded: edits that can't be
// merged are kept as two notes, and an edit wins over a deletion.
import type { SyncStatus } from "./api";
import { freeName, isValidFileName } from "./file-names.ts";
import type { FileInfo, NoteFolder } from "./folder";
import { parseNote, renameAttachments } from "./markdown.ts";
import { conflictCopy, mergeNotes } from "./merge-notes.ts";

// Hidden, so it's never taken for a note.
const STATE_FILE = ".sync-state.json";
// Changes made in quick succession are sent together.
const DELAY_MS = 1_000;
// How often to report progress while files are arriving.
const REPORT_MS = 500;
const SAVE_EVERY = 25;
// Files that change while being synced are tried again, this many times.
const MAX_PASSES = 4;
// An empty server folder is only suspicious if it used to hold this much.
const SUSPICIOUS_LOSS = 5;

type NoteBase = {
  /** The server's version of the file. */
  remote: string;
  /** Its contents, to see what changed on each side and merge them. */
  text: string;
};

type FileBase = { remote: string; local: string };

type State = {
  notes: Map<string, NoteBase>;
  attachments: Map<string, FileBase>;
  lastSynced: string | null;
};

class Stopped extends Error {}

const isNoteName = (name: string) =>
  name.endsWith(".md") && isValidFileName(name.slice(0, -3));

function byName(files: FileInfo[], include: (name: string) => boolean) {
  return new Map(
    files.filter((file) => include(file.name)).map((file) => [file.name, file]),
  );
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Runs one thing at a time. */
function createMutex() {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(run: () => Promise<T>): Promise<T> => {
    const result = last.then(run);
    last = result.catch(() => {});
    return result;
  };
}

export function createSync({
  local,
  remote,
  describeError,
  onStatus = () => {},
}: {
  /** The copy on this device. */
  local: NoteFolder;
  remote: NoteFolder;
  describeError: (error: unknown) => string;
  onStatus?: (status: SyncStatus) => void;
}) {
  // Held by anything that changes the local copy.
  const lock = createMutex();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let again = false;
  let reportedAt = 0;
  let status: SyncStatus = {
    syncing: false,
    error: null,
    lastSynced: null,
    revision: 0,
  };

  function report(changes: Partial<SyncStatus>) {
    status = { ...status, ...changes };
    reportedAt = Date.now();
    if (!stopped) onStatus(status);
  }

  /** Notes a change to the local copy, so it can be shown. */
  function changed() {
    const revision = status.revision + 1;
    if (Date.now() - reportedAt >= REPORT_MS) report({ revision });
    else status = { ...status, revision };
  }

  async function loadState(): Promise<State> {
    const source = await local.read(STATE_FILE);
    try {
      const saved = JSON.parse(source ?? "");
      return {
        notes: new Map(saved.notes),
        attachments: new Map(saved.attachments),
        lastSynced: saved.lastSynced,
      };
    } catch {
      // Without it, files that differ are treated as conflicts, which is safe.
      return { notes: new Map(), attachments: new Map(), lastSynced: null };
    }
  }

  async function pass() {
    await local.prepare();
    const state = await loadState();
    report({ lastSynced: state.lastSynced });

    const saveLock = createMutex();
    const save = () =>
      saveLock(() =>
        local.write(
          STATE_FILE,
          JSON.stringify({
            notes: [...state.notes],
            attachments: [...state.attachments],
            lastSynced: state.lastSynced,
          }),
        ),
      );
    let unsaved = 0;
    const saveSometimes = async () => {
      if (++unsaved % SAVE_EVERY === 0) await save();
    };

    const [remoteNotes, remoteFiles, localNotes, localFiles] =
      await Promise.all([
        remote.list().then((files) => byName(files, isNoteName)),
        remote.attachments
          .list()
          .then((files) => byName(files, isValidFileName)),
        local.list().then((files) => byName(files, isNoteName)),
        local.attachments
          .list()
          .then((files) => byName(files, isValidFileName)),
      ]);

    // More likely a server that has lost its files than a user who deleted
    // every one of them.
    if (
      remoteNotes.size + remoteFiles.size === 0 &&
      state.notes.size + state.attachments.size >= SUSPICIOUS_LOSS
    ) {
      throw new Error(
        "The server's notes folder is unexpectedly empty, so nothing was changed. If that's intended, disconnect and connect again",
      );
    }

    const errors: unknown[] = [];
    // Set when a file changed under us, and has to be looked at again.
    let skipped = false;

    // One file failing mustn't stop the others.
    async function each(run: () => Promise<void>) {
      if (stopped) throw new Stopped();
      try {
        await run();
      } catch (error) {
        if (error instanceof Stopped) throw error;
        errors.push(error);
      }
    }

    // Changes the local copy, unless it is being stopped.
    const locally = <T>(run: () => Promise<T>) =>
      lock(async () => {
        if (stopped) throw new Stopped();
        return run();
      });

    // ---- Attachments ----

    const failedUploads = new Set<string>();

    async function upload(name: string, expected: string | undefined) {
      const info = await local.attachments
        .list()
        .then((files) => files.find((file) => file.name === name));
      const data = info && (await local.attachments.read(name));
      const there = await remote.attachments.stat(name);
      if (!info || !data || there?.version !== expected) {
        skipped = true;
        return;
      }
      try {
        await remote.attachments.write(name, data);
      } catch (error) {
        failedUploads.add(name);
        throw error;
      }
      const written = await remote.attachments.stat(name);
      state.attachments.set(name, {
        remote: written?.version ?? "",
        local: info.version,
      });
      await save();
    }

    async function download(name: string, expected: string | undefined) {
      const there = await remote.attachments.stat(name);
      const data = there && (await remote.attachments.read(name));
      if (!there || !data) {
        skipped = true;
        return;
      }
      await locally(async () => {
        const here = await local.attachments.stat(name);
        if (here?.version !== expected) {
          skipped = true;
          return;
        }
        await local.attachments.write(name, data);
        const written = await local.attachments.stat(name);
        state.attachments.set(name, {
          remote: there.version,
          local: written!.version,
        });
        changed();
      });
      await saveSometimes();
    }

    // Both sides have a file of this name, and either could be the newer.
    async function reconcile(name: string) {
      const there = await remote.attachments.stat(name);
      const theirs = there && (await remote.attachments.read(name));
      const newName = await locally(async () => {
        const here = await local.attachments.stat(name);
        const ours = here && (await local.attachments.read(name));
        if (!there || !theirs || !here || !ours) {
          skipped = true;
          return null;
        }
        if (sameBytes(ours, theirs)) {
          state.attachments.set(name, {
            remote: there.version,
            local: here.version,
          });
          return null;
        }
        // The server's file keeps the name, and ours gets a new one.
        const renamed = freeName(name, [
          // Listed now, as files may have been added since the sync began.
          ...(await local.attachments.list()).map((file) => file.name),
          ...remoteFiles.keys(),
          ...state.attachments.keys(),
        ]);
        await local.attachments.write(renamed, ours);
        // Only notes edited here can mean our file by the old name.
        for (const note of await local.list()) {
          if (!isNoteName(note.name)) continue;
          const text = await local.read(note.name);
          if (text === null || text === state.notes.get(note.name)?.text) {
            continue;
          }
          const next = renameAttachments(text, new Map([[name, renamed]]));
          if (next !== text) await local.write(note.name, next);
        }
        await local.attachments.write(name, theirs);
        const written = await local.attachments.stat(name);
        state.attachments.set(name, {
          remote: there.version,
          local: written!.version,
        });
        changed();
        return renamed;
      });
      if (newName !== null) await upload(newName, undefined);
      await saveSometimes();
    }

    // Uploads come before the notes that mention them, downloads after the
    // notes so that those show up sooner, and deletions last of all.
    const downloads: string[] = [];
    const deletions: string[] = [];
    const attachmentNames = new Set([
      ...localFiles.keys(),
      ...remoteFiles.keys(),
      ...state.attachments.keys(),
    ]);
    // One at a time, as they can be large.
    for (const name of attachmentNames) {
      await each(async () => {
        const here = localFiles.get(name)?.version;
        const there = remoteFiles.get(name)?.version;
        const base = state.attachments.get(name);
        const changedHere = here !== base?.local;
        const changedThere = there !== base?.remote;
        if (here === undefined && there === undefined) {
          state.attachments.delete(name);
        } else if (changedHere && changedThere) {
          if (here !== undefined && there !== undefined) await reconcile(name);
          else if (here !== undefined) await upload(name, there);
          else downloads.push(name);
        } else if (changedHere) {
          if (here !== undefined) await upload(name, there);
          else deletions.push(name);
        } else if (changedThere) {
          if (there !== undefined) downloads.push(name);
          else deletions.push(name);
        }
      });
    }

    // ---- Notes ----

    // Whether a note lists a file that is still waiting to be uploaded, say
    // because it was attached after this sync began.
    async function awaitsUpload(name: string, text: string) {
      const file = { id: name.slice(0, -3), modifiedAt: new Date(0) };
      for (const attachment of parseNote(text, file).note.attachments) {
        // One that has just failed shouldn't hold the writing back.
        if (failedUploads.has(attachment)) continue;
        const here = await local.attachments.stat(attachment);
        if (
          here &&
          here.version !== state.attachments.get(attachment)?.local
        ) {
          return true;
        }
      }
      return false;
    }

    /** Updates the local file, if it still contains `expected`. */
    async function apply(
      name: string,
      expected: string | null,
      next: string | null,
      modifiedAt?: Date,
    ) {
      return locally(async () => {
        if ((await local.read(name)) !== expected) {
          skipped = true;
          return false;
        }
        if (next === null) await local.remove(name);
        else await local.write(name, next, modifiedAt);
        changed();
        return true;
      });
    }

    /** Updates the server's file, if it is still at the `expected` version. */
    async function push(
      name: string,
      text: string | null,
      expected: string | undefined,
    ) {
      if (
        (text !== null && (await awaitsUpload(name, text))) ||
        (await remote.stat(name))?.version !== expected
      ) {
        skipped = true;
        return;
      }
      if (text === null) {
        await remote.remove(name);
        state.notes.delete(name);
      } else {
        await remote.write(name, text);
        const written = await remote.stat(name);
        // Read back, in case another device wrote it just after we did. An
        // empty version makes the next sync look again.
        const stored = await remote.read(name);
        state.notes.set(name, {
          remote: stored === text && written ? written.version : "",
          text,
        });
      }
      await save();
    }

    const noteNames = new Set([
      ...localNotes.keys(),
      ...remoteNotes.keys(),
      ...state.notes.keys(),
    ]);

    async function syncNote(name: string) {
      const info = remoteNotes.get(name);
      const base = state.notes.get(name);
      const baseText = base?.text ?? null;
      let theirs: string | null = null;
      if (info) {
        // Only downloaded if it has changed.
        theirs =
          base && info.version === base.remote
            ? base.text
            : await remote.read(name);
        if (theirs === null) {
          skipped = true;
          return;
        }
      }
      const ours = await local.read(name);
      const record = async () => {
        if (theirs === null) state.notes.delete(name);
        else state.notes.set(name, { remote: info!.version, text: theirs });
        await saveSometimes();
      };
      const takeTheirs = async () => {
        if (await apply(name, ours, theirs, info?.modifiedAt)) await record();
      };

      if (ours === theirs) return record();
      if (ours === baseText) return takeTheirs();
      if (theirs === baseText) return push(name, ours, info?.version);

      // Both changed. An edit wins over a deletion.
      if (ours === null) return takeTheirs();
      if (theirs === null) return push(name, ours, undefined);

      const file = { id: name.slice(0, -3), modifiedAt: info!.modifiedAt };
      const merged = mergeNotes({
        base: baseText,
        local: ours,
        remote: theirs,
        file,
      });
      if (merged !== null) {
        if (!(await apply(name, ours, merged))) return;
        await record();
        if (merged !== theirs) await push(name, merged, info!.version);
        return;
      }

      const copy = conflictCopy(ours, file);
      // Chosen and claimed without awaiting, so no other note gets it.
      const copyName = freeName(`${file.id} (conflict).md`, noteNames);
      noteNames.add(copyName);
      // The copy is saved first, so our writing is never only in memory.
      const kept = await locally(async () => {
        if ((await local.read(name)) !== ours) return false;
        await local.write(copyName, copy);
        await local.write(name, theirs, info!.modifiedAt);
        changed();
        return true;
      });
      if (!kept) {
        skipped = true;
        return;
      }
      await record();
      await push(copyName, copy, undefined);
    }

    await Promise.all([...noteNames].map((name) => each(() => syncNote(name))));

    for (const name of downloads) {
      await each(() => download(name, localFiles.get(name)?.version));
    }

    // Left for later if any note might be out of date.
    if (errors.length === 0 && !skipped) {
      for (const name of deletions) {
        await each(async () => {
          const here = localFiles.get(name)?.version;
          const there = remoteFiles.get(name)?.version;
          const wanted = await locally(async () => {
            for (const note of await local.list()) {
              if (!isNoteName(note.name)) continue;
              const text = await local.read(note.name);
              const id = note.name.slice(0, -3);
              const file = { id, modifiedAt: note.modifiedAt };
              if (
                text !== null &&
                parseNote(text, file).note.attachments.includes(name)
              ) {
                return true;
              }
            }
            if (here === undefined) return false;
            // Deleted on the server.
            if ((await local.attachments.stat(name))?.version !== here) {
              skipped = true;
              return false;
            }
            await local.attachments.remove(name);
            state.attachments.delete(name);
            changed();
            return false;
          });
          if (wanted) {
            // A note still lists it, so it's put back.
            if (here !== undefined) await upload(name, there);
            else await download(name, here);
          } else if (here === undefined) {
            // Deleted here.
            if ((await remote.attachments.stat(name))?.version !== there) {
              skipped = true;
              return;
            }
            await remote.attachments.remove(name);
            state.attachments.delete(name);
          }
        });
      }
    }

    if (errors.length === 0 && !skipped) {
      state.lastSynced = new Date().toISOString();
    }
    await save();
    report({ lastSynced: state.lastSynced });
    if (skipped) again = true;
    if (errors.length > 0) throw errors[0];
  }

  async function passes() {
    report({ syncing: true });
    let error: string | null = null;
    try {
      let count = 0;
      do {
        again = false;
        await pass();
      } while (again && !stopped && ++count < MAX_PASSES);
    } catch (failure) {
      if (!(failure instanceof Stopped)) error = describeError(failure);
    }
    // Cleared in the same step as the last check of `again`.
    running = null;
    report({ syncing: false, error });
  }

  /** Syncs now. Failures are reported in the status rather than thrown. */
  function run(): Promise<void> {
    clearTimeout(timer);
    if (stopped) return Promise.resolve();
    if (running) again = true;
    else running = passes();
    return running;
  }

  /** True if this device has changes the server doesn't. */
  async function hasPendingChanges() {
    await local.prepare();
    const state = await loadState();
    const notes = (await local.list()).filter((file) => isNoteName(file.name));
    const files = await local.attachments.list();
    if (
      notes.length !== state.notes.size ||
      files.length !== state.attachments.size
    ) {
      return true;
    }
    if (
      files.some(
        (file) => state.attachments.get(file.name)?.local !== file.version,
      )
    ) {
      return true;
    }
    for (const { name } of notes) {
      if ((await local.read(name)) !== state.notes.get(name)?.text) return true;
    }
    return false;
  }

  return {
    /** Changes to the local copy must be made through this. */
    lock,
    run,
    hasPendingChanges,
    status: () => status,

    /** Syncs shortly, for after a change. */
    schedule() {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(() => void run(), DELAY_MS);
    },

    async hasSynced() {
      await local.prepare();
      return (await loadState()).lastSynced !== null;
    },

    /** Syncs, and fails unless everything reached the server. */
    async flush() {
      await run();
      if (status.error) throw new Error(status.error);
      if (await hasPendingChanges()) {
        throw new Error("Some changes haven't synced yet");
      }
    },

    /** Ends syncing for good, waiting for any file being copied. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },

    /** Deletes the local copy. Only for after `stop`. */
    async clear() {
      // First, so that a partly deleted copy is never synced as deletions.
      await local.remove(STATE_FILE);
      const [notes, files] = await Promise.all([
        local.list(),
        local.attachments.list(),
      ]);
      await Promise.all([
        ...notes.map((file) => local.remove(file.name)),
        ...files.map((file) => local.attachments.remove(file.name)),
      ]);
    },
  };
}

export type Sync = ReturnType<typeof createSync>;
