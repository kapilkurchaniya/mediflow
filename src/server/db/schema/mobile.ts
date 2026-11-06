/** Mobile App & Management Schema (Lane A: A5.7) */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, createdAt } from "./_helpers";
import { memberships, stores, tenants, users } from "./platform";
import { sales } from "./sales";

export const mobileDevices = pgTable(
  "mobile_devices",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    deviceName: text("device_name").notNull(),
    platform: text("platform").notNull(), // 'ios' | 'android'
    deviceUuid: text("device_uuid").notNull(),
    enrollmentStatus: text("enrollment_status").notNull().default("pending"), // 'pending' | 'enrolled' | 'revoked'
    pushToken: text("push_token"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_mobile_device_uuid").on(t.tenantId, t.userId, t.deviceUuid),
    uniqueIndex("uq_mobile_device_tenant_user").on(t.tenantId, t.userId, t.id),
    check("chk_device_platform", sql`${t.platform} IN ('ios', 'android')`),
    check("chk_device_status", sql`${t.enrollmentStatus} IN ('pending', 'enrolled', 'revoked')`),
  ],
);

export const mobileSessions = pgTable(
  "mobile_sessions",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    deviceId: uuid("device_id").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    familyId: uuid("family_id").notNull().defaultRandom(),
    sessionVersion: integer("session_version").notNull().default(1),
    isConsumed: text("is_consumed").notNull().default("false"), // stored as boolean in DB
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_mobile_refresh_token_hash").on(t.refreshTokenHash),
    uniqueIndex("uq_mobile_sessions_composite").on(t.tenantId, t.userId, t.deviceId, t.id),
    index("idx_mobile_sessions_family").on(t.tenantId, t.familyId),
    foreignKey({
      columns: [t.tenantId, t.userId, t.deviceId],
      foreignColumns: [mobileDevices.tenantId, mobileDevices.userId, mobileDevices.id],
      name: "fk_session_device",
    }).onDelete("restrict"),
  ],
);

export const remoteApprovalRequests = pgTable(
  "remote_approval_requests",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    storeId: uuid("store_id").notNull(),
    requestType: text("request_type").notNull(), // 'credit_override' | 'po_limit'
    refId: uuid("ref_id").notNull(),
    requestedBy: uuid("requested_by").notNull(),
    snapshotPayload: jsonb("snapshot_payload").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected' | 'expired'
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_approval_request_tenant").on(t.tenantId, t.id),
    check("chk_approval_req_type", sql`${t.requestType} IN ('credit_override', 'po_limit')`),
    check("chk_approval_req_status", sql`${t.status} IN ('pending', 'approved', 'rejected', 'expired')`),
    foreignKey({
      columns: [t.tenantId, t.storeId],
      foreignColumns: [stores.tenantId, stores.id],
      name: "fk_approval_req_store",
    }),
  ],
);

export const remoteApprovalChallenges = pgTable(
  "remote_approval_challenges",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    requestId: uuid("request_id").notNull(),
    approverUserId: uuid("approver_user_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    challengeTokenHash: text("challenge_token_hash").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    isConsumed: text("is_consumed").notNull().default("false"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_approval_challenge_token").on(t.challengeTokenHash),
    uniqueIndex("uq_approval_challenge_actor").on(t.tenantId, t.approverUserId, t.id),
    foreignKey({
      columns: [t.tenantId, t.requestId],
      foreignColumns: [remoteApprovalRequests.tenantId, remoteApprovalRequests.id],
      name: "fk_challenge_request",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.approverUserId, t.deviceId, t.sessionId],
      foreignColumns: [mobileSessions.tenantId, mobileSessions.userId, mobileSessions.deviceId, mobileSessions.id],
      name: "fk_challenge_session_device",
    }),
  ],
);

export const remoteApprovalDecisions = pgTable(
  "remote_approval_decisions",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    requestId: uuid("request_id").notNull(),
    challengeId: uuid("challenge_id").notNull(),
    decidedBy: uuid("decided_by").notNull(),
    decision: text("decision").notNull(), // 'approved' | 'rejected'
    decisionReason: text("decision_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_approval_request_decision").on(t.tenantId, t.requestId),
    uniqueIndex("uq_approval_idempotency").on(t.tenantId, t.idempotencyKey),
    check("chk_approval_decision", sql`${t.decision} IN ('approved', 'rejected')`),
    foreignKey({
      columns: [t.tenantId, t.requestId],
      foreignColumns: [remoteApprovalRequests.tenantId, remoteApprovalRequests.id],
      name: "fk_decision_request",
    }),
    foreignKey({
      columns: [t.tenantId, t.decidedBy, t.challengeId],
      foreignColumns: [remoteApprovalChallenges.tenantId, remoteApprovalChallenges.approverUserId, remoteApprovalChallenges.id],
      name: "fk_decision_challenge_actor",
    }),
  ],
);

export const deliveryOrders = pgTable(
  "delivery_orders",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    storeId: uuid("store_id").notNull(),
    saleId: uuid("sale_id").notNull(),
    deliveryStaffUserId: uuid("delivery_staff_user_id"),
    deliveryStatus: text("delivery_status").notNull().default("assigned"), // 'assigned' | 'in_transit' | 'delivered' | 'failed'
    paymentStatus: text("payment_status").notNull().default("pending"), // 'pending' | 'intent_created' | 'collected' | 'verified'
    deliveryAddress: text("delivery_address").notNull(),
    recipientName: text("recipient_name").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_delivery_order_tenant").on(t.tenantId, t.id),
    index("idx_delivery_staff_assigned").on(t.tenantId, t.storeId, t.deliveryStaffUserId, t.deliveryStatus),
    check("chk_deliv_status", sql`${t.deliveryStatus} IN ('assigned', 'in_transit', 'delivered', 'failed')`),
    check("chk_deliv_pay_status", sql`${t.paymentStatus} IN ('pending', 'intent_created', 'collected', 'verified')`),
    foreignKey({
      columns: [t.tenantId, t.storeId],
      foreignColumns: [stores.tenantId, stores.id],
      name: "fk_delivery_store",
    }),
  ],
);

export const deliveryEvents = pgTable(
  "delivery_events",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    deliveryOrderId: uuid("delivery_order_id").notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    prevAssigneeId: uuid("prev_assignee_id"),
    newAssigneeId: uuid("new_assignee_id"),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    check("chk_event_type", sql`${t.eventType} IN ('assigned', 'reassigned', 'in_transit', 'delivered', 'failed', 'proof_uploaded')`),
    foreignKey({
      columns: [t.tenantId, t.deliveryOrderId],
      foreignColumns: [deliveryOrders.tenantId, deliveryOrders.id],
      name: "fk_event_order",
    }).onDelete("restrict"),
  ],
);

export const deliveryProofs = pgTable(
  "delivery_proofs",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    deliveryOrderId: uuid("delivery_order_id").notNull(),
    proofType: text("proof_type").notNull(), // 'delivery_photo' | 'recipient_signature'
    fileKey: text("file_key").notNull(),
    fileType: text("file_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    uploadStatus: text("upload_status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_proof_idempotency").on(t.tenantId, t.idempotencyKey),
    check("chk_proof_type", sql`${t.proofType} IN ('delivery_photo', 'recipient_signature')`),
    check("chk_proof_mime", sql`${t.fileType} IN ('image/jpeg', 'image/png', 'application/pdf')`),
    check("chk_proof_size", sql`${t.fileSizeBytes} > 0 AND ${t.fileSizeBytes} <= 10485760`),
    check("chk_proof_status", sql`${t.uploadStatus} IN ('pending', 'completed', 'failed')`),
    foreignKey({
      columns: [t.tenantId, t.deliveryOrderId],
      foreignColumns: [deliveryOrders.tenantId, deliveryOrders.id],
      name: "fk_proof_order",
    }).onDelete("restrict"),
  ],
);

export const deliveryPaymentIntents = pgTable(
  "delivery_payment_intents",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    deliveryOrderId: uuid("delivery_order_id").notNull(),
    provider: text("provider").notNull().default("razorpay"),
    providerQrId: text("provider_qr_id").notNull(),
    providerOrderRef: text("provider_order_ref").notNull(),
    providerPaymentId: text("provider_payment_id"),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    qrPayload: text("qr_payload").notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'verified' | 'failed' | 'expired'
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_delivery_order_ref").on(t.tenantId, t.providerOrderRef),
    uniqueIndex("uq_mobile_intent_provider_qr").on(t.provider, t.providerQrId),
    uniqueIndex("uq_mobile_intent_provider_payment").on(t.tenantId, t.providerPaymentId),
    check("chk_intent_provider", sql`${t.provider} IN ('razorpay', 'mock')`),
    check("chk_intent_status", sql`${t.status} IN ('pending', 'verified', 'failed', 'expired')`),
    foreignKey({
      columns: [t.tenantId, t.deliveryOrderId],
      foreignColumns: [deliveryOrders.tenantId, deliveryOrders.id],
      name: "fk_intent_order",
    }),
  ],
);

export const deliveryPaymentWebhooks = pgTable(
  "delivery_payment_webhooks",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerPaymentId: text("provider_payment_id"),
    eventType: text("event_type").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'processed' | 'ignored' | 'failed'
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_payment_webhook_event").on(t.provider, t.providerEventId),
    check("chk_webhook_status", sql`${t.status} IN ('pending', 'processing', 'processed', 'ignored', 'failed')`),
  ],
);
