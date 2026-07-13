import Link from "next/link";
import { PenIcon } from "./auth-form";

export function PublicHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-edge px-4 py-3 sm:px-6">
      <Link className="flex items-center gap-2" href="/">
        <PenIcon className="h-7 w-7" />
        <span className="text-lg text-ink-muted">Note</span>
      </Link>
      {children}
    </header>
  );
}
