import { schema, type Tx } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import type { RecordAuditCountsParams } from "./types";

/**
 * Records physical counted quantities submitted by staff.
 * If in blind count mode, staff does not see system quantity on input.
 * Records the observation timestamp (countedAt) used as the cutoff
 * for movement-aware reconciliation.
 */
export async function recordStockAuditCounts(
  tx: Tx,
  params: RecordAuditCountsParams
) {
  const { tenantId, sessionId, counts, userId } = params;

  if (counts.length === 0) {
    throw new DomainError("EMPTY_COUNTS", "No count updates provided");
  }

  const [session] = await tx
    .select()
    .from(schema.stockAuditSessions)
    .where(
      and(
        eq(schema.stockAuditSessions.id, sessionId),
        eq(schema.stockAuditSessions.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Stock audit session not found");
  }

  if (session.status === "approved" || session.status === "cancelled") {
    throw new DomainError(
      "SESSION_CLOSED",
      `Cannot record counts on a ${session.status} audit session`
    );
  }

  const now = new Date();

  for (const c of counts) {
    if (c.countedQty < 0) {
      throw new DomainError(
        "INVALID_COUNT",
        "Counted quantity cannot be negative"
      );
    }

    const [item] = await tx
      .select()
      .from(schema.stockAuditItems)
      .where(
        and(
          eq(schema.stockAuditItems.id, c.itemId),
          eq(schema.stockAuditItems.sessionId, sessionId),
          eq(schema.stockAuditItems.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!item) continue;

    const observationTime = c.observedAt ? new Date(c.observedAt) : now;
    const varianceQty = c.countedQty - item.systemQty;
    const varianceCostPaise = varianceQty * item.unitCostPaise;

    await tx
      .update(schema.stockAuditItems)
      .set({
        countedQty: c.countedQty,
        varianceQty,
        varianceCostPaise,
        status: "counted",
        countedBy: userId,
        countedAt: observationTime,
      })
      .where(eq(schema.stockAuditItems.id, c.itemId));
  }

  // Update session status to under_review
  await tx
    .update(schema.stockAuditSessions)
    .set({
      status: "under_review",
    })
    .where(eq(schema.stockAuditSessions.id, sessionId));

  return { success: true, updatedCount: counts.length };
}
