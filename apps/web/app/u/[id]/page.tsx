import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { noteRepository } from "../../../lib/repositories/note-repository";
import { userRepository } from "../../../lib/repositories/user-repository";
import { breadcrumbJsonLd, Breadcrumbs } from "../../components/breadcrumbs";
import { noteExcerpt } from "../../components/note-excerpt";
import { colorValue } from "../../components/note-types";
import { parsePage } from "../../components/pagination";
import { PaginationNav } from "../../components/pagination-nav";
import { PublicHeader } from "../../components/public-header";
import { SignupFooter } from "../../components/signup-footer";

const PAGE_SIZE = 24;

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { id } = await params;
  const user = await userRepository.findPublicProfileById(id);
  if (!user) {
    return { title: "User not found", robots: { index: false, follow: false } };
  }

  const { page } = await searchParams;
  const pageNum = parsePage(page);
  const canonical = pageNum > 1 ? `/u/${id}?page=${pageNum}` : `/u/${id}`;

  return {
    title: pageNum > 1 ? `${user.name} — page ${pageNum}` : `${user.name}'s public notes`,
    description: `Public notes shared by ${user.name}.`,
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default async function UserNotesPage({ params, searchParams }: Params) {
  const { id } = await params;
  const user = await userRepository.findPublicProfileById(id);
  if (!user) notFound();

  const { page } = await searchParams;
  const currentPage = parsePage(page);

  const [total, notes] = await Promise.all([
    noteRepository.countPublicByUser(id),
    noteRepository.listPublicByUser(id, {
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const jsonLd = breadcrumbJsonLd([
    { label: "Notes", href: "/n" },
    { label: user.name },
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <PublicHeader>
        <Link
          className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-ink/10"
          href="/n"
        >
          Browse public notes
        </Link>
      </PublicHeader>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <Breadcrumbs items={[{ label: "Notes", href: "/n" }, { label: user.name }]} />
        <h1 className="mb-1 text-2xl font-semibold text-ink">
          {user.name}&apos;s public notes
        </h1>
        <p className="mb-8 text-sm text-ink-muted">
          {total} public {total === 1 ? "note" : "notes"}, newest first.
        </p>

        {total === 0 ? (
          <p className="mt-16 text-center text-sm text-ink-muted">
            {user.name} hasn&apos;t shared any public notes yet.
          </p>
        ) : notes.length === 0 ? (
          <p className="mt-16 text-center text-sm text-ink-muted">
            No notes on this page.{" "}
            <Link className="font-medium text-accent hover:underline" href={`/u/${id}`}>
              Back to the first page
            </Link>
          </p>
        ) : (
          <>
            <div className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
              {notes.map((note) => (
                <Link
                  className="mb-3 block break-inside-avoid rounded-lg border border-edge p-4 transition-shadow hover:shadow-md"
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
                  <time
                    className="mt-3 block text-xs text-ink-muted"
                    dateTime={note.createdAt.toISOString()}
                  >
                    {note.createdAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </Link>
              ))}
            </div>

            <PaginationNav
              basePath={`/u/${id}`}
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
