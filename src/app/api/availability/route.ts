import { NextResponse } from "next/server";
import type { ShiftType } from "@/lib/types";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { createAvailabilityBlock } from "@/server/repositories";

export async function POST(request: Request) {
  const user = requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const employeeId = String(body.employeeId ?? "");
  const weekStart = String(body.weekStart ?? "");
  const dayIndex = Number(body.dayIndex);
  const shiftType = body.shiftType ? (String(body.shiftType) as ShiftType) : null;
  const startsAt = body.startsAt ? String(body.startsAt) : null;
  const endsAt = body.endsAt ? String(body.endsAt) : null;

  if (!employeeId || !weekStart || Number.isNaN(dayIndex) || (!shiftType && (!startsAt || !endsAt))) {
    return jsonError("A valid employee, week, day, and blocked shift or time range are required.");
  }

  const block = await createAvailabilityBlock({
    employeeId,
    weekStart,
    dayIndex,
    shiftType,
    startsAt,
    endsAt,
    reason: String(body.reason ?? "")
  });

  return NextResponse.json({ block }, { status: 201 });
}
