import { useEffect, useRef } from "react";

type Flush = () => Promise<boolean>;

const drafts = new Set<Flush>();

function useRegistered(flushes: Set<Flush>, flush: Flush) {
  const latest = useRef(flush);
  useEffect(() => {
    latest.current = flush;
  });
  useEffect(() => {
    const run = () => latest.current();
    flushes.add(run);
    return () => void flushes.delete(run);
  }, [flushes]);
}

/** Registers a draft to be saved before the window closes. */
export function useFlushOnClose(flush: Flush) {
  useRegistered(drafts, flush);
}

const checks = new Set<Flush>();

/** Registers a check that runs once all drafts have started saving. */
export function useCheckOnClose(check: Flush) {
  useRegistered(checks, check);
}

async function all(flushes: Set<Flush>) {
  const results = await Promise.all([...flushes].map((flush) => flush()));
  return results.every(Boolean);
}

/** Saves everything outstanding; false if something would be lost. */
export async function saveAll(): Promise<boolean> {
  const draftsSaved = await all(drafts);
  return (await all(checks)) && draftsSaved;
}
