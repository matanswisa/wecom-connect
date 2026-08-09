import { NextResponse } from "next/server";
import { getAvailabilityWeekStart, getSundayWeekStart } from "@/lib/dates";
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
  const availabilityWeekStart =
    searchParams.get("availabilityWeekStart") ?? getAvailabilityWeekStart();
  const [employees, assignments, scheduleAvailabilityBlocks, availabilityBlocks, swaps] =
    await Promise.all([
      listEmployees(),
      listAssignments(weekStart),
      listAvailabilityBlocks(weekStart),
      listAvailabilityBlocks(availabilityWeekStart),
      listSwapRequests()
    ]);
  const ownEmployeeIds = new Set(
    employees.filter((employee) => employee.userId === user.id).map((employee) => employee.id)
  );
  const visibleScheduleAvailabilityBlocks = user.role === "MANAGER"
    ? scheduleAvailabilityBlocks
    : scheduleAvailabilityBlocks.filter((block) => ownEmployeeIds.has(block.employeeId));
  const visibleAvailabilityBlocks = user.role === "MANAGER"
    ? availabilityBlocks
    : availabilityBlocks.filter((block) => ownEmployeeIds.has(block.employeeId));

  return NextResponse.json({
    weekStart,
    availabilityWeekStart,
    employees,
    assignments,
    scheduleAvailabilityBlocks: visibleScheduleAvailabilityBlocks,
    availabilityBlocks: visibleAvailabilityBlocks,
    swaps,
    summaries: calculateSummaries(employees, assignments)
  });
}
