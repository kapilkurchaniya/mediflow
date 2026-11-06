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

import { env } from "../../env";

// Reuse the pool across hot reloads in development.
const pool =
  globalThis.__mediflowPool ??
  new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    min: env.DB_POOL_MIN,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  });
if (env.NODE_ENV !== "production") globalThis.__mediflowPool = pool;

export const db: DB = drizzle(pool, { schema });
export { schema, pool };
