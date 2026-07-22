import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, User } from "@/lib/types";

const COOKIE_NAME = "wecomconnect_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

interface SessionPayload {
  id: string;
  email: string;
  name: string;
  role: Role;
  expiresAt: number;
}

export function signSession(user: User): string {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + MAX_AGE_SECONDS * 1000
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readSessionToken(token: string | undefined): User | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !isEqual(signature, sign(encodedPayload))) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as SessionPayload;
  if (payload.expiresAt < Date.now()) {
    return null;
  }

  return {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    role: payload.role
  };
}

export function getCurrentUser(): User | null {
  return readSessionToken(cookies().get(COOKIE_NAME)?.value);
}

export function requireCurrentUser(): User {
  const user = getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export function setSessionCookie(user: User) {
  cookies().set(COOKIE_NAME, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

function sign(value: string): string {
  const secret = process.env.AUTH_SECRET ?? "development-only-secret";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function isEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
