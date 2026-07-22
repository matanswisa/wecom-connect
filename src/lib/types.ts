export type Role = "MANAGER" | "EMPLOYEE";

export type ShiftType = "MORNING" | "EVENING" | "NIGHT";

export type SwapStatus =
  | "PENDING_EMPLOYEE"
  | "DECLINED_BY_EMPLOYEE"
  | "PENDING_MANAGER"
  | "DECLINED_BY_MANAGER"
  | "APPROVED";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Employee {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  roleTitle: string;
  weeklyMinShifts: number;
  weeklyMaxShifts: number;
  isActive: boolean;
}

export interface AvailabilityBlock {
  id: string;
  employeeId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType | null;
  startsAt: string | null;
  endsAt: string | null;
  reason: string;
}

export interface ShiftAssignment {
  id: string;
  employeeId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
  notes: string;
}

export interface ShiftSwapRequest {
  id: string;
  requesterAssignmentId: string;
  targetEmployeeId: string;
  targetAssignmentId: string | null;
  status: SwapStatus;
  createdAt: string;
}

export interface AssignmentInput {
  employeeId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
}

export interface AssignmentIssue {
  code: string;
  message: string;
}

export interface AssignmentValidation {
  errors: AssignmentIssue[];
  warnings: AssignmentIssue[];
}

export interface EmployeeSummary {
  employeeId: string;
  shiftCount: number;
  workHours: number;
  minShifts: number;
  maxShifts: number;
}
