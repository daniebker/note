// Getting at the contents of attached files from the UI.
import { useEffect, useState } from "react";

const IMAGE_TYPES: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

function imageType(name: string) {
  return IMAGE_TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()];
}

export const isImage = (name: string) => imageType(name) !== undefined;

async function objectUrl(name: string) {
  const result = await window.noteApi.readAttachment(name);
  if (!result.ok) throw new Error(result.error);
  const type = imageType(name) ?? "application/octet-stream";
  return URL.createObjectURL(
    new Blob([new Uint8Array(result.value)], { type }),
  );
}

// Shared, so a file shown twice is only downloaded once, and freed when
// nothing is showing it.
const urls = new Map<string, { url: Promise<string>; users: number }>();

function acquire(name: string) {
  const entry = urls.get(name) ?? { url: objectUrl(name), users: 0 };
  urls.set(name, entry);
  entry.users++;
  return {
    url: entry.url,
    release() {
      if (--entry.users > 0) return;
      urls.delete(name);
      void entry.url.then(URL.revokeObjectURL, () => {});
    },
  };
}

/** A URL showing an attachment: undefined while loading, null if it failed. */
export function useAttachmentUrl(name: string) {
  const [loaded, setLoaded] = useState<{ name: string; url: string | null }>();

  useEffect(() => {
    let current = true;
    const { url, release } = acquire(name);
    url.then(
      (value) => current && setLoaded({ name, url: value }),
      () => current && setLoaded({ name, url: null }),
    );
    return () => {
      current = false;
      release();
    };
  }, [name]);

  return loaded?.name === name ? loaded.url : undefined;
}

/**
 * Opens an attachment in another app, or else saves a copy of it. Resolves to
 * an error message if that fails.
 */
export async function openAttachment(name: string): Promise<string | null> {
  if (window.noteApi.openAttachment) {
    const result = await window.noteApi.openAttachment(name);
    return result.ok ? null : result.error;
  }
  try {
    const url = await objectUrl(name);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Not at once, as the download may not have read it yet.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
