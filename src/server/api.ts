import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";
import type { Role, User } from "@/lib/types";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function requireApiUser(roles?: Role[]): User | NextResponse {
  const user = getCurrentUser();
  if (!user) {
    return jsonError("Authentication is required.", 401);
  }

  if (roles && !roles.includes(user.role)) {
    return jsonError("You do not have permission for this action.", 403);
  }

  return user;
}

export function isApiError(value: User | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
