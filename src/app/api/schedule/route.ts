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
  const visibleAvailabilityBlocks =
    user.role === "MANAGER"
      ? availabilityBlocks
      : availabilityBlocks.filter((block) => {
          const employee = employees.find((item) => item.id === block.employeeId);
          return employee?.userId === user.id;
        });

  return NextResponse.json({
    weekStart,
    employees,
    assignments,
    availabilityBlocks: visibleAvailabilityBlocks,
    swaps,
    summaries: calculateSummaries(employees, assignments)
  });
}
