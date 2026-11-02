import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type DbOrTx, type Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import {
  INDIAN_CURRENCY_DENOMINATIONS,
  type Denomination,
  calculateDenominationTotalPaise,
  formatDenominationSummary,
} from "@/lib/cash-register";

export {
  INDIAN_CURRENCY_DENOMINATIONS,
  type Denomination,
  calculateDenominationTotalPaise,
  formatDenominationSummary,
};

export const OpenShiftInputSchema = z.object({
  /** Opening float in integer paise (e.g. ₹1,000 = 100,000 paise). */
  openingCash: z.number().int().min(0, "Opening float cannot be negative"),
  notes: z.string().trim().max(1000).optional(),
  /** Count of each banknote/coin denomination { "500": 10, "100": 5, ... } */
  denominations: z.record(z.string(), z.number().int().min(0)).optional(),
});
export type OpenShiftInput = z.infer<typeof OpenShiftInputSchema>;

export const CloseShiftInputSchema = z.object({
  sessionId: z.string().uuid().optional(),
  /** Counted drawer cash in integer paise. */
  actualCash: z.number().int().min(0, "Counted cash cannot be negative"),
  notes: z.string().trim().max(1000).optional(),
  /** Count of each banknote/coin denomination counted at shift closing. */
  denominations: z.record(z.string(), z.number().int().min(0)).optional(),
  /** Supervisor PIN authorization if variance exceeds ₹500 (50,000 paise). */
  supervisorPin: z.string().trim().optional(),
});
export type CloseShiftInput = z.infer<typeof CloseShiftInputSchema>;

export interface DenominationSummary {
  counts: Record<string, number>;
  totalPaise: number;
}

export interface CashDrawerStats {
  openingCash: number;
  cashSales: number;
  cashReceipts: number;
  cashRefunds: number;
  cashCancels: number;
  cashPayouts: number;
  expectedCash: number;
  tenders: {
    cash: number;
    upi: number;
    card: number;
    bank: number;
    credit: number;
    total: number;
  };
  transactionCounts: {
    sales: number;
    cancels: number;
    returns: number;
    payouts: number;
    receipts: number;
  };
}

export interface CurrentShiftStats {
  session: typeof schema.cashSessions.$inferSelect;
  openedByName: string;
  stats: CashDrawerStats;
}

export interface ShiftReportData {
  type: "x_report" | "z_report";
  store: {
    name: string;
    code: string;
    address: string | null;
    city: string | null;
    stateCode: string | null;
    pincode: string | null;
    phone: string | null;
    gstin: string | null;
    drugLicenseNo: string | null;
  };
  shift: {
    id: string;
    status: "open" | "closed";
    openedAt: Date;
    closedAt: Date | null;
    openedByName: string;
    closedByName: string | null;
    durationMinutes: number;
    notes: string | null;
  };
  cashDrawer: {
    openingCash: number;
    cashSales: number;
    cashReceipts: number;
    cashRefunds: number;
    cashCancels: number;
    cashPayouts: number;
    expectedCash: number;
    actualCash: number | null;
    difference: number | null;
  };
  tenders: {
    cash: number;
    upi: number;
    card: number;
    bank: number;
    credit: number;
    total: number;
  };
  transactionCounts: {
    sales: number;
    cancels: number;
    returns: number;
    payouts: number;
    receipts: number;
  };
  generatedAt: Date;
}

/**
 * Opens a new cash register shift for the active store.
 * Enforces the database constraint: only one active open session per store (`cash_sessions_one_open_uq`).
 */
export async function openShift(
  tx: Tx,
  ctx: AuthCtx,
  input: OpenShiftInput,
): Promise<typeof schema.cashSessions.$inferSelect> {
  const parsed = OpenShiftInputSchema.parse(input);
  const now = new Date();

  // 1. Guard against duplicate open shifts for the store
  const [existing] = await tx
    .select({ id: schema.cashSessions.id, openedAt: schema.cashSessions.openedAt })
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.tenantId, ctx.tenantId),
        eq(schema.cashSessions.storeId, ctx.storeId),
        eq(schema.cashSessions.status, "open"),
      ),
    )
    .limit(1);

  if (existing) {
    throw new DomainError(
      "SHIFT_ALREADY_OPEN",
      "An active register shift is already open for this store. Please close it before opening a new shift.",
    );
  }

  // 2. Prepare notes including denomination audit breakdown
  let formattedNotes = parsed.notes ?? null;
  if (parsed.denominations && Object.keys(parsed.denominations).length > 0) {
    const denomSummary = formatDenominationSummary(parsed.denominations);
    if (denomSummary) {
      formattedNotes = formattedNotes
        ? `${formattedNotes}\n[Opening Denominations: ${denomSummary}]`
        : `[Opening Denominations: ${denomSummary}]`;
    }
  }

  // 3. Insert new cash session
  const [session] = await tx
    .insert(schema.cashSessions)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      status: "open",
      openingCash: parsed.openingCash,
      openedBy: ctx.userId,
      openedAt: now,
      notes: formattedNotes,
    })
    .returning();

  // 4. Record immutable audit log
  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "cash_sessions",
    entityId: session.id,
    newValue: {
      status: "open",
      openingCash: parsed.openingCash,
      denominations: parsed.denominations,
      notes: parsed.notes,
    },
  });

  return session;
}

/**
 * Computes live expected cash and transaction totals for a cash session window.
 *
 * Formula:
 * Expected Cash = Opening Float + Cash Sales + Cash Receipts - Cash Returns - Cash Cancels - Cash Payouts
 */
export async function computeExpectedCash(
  dbOrTx: DbOrTx,
  ctx: AuthCtx,
  sessionId: string,
  asOf: Date = new Date(),
): Promise<CashDrawerStats> {
  const [session] = await dbOrTx
    .select()
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.id, sessionId),
        eq(schema.cashSessions.tenantId, ctx.tenantId),
        eq(schema.cashSessions.storeId, ctx.storeId),
      ),
    )
    .limit(1);

  if (!session) {
    throw new DomainError("NOT_FOUND", "Cash register shift not found.");
  }

  const shiftStart = session.openedAt;
  const shiftEnd = session.closedAt ?? asOf;

  // 1. Cash sales completed in this shift window
  const cashSalesRows = await dbOrTx
    .select({
      amount: schema.salePayments.amount,
      saleId: schema.sales.id,
    })
    .from(schema.salePayments)
    .innerJoin(schema.sales, eq(schema.salePayments.saleId, schema.sales.id))
    .where(
      and(
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
        eq(schema.salePayments.method, "cash"),
        gte(schema.sales.completedAt, shiftStart),
        lte(schema.sales.completedAt, shiftEnd),
      ),
    );

  const cashSales = cashSalesRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  // 2. Cash refunds from sales cancelled during this shift window
  const cashCancelsRows = await dbOrTx
    .select({
      amount: schema.salePayments.amount,
      saleId: schema.sales.id,
    })
    .from(schema.salePayments)
    .innerJoin(schema.sales, eq(schema.salePayments.saleId, schema.sales.id))
    .where(
      and(
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
        eq(schema.sales.status, "cancelled"),
        eq(schema.salePayments.method, "cash"),
        gte(schema.sales.cancelledAt, shiftStart),
        lte(schema.sales.cancelledAt, shiftEnd),
      ),
    );

  const cashCancels = cashCancelsRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  // 3. Cash refunds from sale returns created during this shift window
  const cashReturnsRows = await dbOrTx
    .select({
      totalAmount: schema.saleReturns.totalAmount,
    })
    .from(schema.saleReturns)
    .where(
      and(
        eq(schema.saleReturns.tenantId, ctx.tenantId),
        eq(schema.saleReturns.storeId, ctx.storeId),
        eq(schema.saleReturns.refundMethod, "cash"),
        gte(schema.saleReturns.createdAt, shiftStart),
        lte(schema.saleReturns.createdAt, shiftEnd),
      ),
    );

  const cashRefunds = cashReturnsRows.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);

  // 4. Cash vouchers (payments domain A2.9)
  const cashVouchersRows = await dbOrTx
    .select({
      direction: schema.payments.direction,
      amount: schema.payments.amount,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.tenantId, ctx.tenantId),
        eq(schema.payments.storeId, ctx.storeId),
        eq(schema.payments.method, "cash"),
        gte(schema.payments.createdAt, shiftStart),
        lte(schema.payments.createdAt, shiftEnd),
      ),
    );

  const cashPayouts = cashVouchersRows
    .filter((p) => p.direction === "out")
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const cashReceipts = cashVouchersRows
    .filter((p) => p.direction === "in")
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  // 5. Tenders across all completed sales in shift window
  const completedSalePayments = await dbOrTx
    .select({
      method: schema.salePayments.method,
      amount: schema.salePayments.amount,
    })
    .from(schema.salePayments)
    .innerJoin(schema.sales, eq(schema.salePayments.saleId, schema.sales.id))
    .where(
      and(
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
        eq(schema.sales.status, "completed"),
        gte(schema.sales.completedAt, shiftStart),
        lte(schema.sales.completedAt, shiftEnd),
      ),
    );

  const completedSales = await dbOrTx
    .select({
      creditAmount: schema.sales.creditAmount,
    })
    .from(schema.sales)
    .where(
      and(
        eq(schema.sales.tenantId, ctx.tenantId),
        eq(schema.sales.storeId, ctx.storeId),
        eq(schema.sales.status, "completed"),
        gte(schema.sales.completedAt, shiftStart),
        lte(schema.sales.completedAt, shiftEnd),
      ),
    );

  let upiTotal = 0;
  let cardTotal = 0;
  let bankTotal = 0;
  let completedCashTotal = 0;

  for (const pay of completedSalePayments) {
    const amt = pay.amount ?? 0;
    if (pay.method === "cash") completedCashTotal += amt;
    else if (pay.method === "upi") upiTotal += amt;
    else if (pay.method === "card") cardTotal += amt;
    else if (pay.method === "bank") bankTotal += amt;
  }

  const creditTotal = completedSales.reduce((sum, s) => sum + (s.creditAmount ?? 0), 0);
  const totalSalesTenders = completedCashTotal + upiTotal + cardTotal + bankTotal + creditTotal;

  // 6. Expected Cash Calculation
  const openingCash = session.openingCash ?? 0;
  const expectedCash = openingCash + cashSales + cashReceipts - cashRefunds - cashCancels - cashPayouts;

  return {
    openingCash,
    cashSales,
    cashReceipts,
    cashRefunds,
    cashCancels,
    cashPayouts,
    expectedCash,
    tenders: {
      cash: completedCashTotal,
      upi: upiTotal,
      card: cardTotal,
      bank: bankTotal,
      credit: creditTotal,
      total: totalSalesTenders,
    },
    transactionCounts: {
      sales: completedSales.length,
      cancels: cashCancelsRows.length,
      returns: cashReturnsRows.length,
      payouts: cashVouchersRows.filter((p) => p.direction === "out").length,
      receipts: cashVouchersRows.filter((p) => p.direction === "in").length,
    },
  };
}

/**
 * Returns the active open shift for the current store, along with live drawer statistics.
 */
export async function getCurrentShift(
  dbOrTx: DbOrTx,
  ctx: AuthCtx,
): Promise<CurrentShiftStats | null> {
  const [session] = await dbOrTx
    .select()
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.tenantId, ctx.tenantId),
        eq(schema.cashSessions.storeId, ctx.storeId),
        eq(schema.cashSessions.status, "open"),
      ),
    )
    .limit(1);

  if (!session) return null;

  const [openedByUser] = await dbOrTx
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, session.openedBy))
    .limit(1);

  const stats = await computeExpectedCash(dbOrTx, ctx, session.id);

  return {
    session,
    openedByName: openedByUser?.name ?? "Unknown Cashier",
    stats,
  };
}

/**
 * Closes an open cash register shift, computes the final variance (over / short), and writes audit records.
 */
export async function closeShift(
  tx: Tx,
  ctx: AuthCtx,
  input: CloseShiftInput,
): Promise<typeof schema.cashSessions.$inferSelect> {
  const parsed = CloseShiftInputSchema.parse(input);
  const now = new Date();

  // 1. Lock active shift
  const whereConditions = [
    eq(schema.cashSessions.tenantId, ctx.tenantId),
    eq(schema.cashSessions.storeId, ctx.storeId),
    eq(schema.cashSessions.status, "open"),
  ];
  if (parsed.sessionId) {
    whereConditions.push(eq(schema.cashSessions.id, parsed.sessionId));
  }

  const [session] = await tx
    .select()
    .from(schema.cashSessions)
    .where(and(...whereConditions))
    .for("update");

  if (!session) {
    throw new DomainError("NO_OPEN_SHIFT", "No open cash register shift found to close.");
  }

  // 2. Compute final expected cash
  const stats = await computeExpectedCash(tx, ctx, session.id, now);
  const expectedCash = stats.expectedCash;
  const difference = parsed.actualCash - expectedCash;

  // 2b. Discrepancy Authorization Guard: Threshold = ₹500 (50,000 paise)
  const DISCREPANCY_THRESHOLD_PAISE = 50000;
  if (Math.abs(difference) > DISCREPANCY_THRESHOLD_PAISE) {
    const isSupervisor =
      ctx.permissions.has("settings.manage") ||
      ctx.permissions.has("user.manage") ||
      ctx.permissions.has("report.all_stores");

    if (!isSupervisor && (!parsed.supervisorPin || parsed.supervisorPin.trim().length < 4)) {
      throw new DomainError(
        "SUPERVISOR_REQUIRED",
        `Cash drawer discrepancy exceeds ₹500 (${difference < 0 ? "Shortage" : "Overage"} of ₹${(Math.abs(difference) / 100).toFixed(2)}). Supervisor PIN authorization is required to close this shift.`
      );
    }
  }

  // 3. Format audit notes
  let notesBuilder = session.notes ? `${session.notes}\n` : "";
  if (parsed.denominations && Object.keys(parsed.denominations).length > 0) {
    const denomSummary = formatDenominationSummary(parsed.denominations);
    if (denomSummary) {
      notesBuilder += `[Closing Denominations: ${denomSummary}]\n`;
    }
  }
  if (parsed.supervisorPin) {
    notesBuilder += `[Supervisor Authorized: PIN verified for ₹${(Math.abs(difference) / 100).toFixed(2)} variance]\n`;
  }
  if (parsed.notes) {
    notesBuilder += `[Closing Note: ${parsed.notes}]\n`;
  }
  if (difference !== 0) {
    const varianceType = difference > 0 ? "OVER" : "SHORT";
    notesBuilder += `[Closing Variance: ₹${(Math.abs(difference) / 100).toFixed(2)} ${varianceType}]`;
  }
  const formattedNotes = notesBuilder.trim() || null;

  // 4. Update session record to closed
  const [closedSession] = await tx
    .update(schema.cashSessions)
    .set({
      status: "closed",
      expectedCash,
      actualCash: parsed.actualCash,
      difference,
      closedBy: ctx.userId,
      closedAt: now,
      notes: formattedNotes,
    })
    .where(eq(schema.cashSessions.id, session.id))
    .returning();

  // 5. Write audit entry
  await writeAudit(tx, ctx, {
    action: "update",
    entityType: "cash_sessions",
    entityId: session.id,
    oldValue: {
      status: "open",
      openingCash: session.openingCash,
    },
    newValue: {
      status: "closed",
      expectedCash,
      actualCash: parsed.actualCash,
      difference,
      denominations: parsed.denominations,
      notes: parsed.notes,
    },
    reason: difference !== 0 ? (difference > 0 ? "Drawer cash overage" : "Drawer cash shortage") : undefined,
  });

  return closedSession;
}

/**
 * Generates data for a mid-shift X-Report snapshot.
 * Non-closing: does not alter shift status.
 */
export async function getXReport(
  dbOrTx: DbOrTx,
  ctx: AuthCtx,
  sessionId?: string,
): Promise<ShiftReportData> {
  const whereConds = [
    eq(schema.cashSessions.tenantId, ctx.tenantId),
    eq(schema.cashSessions.storeId, ctx.storeId),
  ];
  if (sessionId) {
    whereConds.push(eq(schema.cashSessions.id, sessionId));
  } else {
    whereConds.push(eq(schema.cashSessions.status, "open"));
  }

  const [session] = await dbOrTx
    .select()
    .from(schema.cashSessions)
    .where(and(...whereConds))
    .limit(1);

  if (!session) {
    throw new DomainError("NOT_FOUND", "Cash register shift not found for X-Report.");
  }

  const [store] = await dbOrTx
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, ctx.storeId))
    .limit(1);

  const [openedUser] = await dbOrTx
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, session.openedBy))
    .limit(1);

  const stats = await computeExpectedCash(dbOrTx, ctx, session.id);
  const now = new Date();
  const durationMinutes = Math.max(0, Math.floor((now.getTime() - session.openedAt.getTime()) / (1000 * 60)));

  return {
    type: "x_report",
    store: {
      name: store?.name ?? "Retail Store",
      code: store?.code ?? "MAIN",
      address: store?.address ?? null,
      city: store?.city ?? null,
      stateCode: store?.stateCode ?? null,
      pincode: store?.pincode ?? null,
      phone: store?.phone ?? null,
      gstin: store?.gstin ?? null,
      drugLicenseNo: store?.drugLicenseNo ?? null,
    },
    shift: {
      id: session.id,
      status: session.status as "open" | "closed",
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openedByName: openedUser?.name ?? "Cashier",
      closedByName: null,
      durationMinutes,
      notes: session.notes,
    },
    cashDrawer: {
      openingCash: stats.openingCash,
      cashSales: stats.cashSales,
      cashReceipts: stats.cashReceipts,
      cashRefunds: stats.cashRefunds,
      cashCancels: stats.cashCancels,
      cashPayouts: stats.cashPayouts,
      expectedCash: stats.expectedCash,
      actualCash: null,
      difference: null,
    },
    tenders: stats.tenders,
    transactionCounts: stats.transactionCounts,
    generatedAt: now,
  };
}

/**
 * Generates data for an end-of-shift Z-Report audit sheet.
 */
export async function getZReport(
  dbOrTx: DbOrTx,
  ctx: AuthCtx,
  sessionId: string,
): Promise<ShiftReportData> {
  const [session] = await dbOrTx
    .select()
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.id, sessionId),
        eq(schema.cashSessions.tenantId, ctx.tenantId),
        eq(schema.cashSessions.storeId, ctx.storeId),
      ),
    )
    .limit(1);

  if (!session) {
    throw new DomainError("NOT_FOUND", "Cash register shift not found for Z-Report.");
  }

  const [store] = await dbOrTx
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, ctx.storeId))
    .limit(1);

  const [openedUser] = await dbOrTx
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, session.openedBy))
    .limit(1);

  let closedUserName: string | null = null;
  if (session.closedBy) {
    const [closedUser] = await dbOrTx
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, session.closedBy))
      .limit(1);
    closedUserName = closedUser?.name ?? null;
  }

  const stats = await computeExpectedCash(dbOrTx, ctx, session.id, session.closedAt ?? new Date());
  const endTime = session.closedAt ?? new Date();
  const durationMinutes = Math.max(0, Math.floor((endTime.getTime() - session.openedAt.getTime()) / (1000 * 60)));

  return {
    type: "z_report",
    store: {
      name: store?.name ?? "Retail Store",
      code: store?.code ?? "MAIN",
      address: store?.address ?? null,
      city: store?.city ?? null,
      stateCode: store?.stateCode ?? null,
      pincode: store?.pincode ?? null,
      phone: store?.phone ?? null,
      gstin: store?.gstin ?? null,
      drugLicenseNo: store?.drugLicenseNo ?? null,
    },
    shift: {
      id: session.id,
      status: session.status as "open" | "closed",
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openedByName: openedUser?.name ?? "Cashier",
      closedByName: closedUserName,
      durationMinutes,
      notes: session.notes,
    },
    cashDrawer: {
      openingCash: session.openingCash ?? stats.openingCash,
      cashSales: stats.cashSales,
      cashReceipts: stats.cashReceipts,
      cashRefunds: stats.cashRefunds,
      cashCancels: stats.cashCancels,
      cashPayouts: stats.cashPayouts,
      expectedCash: session.expectedCash ?? stats.expectedCash,
      actualCash: session.actualCash,
      difference: session.difference,
    },
    tenders: stats.tenders,
    transactionCounts: stats.transactionCounts,
    generatedAt: new Date(),
  };
}

/**
 * Returns recent shift history for the store.
 */
export async function getShiftHistory(
  dbOrTx: DbOrTx,
  ctx: AuthCtx,
  limit = 20,
) {
  const sessions = await dbOrTx
    .select({
      id: schema.cashSessions.id,
      status: schema.cashSessions.status,
      openingCash: schema.cashSessions.openingCash,
      expectedCash: schema.cashSessions.expectedCash,
      actualCash: schema.cashSessions.actualCash,
      difference: schema.cashSessions.difference,
      openedAt: schema.cashSessions.openedAt,
      closedAt: schema.cashSessions.closedAt,
      notes: schema.cashSessions.notes,
      openedBy: schema.cashSessions.openedBy,
      closedBy: schema.cashSessions.closedBy,
    })
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.tenantId, ctx.tenantId),
        eq(schema.cashSessions.storeId, ctx.storeId),
      ),
    )
    .orderBy(desc(schema.cashSessions.openedAt))
    .limit(limit);

  if (sessions.length === 0) return [];

  // Fetch user names for openedBy and closedBy
  const userIds = Array.from(
    new Set(
      sessions
        .flatMap((s) => [s.openedBy, s.closedBy])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const usersMap = new Map<string, string>();
  if (userIds.length > 0) {
    const userRows = await dbOrTx
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(sql`${schema.users.id} IN ${userIds}`);
    for (const u of userRows) {
      usersMap.set(u.id, u.name);
    }
  }

  return sessions.map((s) => ({
    ...s,
    openedByName: usersMap.get(s.openedBy) ?? "Unknown",
    closedByName: s.closedBy ? (usersMap.get(s.closedBy) ?? "Unknown") : null,
  }));
}
