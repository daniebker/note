import { NextResponse } from "next/server";
import { z } from "zod";
import { userRepository } from "../../../../lib/repositories/user-repository";
import { hashPassword } from "../../../../lib/password";
import { setSessionCookie } from "../../../../lib/auth";
import { clientIpFrom, verifyTurnstileToken } from "../../../../lib/turnstile";
import { usernameSchema } from "../../../../lib/username";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  username: usernameSchema,
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

  const { name, username, email, password, turnstileToken } = parsed.data;

  if (!(await verifyTurnstileToken(turnstileToken, clientIpFrom(request)))) {
    return NextResponse.json(
      { error: "Verification failed, please try again" },
      { status: 403 },
    );
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const existingUsername = await userRepository.findByUsername(username);
  if (existingUsername) {
    return NextResponse.json(
      { error: "That username is already taken" },
      { status: 409 },
    );
  }

  const user = await userRepository.create({
    name,
    username,
    email,
    passwordHash: await hashPassword(password),
  });

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
  });
  return NextResponse.json({ ok: true });
}
