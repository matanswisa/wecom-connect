import { getPool, query } from "./db";
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
  requester_employee_id?: string;
  requester_employee_name?: string;
  target_employee_id: string;
  target_employee_name?: string;
  target_assignment_id: string | null;
  week_start?: string | Date;
  day_index?: number;
  shift_type?: ShiftType;
  target_day_index?: number | null;
  target_shift_type?: ShiftType | null;
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

export async function createManagedEmployee(input: {
  name: string;
  email: string;
  roleTitle: string;
  weeklyMinShifts: number;
  weeklyMaxShifts: number;
  passwordHash: string;
}) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query<UserRow>(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, 'EMPLOYEE')
       RETURNING *`,
      [input.email, input.name, input.passwordHash]
    );
    const user = userResult.rows[0];
    const employeeResult = await client.query<EmployeeRow>(
      `INSERT INTO employees
        (user_id, name, email, role_title, weekly_min_shifts, weekly_max_shifts)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        user.id,
        input.name,
        input.email,
        input.roleTitle,
        input.weeklyMinShifts,
        input.weeklyMaxShifts
      ]
    );
    await client.query("COMMIT");
    return toEmployee(employeeResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateManagedEmployee(input: {
  id: string;
  name: string;
  email: string;
  roleTitle: string;
  weeklyMinShifts: number;
  weeklyMaxShifts: number;
  passwordHash: string | null;
}) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const employeeResult = await client.query<EmployeeRow>(
      `UPDATE employees
       SET name = $2,
           email = $3,
           role_title = $4,
           weekly_min_shifts = $5,
           weekly_max_shifts = $6
       WHERE id = $1
       RETURNING *`,
      [
        input.id,
        input.name,
        input.email,
        input.roleTitle,
        input.weeklyMinShifts,
        input.weeklyMaxShifts
      ]
    );
    const employee = employeeResult.rows[0];
    if (!employee) {
      await client.query("ROLLBACK");
      return null;
    }

    if (employee.user_id) {
      await client.query(
        `UPDATE users
         SET name = $2,
             email = $3,
             password_hash = COALESCE($4, password_hash)
         WHERE id = $1`,
        [employee.user_id, input.name, input.email, input.passwordHash]
      );
    } else if (input.passwordHash) {
      const userResult = await client.query<UserRow>(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ($1, $2, $3, 'EMPLOYEE')
         RETURNING *`,
        [input.email, input.name, input.passwordHash]
      );
      await client.query(
        "UPDATE employees SET user_id = $2 WHERE id = $1",
        [employee.id, userResult.rows[0].id]
      );
    }
    const finalEmployeeResult = await client.query<EmployeeRow>(
      "SELECT * FROM employees WHERE id = $1",
      [employee.id]
    );
    await client.query("COMMIT");
    return toEmployee(finalEmployeeResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteManagedEmployee(id: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const employeeResult = await client.query<EmployeeRow>(
      "DELETE FROM employees WHERE id = $1 RETURNING *",
      [id]
    );
    const employee = employeeResult.rows[0];
    if (!employee) {
      await client.query("ROLLBACK");
      return false;
    }
    if (employee.user_id) {
      await client.query("DELETE FROM users WHERE id = $1", [employee.user_id]);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listAssignments(weekStart: string) {
  const rows = await query<AssignmentRow>(
    "SELECT * FROM shift_assignments WHERE week_start = $1 ORDER BY day_index, shift_type",
    [weekStart]
  );
  return rows.map(toAssignment);
}

export async function findAssignment(id: string) {
  const [row] = await query<AssignmentRow>("SELECT * FROM shift_assignments WHERE id = $1", [id]);
  return row ? toAssignment(row) : null;
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
  const rows = await query<SwapRow>(
    `SELECT swaps.*,
            requester_assignment.employee_id AS requester_employee_id,
            requester.name AS requester_employee_name,
            target.name AS target_employee_name,
            requester_assignment.week_start,
            requester_assignment.day_index,
            requester_assignment.shift_type,
            target_assignment.day_index AS target_day_index,
            target_assignment.shift_type AS target_shift_type
     FROM shift_swap_requests swaps
     JOIN shift_assignments requester_assignment
       ON requester_assignment.id = swaps.requester_assignment_id
     JOIN employees requester ON requester.id = requester_assignment.employee_id
     JOIN employees target ON target.id = swaps.target_employee_id
     LEFT JOIN shift_assignments target_assignment
       ON target_assignment.id = swaps.target_assignment_id
     ORDER BY swaps.created_at DESC`
  );
  return rows.map(toSwap);
}

export async function findSwapRequest(id: string) {
  const [row] = await query<SwapRow>("SELECT * FROM shift_swap_requests WHERE id = $1", [id]);
  return row ? toSwap(row) : null;
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

export async function updateSwapStatus(
  id: string,
  status: ShiftSwapRequest["status"],
  expectedStatus: ShiftSwapRequest["status"]
) {
  const decidedColumn =
    status === "PENDING_MANAGER" || status === "DECLINED_BY_EMPLOYEE"
      ? "employee_decided_at"
      : "manager_decided_at";
  const [swap] = await query<SwapRow>(
    `UPDATE shift_swap_requests
     SET status = $2, ${decidedColumn} = now()
     WHERE id = $1 AND status = $3
     RETURNING *`,
    [id, status, expectedStatus]
  );
  return swap ? toSwap(swap) : null;
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
    requesterEmployeeId: row.requester_employee_id,
    requesterEmployeeName: row.requester_employee_name,
    targetEmployeeId: row.target_employee_id,
    targetEmployeeName: row.target_employee_name,
    targetAssignmentId: row.target_assignment_id,
    weekStart: row.week_start ? normalizeDateOnly(row.week_start) : undefined,
    dayIndex: row.day_index,
    shiftType: row.shift_type,
    targetDayIndex: row.target_day_index,
    targetShiftType: row.target_shift_type,
    status: row.status,
    createdAt: row.created_at
  };
}
