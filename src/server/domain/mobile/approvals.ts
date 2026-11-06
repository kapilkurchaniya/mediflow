/** Remote Approvals Framework: Anti-Replay, Session Binding & Atomic Domain Execution (Lane A: A5.7.5) */
import crypto from "crypto";
import { sql, and, eq } from "drizzle-orm";
import { db as defaultDb } from "../../db";
import {
  remoteApprovalRequests,
  remoteApprovalChallenges,
  remoteApprovalDecisions,
} from "../../db/schema/mobile";
import { sha256 } from "./auth";

export interface ApprovalSnapshot {
  refId: string;
  requestType: "credit_override" | "po_limit";
  amountPaise: number;
  customerId?: string;
  customerName?: string;
  orderId?: string;
  requestedReason?: string;
  details?: Record<string, unknown>;
}

export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(",")}]`;
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
}

export async function createApprovalRequest(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    storeId: string;
    requestType: "credit_override" | "po_limit";
    refId: string;
    requestedBy: string;
    payload: ApprovalSnapshot;
    ttlHours?: number;
  },
) {
  const canonicalStr = canonicalJson(input.payload);
  const snapshotHash = sha256(canonicalStr);
  const ttl = input.ttlHours || 24;
  const expiresAt = new Date(Date.now() + ttl * 3600 * 1000);

  const [req] = await db
    .insert(remoteApprovalRequests)
    .values({
      tenantId: input.tenantId,
      storeId: input.storeId,
      requestType: input.requestType,
      refId: input.refId,
      requestedBy: input.requestedBy,
      snapshotPayload: input.payload,
      snapshotHash,
      status: "pending",
      expiresAt,
    })
    .returning();
  return req;
}

export async function listPendingApprovals(
  db: typeof defaultDb,
  input: { tenantId: string; storeId?: string; approverUserId: string },
) {
  const storeFilter = input.storeId ? sql`AND r.store_id = ${input.storeId}::uuid` : sql``;
  const res = await db.execute(sql`
    SELECT r.id, r.tenant_id, r.store_id, r.request_type, r.ref_id, r.requested_by,
           r.snapshot_payload, r.snapshot_hash, r.status, r.expires_at, r.created_at,
           u.name as requester_name, u.email as requester_email,
           st.name as store_name
    FROM remote_approval_requests r
    JOIN users u ON r.requested_by = u.id
    JOIN stores st ON r.store_id = st.id
    WHERE r.tenant_id = ${input.tenantId}::uuid
      AND r.status = 'pending'
      AND r.expires_at > now()
      AND r.requested_by <> ${input.approverUserId}::uuid
      ${storeFilter}
    ORDER BY r.created_at DESC
  `);
  return res.rows;
}

export async function issueApprovalChallenge(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    requestId: string;
    approverUserId: string;
    deviceId: string;
    sessionId: string;
  },
) {
  return await db.transaction(async (tx) => {
    // 1. Lock the request to serialize challenge issuance
    const reqRes = await tx.execute(sql`
      SELECT id, tenant_id, requested_by, snapshot_hash, status, expires_at
      FROM remote_approval_requests
      WHERE id = ${input.requestId}::uuid AND tenant_id = ${input.tenantId}::uuid
      FOR UPDATE
    `);
    const req = reqRes.rows[0] as Record<string, unknown> | undefined;
    if (!req) throw new Error("REQUEST_NOT_FOUND");
    if (req.status !== "pending") throw new Error(`REQUEST_NOT_PENDING: Request status is ${req.status}`);
    if (new Date(req.expires_at as string) <= new Date()) throw new Error("REQUEST_EXPIRED");
    if (req.requested_by === input.approverUserId) {
      throw new Error("SELF_APPROVAL_PROHIBITED: Requester cannot approve their own request");
    }

    // 2. Invalidate any prior unconsumed challenges for this approver/request
    await tx.execute(sql`
      UPDATE remote_approval_challenges
      SET is_consumed = 'true'
      WHERE tenant_id = ${input.tenantId}::uuid
        AND request_id = ${input.requestId}::uuid
        AND approver_user_id = ${input.approverUserId}::uuid
        AND is_consumed = 'false'
    `);

    // 3. Issue fresh 120-second challenge
    const rawChallengeToken = crypto.randomBytes(32).toString("hex");
    const challengeTokenHash = sha256(rawChallengeToken);
    const expiresAt = new Date(Date.now() + 120 * 1000); // 120 seconds

    const [challenge] = await tx
      .insert(remoteApprovalChallenges)
      .values({
        tenantId: input.tenantId,
        requestId: input.requestId,
        approverUserId: input.approverUserId,
        deviceId: input.deviceId,
        sessionId: input.sessionId,
        challengeTokenHash,
        snapshotHash: req.snapshot_hash as string,
        isConsumed: "false",
        expiresAt,
      })
      .returning();

    return {
      challengeId: challenge.id,
      challengeToken: rawChallengeToken,
      snapshotHash: req.snapshot_hash,
      expiresAt: challenge.expiresAt,
    };
  });
}

export async function decideApproval(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    requestId: string;
    challengeId: string;
    challengeToken: string;
    approverUserId: string;
    deviceId: string;
    sessionId: string;
    decision: "approved" | "rejected";
    decisionReason?: string;
    idempotencyKey: string;
  },
) {
  return await db.transaction(async (tx) => {
    // 1. Check idempotency
    const existingDecision = await tx
      .select()
      .from(remoteApprovalDecisions)
      .where(and(eq(remoteApprovalDecisions.tenantId, input.tenantId), eq(remoteApprovalDecisions.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existingDecision[0]) {
      return { decision: existingDecision[0], replayed: true };
    }

    // 2. Lock request row FOR UPDATE
    const reqRes = await tx.execute(sql`
      SELECT id, tenant_id, store_id, request_type, ref_id, requested_by, snapshot_payload, snapshot_hash, status, expires_at
      FROM remote_approval_requests
      WHERE id = ${input.requestId}::uuid AND tenant_id = ${input.tenantId}::uuid
      FOR UPDATE
    `);
    const req = reqRes.rows[0] as Record<string, unknown> | undefined;
    if (!req) throw new Error("REQUEST_NOT_FOUND");
    if (req.status !== "pending") throw new Error(`REQUEST_ALREADY_DECIDED: Current status is ${req.status}`);
    if (new Date(req.expires_at as string) <= new Date()) throw new Error("REQUEST_EXPIRED");
    if (req.requested_by === input.approverUserId) {
      throw new Error("SELF_APPROVAL_PROHIBITED: Requester cannot approve their own request");
    }

    // 3. Lock challenge row FOR UPDATE and validate 4-column session binding & token
    const challengeRes = await tx.execute(sql`
      SELECT id, tenant_id, request_id, approver_user_id, device_id, session_id,
             challenge_token_hash, snapshot_hash, is_consumed, expires_at
      FROM remote_approval_challenges
      WHERE id = ${input.challengeId}::uuid AND tenant_id = ${input.tenantId}::uuid
      FOR UPDATE
    `);
    const ch = challengeRes.rows[0] as Record<string, unknown> | undefined;
    if (!ch) throw new Error("CHALLENGE_NOT_FOUND");
    if (ch.request_id !== input.requestId) throw new Error("CHALLENGE_REQUEST_MISMATCH");
    if (ch.approver_user_id !== input.approverUserId) throw new Error("CHALLENGE_ACTOR_MISMATCH");
    if (ch.device_id !== input.deviceId || ch.session_id !== input.sessionId) {
      throw new Error("CHALLENGE_SESSION_MISMATCH: Challenge cannot be executed from another session or device");
    }
    const isConsumed = ch.is_consumed === "true" || ch.is_consumed === true;
    if (isConsumed) throw new Error("CHALLENGE_ALREADY_CONSUMED");
    if (new Date(ch.expires_at as string) <= new Date()) throw new Error("CHALLENGE_EXPIRED");

    // 4. Validate token hash & canonical snapshot hash
    const presentedTokenHash = sha256(input.challengeToken);
    if (presentedTokenHash !== ch.challenge_token_hash) throw new Error("INVALID_CHALLENGE_TOKEN");
    const recomputedHash = sha256(canonicalJson(req.snapshot_payload));
    if (recomputedHash !== req.snapshot_hash || ch.snapshot_hash !== req.snapshot_hash) {
      throw new Error("SNAPSHOT_HASH_MISMATCH: Authoritative domain payload was modified");
    }

    // 5. Consume challenge
    await tx.execute(sql`UPDATE remote_approval_challenges SET is_consumed = 'true' WHERE id = ${ch.id}::uuid`);

    // 6. Insert decision record
    const [dec] = await tx
      .insert(remoteApprovalDecisions)
      .values({
        tenantId: input.tenantId,
        requestId: input.requestId,
        challengeId: input.challengeId,
        decidedBy: input.approverUserId,
        decision: input.decision,
        decisionReason: input.decisionReason,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    // 7. If approved: execute domain operation in SAME transaction
    if (input.decision === "approved") {
      if (req.request_type === "credit_override") {
        // Enforce credit override domain execution (e.g. mark customer credit limit approved or sale released)
        await tx.execute(sql`
          UPDATE sales
          SET notes = COALESCE(notes, '') || ' [Credit Approved by Remote Manager: ' || ${input.approverUserId}::text || ']'
          WHERE id = ${req.ref_id}::uuid AND tenant_id = ${input.tenantId}::uuid
        `);
      } else if (req.request_type === "po_limit") {
        await tx.execute(sql`
          UPDATE purchases
          SET status = 'approved'
          WHERE id = ${req.ref_id}::uuid AND tenant_id = ${input.tenantId}::uuid
        `);
      }
    }

    // 8. Update request status
    await tx.execute(sql`
      UPDATE remote_approval_requests
      SET status = ${input.decision}
      WHERE id = ${input.requestId}::uuid
    `);

    return { decision: dec, replayed: false };
  });
}
