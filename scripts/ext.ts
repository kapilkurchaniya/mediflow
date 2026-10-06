import "dotenv/config";
import { db } from "../src/server/db/index";
import { sql } from "drizzle-orm";

async function run() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  console.log("Extension created");
  process.exit(0);
}
run();
