/** Integration Tests for Mobile Auth, Token Rotation & Approvals (Lane A: A5.7.9) */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../../src/server/db";
import {
  registerDevice,
  approveDevice,
  loginMobile,
  refreshMobileSession,
  validateMobileToken,
  revokeDevice,
} from "../../src/server/domain/mobile/auth";
import {
  createApprovalRequest,
  issueApprovalChallenge,
  decideApproval,
} from "../../src/server/domain/mobile/approvals";

describe("Mobile Auth, Token Rotation & Approvals Suite", () => {
  let tenantId: string;
  let storeId: string;
  let ownerUserId: string;
  let staffUserId: string;
  let saleId: string;
  let ownerEmail: string;
  let staffEmail: string;

  beforeAll(async () => {
    tenantId = crypto.randomUUID();
    storeId = crypto.randomUUID();
    ownerUserId = crypto.randomUUID();
    staffUserId = crypto.randomUUID();
    saleId = crypto.randomUUID();
    ownerEmail = `mob_auth_owner_${tenantId.slice(0, 8)}@test.com`;
    staffEmail = `mob_auth_staff_${tenantId.slice(0, 8)}@test.com`;
    const pwHash = await bcrypt.hash("pass123", 4);

    await db.execute(sql`INSERT INTO tenants (id, name, legal_name) VALUES (${tenantId}::uuid, 'Mob Auth Tenant', 'Mob Auth Legal')`);
    await db.execute(sql`INSERT INTO stores (id, tenant_id, name, code, state_code) VALUES (${storeId}::uuid, ${tenantId}::uuid, 'Store 1', 'ST1', 'MH')`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${ownerUserId}::uuid, 'Owner User', ${ownerEmail}, ${pwHash})`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${staffUserId}::uuid, 'Staff User', ${staffEmail}, ${pwHash})`);
    await db.execute(sql`INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES (gen_random_uuid(), ${tenantId}::uuid, 'owner', 'Owner', true) ON CONFLICT DO NOTHING`);
    await db.execute(sql`INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES (gen_random_uuid(), ${tenantId}::uuid, 'delivery_staff', 'Delivery Staff', true) ON CONFLICT DO NOTHING`);

    await db.execute(sql`
      INSERT INTO memberships (id, tenant_id, user_id, role_id, status, all_stores, store_ids)
      SELECT gen_random_uuid(), ${tenantId}::uuid, ${ownerUserId}::uuid, id, 'active', true, ARRAY[${storeId}::uuid]
      FROM roles WHERE tenant_id = ${tenantId}::uuid AND key = 'owner'
    `);
    await db.execute(sql`
      INSERT INTO memberships (id, tenant_id, user_id, role_id, status, all_stores, store_ids)
      SELECT gen_random_uuid(), ${tenantId}::uuid, ${staffUserId}::uuid, id, 'active', false, ARRAY[${storeId}::uuid]
      FROM roles WHERE tenant_id = ${tenantId}::uuid AND key = 'delivery_staff'
    `);
    await db.execute(sql`
      INSERT INTO sales (id, tenant_id, store_id, invoice_no, status, total_amount, paid_amount, cost_amount, credit_amount, created_by, completed_at)
      VALUES (${saleId}::uuid, ${tenantId}::uuid, ${storeId}::uuid, 'INV-AUTH-1', 'completed', 50000, 0, 30000, 50000, ${ownerUserId}::uuid, now())
    `);
  });

  afterAll(async () => {
    await db.execute(sql`SET session_replication_role = 'replica'`);
    const tables = ["remote_approval_decisions", "remote_approval_challenges", "remote_approval_requests", "mobile_sessions", "mobile_devices", "sales", "memberships", "roles", "stores"];
    for (const t of tables) {
      await db.execute(sql.raw(`DELETE FROM ${t} WHERE tenant_id = '${tenantId}'`));
    }
    await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${ownerUserId}::uuid, ${staffUserId}::uuid)`);
    await db.execute(sql`SET session_replication_role = 'origin'`);
  });

  it("enforces device approval lifecycle and prevents login before approval", async () => {
    const devUuid = `dev_${Date.now()}`;
    await expect(loginMobile(db, { email: ownerEmail, password: "pass123", deviceUuid: devUuid, deviceName: "Owner iPhone", platform: "ios" })).rejects.toThrow("DEVICE_PENDING_ENROLLMENT");

    const devRes = await db.execute(sql`SELECT id FROM mobile_devices WHERE device_uuid = ${devUuid}`);
    const devId = (devRes.rows[0] as Record<string, unknown>).id as string;
    await approveDevice(db, tenantId, devId);

    const loginRes = await loginMobile(db, { email: ownerEmail, password: "pass123", deviceUuid: devUuid, deviceName: "Owner iPhone", platform: "ios" });
    expect(loginRes.accessToken).toBeDefined();
    expect(loginRes.refreshToken).toBeDefined();
    expect(loginRes.user.role).toBe("owner");
  });

  it("handles token rotation and immediately revokes token family on consumed token replay", async () => {
    const devUuid = `dev_rot_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId, userId: ownerUserId, deviceName: "Pixel 8", platform: "android", deviceUuid: devUuid });
    await approveDevice(db, tenantId, dev.id);

    const loginRes = await loginMobile(db, { email: ownerEmail, password: "pass123", deviceUuid: devUuid, deviceName: "Pixel 8", platform: "android" });
    const gen1Refresh = loginRes.refreshToken;

    const rot1 = await refreshMobileSession(db, { refreshToken: gen1Refresh });
    expect(rot1.accessToken).toBeDefined();
    expect(rot1.refreshToken).not.toBe(gen1Refresh);

    await expect(refreshMobileSession(db, { refreshToken: gen1Refresh })).rejects.toThrow("TOKEN_REUSE_DETECTED");
    await expect(refreshMobileSession(db, { refreshToken: rot1.refreshToken })).rejects.toThrow("SESSION_REVOKED_OR_EXPIRED");
  });

  it("immediately rejects valid JWT when device is revoked", async () => {
    const devUuid = `dev_jwt_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId, userId: ownerUserId, deviceName: "iPad", platform: "ios", deviceUuid: devUuid });
    await approveDevice(db, tenantId, dev.id);

    const loginRes = await loginMobile(db, { email: ownerEmail, password: "pass123", deviceUuid: devUuid, deviceName: "iPad", platform: "ios" });
    const validCheck = await validateMobileToken(db, loginRes.accessToken);
    expect(validCheck.valid).toBe(true);

    await revokeDevice(db, tenantId, dev.id);
    const revCheck = await validateMobileToken(db, loginRes.accessToken);
    expect(revCheck.valid).toBe(false);
  });

  it("prevents self-approval and executes remote approval atomically", async () => {
    const req = await createApprovalRequest(db, {
      tenantId, storeId, requestType: "credit_override", refId: saleId, requestedBy: staffUserId,
      payload: { refId: saleId, requestType: "credit_override", amountPaise: 50000, customerName: "Credit Cust" },
    });

    await expect(issueApprovalChallenge(db, {
      tenantId, requestId: req.id, approverUserId: staffUserId, deviceId: crypto.randomUUID(), sessionId: crypto.randomUUID(),
    })).rejects.toThrow("SELF_APPROVAL_PROHIBITED");

    const devUuid = `dev_appr_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId, userId: ownerUserId, deviceName: "Mac", platform: "ios", deviceUuid: devUuid });
    await approveDevice(db, tenantId, dev.id);
    const login = await loginMobile(db, { email: ownerEmail, password: "pass123", deviceUuid: devUuid, deviceName: "Mac", platform: "ios" });
    const payload = await validateMobileToken(db, login.accessToken);
    if (!payload.valid) throw new Error("Login failed");

    const challenge = await issueApprovalChallenge(db, {
      tenantId, requestId: req.id, approverUserId: ownerUserId,
      deviceId: payload.context.deviceId, sessionId: payload.context.sessionId,
    });
    expect(challenge.challengeToken).toBeDefined();

    const decRes = await decideApproval(db, {
      tenantId, requestId: req.id, challengeId: challenge.challengeId, challengeToken: challenge.challengeToken,
      approverUserId: ownerUserId, deviceId: payload.context.deviceId, sessionId: payload.context.sessionId,
      decision: "approved", decisionReason: "Approved for VIP customer", idempotencyKey: `idemp_${Date.now()}`,
    });
    expect(decRes.decision.decision).toBe("approved");

    const updatedReq = await db.execute(sql`SELECT status FROM remote_approval_requests WHERE id = ${req.id}::uuid`);
    expect((updatedReq.rows[0] as Record<string, unknown>).status).toBe("approved");
  });

  it("rejects decision when approval challenge has expired (>120s)", async () => {
    const req = await createApprovalRequest(db, {
      tenantId, storeId, requestType: "credit_override", refId: saleId, requestedBy: staffUserId,
      payload: { refId: saleId, requestType: "credit_override", amountPaise: 15000 },
    });

    const devUuid = `dev_exp_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId, userId: ownerUserId, deviceName: "Exp Device", platform: "ios", deviceUuid: devUuid });
    await approveDevice(db, tenantId, dev.id);
    const login = await loginMobile(db, { email: ownerEmail, password: "pass123", deviceUuid: devUuid, deviceName: "Exp Device", platform: "ios" });
    const auth = await validateMobileToken(db, login.accessToken);
    if (!auth.valid) throw new Error("Auth failed");

    const challenge = await issueApprovalChallenge(db, {
      tenantId, requestId: req.id, approverUserId: ownerUserId,
      deviceId: auth.context.deviceId, sessionId: auth.context.sessionId,
    });

    await db.execute(sql`UPDATE remote_approval_challenges SET expires_at = now() - interval '5 seconds' WHERE id = ${challenge.challengeId}::uuid`);

    await expect(decideApproval(db, {
      tenantId, requestId: req.id, challengeId: challenge.challengeId, challengeToken: challenge.challengeToken,
      approverUserId: ownerUserId, deviceId: auth.context.deviceId, sessionId: auth.context.sessionId,
      decision: "approved", idempotencyKey: `idemp_exp_${Date.now()}`,
    })).rejects.toThrow("CHALLENGE_EXPIRED");
  });

  it("handles decision idempotency: replay returns existing decision with replayed flag", async () => {
    const req = await createApprovalRequest(db, {
      tenantId, storeId, requestType: "credit_override", refId: saleId, requestedBy: staffUserId,
      payload: { refId: saleId, requestType: "credit_override", amountPaise: 30000 },
    });

    const devUuid = `dev_idemp_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId, userId: ownerUserId, deviceName: "Idemp Device", platform: "android", deviceUuid: devUuid });
    await approveDevice(db, tenantId, dev.id);
    const login = await loginMobile(db, { email: ownerEmail, password: "pass123", deviceUuid: devUuid, deviceName: "Idemp Device", platform: "android" });
    const auth = await validateMobileToken(db, login.accessToken);
    if (!auth.valid) throw new Error("Auth failed");

    const challenge = await issueApprovalChallenge(db, {
      tenantId, requestId: req.id, approverUserId: ownerUserId,
      deviceId: auth.context.deviceId, sessionId: auth.context.sessionId,
    });

    const idempKey = `idemp_replay_${Date.now()}`;
    const res1 = await decideApproval(db, {
      tenantId, requestId: req.id, challengeId: challenge.challengeId, challengeToken: challenge.challengeToken,
      approverUserId: ownerUserId, deviceId: auth.context.deviceId, sessionId: auth.context.sessionId,
      decision: "rejected", decisionReason: "Exceeded credit risk", idempotencyKey: idempKey,
    });
    expect(res1.decision.decision).toBe("rejected");
    expect(res1.replayed).toBeFalsy();

    const res2 = await decideApproval(db, {
      tenantId, requestId: req.id, challengeId: challenge.challengeId, challengeToken: challenge.challengeToken,
      approverUserId: ownerUserId, deviceId: auth.context.deviceId, sessionId: auth.context.sessionId,
      decision: "rejected", idempotencyKey: idempKey,
    });
    expect(res2.replayed).toBe(true);
    expect(res2.decision.id).toBe(res1.decision.id);
  });
});
