import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "../../lib/db";
import { noteExcerpt } from "../components/note-excerpt";
import { colorValue } from "../components/note-types";
import { PaginationNav } from "../components/pagination-nav";
import { parsePage } from "../components/pagination";
import { PublicHeader } from "../components/public-header";
import { SignupFooter } from "../components/signup-footer";

const PAGE_SIZE = 24;

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

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
      include: { user: { select: { id: true, name: true } } },
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
                <div
                  className="mb-3 break-inside-avoid rounded-lg border border-edge p-4 transition-shadow hover:shadow-md"
                  key={note.id}
                  style={{ backgroundColor: colorValue(note.color) }}
                >
                  <Link className="block" href={`/n/${note.id}`}>
                    {note.title && (
                      <h2 className="mb-2 text-sm font-semibold text-ink">
                        {note.title}
                      </h2>
                    )}
                    <p className="line-clamp-6 text-sm text-ink-muted">
                      {noteExcerpt(note.content, 240)}
                    </p>
                  </Link>
                  <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                    <Link
                      className="hover:text-accent hover:underline"
                      href={`/u/${note.user.id}`}
                    >
                      {note.user.name}
                    </Link>
                    <time dateTime={note.createdAt.toISOString()}>
                      {note.createdAt.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                </div>
              ))}
            </div>

            <PaginationNav
              basePath="/n"
              currentPage={currentPage}
              totalPages={totalPages}
            />
          </>
        )}
      </main>

      <SignupFooter />
    </div>
  );
}
