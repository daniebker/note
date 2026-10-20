import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, setSessionCookie } from "../../../../lib/auth";
import { verifyPassword } from "../../../../lib/password";
import { userRepository } from "../../../../lib/repositories/user-repository";

const updateEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Current password is required"),
});

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  const current = await userRepository.findById(session.userId);
  if (!current) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await verifyPassword(password, current.passwordHash))) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }

  const existing = await userRepository.findByEmail(email);
  if (existing && existing.id !== session.userId) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const user = await userRepository.updateEmail(session.userId, email);

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
  });

  return NextResponse.json({ email: user.email });
}
