import { useEffect, useRef } from "react";

const handlers: (() => void)[] = [];

/** Handles the platform's "back" action while the component is mounted. */
export function useBack(handler: () => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const run = () => latest.current();
    handlers.push(run);
    return () => void handlers.splice(handlers.indexOf(run), 1);
  }, []);
}

/** Runs the most recent handler; false if there was nothing to go back from. */
export function goBack(): boolean {
  const handler = handlers.at(-1);
  handler?.();
  return handler !== undefined;
}
