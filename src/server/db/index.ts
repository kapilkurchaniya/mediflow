import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

// BIGINT (int8) → JS number. All bigint columns are paise amounts / ids well within 2^53.
pg.types.setTypeParser(20, (v) => Number(v));
// NUMERIC → number (used by aggregate SUM results).
pg.types.setTypeParser(1700, (v) => Number(v));
// DATE → keep as 'YYYY-MM-DD' string (avoids timezone shifts).
pg.types.setTypeParser(1082, (v) => v);

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the DB. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

declare global {
  var __mediflowPool: pg.Pool | undefined;
}

// Reuse the pool across hot reloads in development.
const pool =
  globalThis.__mediflowPool ??
  new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
if (process.env.NODE_ENV !== "production") globalThis.__mediflowPool = pool;

export const db: DB = drizzle(pool, { schema });
export { schema, pool };
