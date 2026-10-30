import { and, eq, inArray, sql } from "drizzle-orm";
import { format } from "date-fns";
import { schema, type Tx } from "@/server/db";
import { can, type AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { computeSaleTotals, type SaleLineInput } from "@/lib/money";
import { formatINR } from "@/lib/format";
import { recordStockMovement } from "@/server/domain/stock";
import { nextDocNumber } from "@/server/domain/sequence";
import { postSaleJournalEntry } from "@/server/domain/accounting";
import {
  applyPrescriptionDispensing,
  isScheduledDrug,
  recordDispensingLog,
  validateDispensingCompliance,
} from "@/server/domain/compliance";
import { createGstDocumentFromSale, determineTaxContext, extractStateCodeFromGstin } from "@/server/domain/gst";
import { LoyaltyService } from "@/server/domain/loyalty";
import { enqueue } from "@/server/jobs/outbox";
import { writeAudit } from "@/server/audit";
import { allocateFefoBatches } from "./allocate-fefo";
import type { CreateSaleOptions, CreateSaleResult, SaleInput } from "./types";

/** Money methods a customer can hand over. "Credit" is not a method: it is whatever is left unpaid. */
const MONEY_METHODS = ["cash", "upi", "card", "bank"] as const;

/**
 * 🤝 CONTRACT (ROADMAP A2.1). Creates one completed sale inside the caller's transaction:
 * re-reads batches/prices on the server, checks expiry and stock, validates drug-schedule compliance,
 * decides the tax context (CGST+SGST vs IGST), numbers the invoice, writes the sale, stock movements,
 * dispensing logs, payments, the journal entry, the GST document and loyalty points, and queues the receipt.
 *
 * Throws DomainError for expected failures (the message is safe to show to the user).
 * Optional steps (GST document, loyalty, receipt) run in savepoints, so a failure in one never loses the sale.
 *
 * Payment rules (A2.2): any mix of cash / UPI / card / bank. Less than the total is credit and needs a customer, the
 * `customer.credit` permission and room under the customer's credit limit (0 = no credit). More than the total is only
 * allowed in cash and is handed back as change (`changeDue`).
 *
 * Reserved for later tasks: `redeemPoints` (A2.7) and `opts.allowNegativeStock` (A4.3) are rejected or ignored for now.
 */
export async function createSale(
  tx: Tx,
  ctx: AuthCtx,
  input: SaleInput,
  opts: CreateSaleOptions,
): Promise<CreateSaleResult> {
  const now = opts.now ?? new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  // ── 0. Idempotency: a repeated clientSaleId returns the first sale instead of billing twice ──────
  if (input.clientSaleId) {
    const claimed = await tx
      .insert(schema.idempotencyKeys)
      .values({ tenantId: ctx.tenantId, scope: "sale", key: input.clientSaleId, response: {} })
      .onConflictDoNothing()
      .returning({ key: schema.idempotencyKeys.key });
    if (claimed.length === 0) {
      const [prior] = await tx
        .select({ response: schema.idempotencyKeys.response })
        .from(schema.idempotencyKeys)
        .where(
          and(
            eq(schema.idempotencyKeys.tenantId, ctx.tenantId),
            eq(schema.idempotencyKeys.scope, "sale"),
            eq(schema.idempotencyKeys.key, input.clientSaleId),
          ),
        );
      const r = prior?.response as Partial<Omit<CreateSaleResult, "duplicate">> | undefined;
      if (r?.saleId && r.invoiceNo && typeof r.total === "number") {
        return { saleId: r.saleId, invoiceNo: r.invoiceNo, total: r.total, changeDue: r.changeDue ?? 0, duplicate: true };
      }
      throw new DomainError("SALE_IN_PROGRESS", "This bill is already being processed. Please check the sales list.");
    }
  }

  // ── 1. Never trust numbers from the browser ──────────────────────────────────────────────────────
  if (input.lines.length === 0) throw new DomainError("NO_ITEMS", "No items to bill");
  for (const l of input.lines) {
    const hasPackOrLoose = l.packQty !== undefined || l.looseQty !== undefined;
    if (hasPackOrLoose) {
      if (
        (l.packQty !== undefined && (!Number.isInteger(l.packQty) || l.packQty < 0)) ||
        (l.looseQty !== undefined && (!Number.isInteger(l.looseQty) || l.looseQty < 0))
      ) {
        throw new DomainError("INVALID_QTY", "Pack and loose quantities must be whole numbers zero or greater.");
      }
      if ((l.packQty ?? 0) <= 0 && (l.looseQty ?? 0) <= 0) {
        throw new DomainError("INVALID_QTY", "Total quantity must be greater than zero.");
      }
    } else {
      if (!Number.isInteger(l.qty) || (l.qty ?? 0) <= 0) {
        throw new DomainError("INVALID_QTY", "Quantity must be a whole number above zero.");
      }
    }
    if (!Number.isInteger(l.discountBp) || l.discountBp < 0 || l.discountBp > 10000) {
      throw new DomainError("INVALID_DISCOUNT", "Discount must be between 0% and 100%.");
    }
  }
  if (!Number.isInteger(input.billDiscountPaise) || input.billDiscountPaise < 0) {
    throw new DomainError("INVALID_DISCOUNT", "Discount must be between 0% and 100%.");
  }
  for (const p of input.payments) {
    if (!Number.isInteger(p.amount) || p.amount < 0) {
      throw new DomainError("INVALID_PAYMENT", "Amount paid must be zero or more.");
    }
  }
  const tendered = input.payments.filter((p) => p.amount > 0);
  if (tendered.some((p) => !(MONEY_METHODS as readonly string[]).includes(p.method))) {
    throw new DomainError("INVALID_PAYMENT", "Leave the unpaid part empty: it becomes credit on the customer's account.");
  }
  if (input.redeemPoints > 0) {
    throw new DomainError("REDEEM_NOT_AVAILABLE", "Redeeming loyalty points at the counter is not available yet.");
  }

  // Optional per-pharmacy discount ceiling (tenants.settings.maxDiscountBp, basis points; unset = no limit).
  // Going above it needs sale.discount_override (managers/owners). A settings screen arrives in A3.1.
  const [tenantRow] = await tx
    .select({ settings: schema.tenants.settings })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenantId));
  const maxDiscountBp = Number(tenantRow?.settings?.maxDiscountBp);
  const aboveLimit = Number.isFinite(maxDiscountBp) && input.lines.some((l) => l.discountBp > maxDiscountBp);
  if (aboveLimit && !can(ctx, "sale.discount_override")) {
    throw new DomainError(
      "DISCOUNT_OVER_LIMIT",
      `Discounts above ${maxDiscountBp / 100}% need a manager's approval (permission "sale.discount_override").`,
    );
  }

  // ── 2. Store and customer (both scoped to the tenant) ────────────────────────────────────────────
  const [store] = await tx
    .select({
      invoicePrefix: schema.stores.invoicePrefix,
      stateCode: schema.stores.stateCode,
      gstin: schema.stores.gstin,
    })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, ctx.storeId), eq(schema.stores.tenantId, ctx.tenantId)));
  if (!store) throw new DomainError("STORE_NOT_FOUND", "Store not found");

  let customer:
    | { name: string; phone: string | null; gstin: string | null; stateCode: string | null; creditLimit: number | null }
    | undefined;
  if (input.customerId) {
    [customer] = await tx
      .select({
        name: schema.customers.name,
        phone: schema.customers.phone,
        gstin: schema.customers.gstin,
        stateCode: schema.customers.stateCode,
        creditLimit: schema.customers.creditLimit,
      })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, input.customerId), eq(schema.customers.tenantId, ctx.tenantId)))
      .for("update");
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Customer not found.");
  }

  // ── 3. FEFO Batch Allocation and validation (tenant + store scoped) ─────────────────────────
  const { allocatedLines } = await allocateFefoBatches(tx, ctx, input.lines, {
    todayStr,
    allowNegativeStock: opts.allowNegativeStock,
  });

  const lineInputs: SaleLineInput[] = allocatedLines.map((p) => ({
    qty: p.baseQty,
    packQty: p.packQty,
    looseQty: p.looseQty,
    unitsPerPack: p.unitsPerPack,
    rate: p.saleRate,
    discountBp: p.discountBp,
    gstRateBp: p.medicine.gstRateBp,
  }));

  // ── 4. Drug-schedule compliance (Drugs & Cosmetics Rules) ───────────────────────────────────────
  const c = input.compliance;
  const doctorName = c?.doctorName?.trim() || undefined;
  const patientName = c?.patientName?.trim() || customer?.name;
  const check = validateDispensingCompliance({
    items: allocatedLines.map((p) => ({
      medicineName: p.medicine.name,
      schedule: p.medicine.schedule,
      rxRequired: p.medicine.rxRequired,
      qty: p.baseQty,
    })),
    doctorName,
    doctorRegNo: c?.doctorRegNo,
    patientName,
    patientAddress: c?.patientAddress,
    patientAge: c?.patientAge,
    prescriptionRef: c?.prescriptionRef,
  });
  if (!check.valid) throw new DomainError("COMPLIANCE", check.errors.join("; "));

  // ── 5. Tax context: CGST+SGST (same state) or IGST (B2B customer in another state) ─────────────
  // The store's state must be a 2-digit code (or derivable from its GSTIN). If it can't be determined
  // we bill intra-state rather than guess.
  const storeState = /^\d{2}$/.test(store.stateCode ?? "") ? store.stateCode : extractStateCodeFromGstin(store.gstin);
  const isInterState = storeState
    ? determineTaxContext({
        storeStateCode: storeState,
        storeGstin: store.gstin,
        customerGstin: customer?.gstin,
        customerStateCode: customer?.stateCode,
      }).isInterState
    : false;

  const totals = computeSaleTotals(lineInputs, isInterState, input.billDiscountPaise);

  // ── 5b. Payments: split tender, credit and change ───────────────────────────────────────────────
  const tenderedTotal = tendered.reduce((s, p) => s + p.amount, 0);
  let changeDue = 0;
  // what the shop actually keeps, per method (cash is reduced by the change handed back)
  const payments = tendered.map((p) => ({ ...p }));
  if (tenderedTotal > totals.total) {
    const excess = tenderedTotal - totals.total;
    const cashIn = payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
    if (excess > cashIn) {
      throw new DomainError("OVERPAID", "Only cash can be overpaid (the change is given back in cash). Reduce the UPI/card amount.");
    }
    changeDue = excess;
    let left = excess;
    for (const p of payments.filter((x) => x.method === "cash")) {
      const take = Math.min(p.amount, left);
      p.amount -= take;
      left -= take;
    }
  }
  const kept = payments.filter((p) => p.amount > 0);
  const paidAmount = kept.reduce((s, p) => s + p.amount, 0);
  const creditAmount = Math.max(totals.total - paidAmount, 0);
  if (creditAmount > 0) {
    if (!input.customerId || !customer) {
      throw new DomainError("CREDIT_NEEDS_CUSTOMER", "Choose a customer to put the unpaid amount on credit, or collect the full amount.");
    }
    if (!can(ctx, "customer.credit")) {
      throw new DomainError("CREDIT_NOT_ALLOWED", 'You don\'t have permission to sell on credit (permission "customer.credit"). Collect the full amount.');
    }
    const limit = customer.creditLimit ?? 0;
    if (limit <= 0) {
      throw new DomainError("NO_CREDIT_LIMIT", `${customer.name} has no credit limit. Set one on the customer's profile, or collect the full amount.`);
    }
    const [owed] = await tx
      .select({ due: sql<number>`coalesce(sum(${schema.sales.creditAmount}), 0)::bigint` })
      .from(schema.sales)
      .where(and(eq(schema.sales.tenantId, ctx.tenantId), eq(schema.sales.customerId, input.customerId), eq(schema.sales.status, "completed")));
    const outstanding = Number(owed?.due ?? 0);
    if (outstanding + creditAmount > limit) {
      throw new DomainError(
        "CREDIT_LIMIT",
        `Credit limit exceeded: ${customer.name} already owes ${formatINR(outstanding)} and the limit is ${formatINR(limit)}. Collect more now.`,
      );
    }
  }

  // ── 6. Invoice number (gap-free, row-locked) and the sale header ─────────────────────────────────
  const invoiceNo =
    opts.invoiceNo ?? (await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "sale", store.invoicePrefix, now));

  const [sale] = await tx
    .insert(schema.sales)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      invoiceNo,
      customerId: input.customerId ?? null,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      medicalRepId: input.medicalRepId?.trim() || null,
      doctorName: doctorName ?? null,
      doctorRegNo: c?.doctorRegNo?.trim() || null,
      doctorAddress: c?.doctorAddress?.trim() || null,
      patientAge: c?.patientAge ?? null,
      patientGender: c?.patientGender || null,
      patientAddress: c?.patientAddress?.trim() || null,
      prescriptionId: c?.prescriptionId ?? null,
      prescriptionRef: c?.prescriptionRef?.trim() || null,
      pharmacistId: ctx.userId,
      isInterState,
      grossAmount: totals.gross,
      discountAmount: totals.discount,
      taxableAmount: totals.taxable,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      roundOff: totals.roundOff,
      totalAmount: totals.total,
      paidAmount,
      creditAmount,
      status: "completed",
      completedAt: now,
      createdBy: ctx.userId,
    })
    .returning({ id: schema.sales.id });

  // A discount above the shop's limit was allowed because the user holds sale.discount_override: leave a trail.
  if (aboveLimit) {
    await writeAudit(tx, ctx, {
      action: "discount_override",
      entityType: "sale",
      entityId: sale.id,
      newValue: { invoiceNo, maxDiscountBp, highestLineDiscountBp: Math.max(...input.lines.map((l) => l.discountBp)) },
      reason: "Discount above the shop limit, approved by permission sale.discount_override",
    });
  }

  // Record audit trails for any manual FEFO batch overrides at the counter
  for (const p of allocatedLines) {
    if (p.isOverride && p.earlierBatchesSkipped && p.earlierBatchesSkipped.length > 0) {
      await writeAudit(tx, ctx, {
        action: "fefo_override",
        entityType: "sale",
        entityId: sale.id,
        newValue: {
          invoiceNo,
          medicineId: p.medicine.id,
          medicineName: p.medicine.name,
          selectedBatchId: p.batch.id,
          selectedBatchNo: p.batch.batchNo,
          selectedExpiryDate: p.batch.expiryDate,
          skippedBatches: p.earlierBatchesSkipped,
          reason: p.overrideReason || "Manual batch selection at counter overrode earlier-expiring batch",
        },
        reason:
          p.overrideReason ||
          `Counter manual override: Selected batch ${p.batch.batchNo} (${p.batch.expiryDate}) over earlier-expiring batch ${p.earlierBatchesSkipped[0].batchNo} (${p.earlierBatchesSkipped[0].expiryDate})`,
      });
    }
  }

  // ── 7. Lines: stock movement (locks the batch) + sale items ─────────────────────────────────────
  const saleItems = [];
  for (let i = 0; i < allocatedLines.length; i++) {
    const p = allocatedLines[i];
    const res = totals.lines[i];
    await recordStockMovement({
      tx,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      batchId: p.batch.id,
      medicineId: p.medicine.id,
      type: "sale",
      qtyChange: -p.baseQty,
      unitCost: p.batch.purchaseRate,
      refType: "sale",
      refId: sale.id,
      userId: ctx.userId,
    });
    saleItems.push({
      tenantId: ctx.tenantId,
      saleId: sale.id,
      medicineId: p.medicine.id,
      batchId: p.batch.id,
      medicineName: p.medicine.name,
      batchNo: p.batch.batchNo,
      expiryDate: p.batch.expiryDate,
      qty: p.baseQty,
      unitsPerPack: p.unitsPerPack,
      packUnit: p.medicine.packUnit ?? "strip",
      looseUnit: p.medicine.looseUnit ?? "tablet",
      packQty: p.packQty,
      looseQty: p.looseQty,
      mrp: p.batch.mrp,
      rate: p.saleRate,
      discountBp: p.discountBp,
      discountAmount: res.discount,
      taxableAmount: res.taxable,
      gstRateBp: p.medicine.gstRateBp,
      cgst: res.cgst,
      sgst: res.sgst,
      igst: res.igst,
      totalAmount: res.total,
      unitCost: p.batch.purchaseRate,
    });
  }
  const insertedItems = await tx.insert(schema.saleItems).values(saleItems).returning({ id: schema.saleItems.id });

  // ── 8. Statutory dispensing register (Schedule H / H1 / X / narcotics) ──────────────────────────
  for (let i = 0; i < allocatedLines.length; i++) {
    const p = allocatedLines[i];
    if (!isScheduledDrug(p.medicine.schedule) || !insertedItems[i]) continue;
    await recordDispensingLog({
      tx,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      saleId: sale.id,
      saleItemId: insertedItems[i].id,
      medicineId: p.medicine.id,
      batchId: p.batch.id,
      medicineName: p.medicine.name,
      batchNo: p.batch.batchNo,
      expiryDate: p.batch.expiryDate,
      manufacturerName: p.manufacturerName,
      schedule: p.medicine.schedule,
      patientName: patientName || "Walk-in Patient",
      patientAge: c?.patientAge ?? null,
      patientGender: c?.patientGender || null,
      patientAddress: c?.patientAddress || null,
      patientPhone: c?.patientPhone || customer?.phone || null,
      doctorName: doctorName || "Registered Medical Practitioner",
      doctorRegNo: c?.doctorRegNo || null,
      doctorAddress: c?.doctorAddress || null,
      prescriptionRef: c?.prescriptionRef || null,
      prescriptionDate: c?.prescriptionDate || todayStr,
      quantityDispensed: p.baseQty,
      pharmacistId: ctx.userId,
      pharmacistName: ctx.user.name,
      pharmacistRegNo: ctx.user.pharmacistRegNo || null,
    });
  }

  // ── 9. Dispensing against a prescription (🤝 B1.4): quantities, status, over-dispensing guard ────
  if (c?.prescriptionId) {
    try {
      await applyPrescriptionDispensing(tx, {
        prescriptionId: c.prescriptionId,
        tenantId: ctx.tenantId,
        today: now,
        lines: allocatedLines.map((p) => ({
          medicineId: p.medicine.id,
          medicineName: p.medicine.name,
          quantity: p.baseQty,
        })),
      });
    } catch (e) {
      throw new DomainError("PRESCRIPTION", e instanceof Error ? e.message : "Could not apply the prescription.");
    }
  }

  // ── 10. Payment rows and the double-entry journal ───────────────────────────────────────────────
  if (kept.length > 0) {
    await tx.insert(schema.salePayments).values(
      kept.map((p) => ({
        tenantId: ctx.tenantId,
        saleId: sale.id,
        method: p.method,
        amount: p.amount,
        reference: p.reference ?? null,
        status: "success",
      })),
    );
  }
  await postSaleJournalEntry({
    tx,
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    userId: ctx.userId,
    saleId: sale.id,
    invoiceNo,
    invoiceDate: now,
    customerId: input.customerId ?? null,
    customerName: customer?.name ?? null,
    paymentMethod: kept[0]?.method ?? "cash",
    payments: kept.map((p) => ({ method: p.method, amount: p.amount })),
    taxableAmount: totals.taxable,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    roundOff: totals.roundOff,
    totalAmount: totals.total,
    paidAmount,
    creditAmount,
  });

  // ── 11. Optional steps. Each runs in a SAVEPOINT: a failed SQL statement poisons a Postgres
  // transaction (COMMIT would silently become ROLLBACK), the savepoint rolls back only that step. ───
  // GST document. A failure is retried later through the outbox (B2.1 gst.doc_retry handler).
  try {
    await tx.transaction(async (sp) => {
      await createGstDocumentFromSale(sp, { saleId: sale.id, tenantId: ctx.tenantId, storeId: ctx.storeId });
    });
  } catch (err) {
    console.error("Warning: GST document creation failed; sale kept, queued for retry:", err);
    await queueOptional(tx, ctx.tenantId, "gst.doc_retry", { refType: "sale", refId: sale.id, storeId: ctx.storeId });
  }

  if (input.customerId) {
    try {
      await tx.transaction(async (sp) => {
        await LoyaltyService.earnPoints(sp, {
          tenantId: ctx.tenantId,
          customerId: input.customerId!,
          saleAmountPaise: totals.total,
          saleId: sale.id,
        });
      });
    } catch (err) {
      console.error("Warning: loyalty points earning failed; sale kept:", err);
    }
  }

  // WhatsApp receipt goes through the outbox: the bill completes instantly and the message is sent (and
  // retried with back-off) by the worker, not inside this request.
  if (customer?.phone) {
    await queueOptional(tx, ctx.tenantId, "whatsapp.receipt", { saleId: sale.id });
  }

  const result = { saleId: sale.id, invoiceNo, total: totals.total, changeDue };
  if (input.clientSaleId) {
    await tx
      .update(schema.idempotencyKeys)
      .set({ response: result })
      .where(
        and(
          eq(schema.idempotencyKeys.tenantId, ctx.tenantId),
          eq(schema.idempotencyKeys.scope, "sale"),
          eq(schema.idempotencyKeys.key, input.clientSaleId),
        ),
      );
  }
  return { ...result, duplicate: false };
}

/** Queue an outbox event in a savepoint; a failure here is logged and never loses the sale. */
async function queueOptional(
  tx: Tx,
  tenantId: string,
  type: Parameters<typeof enqueue>[2],
  payload: Record<string, unknown>,
) {
  try {
    await tx.transaction(async (sp) => {
      await enqueue(sp, tenantId, type, payload);
    });
  } catch (err) {
    console.error(`Warning: could not queue ${type}; sale kept:`, err);
  }
}
