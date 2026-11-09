import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../setup/db";

describe("Year-End Database Roles & Security Boundary Tests (A5.6)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    t = await createTestDb();
    // Create an unprivileged DB role to test real principal boundaries
    await t.db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'test_unprivileged_actor') THEN
          CREATE ROLE test_unprivileged_actor WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO test_unprivileged_actor;
    `);
  });

  afterAll(async () => {
    try {
      await t.db.execute(sql`DROP ROLE IF EXISTS test_unprivileged_actor;`);
    } catch {}
    await t?.cleanup();
  });

  it("1. mediflow_year_end_owner has restricted non-login, no-inherit attributes", async () => {
    const res = await t.db.execute(sql`
      SELECT rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb
      FROM pg_roles WHERE rolname = 'mediflow_year_end_owner'
    `);
    expect(res.rows.length).toBe(1);
    const r = res.rows[0];
    expect(r.rolcanlogin).toBe(false);
    expect(r.rolsuper).toBe(false);
    expect(r.rolinherit).toBe(false);
    expect(r.rolcreaterole).toBe(false);
    expect(r.rolcreatedb).toBe(false);
  });

  it("2. grant issuance and finalizer procedures are owned by mediflow_year_end_owner", async () => {
    const res = await t.db.execute(sql`
      SELECT p.proname, r.rolname
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.proname IN ('issue_year_end_authorization_grant', 'finalize_year_end_snapshot')
    `);
    expect(res.rows.length).toBe(2);
    for (const row of res.rows) {
      expect(row.rolname).toBe("mediflow_year_end_owner");
    }
  });

  it("3. unprivileged DB principal is denied execution on grant issuance", async () => {
    const client = await t.pool.connect();
    try {
      await client.query("SET ROLE test_unprivileged_actor");
      let denied = false;
      try {
        await client.query(`
          SELECT public.issue_year_end_authorization_grant(
            '00000000-0000-0000-0000-000000000001'::uuid,
            '00000000-0000-0000-0000-000000000002'::uuid,
            '2024-2025',
            '00000000-0000-0000-0000-000000000003'::uuid,
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            60
          )
        `);
      } catch (err: unknown) {
        denied = true;
        expect((err as { code?: string }).code).toBe("42501");
      }
      expect(denied).toBe(true);
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });

  it("4. unprivileged DB principal is denied execution on finalize_year_end_snapshot", async () => {
    const client = await t.pool.connect();
    try {
      await client.query("SET ROLE test_unprivileged_actor");
      let denied = false;
      try {
        await client.query(`
          SELECT public.finalize_year_end_snapshot(
            '00000000-0000-0000-0000-000000000001'::uuid,
            '00000000-0000-0000-0000-000000000002'::uuid,
            '2024-2025',
            'dummy_raw_token'
          )
        `);
      } catch (err: unknown) {
        denied = true;
        expect((err as { code?: string }).code).toBe("42501");
      }
      expect(denied).toBe(true);
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });

  it("5. unprivileged DB principal is denied table access on authorization grants", async () => {
    const client = await t.pool.connect();
    try {
      await client.query("SET ROLE test_unprivileged_actor");
      let denied = false;
      try {
        await client.query("SELECT * FROM public.year_end_authorization_grants");
      } catch (err: unknown) {
        denied = true;
        expect((err as { code?: string }).code).toBe("42501");
      }
      expect(denied).toBe(true);
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });
});
