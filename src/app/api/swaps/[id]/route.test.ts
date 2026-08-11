import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  findSwapRequest: vi.fn(),
  listEmployees: vi.fn(),
  updateSwapStatus: vi.fn()
}));

vi.mock("@/server/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireApiUser: mocks.requireApiUser,
    isApiError: (value: unknown) => value instanceof NextResponse,
    jsonError: (message: string, status = 400) =>
      NextResponse.json({ error: message }, { status })
  };
});
vi.mock("@/server/repositories", () => ({
  findSwapRequest: mocks.findSwapRequest,
  listEmployees: mocks.listEmployees,
  updateSwapStatus: mocks.updateSwapStatus
}));

import { PATCH } from "./route";

const manager = { id: "manager-user", email: "admin@example.com", name: "admin", role: "MANAGER" };
const targetUser = { id: "target-user", email: "target@example.com", name: "Target", role: "EMPLOYEE" };
const pendingEmployeeSwap = {
  id: "swap-1",
  requesterAssignmentId: "assignment-1",
  targetEmployeeId: "employee-2",
  targetAssignmentId: null,
  status: "PENDING_EMPLOYEE",
  createdAt: "2026-08-11T00:00:00.000Z"
};

function actionRequest(action: string) {
  return new Request("http://localhost/api/swaps/swap-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });
}

describe("swap approval stages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves an approval by the target employee to manager review", async () => {
    mocks.requireApiUser.mockResolvedValue(targetUser);
    mocks.findSwapRequest.mockResolvedValue(pendingEmployeeSwap);
    mocks.listEmployees.mockResolvedValue([{
      id: pendingEmployeeSwap.targetEmployeeId,
      userId: targetUser.id
    }]);
    mocks.updateSwapStatus.mockResolvedValue({
      ...pendingEmployeeSwap,
      status: "PENDING_MANAGER"
    });

    const response = await PATCH(actionRequest("approve_employee"), {
      params: Promise.resolve({ id: pendingEmployeeSwap.id })
    });

    expect(response.status).toBe(200);
    expect(mocks.updateSwapStatus).toHaveBeenCalledWith(
      pendingEmployeeSwap.id,
      "PENDING_MANAGER",
      "PENDING_EMPLOYEE"
    );
  });

  it("allows admin to approve a request awaiting manager review", async () => {
    const pendingManagerSwap = { ...pendingEmployeeSwap, status: "PENDING_MANAGER" };
    mocks.requireApiUser.mockResolvedValue(manager);
    mocks.findSwapRequest.mockResolvedValue(pendingManagerSwap);
    mocks.updateSwapStatus.mockResolvedValue({ ...pendingManagerSwap, status: "APPROVED" });

    const response = await PATCH(actionRequest("approve_manager"), {
      params: Promise.resolve({ id: pendingEmployeeSwap.id })
    });

    expect(response.status).toBe(200);
    expect(mocks.requireApiUser).toHaveBeenCalledWith(["MANAGER"]);
    expect(mocks.updateSwapStatus).toHaveBeenCalledWith(
      pendingEmployeeSwap.id,
      "APPROVED",
      "PENDING_MANAGER"
    );
  });
});
