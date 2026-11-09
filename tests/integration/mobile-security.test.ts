/** Integration Tests for Mobile Security, Isolation & Replay Revocation (Lane A: A5.7.9) */
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

describe("Mobile Security, Multi-Tenant Isolation & Replay Suite", () => {
  let tenant1Id: string;
  let tenant2Id: string;
  let store1Id: string;
  let store2Id: string;
  let owner1UserId: string;
  let staff1UserId: string;
  let owner2UserId: string;
  let owner1Email: string;

  beforeAll(async () => {
    tenant1Id = crypto.randomUUID();
    tenant2Id = crypto.randomUUID();
    store1Id = crypto.randomUUID();
    store2Id = crypto.randomUUID();
    owner1UserId = crypto.randomUUID();
    staff1UserId = crypto.randomUUID();
    owner2UserId = crypto.randomUUID();
    owner1Email = `sec_owner1_${tenant1Id.slice(0, 8)}@test.com`;
    const staff1Email = `sec_staff1_${tenant1Id.slice(0, 8)}@test.com`;
    const owner2Email = `sec_owner2_${tenant2Id.slice(0, 8)}@test.com`;

    const pwHash = await bcrypt.hash("pass123", 4);

    await db.execute(sql`INSERT INTO tenants (id, name, legal_name) VALUES (${tenant1Id}::uuid, 'Sec T1', 'Sec T1 Legal')`);
    await db.execute(sql`INSERT INTO tenants (id, name, legal_name) VALUES (${tenant2Id}::uuid, 'Sec T2', 'Sec T2 Legal')`);
    await db.execute(sql`INSERT INTO stores (id, tenant_id, name, code, state_code) VALUES (${store1Id}::uuid, ${tenant1Id}::uuid, 'Store 1', 'ST1', 'MH')`);
    await db.execute(sql`INSERT INTO stores (id, tenant_id, name, code, state_code) VALUES (${store2Id}::uuid, ${tenant2Id}::uuid, 'Store 2', 'ST2', 'DL')`);

    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${owner1UserId}::uuid, 'Owner 1', ${owner1Email}, ${pwHash})`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${staff1UserId}::uuid, 'Staff 1', ${staff1Email}, ${pwHash})`);
    await db.execute(sql`INSERT INTO users (id, name, email, password_hash) VALUES (${owner2UserId}::uuid, 'Owner 2', ${owner2Email}, ${pwHash})`);

    await db.execute(sql`INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES (gen_random_uuid(), ${tenant1Id}::uuid, 'owner', 'Owner', true) ON CONFLICT DO NOTHING`);
    await db.execute(sql`INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES (gen_random_uuid(), ${tenant1Id}::uuid, 'delivery_staff', 'Delivery Staff', true) ON CONFLICT DO NOTHING`);
    await db.execute(sql`INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES (gen_random_uuid(), ${tenant2Id}::uuid, 'owner', 'Owner', true) ON CONFLICT DO NOTHING`);

    await db.execute(sql`
      INSERT INTO memberships (id, tenant_id, user_id, role_id, status, all_stores, store_ids)
      SELECT gen_random_uuid(), ${tenant1Id}::uuid, ${owner1UserId}::uuid, id, 'active', true, ARRAY[${store1Id}::uuid]
      FROM roles WHERE tenant_id = ${tenant1Id}::uuid AND key = 'owner'
    `);
    await db.execute(sql`
      INSERT INTO memberships (id, tenant_id, user_id, role_id, status, all_stores, store_ids)
      SELECT gen_random_uuid(), ${tenant1Id}::uuid, ${staff1UserId}::uuid, id, 'active', false, ARRAY[${store1Id}::uuid]
      FROM roles WHERE tenant_id = ${tenant1Id}::uuid AND key = 'delivery_staff'
    `);
    await db.execute(sql`
      INSERT INTO memberships (id, tenant_id, user_id, role_id, status, all_stores, store_ids)
      SELECT gen_random_uuid(), ${tenant2Id}::uuid, ${owner2UserId}::uuid, id, 'active', true, ARRAY[${store2Id}::uuid]
      FROM roles WHERE tenant_id = ${tenant2Id}::uuid AND key = 'owner'
    `);
  });

  afterAll(async () => {
    await db.execute(sql`SET session_replication_role = 'replica'`);
    await db.execute(sql`DELETE FROM remote_approval_challenges WHERE tenant_id IN (${tenant1Id}::uuid, ${tenant2Id}::uuid)`);
    await db.execute(sql`DELETE FROM remote_approval_requests WHERE tenant_id IN (${tenant1Id}::uuid, ${tenant2Id}::uuid)`);
    await db.execute(sql`DELETE FROM mobile_sessions WHERE tenant_id IN (${tenant1Id}::uuid, ${tenant2Id}::uuid)`);
    await db.execute(sql`DELETE FROM mobile_devices WHERE tenant_id IN (${tenant1Id}::uuid, ${tenant2Id}::uuid)`);
    await db.execute(sql`DELETE FROM memberships WHERE tenant_id IN (${tenant1Id}::uuid, ${tenant2Id}::uuid)`);
    await db.execute(sql`DELETE FROM roles WHERE tenant_id IN (${tenant1Id}::uuid, ${tenant2Id}::uuid)`);
    await db.execute(sql`DELETE FROM stores WHERE tenant_id IN (${tenant1Id}::uuid, ${tenant2Id}::uuid)`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${owner1UserId}::uuid, ${staff1UserId}::uuid, ${owner2UserId}::uuid)`);
    await db.execute(sql`DELETE FROM tenants WHERE id IN (${tenant1Id}::uuid, ${tenant2Id}::uuid)`);
    await db.execute(sql`SET session_replication_role = 'origin'`);
  });

  it("proves refresh replay commits family revocation to PostgreSQL before error return", async () => {
    const devUuid = `dev_replay_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId: tenant1Id, userId: owner1UserId, deviceName: "DevReplay", platform: "android", deviceUuid: devUuid });
    await approveDevice(db, tenant1Id, dev.id);

    const loginRes = await loginMobile(db, {
      email: owner1Email,
      password: "pass123",
      deviceUuid: devUuid,
      deviceName: "DevReplay",
      platform: "android",
    });

    const tokenGen1 = loginRes.refreshToken;
    const tokenGen2 = await refreshMobileSession(db, { refreshToken: tokenGen1 });

    // Present consumed tokenGen1: must throw TOKEN_REUSE_DETECTED
    await expect(refreshMobileSession(db, { refreshToken: tokenGen1 })).rejects.toThrow("TOKEN_REUSE_DETECTED");

    // Independently query PostgreSQL to assert family revocation persisted
    const sessions = await db.execute(sql`
      SELECT id, revoked_at FROM mobile_sessions
      WHERE tenant_id = ${tenant1Id}::uuid AND device_id = ${dev.id}::uuid
    `);

    expect(sessions.rows.length).toBeGreaterThanOrEqual(2);
    for (const s of sessions.rows as Record<string, unknown>[]) {
      expect(s.revoked_at).not.toBeNull();
    }

    // Token Gen 2 is now rejected
    await expect(refreshMobileSession(db, { refreshToken: tokenGen2.refreshToken })).rejects.toThrow("SESSION_REVOKED_OR_EXPIRED");
  });

  it("immediately rejects valid access JWT when membership is suspended", async () => {
    const devUuid = `dev_suspend_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId: tenant1Id, userId: owner1UserId, deviceName: "SuspendPad", platform: "ios", deviceUuid: devUuid });
    await approveDevice(db, tenant1Id, dev.id);
    const login = await loginMobile(db, { email: owner1Email, password: "pass123", deviceUuid: devUuid, deviceName: "SuspendPad", platform: "ios" });

    const check1 = await validateMobileToken(db, login.accessToken);
    expect(check1.valid).toBe(true);

    // Suspend membership
    await db.execute(sql`UPDATE memberships SET status = 'suspended' WHERE tenant_id = ${tenant1Id}::uuid AND user_id = ${owner1UserId}::uuid`);

    const check2 = await validateMobileToken(db, login.accessToken);
    expect(check2.valid).toBe(false);

    // Restore membership
    await db.execute(sql`UPDATE memberships SET status = 'active' WHERE tenant_id = ${tenant1Id}::uuid AND user_id = ${owner1UserId}::uuid`);
  });

  it("rejects approval challenge when approver presents device from different session", async () => {
    const saleId = crypto.randomUUID();
    const req = await createApprovalRequest(db, {
      tenantId: tenant1Id,
      storeId: store1Id,
      requestType: "credit_override",
      refId: saleId,
      requestedBy: staff1UserId,
      payload: { refId: saleId, requestType: "credit_override", amountPaise: 25000 },
    });

    // Mismatched device and session IDs
    await expect(
      issueApprovalChallenge(db, {
        tenantId: tenant1Id,
        requestId: req.id,
        approverUserId: owner1UserId,
        deviceId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it("enforces cross-tenant isolation: tenant2 cannot view or approve tenant1 requests", async () => {
    const saleId = crypto.randomUUID();
    const req = await createApprovalRequest(db, {
      tenantId: tenant1Id,
      storeId: store1Id,
      requestType: "credit_override",
      refId: saleId,
      requestedBy: staff1UserId,
      payload: { refId: saleId, requestType: "credit_override", amountPaise: 15000 },
    });

    // Tenant 2 attempts to issue challenge on Tenant 1 request
    await expect(
      issueApprovalChallenge(db, {
        tenantId: tenant2Id,
        requestId: req.id,
        approverUserId: owner2UserId,
        deviceId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("REQUEST_NOT_FOUND");
  });

  it("rejects token validation when device is explicitly revoked", async () => {
    const devUuid = `dev_rev_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId: tenant1Id, userId: owner1UserId, deviceName: "RevDevice", platform: "ios", deviceUuid: devUuid });
    await approveDevice(db, tenant1Id, dev.id);
    const login = await loginMobile(db, { email: owner1Email, password: "pass123", deviceUuid: devUuid, deviceName: "RevDevice", platform: "ios" });

    await revokeDevice(db, tenant1Id, dev.id);
    const check = await validateMobileToken(db, login.accessToken);
    expect(check.valid).toBe(false);
  });

  it("rejects decision execution when challenge token is tampered or invalid", async () => {
    const saleId = crypto.randomUUID();
    const req = await createApprovalRequest(db, {
      tenantId: tenant1Id,
      storeId: store1Id,
      requestType: "credit_override",
      refId: saleId,
      requestedBy: staff1UserId,
      payload: { refId: saleId, requestType: "credit_override", amountPaise: 18000 },
    });

    const devUuid = `dev_tamp_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId: tenant1Id, userId: owner1UserId, deviceName: "TampDevice", platform: "ios", deviceUuid: devUuid });
    await approveDevice(db, tenant1Id, dev.id);
    const login = await loginMobile(db, { email: owner1Email, password: "pass123", deviceUuid: devUuid, deviceName: "TampDevice", platform: "ios" });
    const auth = await validateMobileToken(db, login.accessToken);
    if (!auth.valid) throw new Error("Auth failed");

    const challenge = await issueApprovalChallenge(db, {
      tenantId: tenant1Id,
      requestId: req.id,
      approverUserId: owner1UserId,
      deviceId: auth.context.deviceId,
      sessionId: auth.context.sessionId,
    });

    // Attempt decision with a forged challenge token
    await expect(
      decideApproval(db, {
        tenantId: tenant1Id,
        requestId: req.id,
        challengeId: challenge.challengeId,
        challengeToken: "forged_hex_challenge_token_0123456789abcdef",
        approverUserId: owner1UserId,
        deviceId: auth.context.deviceId,
        sessionId: auth.context.sessionId,
        decision: "approved",
        idempotencyKey: `idemp_tamp_${Date.now()}`,
      }),
    ).rejects.toThrow("INVALID_CHALLENGE_TOKEN");
  });

  it("immediately invalidates active access token when session is revoked in database", async () => {
    const devUuid = `dev_sess_rev_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId: tenant1Id, userId: owner1UserId, deviceName: "SessRevPad", platform: "android", deviceUuid: devUuid });
    await approveDevice(db, tenant1Id, dev.id);
    const login = await loginMobile(db, { email: owner1Email, password: "pass123", deviceUuid: devUuid, deviceName: "SessRevPad", platform: "android" });

    const check1 = await validateMobileToken(db, login.accessToken);
    expect(check1.valid).toBe(true);

    // Revoke the session row directly
    if (check1.valid) {
      await db.execute(sql`
        UPDATE mobile_sessions
        SET revoked_at = now()
        WHERE id = ${check1.context.sessionId}::uuid
      `);
    }

    const check2 = await validateMobileToken(db, login.accessToken);
    expect(check2.valid).toBe(false);
    if (!check2.valid) {
      expect(check2.error).toBe("SESSION_REVOKED");
    }
  });

  it("enforces staff store scope: delivery staff receives constrained store list without allStores access", async () => {
    const devUuid = `dev_staff_scope_${Date.now()}`;
    const dev = await registerDevice(db, { tenantId: tenant1Id, userId: staff1UserId, deviceName: "StaffPhone", platform: "android", deviceUuid: devUuid });
    await approveDevice(db, tenant1Id, dev.id);

    const staffEmail = `sec_staff1_${tenant1Id.slice(0, 8)}@test.com`;
    const login = await loginMobile(db, { email: staffEmail, password: "pass123", deviceUuid: devUuid, deviceName: "StaffPhone", platform: "android" });
    const check = await validateMobileToken(db, login.accessToken);

    expect(check.valid).toBe(true);
    if (check.valid) {
      expect(check.context.role).toBe("delivery_staff");
      expect(check.context.allStores).toBe(false);
      expect(check.context.storeIds).toContain(store1Id);
      expect(check.context.storeIds).not.toContain(store2Id);
    }
  });
});
