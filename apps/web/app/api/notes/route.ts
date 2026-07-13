import { NextResponse } from "next/server";
import { z } from "zod";
import { noteRepository } from "../../../lib/repositories/note-repository";
import { getSession } from "../../../lib/auth";

const createNoteSchema = z.object({
  title: z.string().max(500).default(""),
  content: z.string().max(50_000).default(""),
  color: z.string().max(30).default("default"),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const notes = await noteRepository.listActiveForUser(session.userId);
  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const note = await noteRepository.create(session.userId, parsed.data);
  return NextResponse.json({ note }, { status: 201 });
}
