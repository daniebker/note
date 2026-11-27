// A notes folder on a WebDAV server.
import { createClient, type FileStat } from "webdav";
import type { WebdavConnection } from "./api";
import type { FileInfo, NoteFolder } from "./folder";
import { ATTACHMENTS_FOLDER } from "./file-names.ts";

const MAX_CONCURRENT_REQUESTS = 8;
// So that a connection that has silently died doesn't stall syncing for good.
const TIMEOUT_MS = 60_000;
const TRANSFER_TIMEOUT_MS = 10 * 60_000;

// Missing from old Android WebViews, where native code has its own timeouts.
const within = (ms: number) => ({ signal: AbortSignal.timeout?.(ms) });

function isNotFound(error: unknown) {
  return (error as { status?: number } | null)?.status === 404;
}

async function nullIfNotFound<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function fileInfo(stat: FileStat): FileInfo {
  return {
    name: stat.basename,
    version: `${stat.etag}|${stat.lastmod}|${stat.size}`,
    modifiedAt: new Date(stat.lastmod),
  };
}

export function createWebdavFolder({
  url,
  username,
  password,
}: Omit<WebdavConnection, "type">): NoteFolder {
  // The client is rooted at the server so that `prepare` can create the notes
  // folder itself.
  const { origin, pathname } = new URL(url);
  const dav = createClient(origin, {
    username: username || undefined,
    password: password || undefined,
  });
  const folder = pathname.split("/").map(decodeURIComponent).join("/");
  const root = folder.replace(/\/+$/, "");
  const filePath = (name: string) => `${root}/${name}`;

  let activeRequests = 0;
  const waiting: (() => void)[] = [];

  async function request<T>(run: () => Promise<T>): Promise<T> {
    if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      // The finishing request hands its slot straight to us.
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      activeRequests++;
    }
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else activeRequests--;
    }
  }

  async function removeFile(path: string) {
    await nullIfNotFound(
      request(() => dav.deleteFile(path, within(TIMEOUT_MS))),
    );
  }

  async function writeFile(path: string, contents: string | ArrayBuffer) {
    const written = await request(() =>
      dav.putFileContents(path, contents, within(TRANSFER_TIMEOUT_MS)),
    );
    if (!written) throw new Error(`Failed to write ${path}`);
  }

  const exists = (path: string) =>
    request(() => dav.exists(path, within(TIMEOUT_MS)));

  async function entries(path: string) {
    return (await request(() =>
      dav.getDirectoryContents(path, within(TIMEOUT_MS)),
    )) as FileStat[];
  }

  async function statFile(path: string) {
    const stat = await nullIfNotFound(
      request(() => dav.stat(path, within(TIMEOUT_MS))),
    );
    return stat ? fileInfo(stat as FileStat) : null;
  }

  const attachmentsRoot = filePath(ATTACHMENTS_FOLDER);
  const attachmentPath = (name: string) => `${attachmentsRoot}/${name}`;

  async function createAttachmentsFolder() {
    if (await exists(attachmentsRoot)) return;
    try {
      await request(() =>
        dav.createDirectory(attachmentsRoot, within(TIMEOUT_MS)),
      );
    } catch (error) {
      // Another device may have just created it.
      if (!(await exists(attachmentsRoot))) throw error;
    }
  }

  return {
    attachments: {
      async list() {
        const found = await nullIfNotFound(entries(attachmentsRoot));
        return (found ?? [])
          .filter((entry) => entry.type === "file")
          .map(fileInfo);
      },

      stat: (name) => statFile(attachmentPath(name)),

      async read(name) {
        const data = await nullIfNotFound(
          request(() =>
            dav.getFileContents(
              attachmentPath(name),
              within(TRANSFER_TIMEOUT_MS),
            ),
          ),
        );
        // A Buffer under Node, an ArrayBuffer in a browser.
        return data === null
          ? null
          : new Uint8Array(data as ArrayBuffer | Uint8Array);
      },

      async write(name, data) {
        await createAttachmentsFolder();
        // The client only sends strings, Buffers and ArrayBuffers as they are.
        await writeFile(attachmentPath(name), new Uint8Array(data).buffer);
      },

      remove: (name) => removeFile(attachmentPath(name)),
    },

    // Its parent folder must already be there.
    async prepare() {
      if (!(await exists(root || "/"))) {
        await dav.createDirectory(root, within(TIMEOUT_MS));
      }
      await entries(root || "/");
    },

    async list() {
      const found = await entries(root || "/");
      return found.filter((entry) => entry.type === "file").map(fileInfo);
    },

    stat: (name) => statFile(filePath(name)),

    async read(name) {
      const source = await nullIfNotFound(
        request(() =>
          dav.getFileContents(filePath(name), {
            format: "text",
            ...within(TIMEOUT_MS),
          }),
        ),
      );
      return source as string | null;
    },

    // The server sets the modification time.
    write: (name, contents) => writeFile(filePath(name), contents),

    remove: (name) => removeFile(filePath(name)),
  };
}
