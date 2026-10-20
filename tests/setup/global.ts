import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { baseDbName, templateDbName, urlFor } from "./urls";

/**
 * Runs once per `vitest run`: builds a template database from the real migrations.
 * Each test file then copies it (CREATE DATABASE ... TEMPLATE), which takes ~100 ms.
 */
export default async function setup() {
  config({ path: ".env.test", quiet: true });
  if (!process.env.DATABASE_URL) {
    return;
  }
  const tpl = templateDbName();

  try {
    const admin = new pg.Client({ connectionString: urlFor(baseDbName()) });
    await admin.connect();
    await admin.query(`drop database if exists "${tpl}" with (force)`);
    await admin.query(`create database "${tpl}"`);
    await admin.end();

    const pool = new pg.Pool({ connectionString: urlFor(tpl), max: 1 });
    await pool.query("create extension if not exists pg_trgm");
    await pool.query('create extension if not exists "pgcrypto"');
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    await pool.end(); // a template must have no open connections
  } catch (err: unknown) {
    console.warn("Global test DB setup skipped (Postgres not running):", (err as Error).message);
    return;
  }

  return async function teardown() {
    try {
      const c = new pg.Client({ connectionString: urlFor(baseDbName()) });
      await c.connect();
      await c.query(`drop database if exists "${tpl}" with (force)`);
      await c.end();
    } catch {}
  };
}
