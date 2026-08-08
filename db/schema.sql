PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('MANAGER', 'EMPLOYEE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role_title TEXT NOT NULL DEFAULT 'Employee',
  weekly_min_shifts INTEGER NOT NULL DEFAULT 1,
  weekly_max_shifts INTEGER NOT NULL DEFAULT 6,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  shift_type TEXT CHECK (shift_type IN ('MORNING', 'EVENING', 'NIGHT')),
  starts_at TEXT,
  ends_at TEXT,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'UNAVAILABLE'
    CHECK (status IN ('UNAVAILABLE', 'PREFERRED', 'TIME_OFF')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    status = 'TIME_OFF' OR shift_type IS NOT NULL OR (starts_at IS NOT NULL AND ends_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS availability_blocks_shift_unique
  ON availability_blocks (employee_id, week_start, day_index, shift_type)
  WHERE shift_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS availability_blocks_time_off_unique
  ON availability_blocks (employee_id, week_start, day_index)
  WHERE status = 'TIME_OFF';

CREATE TABLE IF NOT EXISTS shift_assignments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  shift_type TEXT NOT NULL CHECK (shift_type IN ('MORNING', 'EVENING', 'NIGHT')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (week_start, day_index, shift_type, employee_id)
);

CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  requester_assignment_id TEXT NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  target_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  target_assignment_id TEXT REFERENCES shift_assignments(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN ('PENDING_EMPLOYEE', 'DECLINED_BY_EMPLOYEE', 'PENDING_MANAGER', 'DECLINED_BY_MANAGER', 'APPROVED')
  ) DEFAULT 'PENDING_EMPLOYEE',
  employee_decided_at TEXT,
  manager_decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE employees SET weekly_max_shifts = 6 WHERE weekly_max_shifts <> 6;
