import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } });
  },

  create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  },

  updateUsername(id: string, username: string) {
    return prisma.user.update({ where: { id }, data: { username } });
  },

  findPublicProfileByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username },
      select: { id: true, name: true, username: true },
    });
  },

  listAuthorsWithPublicNotes() {
    return prisma.user.findMany({
      where: { notes: { some: { public: true } } },
      select: { username: true },
    });
  },
};
