import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "../../lib/db";
import { noteExcerpt } from "../components/note-excerpt";
import { colorValue } from "../components/note-types";
import { PublicHeader } from "../components/public-header";
import { SignupFooter } from "../components/signup-footer";

const PAGE_SIZE = 24;

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page } = await searchParams;
  const pageNum = parsePage(page);
  const canonical = pageNum > 1 ? `/n?page=${pageNum}` : "/n";

  return {
    title: pageNum > 1 ? `Public notes — page ${pageNum}` : "Public notes",
    description: "Browse notes shared publicly by the Note community.",
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default async function PublicNotesPage({ searchParams }: Props) {
  const { page } = await searchParams;
  const currentPage = parsePage(page);

  const [total, notes] = await Promise.all([
    prisma.note.count({ where: { public: true } }),
    prisma.note.findMany({
      where: { public: true },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <PublicHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-ink">Public notes</h1>
        <p className="mb-8 text-sm text-ink-muted">
          The latest notes shared publicly, newest first.
        </p>

        {total === 0 ? (
          <p className="mt-16 text-center text-sm text-ink-muted">
            No public notes yet.
          </p>
        ) : notes.length === 0 ? (
          <p className="mt-16 text-center text-sm text-ink-muted">
            No notes on this page.{" "}
            <Link className="font-medium text-accent hover:underline" href="/n">
              Back to the first page
            </Link>
          </p>
        ) : (
          <>
            <div className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
              {notes.map((note) => (
                <Link
                  className="group mb-3 block break-inside-avoid rounded-lg border border-edge p-4 transition-shadow hover:shadow-md"
                  href={`/n/${note.id}`}
                  key={note.id}
                  style={{ backgroundColor: colorValue(note.color) }}
                >
                  {note.title && (
                    <h2 className="mb-2 text-sm font-semibold text-ink">
                      {note.title}
                    </h2>
                  )}
                  <p className="line-clamp-6 text-sm text-ink-muted">
                    {noteExcerpt(note.content, 240)}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                    <span>{note.user.name}</span>
                    <time dateTime={note.createdAt.toISOString()}>
                      {note.createdAt.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-4 text-sm">
                {currentPage > 1 ? (
                  <Link
                    className="rounded-md px-3 py-1.5 font-medium text-accent hover:bg-accent/10"
                    href={currentPage === 2 ? "/n" : `/n?page=${currentPage - 1}`}
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
                    href={`/n?page=${currentPage + 1}`}
                  >
                    Older →
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 text-ink-muted/50">Older →</span>
                )}
              </nav>
            )}
          </>
        )}
      </main>

      <SignupFooter />
    </div>
  );
}
