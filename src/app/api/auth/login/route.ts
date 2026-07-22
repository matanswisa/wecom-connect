import { NextResponse } from "next/server";
import { jsonError } from "@/server/api";
import { verifyPassword } from "@/server/password";
import { findUserByEmail, toUser } from "@/server/repositories";
import { setSessionCookie } from "@/server/session";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const userRow = await findUserByEmail(email);

  if (!userRow || !(await verifyPassword(password, userRow.password_hash))) {
    return jsonError("Invalid email or password.", 401);
  }

  const user = toUser(userRow);
  setSessionCookie(user);
  return NextResponse.json({ user });
}
