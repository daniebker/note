import { NextResponse } from "next/server";
import { z } from "zod";
import { noteRepository } from "../../../../lib/repositories/note-repository";
import { getSession } from "../../../../lib/auth";

const updateNoteSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(50_000).optional(),
  color: z.string().max(30).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  public: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const count = await noteRepository.updateForUser(id, session.userId, parsed.data);
  if (count === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  const note = await noteRepository.findById(id);
  return NextResponse.json({ note });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const count = await noteRepository.deleteForUser(id, session.userId);
  if (count === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
