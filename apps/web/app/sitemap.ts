import type { MetadataRoute } from "next";
import { prisma } from "../lib/db";

// The sitemap lists public notes, which change independently of deploys, and
// the build-time database has no schema (migrations run at container start)
// — so this must be rendered per-request rather than prerendered at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "http://localhost:3002";
  const [notes, authors] = await Promise.all([
    prisma.note.findMany({
      where: { public: true },
      select: { id: true, updatedAt: true },
    }),
    prisma.user.findMany({
      where: { notes: { some: { public: true } } },
      select: { id: true },
    }),
  ]);

  return [
    {
      url: `${base}/n`,
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...authors.map((author) => ({
      url: `${base}/u/${author.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...notes.map((note) => ({
      url: `${base}/n/${note.id}`,
      lastModified: note.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
