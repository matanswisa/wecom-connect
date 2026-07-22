import { query } from "./db";
import type {
  AvailabilityBlock,
  AvailabilityStatus,
  Employee,
  Role,
  ShiftAssignment,
  ShiftSwapRequest,
  ShiftType,
  User
} from "@/lib/types";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
}

interface EmployeeRow {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role_title: string;
  weekly_min_shifts: number;
  weekly_max_shifts: number;
  is_active: boolean;
}

interface AvailabilityRow {
  id: string;
  employee_id: string;
  week_start: string | Date;
  day_index: number;
  shift_type: ShiftType | null;
  starts_at: string | null;
  ends_at: string | null;
  reason: string;
  status: AvailabilityStatus;
}

interface AssignmentRow {
  id: string;
  employee_id: string;
  week_start: string | Date;
  day_index: number;
  shift_type: ShiftType;
  notes: string;
}

interface SwapRow {
  id: string;
  requester_assignment_id: string;
  target_employee_id: string;
  target_assignment_id: string | null;
  status: ShiftSwapRequest["status"];
  created_at: string;
}

export async function findUserByEmail(email: string) {
  const [user] = await query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
  return user ?? null;
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
}) {
  const [user] = await query<UserRow>(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.email, input.name, input.passwordHash, input.role]
  );
  return toUser(user);
}

export async function createEmployeeForUser(user: User) {
  const [employee] = await query<EmployeeRow>(
    `INSERT INTO employees (user_id, name, email, role_title)
     VALUES ($1, $2, $3, 'עובד')
     ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [user.id, user.name, user.email]
  );
  return toEmployee(employee);
}

export async function listEmployees() {
  const rows = await query<EmployeeRow>(
    "SELECT * FROM employees WHERE is_active = true ORDER BY name ASC"
  );
  return rows.map(toEmployee);
}

export async function listAssignments(weekStart: string) {
  const rows = await query<AssignmentRow>(
    "SELECT * FROM shift_assignments WHERE week_start = $1 ORDER BY day_index, shift_type",
    [weekStart]
  );
  return rows.map(toAssignment);
}

export async function listAvailabilityBlocks(weekStart: string) {
  const rows = await query<AvailabilityRow>(
    "SELECT * FROM availability_blocks WHERE week_start = $1 ORDER BY day_index",
    [weekStart]
  );
  return rows.map(toAvailabilityBlock);
}

export async function findAvailabilityBlock(id: string) {
  const [row] = await query<AvailabilityRow>("SELECT * FROM availability_blocks WHERE id = $1", [id]);
  return row ? toAvailabilityBlock(row) : null;
}

export async function createAssignment(input: {
  employeeId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
  notes?: string;
}) {
  const [assignment] = await query<AssignmentRow>(
    `INSERT INTO shift_assignments (employee_id, week_start, day_index, shift_type, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.employeeId, input.weekStart, input.dayIndex, input.shiftType, input.notes ?? ""]
  );
  return toAssignment(assignment);
}

export async function deleteAssignment(id: string) {
  await query("DELETE FROM shift_assignments WHERE id = $1", [id]);
}

export async function createAvailabilityBlock(input: {
  employeeId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType | null;
  startsAt: string | null;
  endsAt: string | null;
  reason: string;
  status: AvailabilityStatus;
}) {
  const conflictClause = input.shiftType
    ? `ON CONFLICT (employee_id, week_start, day_index, shift_type)
       WHERE shift_type IS NOT NULL
       DO UPDATE SET reason = EXCLUDED.reason, status = EXCLUDED.status`
    : input.status === "TIME_OFF"
      ? `ON CONFLICT (employee_id, week_start, day_index)
         WHERE status = 'TIME_OFF'
         DO UPDATE SET reason = EXCLUDED.reason`
      : "";
  const [block] = await query<AvailabilityRow>(
    `INSERT INTO availability_blocks
      (employee_id, week_start, day_index, shift_type, starts_at, ends_at, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ${conflictClause}
     RETURNING *`,
    [
      input.employeeId,
      input.weekStart,
      input.dayIndex,
      input.shiftType,
      input.startsAt,
      input.endsAt,
      input.reason,
      input.status
    ]
  );
  return toAvailabilityBlock(block);
}

export async function deleteAvailabilityBlock(id: string) {
  await query("DELETE FROM availability_blocks WHERE id = $1", [id]);
}

export async function listSwapRequests() {
  const rows = await query<SwapRow>("SELECT * FROM shift_swap_requests ORDER BY created_at DESC");
  return rows.map(toSwap);
}

export async function createSwapRequest(input: {
  requesterAssignmentId: string;
  targetEmployeeId: string;
  targetAssignmentId: string | null;
}) {
  const [swap] = await query<SwapRow>(
    `INSERT INTO shift_swap_requests
      (requester_assignment_id, target_employee_id, target_assignment_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.requesterAssignmentId, input.targetEmployeeId, input.targetAssignmentId]
  );
  return toSwap(swap);
}

export async function updateSwapStatus(id: string, status: ShiftSwapRequest["status"]) {
  const decidedColumn =
    status === "PENDING_MANAGER" || status === "DECLINED_BY_EMPLOYEE"
      ? "employee_decided_at"
      : "manager_decided_at";
  const [swap] = await query<SwapRow>(
    `UPDATE shift_swap_requests
     SET status = $2, ${decidedColumn} = now()
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  return toSwap(swap);
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role
  };
}

function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    roleTitle: row.role_title,
    weeklyMinShifts: row.weekly_min_shifts,
    weeklyMaxShifts: row.weekly_max_shifts,
    isActive: row.is_active
  };
}

function toAvailabilityBlock(row: AvailabilityRow): AvailabilityBlock {
  return {
    id: row.id,
    employeeId: row.employee_id,
    weekStart: normalizeDateOnly(row.week_start),
    dayIndex: row.day_index,
    shiftType: row.shift_type,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
    status: row.status
  };
}

function toAssignment(row: AssignmentRow): ShiftAssignment {
  return {
    id: row.id,
    employeeId: row.employee_id,
    weekStart: normalizeDateOnly(row.week_start),
    dayIndex: row.day_index,
    shiftType: row.shift_type,
    notes: row.notes
  };
}

function normalizeDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function toSwap(row: SwapRow): ShiftSwapRequest {
  return {
    id: row.id,
    requesterAssignmentId: row.requester_assignment_id,
    targetEmployeeId: row.target_employee_id,
    targetAssignmentId: row.target_assignment_id,
    status: row.status,
    createdAt: row.created_at
  };
}
