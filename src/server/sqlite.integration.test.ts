import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databasePath = resolve("data/sqlite-integration-test.db");
process.env.SQLITE_PATH = databasePath;

describe("SQLite repository integration", () => {
  beforeAll(async () => {
    const { getDatabase } = await import("./db");
    getDatabase().exec(readFileSync(resolve("db/schema.sql"), "utf8"));
  });

  afterAll(async () => {
    const { getDatabase } = await import("./db");
    getDatabase().close();
    for (const suffix of ["", "-shm", "-wal"]) {
      rmSync(`${databasePath}${suffix}`, { force: true });
    }
  });

  it("creates, updates, and deletes a managed employee transactionally", async () => {
    const {
      createManagedEmployee,
      deleteManagedEmployee,
      findUserByEmail,
      updateManagedEmployee
    } = await import("./repositories");

    const created = await createManagedEmployee({
      name: "SQLite Smoke",
      email: "sqlite-smoke@wecomconnect.local",
      roleTitle: "Tester",
      weeklyMinShifts: 1,
      weeklyMaxShifts: 6,
      passwordHash: "test-hash"
    });
    expect(created.email).toBe("sqlite-smoke@wecomconnect.local");
    expect(await findUserByEmail(created.email)).not.toBeNull();

    const updated = await updateManagedEmployee({
      id: created.id,
      name: "SQLite Updated",
      email: created.email,
      roleTitle: "Senior Tester",
      weeklyMinShifts: 2,
      weeklyMaxShifts: 5,
      passwordHash: null
    });
    expect(updated?.name).toBe("SQLite Updated");
    expect(updated?.weeklyMaxShifts).toBe(5);

    expect(await deleteManagedEmployee(created.id)).toBe(true);
    expect(await findUserByEmail(created.email)).toBeNull();
  });
});
