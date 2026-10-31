import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { createTestDb } from "../setup/db";
import {
  makeBatch,
  makeCustomer,
  makeMedicine,
  makeStore,
  makeTenant,
  makeUser,
  makeWorld,
} from "../setup/factories";
import { createSale } from "@/server/domain/sales/create-sale";
import { cancelSale } from "@/server/domain/sales/cancel-sale";
import { returnSale, getReturnableSaleDetails } from "@/server/domain/sales/return-sale";
import type { SaleInput } from "@/server/domain/sales/types";
import type { AuthCtx } from "@/server/rbac";
import { format, subDays, addDays } from "date-fns";

vi.mock("@/server/auth", () => ({
  requireAuth: async () => {
    throw new Error("not used");
  },
  getCurrentSession: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

type World = Awaited<ReturnType<typeof makeWorld>>;

function ctxFor(
  w: Pick<World, "tenant" | "store" | "user">,
  permissions: readonly string[] = ALL_PERMISSIONS,
): AuthCtx {
  return {
    tenantId: w.tenant.id,
    storeId: w.store.id,
    userId: w.user.id,
    user: { id: w.user.id, name: w.user.name, email: w.user.email, pharmacistRegNo: "PH-123" },
    permissions: new Set(permissions) as AuthCtx["permissions"],
    allowedStoreIds: "all",
  };
}

async function setupSaleScene(opts: {
  schedule?: string;
  initialStock?: number;
  expiryDays?: number;
  unitsPerPack?: number;
  rate?: number;
} = {}) {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id, { stateCode: "27" });
  const user = await makeUser(t.db);
  const maker = (
    await t.db.insert(schema.manufacturers).values({ tenantId: tenant.id, name: "Sun Pharma" }).returning()
  )[0];

  const unitsPerPack = opts.unitsPerPack ?? 10;
  const rate = opts.rate ?? 10000;

  const medicine = await makeMedicine(t.db, tenant.id, {
    schedule: opts.schedule ?? "none",
    manufacturerId: maker.id,
    unitsPerPack,
    mrp: rate,
    gstRateBp: 1200, // 12% GST
  });

  const expiryDate = format(addDays(new Date(), opts.expiryDays ?? 180), "yyyy-MM-dd");
  const batch = await makeBatch(t.db, {
    tenantId: tenant.id,
    storeId: store.id,
    medicineId: medicine.id,
    qtyOnHand: opts.initialStock ?? 50,
    expiryDate,
    mrp: rate,
    saleRate: rate,
    purchaseRate: 6000,
    status: "active",
  });

  const w = { tenant, store, user, medicine };
  const ctx = ctxFor(w);

  return { w, ctx, batch, medicine };
}

describe("Sale Returns & Credit Notes (Integration - Task A2.5)", () => {
  it("processes a partial return (1 of 3 strips), restoring batch stock, posting balanced journal, generating GST credit note, and updating sales aggregate", async () => {
    const s = await setupSaleScene({ initialStock: 50, unitsPerPack: 10, rate: 10000 });
    const customer = await makeCustomer(t.db, s.w.tenant.id, {
      name: "Anil Kapoor",
      phone: "9876543211",
      creditLimit: 50000,
    });

    // 1. Sell 3 strips (30 base units) for ₹300 total (3 x ₹100)
    const saleInput: SaleInput = {
      customerId: customer.id,
      lines: [
        {
          medicineId: s.medicine.id,
          batchId: s.batch.id,
          qty: 30, // 3 strips
          discountBp: 0,
        },
      ],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 30000 }],
      redeemPoints: 0,
    };

    const now = new Date();
    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { now, source: "pos" }),
    );

    // Verify stock decremented to 20
    const [batchAfterSale] = await t.db
      .select({ qtyOnHand: schema.batches.qtyOnHand })
      .from(schema.batches)
      .where(eq(schema.batches.id, s.batch.id));
    expect(batchAfterSale.qtyOnHand).toBe(20);

    // Get sale item ID
    const [saleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, createdSale.saleId));

    expect(saleItem.qty).toBe(30);
    expect(saleItem.returnedQty).toBe(0);

    // 2. Perform partial return of 1 strip (10 base units)
    const returnResult = await t.db.transaction((tx) =>
      returnSale(
        tx,
        s.ctx,
        {
          saleId: createdSale.saleId,
          items: [{ saleItemId: saleItem.id, packQty: 1, looseQty: 0 }],
          refundMethod: "cash",
          reason: "Patient prescribed alternative brand",
        },
        { now },
      ),
    );

    expect(returnResult.returnId).toBeDefined();
    expect(returnResult.returnNo).toMatch(/^CN\/\d{2}-\d{2}\/\d{6}$/);
    expect(returnResult.returnNo.length).toBeLessThanOrEqual(16);
    expect(returnResult.totalAmount).toBe(10000); // 1 strip = ₹100
    expect(returnResult.restoredBatchesCount).toBe(1);

    // 3. Verify stock restored by 10 (20 -> 30)
    const [batchAfterReturn] = await t.db
      .select({ qtyOnHand: schema.batches.qtyOnHand, status: schema.batches.status })
      .from(schema.batches)
      .where(eq(schema.batches.id, s.batch.id));
    expect(batchAfterReturn.qtyOnHand).toBe(30);
    expect(batchAfterReturn.status).toBe("active");

    // 4. Verify traceable stock movement row
    const stockMovements = await t.db
      .select()
      .from(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.refId, returnResult.returnId),
          eq(schema.stockMovements.refType, "sale_return"),
        ),
      );
    expect(stockMovements).toHaveLength(1);
    expect(stockMovements[0].type).toBe("sale_return");
    expect(stockMovements[0].qtyChange).toBe(10);

    // 5. Verify saleItem returnedQty and sales returnedAmount
    const [updatedSaleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.id, saleItem.id));
    expect(updatedSaleItem.returnedQty).toBe(10);

    const [updatedSale] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, createdSale.saleId));
    expect(updatedSale.returnedAmount).toBe(10000);
    expect(updatedSale.status).toBe("completed"); // Status remains completed

    // 6. Verify balanced Double-entry General Ledger journal
    const journalLines = await t.db
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, returnResult.journalEntryId));

    expect(journalLines.length).toBeGreaterThan(0);
    const sumDebit = journalLines.reduce((sum, l) => sum + l.debit, 0);
    const sumCredit = journalLines.reduce((sum, l) => sum + l.credit, 0);
    expect(sumDebit).toBe(sumCredit);
    expect(sumCredit).toBe(10000); // Equal to total credit note amount

    // 7. Verify GST credit note document created for GSTR-1
    const [gstDoc] = await t.db
      .select()
      .from(schema.gstDocuments)
      .where(
        and(
          eq(schema.gstDocuments.refType, "return"),
          eq(schema.gstDocuments.refId, returnResult.returnId),
        ),
      );
    expect(gstDoc).toBeDefined();
    expect(gstDoc.docType).toBe("credit_note");
    expect(gstDoc.docNo).toBe(returnResult.returnNo);
    expect(gstDoc.total).toBe(10000);

    // 8. Verify audit log entry
    const [auditLog] = await t.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, "sale_return"),
          eq(schema.auditLogs.entityId, returnResult.returnId),
        ),
      );
    expect(auditLog).toBeDefined();
    expect(auditLog.action).toBe("create");
    expect(auditLog.reason).toBe("Patient prescribed alternative brand");
  });

  it("permits subsequent second partial return of the remaining quantity and blocks further returns exceeding sold amount", async () => {
    const s = await setupSaleScene({ initialStock: 50, unitsPerPack: 10, rate: 10000 });
    const saleInput: SaleInput = {
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 30, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 30000 }],
      redeemPoints: 0,
    };

    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { source: "pos" }),
    );
    const [saleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, createdSale.saleId));

    // First return: 1 strip (10 base units)
    await t.db.transaction((tx) =>
      returnSale(tx, s.ctx, {
        saleId: createdSale.saleId,
        items: [{ saleItemId: saleItem.id, packQty: 1 }],
        refundMethod: "cash",
        reason: "Excess medicine",
      }),
    );

    // Second return: remaining 2 strips (20 base units)
    const secondReturn = await t.db.transaction((tx) =>
      returnSale(tx, s.ctx, {
        saleId: createdSale.saleId,
        items: [{ saleItemId: saleItem.id, packQty: 2 }],
        refundMethod: "upi",
        reason: "Patient completed course early",
      }),
    );
    expect(secondReturn.totalAmount).toBe(20000);

    // Verify all 30 units are returned and total returned amount is 30000
    const [finalSaleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.id, saleItem.id));
    expect(finalSaleItem.returnedQty).toBe(30);

    const [finalSale] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, createdSale.saleId));
    expect(finalSale.returnedAmount).toBe(30000);

    // Check getReturnableSaleDetails reports 0 available base qty
    const details = await getReturnableSaleDetails(t.db, s.ctx, createdSale.saleId);
    expect(details.items[0].availableBaseQty).toBe(0);
    expect(details.previousReturns).toHaveLength(2);

    // Attempting a third return must fail with RETURN_QTY_EXCEEDED
    await expect(
      t.db.transaction((tx) =>
        returnSale(tx, s.ctx, {
          saleId: createdSale.saleId,
          items: [{ saleItemId: saleItem.id, packQty: 1 }],
          refundMethod: "cash",
          reason: "Extra return attempt",
        }),
      ),
    ).rejects.toThrow(/Cannot return/);
  });

  it("automatically puts an expired batch into 'hold' status (quarantine) upon return", async () => {
    // Create a batch with expiry date in the future when sold
    const s = await setupSaleScene({ initialStock: 20, expiryDays: 10 });
    const saleInput: SaleInput = {
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 10, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 10000 }],
      redeemPoints: 0,
    };

    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { source: "pos" }),
    );
    const [saleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, createdSale.saleId));

    // Fast-forward return date to 30 days later when the batch is expired
    const returnDate = addDays(new Date(), 30);

    const returnResult = await t.db.transaction((tx) =>
      returnSale(
        tx,
        s.ctx,
        {
          saleId: createdSale.saleId,
          items: [{ saleItemId: saleItem.id, qty: 10 }],
          refundMethod: "cash",
          reason: "Customer returned expired drug after month",
        },
        { now: returnDate },
      ),
    );

    expect(returnResult.quarantinedBatchesCount).toBe(1);

    // Verify batch status was changed to 'hold' so it cannot be sold to other customers
    const [quarantinedBatch] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, s.batch.id));

    expect(quarantinedBatch.status).toBe("hold");
    expect(quarantinedBatch.qtyOnHand).toBe(20); // Restored
  });

  it("handles Customer Account Credit Note settlement (refundMethod: 'credit_note')", async () => {
    const s = await setupSaleScene({ initialStock: 50, rate: 5000 });
    const customer = await makeCustomer(t.db, s.w.tenant.id, {
      name: "Suresh Gupta",
      creditLimit: 50000,
    });

    const saleInput: SaleInput = {
      customerId: customer.id,
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 10, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [], // Full credit sale
      redeemPoints: 0,
    };

    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { source: "pos" }),
    );
    const [saleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, createdSale.saleId));

    const returnResult = await t.db.transaction((tx) =>
      returnSale(tx, s.ctx, {
        saleId: createdSale.saleId,
        items: [{ saleItemId: saleItem.id, qty: 10 }],
        refundMethod: "credit_note",
        reason: "Adjusted against customer outstanding",
      }),
    );

    expect(returnResult.refundMethod).toBe("credit_note");

    // Verify journal credited Debtors / Customer account
    const journalLines = await t.db
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, returnResult.journalEntryId));

    const debtorCredit = journalLines.find(
      (l) => l.partyType === "customer" && l.partyId === customer.id && l.credit > 0,
    );
    expect(debtorCredit).toBeDefined();
    expect(debtorCredit?.credit).toBe(5000);
  });

  it("rejects returns on cancelled sales", async () => {
    const s = await setupSaleScene({ initialStock: 20 });
    const saleInput: SaleInput = {
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 10, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 10000 }],
      redeemPoints: 0,
    };

    const now = new Date();
    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { now, source: "pos" }),
    );

    // Cancel the sale on the same day
    await t.db.transaction((tx) =>
      cancelSale(tx, s.ctx, { saleId: createdSale.saleId, reason: "Entered wrong patient" }, { now }),
    );

    const [saleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, createdSale.saleId));

    // Return attempt must fail
    await expect(
      t.db.transaction((tx) =>
        returnSale(tx, s.ctx, {
          saleId: createdSale.saleId,
          items: [{ saleItemId: saleItem.id, qty: 10 }],
          refundMethod: "cash",
          reason: "Trying to return cancelled sale",
        }),
      ),
    ).rejects.toThrow(/Cannot return items from a cancelled sale/);
  });

  it("handles inter-state sale return reversing IGST", async () => {
    // Inter-state store/sale: IGST instead of CGST/SGST
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id, { stateCode: "27" }); // Maharashtra
    const user = await makeUser(t.db);
    const customer = await makeCustomer(t.db, tenant.id, {
      name: "Bangalore Pharma Clinic",
      gstin: "29AAACC1206D1ZC", // Valid Karnataka (29) GSTIN -> Inter-state with Maharashtra (27)
      stateCode: "29",
    });

    const medicine = await makeMedicine(t.db, tenant.id, {
      unitsPerPack: 10,
      mrp: 10000,
      gstRateBp: 1800, // 18% IGST
    });

    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: medicine.id,
      qtyOnHand: 50,
      expiryDate: format(addDays(new Date(), 90), "yyyy-MM-dd"),
      mrp: 10000,
      saleRate: 10000,
      purchaseRate: 5000,
    });

    const ctx = ctxFor({ tenant, store, user });

    const saleInput: SaleInput = {
      customerId: customer.id,
      lines: [{ medicineId: medicine.id, batchId: batch.id, qty: 10, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "bank", amount: 10000 }],
      redeemPoints: 0,
    };

    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, ctx, saleInput, { source: "pos" }),
    );

    const [saleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, createdSale.saleId));

    const returnResult = await t.db.transaction((tx) =>
      returnSale(tx, ctx, {
        saleId: createdSale.saleId,
        items: [{ saleItemId: saleItem.id, qty: 10 }],
        refundMethod: "bank",
        reason: "B2B inter-state order return",
      }),
    );

    expect(returnResult.totalAmount).toBe(10000);
    expect(returnResult.taxAmount).toBeGreaterThan(0);

    // Verify journal has IGST output reversal
    const journalLines = await t.db
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, returnResult.journalEntryId));

    const sumDebit = journalLines.reduce((s, l) => s + l.debit, 0);
    const sumCredit = journalLines.reduce((s, l) => s + l.credit, 0);
    expect(sumDebit).toBe(sumCredit);

    // Verify GST document has IGST populated and CGST/SGST 0
    const [gstDoc] = await t.db
      .select()
      .from(schema.gstDocuments)
      .where(
        and(
          eq(schema.gstDocuments.refType, "return"),
          eq(schema.gstDocuments.refId, returnResult.returnId),
        ),
      );

    expect(gstDoc.cgst).toBe(0);
    expect(gstDoc.sgst).toBe(0);
    expect(gstDoc.igst).toBe(returnResult.taxAmount);
  });

  it("supports loose tablet return (pack + loose units)", async () => {
    // 1 strip = 10 tablets, sell 15 tablets (1 strip + 5 loose)
    const s = await setupSaleScene({ initialStock: 50, unitsPerPack: 10, rate: 10000 });
    const saleInput: SaleInput = {
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 15, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 15000 }],
      redeemPoints: 0,
    };

    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { source: "pos" }),
    );

    const [saleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, createdSale.saleId));

    // Return 3 loose tablets (0 pack + 3 loose)
    const returnResult = await t.db.transaction((tx) =>
      returnSale(tx, s.ctx, {
        saleId: createdSale.saleId,
        items: [{ saleItemId: saleItem.id, packQty: 0, looseQty: 3 }],
        refundMethod: "cash",
        reason: "Customer returned unconsumed loose tablets",
      }),
    );

    // 3 tablets of ₹10 = ₹30 (3000 paise)
    expect(returnResult.totalAmount).toBe(3000);

    const [updatedSaleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.id, saleItem.id));

    expect(updatedSaleItem.returnedQty).toBe(3);

    // Check remaining returnable: 15 - 3 = 12 base units (1 pack + 2 loose)
    const details = await getReturnableSaleDetails(t.db, s.ctx, createdSale.saleId);
    expect(details.items[0].availableBaseQty).toBe(12);
    expect(details.items[0].availablePackQty).toBe(1);
    expect(details.items[0].availableLooseQty).toBe(2);
  });

  it("repeated partial returns with cumulative rounding on uneven pack division sum to exact original line total with 0 drift", async () => {
    // 1 strip = 3 tablets, rate ₹100.00 (10000 paise)
    const s = await setupSaleScene({ initialStock: 30, unitsPerPack: 3, rate: 10000 });
    const saleInput: SaleInput = {
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 3, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 10000 }],
      redeemPoints: 0,
    };

    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { source: "pos" }),
    );

    const [saleItem] = await t.db
      .select()
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, createdSale.saleId));

    // Return 1st tablet:
    const ret1 = await t.db.transaction((tx) =>
      returnSale(tx, s.ctx, {
        saleId: createdSale.saleId,
        items: [{ saleItemId: saleItem.id, packQty: 0, looseQty: 1 }],
        refundMethod: "cash",
        reason: "Partial return 1",
      }),
    );
    expect(ret1.totalAmount).toBe(3333);

    // Return 2nd tablet:
    const ret2 = await t.db.transaction((tx) =>
      returnSale(tx, s.ctx, {
        saleId: createdSale.saleId,
        items: [{ saleItemId: saleItem.id, packQty: 0, looseQty: 1 }],
        refundMethod: "cash",
        reason: "Partial return 2",
      }),
    );
    expect(ret2.totalAmount).toBe(3334);

    // Return 3rd tablet:
    const ret3 = await t.db.transaction((tx) =>
      returnSale(tx, s.ctx, {
        saleId: createdSale.saleId,
        items: [{ saleItemId: saleItem.id, packQty: 0, looseQty: 1 }],
        refundMethod: "cash",
        reason: "Partial return 3",
      }),
    );
    expect(ret3.totalAmount).toBe(3333);

    // Sum of all 3 partial returns is exactly equal to the original 10000 paise (₹100.00)
    expect(ret1.totalAmount + ret2.totalAmount + ret3.totalAmount).toBe(10000);
  });
});
