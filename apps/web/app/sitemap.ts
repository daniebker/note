import type { MetadataRoute } from "next";
import { prisma } from "../lib/db";

// The sitemap lists public notes, which change independently of deploys, and
// the build-time database has no schema (migrations run at container start)
// — so this must be rendered per-request rather than prerendered at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "http://localhost:3002";
  const notes = await prisma.note.findMany({
    where: { public: true },
    select: { id: true, updatedAt: true },
  });

  return [
    {
      url: `${base}/n`,
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...notes.map((note) => ({
      url: `${base}/n/${note.id}`,
      lastModified: note.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
