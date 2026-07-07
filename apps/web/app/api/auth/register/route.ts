import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/password";
import { setSessionCookie } from "../../../../lib/auth";
import { clientIpFrom, verifyTurnstileToken } from "../../../../lib/turnstile";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  turnstileToken: z.string().min(1, "Verification is required"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { name, email, password, turnstileToken } = parsed.data;

  if (!(await verifyTurnstileToken(turnstileToken, clientIpFrom(request)))) {
    return NextResponse.json(
      { error: "Verification failed, please try again" },
      { status: 403 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });

  await setSessionCookie({ userId: user.id, email: user.email, name: user.name });
  return NextResponse.json({ ok: true });
}
