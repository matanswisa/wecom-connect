import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { createSwapRequest } from "@/server/repositories";

export async function POST(request: Request) {
  const user = requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const requesterAssignmentId = String(body.requesterAssignmentId ?? "");
  const targetEmployeeId = String(body.targetEmployeeId ?? "");
  const targetAssignmentId = body.targetAssignmentId ? String(body.targetAssignmentId) : null;

  if (!requesterAssignmentId || !targetEmployeeId) {
    return jsonError("Requester assignment and target employee are required.");
  }

  const swap = await createSwapRequest({
    requesterAssignmentId,
    targetEmployeeId,
    targetAssignmentId
  });

  return NextResponse.json({ swap }, { status: 201 });
}
