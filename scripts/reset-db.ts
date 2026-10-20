/**
 * Rebuilds the LOCAL database from migrations: drops everything, migrates, seeds.
 * Refuses to run against anything that is not localhost.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (create .env, see docs/08-local-setup.md)");
  process.exit(1);
}

const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing to reset a non-local database (host: ${host}).`);
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: url });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.end();
  console.log("✓ database wiped");

  execSync("npx tsx src/server/db/migrate.ts", { stdio: "inherit" });
  execSync("npx tsx scripts/setup-db.ts", { stdio: "inherit" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
