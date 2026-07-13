import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "../../lib/db";
import { noteExcerpt } from "../components/note-excerpt";
import { colorValue } from "../components/note-types";
import { PublicHeader } from "../components/public-header";
import { SignupFooter } from "../components/signup-footer";

const PAGE_SIZE = 60;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public notes",
  description: "Browse notes shared publicly by the Note community.",
  alternates: { canonical: "/n" },
  robots: { index: true, follow: true },
};

function getPublicNotes() {
  return prisma.note.findMany({
    where: { public: true },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: { user: { select: { name: true } } },
  });
}

export default async function PublicNotesPage() {
  const notes = await getPublicNotes();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <PublicHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-ink">Public notes</h1>
        <p className="mb-8 text-sm text-ink-muted">
          The latest notes shared publicly, newest first.
        </p>

        {notes.length === 0 ? (
          <p className="mt-16 text-center text-sm text-ink-muted">
            No public notes yet.
          </p>
        ) : (
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
        )}
      </main>

      <SignupFooter />
    </div>
  );
}
