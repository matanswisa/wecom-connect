import { randomBytes, scrypt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import process from "node:process";
import Database from "better-sqlite3";

const scryptAsync = promisify(scrypt);
const configuredPath = process.env.SQLITE_PATH?.trim() || "./data/wecomconnect.db";
const databasePath =
  configuredPath === ":memory:" ? configuredPath : resolve(process.cwd(), configuredPath);

if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

const database = new Database(databasePath);
database.pragma("foreign_keys = ON");
database.pragma("journal_mode = WAL");
database.pragma("busy_timeout = 5000");

const demoPasswordHash = await hashPassword("Password123!");
const adminPasswordHash = await hashPassword("Wecom123");

const seed = database.transaction(() => {
  const upsertUser = database.prepare(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET
      name = excluded.name,
      password_hash = excluded.password_hash,
      role = excluded.role`
  );

  upsertUser.run("manager@wecomconnect.local", "מנהל מערכת", demoPasswordHash, "MANAGER");
  upsertUser.run("noa@wecomconnect.local", "נועה כהן", demoPasswordHash, "EMPLOYEE");
  upsertUser.run("admin@wecomconnect.local", "מנהל ראשי", adminPasswordHash, "MANAGER");
  upsertUser.run("employee@wecomconnect.local", "עובד בדיקה", adminPasswordHash, "EMPLOYEE");

  database.prepare(
    `INSERT INTO employees (user_id, name, email, role_title, weekly_min_shifts, weekly_max_shifts)
     SELECT id, name, email, 'עובד/ת משמרת', 1, 6
     FROM users
     WHERE email IN ('noa@wecomconnect.local', 'employee@wecomconnect.local')
     ON CONFLICT (email) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      weekly_max_shifts = 6`
  ).run();

  const upsertEmployee = database.prepare(
    `INSERT INTO employees (name, email, role_title, weekly_min_shifts, weekly_max_shifts)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET weekly_max_shifts = 6`
  );

  upsertEmployee.run("דניאל לוי", "daniel@wecomconnect.local", "אחראי משמרת", 2, 6);
  upsertEmployee.run("מאיה אברהם", "maya@wecomconnect.local", "עובדת משמרת", 1, 6);
  upsertEmployee.run("איתי ברק", "itai@wecomconnect.local", "עובד משמרת", 1, 6);
  upsertEmployee.run("שירה מזרחי", "shira@wecomconnect.local", "עובדת משמרת", 1, 6);
});

seed();
database.close();
console.log(`Seed data is ready at ${databasePath}.`);
