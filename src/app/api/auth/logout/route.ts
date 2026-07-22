import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/session";

export async function POST() {
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
