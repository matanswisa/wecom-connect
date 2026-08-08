import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const configuredPath = process.env.SQLITE_PATH?.trim() || "./data/wecomconnect.db";
const databasePath =
  configuredPath === ":memory:" ? configuredPath : resolve(process.cwd(), configuredPath);

if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const database = new Database(databasePath);

database.pragma("foreign_keys = ON");
database.pragma("journal_mode = WAL");
database.pragma("busy_timeout = 5000");
database.exec(sql);
database.close();

console.log(`SQLite schema is up to date at ${databasePath}.`);
