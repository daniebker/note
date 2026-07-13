import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";
import { prisma } from "../lib/db";
import { NotesApp } from "./components/notes-app";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login");

  const notes = await prisma.note.findMany({
    where: { userId: session.userId, archived: false },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });

  return (
    <NotesApp
      initialNotes={notes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        color: n.color,
        pinned: n.pinned,
        public: n.public,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      }))}
      userName={session.name}
      userEmail={session.email}
    />
  );
}
