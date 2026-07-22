import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";

export async function GET() {
  return NextResponse.json({ user: getCurrentUser() });
}
