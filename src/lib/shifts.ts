import type {
  AssignmentInput,
  AssignmentValidation,
  AvailabilityBlock,
  Employee,
  EmployeeSummary,
  ShiftAssignment,
  ShiftType
} from "./types";

export const SHIFT_DEFINITIONS: Record<
  ShiftType,
  { label: string; startsAt: string; endsAt: string; hours: number; tone: string }
> = {
  MORNING: {
    label: "בוקר",
    startsAt: "07:00",
    endsAt: "15:00",
    hours: 8,
    tone: "morning"
  },
  EVENING: {
    label: "ערב",
    startsAt: "15:00",
    endsAt: "23:00",
    hours: 8,
    tone: "evening"
  },
  NIGHT: {
    label: "לילה",
    startsAt: "23:00",
    endsAt: "07:00",
    hours: 8,
    tone: "night"
  }
};

const SHIFT_ORDER: ShiftType[] = ["MORNING", "EVENING", "NIGHT"];
const MIN_REST_HOURS = 12;

export function getShiftTypes(): ShiftType[] {
  return SHIFT_ORDER;
}

export function getShiftWindow(weekStart: string, dayIndex: number, shiftType: ShiftType) {
  const base = new Date(`${weekStart}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayIndex);

  const definition = SHIFT_DEFINITIONS[shiftType];
  const [startHour, startMinute] = definition.startsAt.split(":").map(Number);
  const [endHour, endMinute] = definition.endsAt.split(":").map(Number);

  const starts = new Date(base);
  starts.setUTCHours(startHour, startMinute, 0, 0);

  const ends = new Date(base);
  ends.setUTCHours(endHour, endMinute, 0, 0);
  if (ends <= starts) {
    ends.setUTCDate(ends.getUTCDate() + 1);
  }

  return { starts, ends };
}

export function calculateSummaries(
  employees: Employee[],
  assignments: ShiftAssignment[]
): EmployeeSummary[] {
  return employees.map((employee) => {
    const ownAssignments = assignments.filter((assignment) => assignment.employeeId === employee.id);
    return {
      employeeId: employee.id,
      shiftCount: ownAssignments.length,
      workHours: ownAssignments.reduce(
        (sum, assignment) => sum + SHIFT_DEFINITIONS[assignment.shiftType].hours,
        0
      ),
      minShifts: employee.weeklyMinShifts,
      maxShifts: employee.weeklyMaxShifts
    };
  });
}

export function validateAssignment(
  input: AssignmentInput,
  employee: Employee,
  existingAssignments: ShiftAssignment[],
  availabilityBlocks: AvailabilityBlock[]
): AssignmentValidation {
  const errors = [];
  const warnings = [];
  const ownAssignments = existingAssignments.filter(
    (assignment) => assignment.employeeId === input.employeeId
  );

  if (ownAssignments.length >= employee.weeklyMaxShifts) {
    errors.push({
      code: "WEEKLY_LIMIT",
      message: `העובד כבר שובץ ל-${employee.weeklyMaxShifts} משמרות השבוע.`
    });
  }

  if (
    ownAssignments.some(
      (assignment) =>
        assignment.dayIndex === input.dayIndex && assignment.shiftType === input.shiftType
    )
  ) {
    errors.push({
      code: "DUPLICATE_SHIFT",
      message: "העובד כבר משובץ למשמרת הזו."
    });
  }

  if (isBlocked(input, availabilityBlocks)) {
    errors.push({
      code: "AVAILABILITY_BLOCKED",
      message: "העובד חסם את המשמרת או השעות האלו."
    });
  }

  const restIssues = findRestIssues(input, ownAssignments);
  errors.push(...restIssues.errors);
  warnings.push(...restIssues.warnings);

  return { errors, warnings };
}

function isBlocked(input: AssignmentInput, availabilityBlocks: AvailabilityBlock[]): boolean {
  const candidate = getShiftWindow(input.weekStart, input.dayIndex, input.shiftType);

  return availabilityBlocks
    .filter((block) => block.employeeId === input.employeeId && block.dayIndex === input.dayIndex)
    .some((block) => {
      if (block.shiftType) {
        return block.shiftType === input.shiftType;
      }

      if (!block.startsAt || !block.endsAt) {
        return false;
      }

      const blockedWindow = getTimeRange(input.weekStart, input.dayIndex, block.startsAt, block.endsAt);
      return candidate.starts < blockedWindow.ends && candidate.ends > blockedWindow.starts;
    });
}

function findRestIssues(input: AssignmentInput, assignments: ShiftAssignment[]) {
  const candidate = getShiftWindow(input.weekStart, input.dayIndex, input.shiftType);
  const errors = [];
  const warnings = [];

  for (const assignment of assignments) {
    const existing = getShiftWindow(assignment.weekStart, assignment.dayIndex, assignment.shiftType);
    const gapAfterExisting = hoursBetween(existing.ends, candidate.starts);
    const gapBeforeExisting = hoursBetween(candidate.ends, existing.starts);

    // Adjacent shifts are blocked completely; short-rest shifts are allowed with a manager warning.
    if (gapAfterExisting >= 0 && gapAfterExisting < 8) {
      errors.push({
        code: "BACK_TO_BACK",
        message: "אי אפשר לשבץ עובד משמרת אחרי משמרת ללא הפסקה מספקת."
      });
    } else if (gapAfterExisting >= 8 && gapAfterExisting < MIN_REST_HOURS) {
      warnings.push({
        code: "SHORT_REST",
        message: "התראה: לעובד יש פחות מ-12 שעות מנוחה בין המשמרות."
      });
    }

    if (gapBeforeExisting >= 0 && gapBeforeExisting < 8) {
      errors.push({
        code: "BACK_TO_BACK",
        message: "אי אפשר לשבץ עובד משמרת אחרי משמרת ללא הפסקה מספקת."
      });
    } else if (gapBeforeExisting >= 8 && gapBeforeExisting < MIN_REST_HOURS) {
      warnings.push({
        code: "SHORT_REST",
        message: "התראה: לעובד יש פחות מ-12 שעות מנוחה בין המשמרות."
      });
    }
  }

  return { errors: uniqueIssues(errors), warnings: uniqueIssues(warnings) };
}

function getTimeRange(weekStart: string, dayIndex: number, startsAt: string, endsAt: string) {
  const base = new Date(`${weekStart}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayIndex);

  const [startHour, startMinute] = startsAt.split(":").map(Number);
  const [endHour, endMinute] = endsAt.split(":").map(Number);
  const starts = new Date(base);
  starts.setUTCHours(startHour, startMinute, 0, 0);
  const ends = new Date(base);
  ends.setUTCHours(endHour, endMinute, 0, 0);
  if (ends <= starts) {
    ends.setUTCDate(ends.getUTCDate() + 1);
  }

  return { starts, ends };
}

function hoursBetween(left: Date, right: Date): number {
  return (right.getTime() - left.getTime()) / 1000 / 60 / 60;
}

function uniqueIssues<T extends { code: string }>(issues: T[]): T[] {
  return Array.from(new Map(issues.map((issue) => [issue.code, issue])).values());
}
