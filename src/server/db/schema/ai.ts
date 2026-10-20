/** AI: assistant action log. (Lane B) */
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, createdAt } from "./_helpers";
import { tenantId } from "./platform";

export const aiActions = pgTable(
  "ai_actions",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"),
    userId: uuid("user_id").notNull(),
    channel: text("channel").notNull().default("chat"), // chat | voice
    input: text("input").notNull(),
    intent: text("intent"),
    tool: text("tool"),
    arguments: jsonb("arguments"),
    result: jsonb("result"),
    safetyLevel: integer("safety_level").notNull().default(1),
    status: text("status").notNull().default("done"), // done | pending_confirmation | confirmed | cancelled | rejected | error
    model: text("model"),
    latencyMs: integer("latency_ms"),
    approvedBy: uuid("approved_by"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_actions_tenant_idx").on(t.tenantId, t.createdAt)],
);
