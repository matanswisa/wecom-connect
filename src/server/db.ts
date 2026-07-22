import pg from "pg";

const { Pool } = pg;

declare global {
  // Reuse the pool during Next.js hot reloads.
  // eslint-disable-next-line no-var
  var wecomconnectPool: pg.Pool | undefined;
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!global.wecomconnectPool) {
    global.wecomconnectPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  return global.wecomconnectPool;
}

export async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, values);
  return result.rows as T[];
}
