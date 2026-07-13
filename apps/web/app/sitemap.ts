import type { MetadataRoute } from "next";
import { prisma } from "../lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "http://localhost:3002";
  const notes = await prisma.note.findMany({
    where: { public: true },
    select: { id: true, updatedAt: true },
  });

  return notes.map((note) => ({
    url: `${base}/n/${note.id}`,
    lastModified: note.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
}
