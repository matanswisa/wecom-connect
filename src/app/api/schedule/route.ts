import { NextResponse } from "next/server";
import { getSundayWeekStart } from "@/lib/dates";
import { calculateSummaries } from "@/lib/shifts";
import { isApiError, requireApiUser } from "@/server/api";
import {
  listAssignments,
  listAvailabilityBlocks,
  listEmployees,
  listSwapRequests
} from "@/server/repositories";

export async function GET(request: Request) {
  const user = requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart") ?? getSundayWeekStart();
  const [employees, assignments, availabilityBlocks, swaps] = await Promise.all([
    listEmployees(),
    listAssignments(weekStart),
    listAvailabilityBlocks(weekStart),
    listSwapRequests()
  ]);

  return NextResponse.json({
    weekStart,
    employees,
    assignments,
    availabilityBlocks,
    swaps,
    summaries: calculateSummaries(employees, assignments)
  });
}
