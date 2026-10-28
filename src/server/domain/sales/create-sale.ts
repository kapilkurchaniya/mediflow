import { and, eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { schema, type Tx } from "@/server/db";
import { can, type AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { computeSaleTotals, type SaleLineInput } from "@/lib/money";
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
import type { CreateSaleOptions, CreateSaleResult, SaleInput } from "./types";

/** Payment methods the journal can book today. Split tender and credit arrive with A2.2. */
const SUPPORTED_METHODS = ["cash", "upi", "card", "bank"] as const;

/**
 * 🤝 CONTRACT (ROADMAP A2.1). Creates one completed sale inside the caller's transaction:
 * re-reads batches/prices on the server, checks expiry and stock, validates drug-schedule compliance,
 * decides the tax context (CGST+SGST vs IGST), numbers the invoice, writes the sale, stock movements,
 * dispensing logs, payments, the journal entry, the GST document and loyalty points, and queues the receipt.
 *
 * Throws DomainError for expected failures (the message is safe to show to the user).
 * Optional steps (GST document, loyalty, receipt) run in savepoints, so a failure in one never loses the sale.
 *
 * Reserved for later tasks: `redeemPoints` (A2.7), more than one payment / credit (A2.2) and
 * `opts.allowNegativeStock` (A4.3) are rejected or ignored for now.
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
        return { saleId: r.saleId, invoiceNo: r.invoiceNo, total: r.total, duplicate: true };
      }
      throw new DomainError("SALE_IN_PROGRESS", "This bill is already being processed. Please check the sales list.");
    }
  }

  // ── 1. Never trust numbers from the browser ──────────────────────────────────────────────────────
  if (input.lines.length === 0) throw new DomainError("NO_ITEMS", "No items to bill");
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) {
      throw new DomainError("INVALID_QTY", "Quantity must be a whole number above zero.");
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
  const payments = input.payments.filter((p) => p.amount > 0);
  if (payments.length > 1) {
    throw new DomainError("SPLIT_NOT_AVAILABLE", "Split payments are not available yet.");
  }
  if (payments[0] && !(SUPPORTED_METHODS as readonly string[]).includes(payments[0].method)) {
    throw new DomainError("METHOD_NOT_AVAILABLE", `Payment by ${payments[0].method} is not available yet.`);
  }
  if (input.redeemPoints > 0) {
    throw new DomainError("REDEEM_NOT_AVAILABLE", "Redeeming loyalty points at the counter is not available yet.");
  }
  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
  const paymentMethod = payments[0]?.method ?? "cash";

  // Optional per-pharmacy discount ceiling (tenants.settings.maxDiscountBp, basis points; unset = no limit).
  // Going above it needs sale.discount_override (managers/owners). A settings screen arrives in A3.1.
  const [tenantRow] = await tx
    .select({ settings: schema.tenants.settings })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenantId));
  const maxDiscountBp = Number(tenantRow?.settings?.maxDiscountBp);
  if (
    Number.isFinite(maxDiscountBp) &&
    !can(ctx, "sale.discount_override") &&
    input.lines.some((l) => l.discountBp > maxDiscountBp)
  ) {
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
    | { name: string; phone: string | null; gstin: string | null; stateCode: string | null }
    | undefined;
  if (input.customerId) {
    [customer] = await tx
      .select({
        name: schema.customers.name,
        phone: schema.customers.phone,
        gstin: schema.customers.gstin,
        stateCode: schema.customers.stateCode,
      })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, input.customerId), eq(schema.customers.tenantId, ctx.tenantId)));
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Customer not found.");
  }

  // ── 3. Batches and medicines, read on the server (tenant + store scoped) ─────────────────────────
  const batchIds = input.lines.map((l) => l.batchId);
  const dbBatches = await tx
    .select({ batch: schema.batches, medicine: schema.medicines, manufacturer: schema.manufacturers.name })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .leftJoin(schema.manufacturers, eq(schema.medicines.manufacturerId, schema.manufacturers.id))
    .where(
      and(
        eq(schema.batches.tenantId, ctx.tenantId),
        eq(schema.batches.storeId, ctx.storeId),
        inArray(schema.batches.id, batchIds),
      ),
    );

  const lineInputs: SaleLineInput[] = [];
  const processed = input.lines.map((line) => {
    const rec = dbBatches.find((b) => b.batch.id === line.batchId);
    if (!rec) throw new DomainError("BATCH_NOT_FOUND", `Batch ${line.batchId} not found`);
    const { batch, medicine, manufacturer } = rec;
    if (batch.qtyOnHand < line.qty) {
      throw new DomainError("INSUFFICIENT_STOCK", `Insufficient stock for ${medicine.name}. Available: ${batch.qtyOnHand}`);
    }
    if (batch.expiryDate <= todayStr) {
      throw new DomainError("BATCH_EXPIRED", `Batch for ${medicine.name} has expired on ${batch.expiryDate}`);
    }
    // Server-side rate, falling back to MRP: the browser's price is ignored.
    const saleRate = batch.saleRate ?? batch.mrp ?? 0;
    lineInputs.push({ qty: line.qty, rate: saleRate, discountBp: line.discountBp, gstRateBp: medicine.gstRateBp });
    return { line, medicine, batch, manufacturerName: manufacturer ?? null, saleRate };
  });

  // ── 4. Drug-schedule compliance (Drugs & Cosmetics Rules) ───────────────────────────────────────
  const c = input.compliance;
  const doctorName = c?.doctorName?.trim() || undefined;
  const patientName = c?.patientName?.trim() || customer?.name;
  const check = validateDispensingCompliance({
    items: processed.map((p) => ({
      medicineName: p.medicine.name,
      schedule: p.medicine.schedule,
      rxRequired: p.medicine.rxRequired,
      qty: p.line.qty,
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
  const creditAmount = Math.max(totals.total - paidAmount, 0);

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

  // ── 7. Lines: stock movement (locks the batch) + sale items ─────────────────────────────────────
  const saleItems = [];
  for (let i = 0; i < processed.length; i++) {
    const p = processed[i];
    const res = totals.lines[i];
    await recordStockMovement({
      tx,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      batchId: p.line.batchId,
      medicineId: p.medicine.id,
      type: "sale",
      qtyChange: -p.line.qty,
      unitCost: p.batch.purchaseRate,
      refType: "sale",
      refId: sale.id,
      userId: ctx.userId,
    });
    saleItems.push({
      tenantId: ctx.tenantId,
      saleId: sale.id,
      medicineId: p.medicine.id,
      batchId: p.line.batchId,
      medicineName: p.medicine.name,
      batchNo: p.batch.batchNo,
      expiryDate: p.batch.expiryDate,
      qty: p.line.qty,
      mrp: p.batch.mrp,
      rate: p.saleRate,
      discountBp: p.line.discountBp,
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
  for (let i = 0; i < processed.length; i++) {
    const p = processed[i];
    if (!isScheduledDrug(p.medicine.schedule) || !insertedItems[i]) continue;
    await recordDispensingLog({
      tx,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      saleId: sale.id,
      saleItemId: insertedItems[i].id,
      medicineId: p.medicine.id,
      batchId: p.line.batchId,
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
      quantityDispensed: p.line.qty,
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
        lines: processed.map((p) => ({
          medicineId: p.medicine.id,
          medicineName: p.medicine.name,
          quantity: p.line.qty,
        })),
      });
    } catch (e) {
      throw new DomainError("PRESCRIPTION", e instanceof Error ? e.message : "Could not apply the prescription.");
    }
  }

  // ── 10. Payment rows and the double-entry journal ───────────────────────────────────────────────
  if (payments[0]) {
    await tx.insert(schema.salePayments).values({
      tenantId: ctx.tenantId,
      saleId: sale.id,
      method: payments[0].method,
      amount: payments[0].amount,
      reference: payments[0].reference ?? null,
      status: "success",
    });
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
    paymentMethod,
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

  const result = { saleId: sale.id, invoiceNo, total: totals.total };
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
