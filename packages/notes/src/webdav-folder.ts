// A notes folder on a WebDAV server.
import { createClient, type FileStat } from "webdav";
import type { WebdavConnection } from "./api";
import type { FileInfo, NoteFolder } from "./folder";

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

  return {
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

    async write(name, contents) {
      const written = await request(() =>
        dav.putFileContents(filePath(name), contents),
      );
      if (!written) throw new Error(`Failed to write ${filePath(name)}`);
    },

    async remove(name) {
      await nullIfNotFound(request(() => dav.deleteFile(filePath(name))));
    },
  };
}
