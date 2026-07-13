import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

type Page = { skip: number; take: number };

export const noteRepository = {
  listActiveForUser(userId: string) {
    return prisma.note.findMany({
      where: { userId, archived: false },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
  },

  findById(id: string) {
    return prisma.note.findUnique({ where: { id } });
  },

  create(userId: string, data: Omit<Prisma.NoteUncheckedCreateInput, "userId">) {
    return prisma.note.create({ data: { ...data, userId } });
  },

  async updateForUser(
    id: string,
    userId: string,
    data: Prisma.NoteUpdateManyMutationInput,
  ) {
    const { count } = await prisma.note.updateMany({
      where: { id, userId },
      data,
    });
    return count;
  },

  async deleteForUser(id: string, userId: string) {
    const { count } = await prisma.note.deleteMany({ where: { id, userId } });
    return count;
  },

  findPublicById(id: string) {
    return prisma.note.findFirst({
      where: { id, public: true },
      include: { user: { select: { id: true, name: true } } },
    });
  },

  countPublic() {
    return prisma.note.count({ where: { public: true } });
  },

  listPublic({ skip, take }: Page) {
    return prisma.note.findMany({
      where: { public: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { user: { select: { id: true, name: true } } },
    });
  },

  listPublicRefs() {
    return prisma.note.findMany({
      where: { public: true },
      select: { id: true, updatedAt: true },
    });
  },

  countPublicByUser(userId: string) {
    return prisma.note.count({ where: { userId, public: true } });
  },

  listPublicByUser(userId: string, { skip, take }: Page) {
    return prisma.note.findMany({
      where: { userId, public: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  },
};
