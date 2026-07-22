import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { updateSwapStatus } from "@/server/repositories";
import type { ShiftSwapRequest } from "@/lib/types";

const ACTIONS: Record<string, ShiftSwapRequest["status"]> = {
  approve_employee: "PENDING_MANAGER",
  decline_employee: "DECLINED_BY_EMPLOYEE",
  approve_manager: "APPROVED",
  decline_manager: "DECLINED_BY_MANAGER"
};

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  const status = ACTIONS[String(body.action ?? "")];

  if (!status) {
    return jsonError("Unknown swap action.");
  }

  const user = requireApiUser(status === "APPROVED" || status === "DECLINED_BY_MANAGER" ? ["MANAGER"] : undefined);
  if (isApiError(user)) {
    return user;
  }

  const swap = await updateSwapStatus(context.params.id, status);
  return NextResponse.json({ swap });
}
