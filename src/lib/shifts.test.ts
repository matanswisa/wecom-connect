import { describe, expect, it } from "vitest";
import { calculateSummaries, validateAssignment } from "./shifts";
import type { AvailabilityBlock, Employee, ShiftAssignment } from "./types";

const employee: Employee = {
  id: "employee-1",
  userId: null,
  name: "נועה כהן",
  email: "noa@example.com",
  roleTitle: "עובדת",
  weeklyMinShifts: 1,
  weeklyMaxShifts: 6,
  isActive: true
};

function assignment(id: string, dayIndex: number, shiftType: ShiftAssignment["shiftType"]) {
  return {
    id,
    employeeId: employee.id,
    weekStart: "2026-07-19",
    dayIndex,
    shiftType,
    notes: ""
  };
}

describe("shift rules", () => {
  it("blocks assignments above the weekly maximum", () => {
    const existing = [
      assignment("1", 0, "MORNING"),
      assignment("2", 0, "NIGHT"),
      assignment("3", 1, "EVENING"),
      assignment("4", 2, "MORNING"),
      assignment("5", 3, "EVENING"),
      assignment("6", 4, "MORNING")
    ];

    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 4, shiftType: "NIGHT" },
      employee,
      existing,
      []
    );

    expect(validation.errors).toContainEqual(
      expect.objectContaining({ code: "WEEKLY_LIMIT" })
    );
  });

  it("blocks direct back-to-back shifts", () => {
    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 0, shiftType: "EVENING" },
      employee,
      [assignment("1", 0, "MORNING")],
      []
    );

    expect(validation.errors).toContainEqual(expect.objectContaining({ code: "BACK_TO_BACK" }));
  });

  it("warns when a night shift is followed by next-day evening shift", () => {
    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 1, shiftType: "EVENING" },
      employee,
      [assignment("1", 0, "NIGHT")],
      []
    );

    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings).toContainEqual(expect.objectContaining({ code: "SHORT_REST" }));
  });

  it("blocks a shift that overlaps employee availability blocks", () => {
    const blocks: AvailabilityBlock[] = [
      {
        id: "block-1",
        employeeId: employee.id,
        weekStart: "2026-07-19",
        dayIndex: 2,
        shiftType: "MORNING",
        startsAt: null,
        endsAt: null,
        reason: "סידור אישי"
      }
    ];

    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 2, shiftType: "MORNING" },
      employee,
      [],
      blocks
    );

    expect(validation.errors).toContainEqual(
      expect.objectContaining({ code: "AVAILABILITY_BLOCKED" })
    );
  });

  it("summarizes shifts and work hours per employee", () => {
    const [summary] = calculateSummaries([employee], [
      assignment("1", 0, "MORNING"),
      assignment("2", 1, "NIGHT")
    ]);

    expect(summary).toMatchObject({
      employeeId: employee.id,
      shiftCount: 2,
      workHours: 16,
      maxShifts: 6
    });
  });
});
