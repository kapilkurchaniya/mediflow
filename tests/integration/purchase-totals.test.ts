 import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../setup/db";
import { makeWorld, makeSupplier, makeMedicine } from "../setup/factories";
import * as schema from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { createPurchase } from "@/server/domain/purchases";

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t?.cleanup();
});

describe("Purchase Totals & Landed Cost Integration (B1.7 / B-2.0 / B-2.0a)", () => {
  it("enforces landed unit cost taxable ÷ (qty + free) on batches and stock movements", async () => {
    const world = await makeWorld(t.db);
    const supplier = await makeSupplier(t.db, world.tenant.id, {
      name: "MediSupply Distributors",
      stateCode: "27", // intra-state with store (27)
    });

    const medicine = await makeMedicine(t.db, world.tenant.id, {
      name: "Paracetamol 500mg",
      gstRateBp: 500,
    });

    // B-2.0 test case: 100 qty + 10 free qty @ ₹60 (6000 paise), 5% GST
    const res = await t.db.transaction((tx) =>
      createPurchase(
        tx,
        {
          tenantId: world.tenant.id,
          storeId: world.store.id,
          userId: world.user.id,
        },
        {
          supplierId: supplier.id,
          supplierInvoiceNo: "SB-001",
          invoiceDate: "2026-10-21",
          items: [
            {
              medicineId: medicine.id,
              batchNo: "PB1",
              expiryDate: "2027-10-31",
              qty: 100,
              freeQty: 10,
              rate: 6000, // ₹60
              mrp: 10000, // ₹100
              saleRate: 9000,
              discountBp: 0,
              gstRateBp: 500, // 5%
            },
          ],
        }
      )
    );

    expect(res.purchase.purchaseNo).toMatch(/^PUR\//);
    expect(res.purchase.isInterState).toBe(false);
    expect(res.purchase.taxableAmount).toBe(600000);
    expect(res.purchase.cgst).toBe(15000); // 2.5% = ₹150
    expect(res.purchase.sgst).toBe(15000); // 2.5% = ₹150
    expect(res.purchase.igst).toBe(0);
    expect(res.purchase.totalAmount).toBe(630000); // ₹6,300

    // 1. Verify batch: qtyOnHand = 110, purchaseRate = 5455 (600,000 / 110)
    const [batch] = await t.db
      .select()
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.storeId, world.store.id),
          eq(schema.batches.batchNo, "PB1")
        )
      );

    expect(batch).toBeDefined();
    expect(batch?.qtyOnHand).toBe(110);
    expect(batch?.purchaseRate).toBe(5455); // Landed cost!

    // 2. Verify purchase_items: landedUnitCost = 5455
    const [purchaseItem] = await t.db
      .select()
      .from(schema.purchaseItems)
      .where(eq(schema.purchaseItems.purchaseId, res.purchase.id));

    expect(purchaseItem).toBeDefined();
    expect(purchaseItem?.qty).toBe(100);
    expect(purchaseItem?.freeQty).toBe(10);
    expect(purchaseItem?.landedUnitCost).toBe(5455);
    expect(purchaseItem?.taxableAmount).toBe(600000);
    expect(purchaseItem?.cgst).toBe(15000);
    expect(purchaseItem?.sgst).toBe(15000);

    // 3. Verify stock movement: type="purchase", qtyChange=110, unitCost=5455
    const [movement] = await t.db
      .select()
      .from(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.batchId, batch!.id),
          eq(schema.stockMovements.type, "purchase")
        )
      );

    expect(movement).toBeDefined();
    expect(movement?.qtyChange).toBe(110);
    expect(movement?.balanceAfter).toBe(110);
    expect(movement?.unitCost).toBe(5455);

    // 4. Verify balanced journal entries
    const [journalEntry] = await t.db
      .select()
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.refType, "purchase"),
          eq(schema.journalEntries.refId, res.purchase.id)
        )
      );

    expect(journalEntry).toBeDefined();

    const journalLines = await t.db
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, journalEntry!.id));

    const totalDebit = journalLines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = journalLines.reduce((s, l) => s + (l.credit ?? 0), 0);

    expect(totalDebit).toBe(630000);
    expect(totalCredit).toBe(630000);
    expect(totalDebit).toBe(totalCredit);
  });

  it("determines inter-state purchase and charges IGST", async () => {
    const world = await makeWorld(t.db);
    // Supplier in Delhi (07), store in Maharashtra (27)
    const supplier = await makeSupplier(t.db, world.tenant.id, {
      name: "Delhi Pharma House",
      stateCode: "07",
    });

    const medicine = await makeMedicine(t.db, world.tenant.id, {
      name: "Amoxicillin 250mg",
      gstRateBp: 1200, // 12%
    });

    const res = await t.db.transaction((tx) =>
      createPurchase(
        tx,
        {
          tenantId: world.tenant.id,
          storeId: world.store.id,
          userId: world.user.id,
        },
        {
          supplierId: supplier.id,
          supplierInvoiceNo: "DEL-900",
          invoiceDate: "2026-10-21",
          items: [
            {
              medicineId: medicine.id,
              batchNo: "DEL-B1",
              expiryDate: "2028-05-31",
              qty: 50,
              freeQty: 0,
              rate: 2000, // ₹20
              mrp: 3500,
              saleRate: 3000,
              discountBp: 0,
              gstRateBp: 1200,
            },
          ],
        }
      )
    );

    expect(res.purchase.isInterState).toBe(true);
    expect(res.purchase.taxableAmount).toBe(100000); // 50 * 2000
    expect(res.purchase.cgst).toBe(0);
    expect(res.purchase.sgst).toBe(0);
    expect(res.purchase.igst).toBe(12000); // 12% IGST
    expect(res.purchase.totalAmount).toBe(112000);

    // Verify journal has IGST Input debit
    const [journalEntry] = await t.db
      .select()
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.refType, "purchase"),
          eq(schema.journalEntries.refId, res.purchase.id)
        )
      );

    const journalLines = await t.db
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, journalEntry!.id));

    const totalDebit = journalLines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = journalLines.reduce((s, l) => s + (l.credit ?? 0), 0);
    expect(totalDebit).toBe(112000);
    expect(totalCredit).toBe(112000);
  });

  it("refuses duplicate supplier invoice number for the same supplier", async () => {
    const world = await makeWorld(t.db);
    const supplier = await makeSupplier(t.db, world.tenant.id, {
      name: "Unique Supplier",
    });

    const medicine = await makeMedicine(t.db, world.tenant.id);

    const input = {
      supplierId: supplier.id,
      supplierInvoiceNo: "DUP-100",
      invoiceDate: "2026-10-21",
      items: [
        {
          medicineId: medicine.id,
          batchNo: "B-DUP",
          expiryDate: "2027-01-01",
          qty: 10,
          freeQty: 0,
          rate: 5000,
          mrp: 8000,
          saleRate: 7000,
          discountBp: 0,
          gstRateBp: 500,
        },
      ],
    };

    // First time succeeds
    await t.db.transaction((tx) =>
      createPurchase(
        tx,
        {
          tenantId: world.tenant.id,
          storeId: world.store.id,
          userId: world.user.id,
        },
        input
      )
    );

    // Second time with identical supplierId and supplierInvoiceNo must fail
    await expect(
      t.db.transaction((tx) =>
        createPurchase(
          tx,
          {
            tenantId: world.tenant.id,
            storeId: world.store.id,
            userId: world.user.id,
          },
          input
        )
      )
    ).rejects.toThrow();
  });
});
