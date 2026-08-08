import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

declare global {
  // Reuse the connection during Next.js hot reloads.
  // eslint-disable-next-line no-var
  var wecomconnectDatabase: Database.Database | undefined;
}

export interface QueryResult<T> {
  rows: T[];
}

export function getDatabase() {
  if (!global.wecomconnectDatabase) {
    const databasePath = resolveDatabasePath();
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    const database = new Database(databasePath);
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
    global.wecomconnectDatabase = database;
  }

  return global.wecomconnectDatabase;
}

export function execute<T>(sql: string, values: unknown[] = []): QueryResult<T> {
  const translated = translateNumberedParameters(sql, values);
  const statement = getDatabase().prepare(translated.sql);
  const parameters = translated.values.map(toSqliteValue);

  if (statement.reader) {
    return { rows: statement.all(...parameters) as T[] };
  }

  statement.run(...parameters);
  return { rows: [] };
}

export async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  return execute<T>(sql, values).rows;
}

export function transaction<T>(callback: () => T): T {
  return getDatabase().transaction(callback)();
}

function resolveDatabasePath(): string {
  const configuredPath = process.env.SQLITE_PATH?.trim() || "./data/wecomconnect.db";
  return configuredPath === ":memory:" ? configuredPath : resolve(process.cwd(), configuredPath);
}

function translateNumberedParameters(sql: string, values: unknown[]) {
  const orderedValues: unknown[] = [];
  const translatedSql = sql
    .replace(/\$(\d+)/g, (_placeholder, index: string) => {
      orderedValues.push(values[Number(index) - 1]);
      return "?";
    })
    .replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP");

  return { sql: translatedSql, values: orderedValues };
}

function toSqliteValue(value: unknown): string | number | bigint | Buffer | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  throw new TypeError(`Unsupported SQLite parameter type: ${typeof value}`);
}
