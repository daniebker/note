import { useBack } from "./back";

/** `useBack` for cases that only apply some of the time. */
export function BackHandler({ onBack }: { onBack: () => void }) {
  useBack(onBack);
  return null;
}
