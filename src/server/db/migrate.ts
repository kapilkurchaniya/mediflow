import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Extensions must exist before the migration that creates trigram indexes.
  await pool.query("create extension if not exists pg_trgm");
  await pool.query('create extension if not exists "pgcrypto"');
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
