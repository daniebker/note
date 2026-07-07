import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/password";
import { setSessionCookie } from "../../../../lib/auth";
import { clientIpFrom, verifyTurnstileToken } from "../../../../lib/turnstile";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  turnstileToken: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 400 },
    );
  }

  const { email, password, turnstileToken } = parsed.data;

  if (!(await verifyTurnstileToken(turnstileToken, clientIpFrom(request)))) {
    return NextResponse.json(
      { error: "Verification failed, please try again" },
      { status: 403 },
    );
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  await setSessionCookie({ userId: user.id, email: user.email, name: user.name });
  return NextResponse.json({ ok: true });
}
