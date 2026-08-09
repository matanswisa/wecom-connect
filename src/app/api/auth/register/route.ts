import { NextResponse } from "next/server";
import { createEmployeeForUser, createUser, findUserByEmail } from "@/server/repositories";
import { hashPassword } from "@/server/password";
import { setSessionCookie } from "@/server/session";
import { jsonError } from "@/server/api";

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!name || !email || password.length < 8) {
    return jsonError("Name, email, and a password of at least 8 characters are required.");
  }

  if (await findUserByEmail(email)) {
    return jsonError("A user with this email already exists.", 409);
  }

  const user = await createUser({
    name,
    email,
    role: "EMPLOYEE",
    passwordHash: await hashPassword(password)
  });

  await createEmployeeForUser(user);

  setSessionCookie(user);
  return NextResponse.json({ user });
}
