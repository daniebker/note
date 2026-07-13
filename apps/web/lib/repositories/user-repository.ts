import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  },

  findPublicProfileById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
  },

  listAuthorIdsWithPublicNotes() {
    return prisma.user.findMany({
      where: { notes: { some: { public: true } } },
      select: { id: true },
    });
  },
};
