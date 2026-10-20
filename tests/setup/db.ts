import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/server/db/schema";
import { baseDbName, templateDbName, urlFor } from "./urls";

// Same type parsers as src/server/db/index.ts (bigint -> number, numeric -> number, date -> string).
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];

/**
 * Gives the calling test file its own throw-away database, copied from the migrated template that
 * tests/setup/global.ts built. Files run in parallel without interfering and need no truncation.
 * Call `cleanup()` in afterAll.
 */
export async function createTestDb() {
  const dbName = `${baseDbName()}_${randomBytes(5).toString("hex")}`;

  const admin = new pg.Client({ connectionString: urlFor(baseDbName()) });
  await admin.connect();
  try {
    // Postgres refuses to copy a template while another copy is starting; retry briefly.
    for (let attempt = 1; ; attempt++) {
      try {
        await admin.query(`create database "${dbName}" template "${templateDbName()}"`);
        break;
      } catch (e) {
        if (attempt >= 20 || !/being accessed by other users/.test(String(e))) throw e;
        await new Promise((r) => setTimeout(r, 100 * attempt));
      }
    }
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: urlFor(dbName), max: 10 });
  // While the database is being dropped, a connection that is still closing can report "terminating connection
  // due to administrator command" (57P01). An unhandled 'error' event would fail the whole run despite green tests.
  pool.on("error", () => {});
  const db = drizzle(pool, { schema });

  async function cleanup() {
    await pool.end();
    const c = new pg.Client({ connectionString: urlFor(baseDbName()) });
    await c.connect();
    await c.query(`drop database if exists "${dbName}" with (force)`);
    await c.end();
  }

  return { db, pool, dbName, cleanup };
}
