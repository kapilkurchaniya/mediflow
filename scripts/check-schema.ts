import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/server/db/index";

async function run() {
  try {
    const res = await db.execute(sql`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'sales'`);
    console.log(res);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
