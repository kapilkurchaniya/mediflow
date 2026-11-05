import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import type { DbOrTx } from "@/server/db";
import type { TestDb } from "../setup/db";
import { setupAccountingPeriodsFixture, type AccountingPeriodsFixture } from "./accounting-periods-fixture";
import {
  postSaleJournalEntry,
  postPurchaseJournalEntry,
  postPurchaseReturnJournalEntry,
  postSaleReturnJournalEntry,
} from "@/server/domain/accounting";
import { postPayment } from "@/server/domain/payments";
import { nextDocNumber } from "@/server/domain/sequence";
import type { AuthCtx } from "@/server/rbac";

export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface InvariantsRunnerContext {
  fixture: AccountingPeriodsFixture;
  authCtx: AuthCtx;
  batchAId: string;
  batchBId: string;
  batchAQty: number;
  batchBQty: number;
}

async function recordStock(
  tx: DbOrTx,
  f: AccountingPeriodsFixture,
  storeId: string,
  batchId: string,
  newQty: number,
  delta: number,
  type: string,
  refType?: string,
  refId?: string,
) {
  await tx.update(schema.batches).set({ qtyOnHand: newQty }).where(eq(schema.batches.id, batchId));
  await tx.insert(schema.stockMovements).values({
    tenantId: f.tenantId,
    storeId,
    batchId,
    medicineId: f.medicineId,
    type,
    qtyChange: delta,
    balanceAfter: newQty,
    refType,
    refId,
    userId: f.userId,
  });
}

export async function setupInvariantsRunner(db: TestDb): Promise<InvariantsRunnerContext> {
  const f = await setupAccountingPeriodsFixture(db);
  await db.insert(schema.stockMovements).values({
    tenantId: f.tenantId,
    storeId: f.storeA,
    batchId: f.batchId,
    medicineId: f.medicineId,
    type: "opening",
    qtyChange: 10,
    balanceAfter: 10,
    unitCost: 3000,
    userId: f.userId,
  });

  const [batchB] = await db
    .insert(schema.batches)
    .values({
      tenantId: f.tenantId,
      storeId: f.storeB,
      medicineId: f.medicineId,
      batchNo: `BATCH-B-${Date.now().toString().slice(-4)}`,
      expiryDate: "2028-06-30",
      mrp: 6000,
      purchaseRate: 3500,
      qtyOnHand: 50,
    })
    .returning();

  await db.insert(schema.stockMovements).values({
    tenantId: f.tenantId,
    storeId: f.storeB,
    batchId: batchB.id,
    medicineId: f.medicineId,
    type: "opening",
    qtyChange: 50,
    balanceAfter: 50,
    unitCost: 3500,
    userId: f.userId,
  });

  const authCtx: AuthCtx = {
    tenantId: f.tenantId,
    storeId: f.storeA,
    userId: f.userId,
    user: { id: f.userId, name: "Test Auditor", email: "auditor@mediflow.test", pharmacistRegNo: null },
    permissions: new Set(["accounting.period.lock", "accounting.post", "sale.create", "inventory.adjust"]),
    allowedStoreIds: "all",
  };

  return {
    fixture: f,
    authCtx,
    batchAId: f.batchId,
    batchBId: batchB.id,
    batchAQty: 10,
    batchBQty: 50,
  };
}

export async function executeRunnerStep(
  db: TestDb,
  ctx: InvariantsRunnerContext,
  idx: number,
  rng: () => number,
): Promise<string> {
  const op = Math.floor(rng() * 10);
  const f = ctx.fixture;
  const today = "2026-05-15";

  switch (op) {
    case 0: { // Cash Sale
      if (ctx.batchAQty < 1) return "skip";
      const saleId = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await postSaleJournalEntry({
          tx, tenantId: f.tenantId, storeId: f.storeA, userId: f.userId,
          saleId, invoiceNo: `INV-C-${idx}`, invoiceDate: new Date(today),
          paymentMethod: "cash", taxableAmount: 500, cgst: 0, sgst: 0, igst: 0, roundOff: 0,
          totalAmount: 500, paidAmount: 500, creditAmount: 0,
        });
        ctx.batchAQty -= 1;
        await recordStock(tx, f, f.storeA, ctx.batchAId, ctx.batchAQty, -1, "sale", "sale", saleId);
      });
      return "cash_sale";
    }

    case 1: { // Credit Sale
      if (ctx.batchAQty < 1) return "skip";
      const saleId = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await postSaleJournalEntry({
          tx, tenantId: f.tenantId, storeId: f.storeA, userId: f.userId,
          saleId, invoiceNo: `INV-CR-${idx}`, invoiceDate: new Date(today), customerId: f.customerId,
          paymentMethod: "credit", taxableAmount: 800, cgst: 0, sgst: 0, igst: 0, roundOff: 0,
          totalAmount: 800, paidAmount: 0, creditAmount: 800,
        });
        ctx.batchAQty -= 1;
        await recordStock(tx, f, f.storeA, ctx.batchAId, ctx.batchAQty, -1, "sale", "sale", saleId);
      });
      return "credit_sale";
    }

    case 2: { // Purchase GRN
      const purchaseId = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await postPurchaseJournalEntry({
          tx, tenantId: f.tenantId, storeId: f.storeA, userId: f.userId,
          purchaseId, purchaseNo: `PO-${idx}`, supplierId: f.supplierId, supplierInvoiceNo: `SI-${idx}`,
          invoiceDate: today, taxableAmount: 1500, cgst: 0, sgst: 0, igst: 0, roundOff: 0,
          cashDiscountAmount: 0, totalAmount: 1500,
        });
        ctx.batchAQty += 5;
        await recordStock(tx, f, f.storeA, ctx.batchAId, ctx.batchAQty, 5, "purchase", "purchase", purchaseId);
      });
      return "purchase_grn";
    }

    case 3: { // Purchase Return
      if (ctx.batchAQty < 2) return "skip";
      const returnId = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await postPurchaseReturnJournalEntry({
          tx, tenantId: f.tenantId, storeId: f.storeA, userId: f.userId,
          returnId, returnNo: `PR-${idx}`, supplierId: f.supplierId, returnDate: today,
          taxableAmount: 600, cgst: 0, sgst: 0, igst: 0, roundOff: 0, totalAmount: 600,
        });
        ctx.batchAQty -= 2;
        await recordStock(tx, f, f.storeA, ctx.batchAId, ctx.batchAQty, -2, "purchase_return", "purchase_return", returnId);
      });
      return "purchase_return";
    }

    case 4: { // Sale Return
      const returnId = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await postSaleReturnJournalEntry({
          tx, tenantId: f.tenantId, storeId: f.storeA, userId: f.userId,
          saleId: crypto.randomUUID(), returnId, returnNo: `SR-${idx}`, returnDate: new Date(today),
          invoiceNo: `INV-RET-${idx}`, refundMethod: "cash", taxableAmount: 500, cgst: 0, sgst: 0, igst: 0,
          roundOff: 0, totalAmount: 500,
        });
        ctx.batchAQty += 1;
        await recordStock(tx, f, f.storeA, ctx.batchAId, ctx.batchAQty, 1, "sale_return", "sale_return", returnId);
      });
      return "sale_return";
    }

    case 5: { // Customer Payment
      await db.transaction(async (tx) => {
        await postPayment(tx, ctx.authCtx, {
          direction: "in", partyType: "customer", partyId: f.customerId,
          amount: 500, paymentDate: today, method: "bank", note: `Payment ${idx}`,
        });
      });
      return "customer_payment";
    }

    case 6: { // Supplier Payment
      await db.transaction(async (tx) => {
        await postPayment(tx, ctx.authCtx, {
          direction: "out", partyType: "supplier", partyId: f.supplierId,
          amount: 500, paymentDate: today, method: "bank", note: `Payment ${idx}`,
        });
      });
      return "supplier_payment";
    }

    case 7: { // Stocktake Surplus (Dr 1080 / Cr 3030)
      await db.transaction(async (tx) => {
        const entryNo = await nextDocNumber(tx, f.tenantId, f.storeA, "journal", "JV");
        const [entry] = await tx.insert(schema.journalEntries).values({
          tenantId: f.tenantId, storeId: f.storeA, entryNo, entryDate: today,
          narration: `Surplus ${idx}`, refType: "adjustment", createdBy: f.userId,
        }).returning();

        await tx.insert(schema.journalLines).values([
          { tenantId: f.tenantId, entryId: entry.id, accountId: f.accounts.inventory, debit: 600, credit: 0 },
          { tenantId: f.tenantId, entryId: entry.id, accountId: f.accounts.stock_gain, debit: 0, credit: 600 },
        ]);
        ctx.batchAQty += 2;
        await recordStock(tx, f, f.storeA, ctx.batchAId, ctx.batchAQty, 2, "adjustment", "adjustment", entry.id);
      });
      return "stocktake_surplus";
    }

    case 8: { // Stocktake Shortage (Dr 5030 / Cr 1080)
      if (ctx.batchAQty < 1) return "skip";
      await db.transaction(async (tx) => {
        const entryNo = await nextDocNumber(tx, f.tenantId, f.storeA, "journal", "JV");
        const [entry] = await tx.insert(schema.journalEntries).values({
          tenantId: f.tenantId, storeId: f.storeA, entryNo, entryDate: today,
          narration: `Shortage ${idx}`, refType: "adjustment", createdBy: f.userId,
        }).returning();

        await tx.insert(schema.journalLines).values([
          { tenantId: f.tenantId, entryId: entry.id, accountId: f.accounts.stock_loss, debit: 300, credit: 0 },
          { tenantId: f.tenantId, entryId: entry.id, accountId: f.accounts.inventory, debit: 0, credit: 300 },
        ]);
        ctx.batchAQty -= 1;
        await recordStock(tx, f, f.storeA, ctx.batchAId, ctx.batchAQty, -1, "damage", "adjustment", entry.id);
      });
      return "stocktake_shortage";
    }

    case 9: { // Inter-store Transfer (Store B -> Store A)
      if (ctx.batchBQty < 2) return "skip";
      await db.transaction(async (tx) => {
        ctx.batchBQty -= 2;
        await recordStock(tx, f, f.storeB, ctx.batchBId, ctx.batchBQty, -2, "transfer_out");
        ctx.batchAQty += 2;
        await recordStock(tx, f, f.storeA, ctx.batchAId, ctx.batchAQty, 2, "transfer_in");
      });
      return "stock_transfer";
    }

    default:
      return "noop";
  }
}
