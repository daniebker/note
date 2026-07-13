import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import { breadcrumbJsonLd, Breadcrumbs } from "../../components/breadcrumbs";
import { noteExcerpt } from "../../components/note-excerpt";
import { NoteMarkdown } from "../../components/note-markdown";
import { colorValue } from "../../components/note-types";
import { PublicHeader } from "../../components/public-header";
import { SignupFooter } from "../../components/signup-footer";

type Params = { params: Promise<{ id: string }> };

function getPublicNote(id: string) {
  return prisma.note.findFirst({
    where: { id, public: true },
    include: { user: { select: { id: true, name: true } } },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const note = await getPublicNote(id);
  if (!note) {
    return { title: "Note not found", robots: { index: false, follow: false } };
  }

  const title = note.title || "Untitled note";
  const description = noteExcerpt(note.content);
  const url = `/n/${note.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: note.createdAt.toISOString(),
      modifiedTime: note.updatedAt.toISOString(),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicNotePage({ params }: Params) {
  const { id } = await params;
  const note = await getPublicNote(id);
  if (!note) notFound();

  const session = await getSession();
  const isAuthor = session?.userId === note.userId;

  const title = note.title || "Untitled note";
  const description = noteExcerpt(note.content);

  const breadcrumbs = [
    { label: "Notes", href: "/n" },
    { label: note.user.name, href: `/u/${note.user.id}` },
    { label: title },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: note.createdAt.toISOString(),
    dateModified: note.updatedAt.toISOString(),
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)) }}
        type="application/ld+json"
      />
      <PublicHeader>
        <div className="flex items-center gap-3">
          <Link
            className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-ink/10"
            href="/n"
          >
            Browse public notes
          </Link>
          {isAuthor && (
            <Link
              className="rounded-md px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10"
              href={`/?edit=${note.id}`}
            >
              Edit note
            </Link>
          )}
        </div>
      </PublicHeader>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />
        <article
          className="rounded-lg border border-edge p-6"
          style={{ backgroundColor: colorValue(note.color) }}
        >
          {note.title && (
            <h1 className="mb-4 text-2xl font-semibold text-ink">
              {note.title}
            </h1>
          )}
          <div className="note-markdown text-ink">
            <NoteMarkdown content={note.content} />
          </div>
        </article>
      </main>

      <SignupFooter />
    </div>
  );
}
