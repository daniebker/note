// A notes folder on a WebDAV server.
import { createClient, type FileStat } from "webdav";
import type { WebdavConnection } from "./api";
import type { FileInfo, NoteFolder } from "./folder";
import { ATTACHMENTS_FOLDER } from "./file-names.ts";

const MAX_CONCURRENT_REQUESTS = 8;

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
    await nullIfNotFound(request(() => dav.deleteFile(path)));
  }

  async function writeFile(path: string, contents: string | ArrayBuffer) {
    const written = await request(() => dav.putFileContents(path, contents));
    if (!written) throw new Error(`Failed to write ${path}`);
  }

  const attachmentsRoot = filePath(ATTACHMENTS_FOLDER);
  const attachmentPath = (name: string) => `${attachmentsRoot}/${name}`;

  async function createAttachmentsFolder() {
    if (await request(() => dav.exists(attachmentsRoot))) return;
    try {
      await request(() => dav.createDirectory(attachmentsRoot));
    } catch (error) {
      // Another device may have just created it.
      if (!(await request(() => dav.exists(attachmentsRoot)))) throw error;
    }
  }

  return {
    attachments: {
      async list() {
        const entries = await nullIfNotFound(
          request(
            () =>
              dav.getDirectoryContents(attachmentsRoot) as Promise<FileStat[]>,
          ),
        );
        return (entries ?? [])
          .filter((entry) => entry.type === "file")
          .map((entry) => entry.basename);
      },

      async read(name) {
        const data = await nullIfNotFound(
          request(() => dav.getFileContents(attachmentPath(name))),
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
      if (!(await dav.exists(root || "/"))) await dav.createDirectory(root);
      await dav.getDirectoryContents(root || "/");
    },

    async list() {
      const entries = await request(
        () => dav.getDirectoryContents(root || "/") as Promise<FileStat[]>,
      );
      return entries.filter((entry) => entry.type === "file").map(fileInfo);
    },

    async stat(name) {
      const stat = await nullIfNotFound(
        request(() => dav.stat(filePath(name)) as Promise<FileStat>),
      );
      return stat ? fileInfo(stat) : null;
    },

    async read(name) {
      const source = await nullIfNotFound(
        request(() => dav.getFileContents(filePath(name), { format: "text" })),
      );
      return source as string | null;
    },

    write: (name, contents) => writeFile(filePath(name), contents),

    remove: (name) => removeFile(filePath(name)),
  };
}
