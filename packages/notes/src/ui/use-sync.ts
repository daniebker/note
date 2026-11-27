import { useEffect, useRef, useState } from "react";
import type { SyncStatus } from "../api";

// How often to look for changes made on other devices.
const INTERVAL_MS = 60_000;

/**
 * Syncs while mounted, calling `onChange` when that changes the notes. The
 * status is null when there is nothing to sync with.
 */
export function useSync(onChange: () => void) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    let revision: number | undefined;
    const receive = (next: SyncStatus | null) => {
      setStatus(next);
      if (next && next.revision !== revision) {
        revision = next.revision;
        latest.current();
      }
    };
    const unsubscribe = window.noteApi.onSyncStatus(receive);
    const sync = () => {
      if (document.visibilityState === "visible") void window.noteApi.sync();
    };
    void window.noteApi.getSyncStatus().then((result) => {
      if (result.ok) receive(result.value);
    });
    sync();
    const timer = setInterval(sync, INTERVAL_MS);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return { status, syncNow: () => void window.noteApi.sync() };
}
