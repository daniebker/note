import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, setSessionCookie } from "../../../../lib/auth";
import { userRepository } from "../../../../lib/repositories/user-repository";
import { usernameSchema } from "../../../../lib/username";

const updateUsernameSchema = z.object({ username: usernameSchema });

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateUsernameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { username } = parsed.data;

  const existing = await userRepository.findByUsername(username);
  if (existing && existing.id !== session.userId) {
    return NextResponse.json(
      { error: "That username is already taken" },
      { status: 409 },
    );
  }

  const user = await userRepository.updateUsername(session.userId, username);

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
  });

  return NextResponse.json({ username: user.username });
}
