import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { findSwapRequest, listEmployees, updateSwapStatus } from "@/server/repositories";
import type { ShiftSwapRequest } from "@/lib/types";

const ACTIONS: Record<string, {
  status: ShiftSwapRequest["status"];
  expectedStatus: ShiftSwapRequest["status"];
  actor: "EMPLOYEE" | "MANAGER";
}> = {
  approve_employee: {
    status: "PENDING_MANAGER",
    expectedStatus: "PENDING_EMPLOYEE",
    actor: "EMPLOYEE"
  },
  decline_employee: {
    status: "DECLINED_BY_EMPLOYEE",
    expectedStatus: "PENDING_EMPLOYEE",
    actor: "EMPLOYEE"
  },
  approve_manager: {
    status: "APPROVED",
    expectedStatus: "PENDING_MANAGER",
    actor: "MANAGER"
  },
  decline_manager: {
    status: "DECLINED_BY_MANAGER",
    expectedStatus: "PENDING_MANAGER",
    actor: "MANAGER"
  }
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await request.json();
  const action = ACTIONS[String(body.action ?? "")];

  if (!action) {
    return jsonError("Unknown swap action.");
  }

  const user = await requireApiUser(action.actor === "MANAGER" ? ["MANAGER"] : undefined);
  if (isApiError(user)) {
    return user;
  }

  const { id } = await context.params;
  const swapRequest = await findSwapRequest(id);
  if (!swapRequest) {
    return jsonError("Swap request not found.", 404);
  }

  if (action.actor === "EMPLOYEE") {
    const employees = await listEmployees();
    const targetEmployee = employees.find(
      (employee) => employee.id === swapRequest.targetEmployeeId
    );
    if (targetEmployee?.userId !== user.id) {
      return jsonError("Only the target employee can respond to this swap.", 403);
    }
  }

  if (swapRequest.status !== action.expectedStatus) {
    return jsonError("This swap request has already been handled.", 409);
  }

  const swap = await updateSwapStatus(id, action.status, action.expectedStatus);
  if (!swap) {
    return jsonError("This swap request has already been handled.", 409);
  }
  return NextResponse.json({ swap });
}
