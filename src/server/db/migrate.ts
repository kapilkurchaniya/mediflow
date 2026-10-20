import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";
import { backfillSystemRoles } from "../roles";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Extensions must exist before the migration that creates trigram indexes.
  await pool.query("create extension if not exists pg_trgm");
  await pool.query('create extension if not exists "pgcrypto"');
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");

  // Data step (idempotent): every tenant must have its system roles and permissions. SQL migrations cannot
  // do this because the permission templates live in TypeScript (src/lib/permissions.ts).
  const tenants = await backfillSystemRoles(drizzle(pool, { schema }));
  console.log(`✓ system roles synced for ${tenants} tenant(s)`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
