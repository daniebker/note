import Link from "next/link";

export function PaginationNav({
  basePath,
  currentPage,
  totalPages,
}: {
  basePath: string;
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  function pageHref(page: number) {
    return page <= 1 ? basePath : `${basePath}?page=${page}`;
  }

  return (
    <nav className="mt-8 flex items-center justify-center gap-4 text-sm">
      {currentPage > 1 ? (
        <Link
          className="rounded-md px-3 py-1.5 font-medium text-accent hover:bg-accent/10"
          href={pageHref(currentPage - 1)}
        >
          ← Newer
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-ink-muted/50">← Newer</span>
      )}
      <span className="text-ink-muted">
        Page {currentPage} of {totalPages}
      </span>
      {currentPage < totalPages ? (
        <Link
          className="rounded-md px-3 py-1.5 font-medium text-accent hover:bg-accent/10"
          href={pageHref(currentPage + 1)}
        >
          Older →
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-ink-muted/50">Older →</span>
      )}
    </nav>
  );
}
