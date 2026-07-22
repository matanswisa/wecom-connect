import { NextResponse } from "next/server";
import { validateAssignment } from "@/lib/shifts";
import type { ShiftType } from "@/lib/types";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  createAssignment,
  listAssignments,
  listAvailabilityBlocks,
  listEmployees
} from "@/server/repositories";

export async function POST(request: Request) {
  const user = requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const employeeId = String(body.employeeId ?? "");
  const weekStart = String(body.weekStart ?? "");
  const dayIndex = Number(body.dayIndex);
  const shiftType = String(body.shiftType ?? "") as ShiftType;
  const employees = await listEmployees();
  const employee = employees.find((item) => item.id === employeeId);

  if (!employee || !weekStart || !["MORNING", "EVENING", "NIGHT"].includes(shiftType)) {
    return jsonError("A valid employee, week, day, and shift are required.");
  }

  const [existingAssignments, availabilityBlocks] = await Promise.all([
    listAssignments(weekStart),
    listAvailabilityBlocks(weekStart)
  ]);
  const validation = validateAssignment(
    { employeeId, weekStart, dayIndex, shiftType },
    employee,
    existingAssignments,
    availabilityBlocks
  );

  if (validation.errors.length > 0) {
    return jsonError("Assignment violates scheduling rules.", 409, validation);
  }

  const assignment = await createAssignment({
    employeeId,
    weekStart,
    dayIndex,
    shiftType,
    notes: String(body.notes ?? "")
  });

  return NextResponse.json({ assignment, validation }, { status: 201 });
}
