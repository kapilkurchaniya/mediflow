import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/health/route";
import { db } from "@/server/db";
import { env } from "@/env";
import { sql } from "drizzle-orm";
import {
  recordWorkerStart,
  recordWorkerSuccess,
  recordWorkerFailure,
  getAllWorkerHeartbeats,
} from "@/server/observability/heartbeat";
import { checkOutbox, checkWorkerHeartbeats } from "@/server/observability/health";

describe("Observability Health & Heartbeats Integration Suite (Phase 6.1)", () => {
  const testTenantId = "a0000000-0000-0000-0000-000000000099";

  beforeAll(async () => {
    // Insert test tenant for any foreign key dependencies
    await db.execute(sql`
      INSERT INTO tenants (id, name, legal_name)
      VALUES (${testTenantId}::uuid, 'Observability Test Tenant', 'Observability Legal')
      ON CONFLICT DO NOTHING
    `);
  });

  afterAll(async () => {
    // Clean up test heartbeats and outbox events
    await db.execute(sql`DELETE FROM worker_heartbeats WHERE worker_name LIKE 'test_%'`);
    await db.execute(sql`DELETE FROM outbox_events WHERE tenant_id = ${testTenantId}::uuid`);
    await db.execute(sql`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`);
  });

  describe("Public Health Liveness Probe", () => {
    it("returns minimal public status without leaking internal metrics", async () => {
      const req = new NextRequest("http://localhost:3000/api/health");
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");

      const body = await res.json();
      expect(body.status).toBe("healthy");
      expect(body.timestamp).toBeDefined();
      expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);

      // Verify strict privacy: zero disclosure of database, latency, outbox, workers, or mobile webhooks
      expect(body.database).toBeUndefined();
      expect(body.latencyMs).toBeUndefined();
      expect(body.outbox).toBeUndefined();
      expect(body.workers).toBeUndefined();
      expect(body.mobileWebhooks).toBeUndefined();
    });
  });

  describe("Protected Health Diagnostics Probe", () => {
    it("rejects unauthorized diagnostic secret with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/health", {
        headers: { "x-health-secret": "wrong-secret-token" },
      });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns comprehensive diagnostics when valid secret is provided", async () => {
      const validSecret = env.HEALTH_SECRET || env.CRON_SECRET || "test_health_secret_0123456789abcdef";
      const req = new NextRequest("http://localhost:3000/api/health", {
        headers: { "x-health-secret": validSecret },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(["healthy", "degraded"]).toContain(body.status);
      expect(body.timestamp).toBeDefined();
      expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);

      // Database probe details
      expect(body.database).toBeDefined();
      expect(body.database.status).toBe("up");
      expect(typeof body.database.latencyMs).toBe("number");

      // Outbox probe details
      expect(body.outbox).toBeDefined();
      expect(["healthy", "degraded"]).toContain(body.outbox.status);
      expect(typeof body.outbox.pendingCount).toBe("number");
      expect(typeof body.outbox.eligiblePendingCount).toBe("number");
      expect(typeof body.outbox.oldestPendingAgeSeconds).toBe("number");

      // Worker probe details
      expect(body.workers).toBeDefined();
      expect(typeof body.workers).toBe("object");

      // Mobile webhooks probe details
      expect(body.mobileWebhooks).toBeDefined();
      expect(["healthy", "degraded"]).toContain(body.mobileWebhooks.status);
      expect(typeof body.mobileWebhooks.pendingCount).toBe("number");
      expect(typeof body.mobileWebhooks.expiredLeasesCount).toBe("number");
      expect(typeof body.mobileWebhooks.failedCount).toBe("number");
    });
  });

  describe("Worker Heartbeat Lifecycle & Stale Detection", () => {
    it("records worker start, success, and failure cycles", async () => {
      const workerName = `test_worker_${Date.now()}`;

      // 1. Worker start
      await recordWorkerStart(db, workerName, { batchSize: 50 });
      let heartbeats = await getAllWorkerHeartbeats(db);
      let hb = heartbeats.find((h) => h.workerName === workerName);
      expect(hb).toBeDefined();
      expect(hb?.status).toBe("running");
      expect(hb?.lastStartedAt).toBeDefined();

      // 2. Worker success
      await recordWorkerSuccess(db, workerName, { processed: 25, succeeded: 25 });
      heartbeats = await getAllWorkerHeartbeats(db);
      hb = heartbeats.find((h) => h.workerName === workerName);
      expect(hb?.status).toBe("ok");
      expect(hb?.lastSuccessAt).toBeDefined();
      expect(hb?.consecutiveFailures).toBe(0);

      // 3. Worker failure
      await recordWorkerFailure(db, workerName, { failed: 1 });
      heartbeats = await getAllWorkerHeartbeats(db);
      hb = heartbeats.find((h) => h.workerName === workerName);
      expect(hb?.status).toBe("failed");
      expect(hb?.lastErrorAt).toBeDefined();
      expect(hb?.consecutiveFailures).toBe(1);
    });

    it("evaluates worker stale state based on heartbeat age", async () => {
      // Insert stale outbox worker heartbeat from 10 minutes ago
      await db.execute(sql`
        INSERT INTO worker_heartbeats (
          worker_name, status, last_started_at, last_heartbeat_at, consecutive_failures, updated_at
        )
        VALUES (
          'outbox_worker', 'running', now() - interval '10 minutes', now() - interval '10 minutes', 0, now()
        )
        ON CONFLICT (worker_name) DO UPDATE
        SET status = 'running', last_heartbeat_at = now() - interval '10 minutes', updated_at = now()
      `);

      const workerProbe = await checkWorkerHeartbeats(db);
      expect(workerProbe.outbox_worker).toBeDefined();
      expect(workerProbe.outbox_worker.status).toBe("stale");
    });
  });

  describe("Outbox Backlog Monitoring & Degradation Probe", () => {
    it("reports healthy when outbox queue is within normal bounds", async () => {
      const probe = await checkOutbox(db);
      expect(["healthy", "degraded"]).toContain(probe.status);
      expect(typeof probe.pendingCount).toBe("number");
      expect(typeof probe.eligiblePendingCount).toBe("number");
      expect(typeof probe.oldestPendingAgeSeconds).toBe("number");
    });

    it("detects queue degradation when synthetic stale event is pending", async () => {
      // Insert synthetic outbox event created 20 minutes ago (> 900s threshold)
      await db.execute(sql`
        INSERT INTO outbox_events (
          tenant_id, type, payload, status, attempts, created_at, next_attempt_at
        )
        VALUES (
          ${testTenantId}::uuid, 'test.stale_event', '{"key": "test"}'::jsonb,
          'pending', 0, now() - interval '20 minutes', now() - interval '15 minutes'
        )
      `);

      const probe = await checkOutbox(db);
      expect(probe.status).toBe("degraded");
      expect(probe.pendingCount).toBeGreaterThanOrEqual(1);
      expect(probe.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(900);
    });
  });
});
