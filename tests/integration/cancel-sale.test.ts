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

async function setupSaleScene(opts: { schedule?: string; initialStock?: number } = {}) {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id, { stateCode: "27" });
  const user = await makeUser(t.db);
  const maker = (
    await t.db.insert(schema.manufacturers).values({ tenantId: tenant.id, name: "Sun Pharma" }).returning()
  )[0];

  const medicine = await makeMedicine(t.db, tenant.id, {
    schedule: opts.schedule ?? "none",
    manufacturerId: maker.id,
    unitsPerPack: 10,
    mrp: 10000,
  });

  const futureExpiry = format(addDays(new Date(), 180), "yyyy-MM-dd");
  const batch = await makeBatch(t.db, {
    tenantId: tenant.id,
    storeId: store.id,
    medicineId: medicine.id,
    qtyOnHand: opts.initialStock ?? 50,
    expiryDate: futureExpiry,
    mrp: 10000,
    saleRate: 10000,
    purchaseRate: 6000,
  });

  const w = { tenant, store, user, medicine };
  const ctx = ctxFor(w);

  return { w, ctx, batch, medicine };
}

describe("Sale Cancellation (Integration - Task A2.4)", () => {
  it("cancels a completed sale on same business day, restoring stock, mirroring journal, voiding GST doc, and recording audit", async () => {
    const s = await setupSaleScene({ initialStock: 50 });
    const customer = await makeCustomer(t.db, s.w.tenant.id, {
      name: "Ramesh Sharma",
      phone: "9876543210",
      creditLimit: 50000,
    });

    const saleInput: SaleInput = {
      customerId: customer.id,
      lines: [
        {
          medicineId: s.medicine.id,
          batchId: s.batch.id,
          qty: 10,
          discountBp: 0,
        },
      ],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 10000 }],
      redeemPoints: 0,
    };

    const now = new Date();
    const createdSale = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { now, source: "pos" }),
    );

    expect(createdSale.saleId).toBeDefined();

    // 1. Verify stock was decremented by 10
    const [batchAfterSale] = await t.db
      .select({ qtyOnHand: schema.batches.qtyOnHand })
      .from(schema.batches)
      .where(eq(schema.batches.id, s.batch.id));
    expect(batchAfterSale.qtyOnHand).toBe(40);

    // 2. Perform same-day cancellation
    const cancelResult = await t.db.transaction((tx) =>
      cancelSale(tx, s.ctx, {
        saleId: createdSale.saleId,
        reason: "Customer cancelled bill before leaving counter",
      }, { now }),
    );

    expect(cancelResult.status).toBe("cancelled");
    expect(cancelResult.saleId).toBe(createdSale.saleId);
    expect(cancelResult.reversalEntryNo).toBeDefined();
    expect(cancelResult.restoredBatchesCount).toBe(1);

    // 3. Verify sale status in DB
    const [saleInDb] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, createdSale.saleId));
    expect(saleInDb.status).toBe("cancelled");
    expect(saleInDb.cancelledAt).not.toBeNull();
    expect(saleInDb.cancelReason).toBe("Customer cancelled bill before leaving counter");

    // 4. Verify batch stock was restored back to 50
    const [batchAfterCancel] = await t.db
      .select({ qtyOnHand: schema.batches.qtyOnHand })
      .from(schema.batches)
      .where(eq(schema.batches.id, s.batch.id));
    expect(batchAfterCancel.qtyOnHand).toBe(50);

    // 5. Verify stock movement was recorded with type: sale_return, refType: sale_cancel
    const movements = await t.db
      .select()
      .from(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.refType, "sale_cancel"),
          eq(schema.stockMovements.refId, createdSale.saleId),
        ),
      );
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe("sale_return");
    expect(movements[0].qtyChange).toBe(10);
    expect(movements[0].balanceAfter).toBe(50);

    // 6. Verify reversing journal entry mirrors original lines exactly
    const [origJv] = await t.db
      .select()
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.refType, "sale"),
          eq(schema.journalEntries.refId, createdSale.saleId),
        ),
      );
    expect(origJv).toBeDefined();

    const origLines = await t.db
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, origJv.id));

    const [reversalJv] = await t.db
      .select()
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.refType, "sale_cancel"),
          eq(schema.journalEntries.refId, createdSale.saleId),
        ),
      );
    expect(reversalJv).toBeDefined();

    const reversalLines = await t.db
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, reversalJv.id));

    expect(reversalLines.length).toBe(origLines.length);

    // Total original debits must equal total reversal credits, and vice-versa
    const origDebits = origLines.reduce((s, l) => s + l.debit, 0);
    const origCredits = origLines.reduce((s, l) => s + l.credit, 0);
    const revDebits = reversalLines.reduce((s, l) => s + l.debit, 0);
    const revCredits = reversalLines.reduce((s, l) => s + l.credit, 0);

    expect(origDebits).toBe(revCredits);
    expect(origCredits).toBe(revDebits);
    expect(revDebits).toBe(revCredits); // Balanced entry!

    // 7. Verify GST Document is cancelled (🤝 B2.6)
    const [gstDoc] = await t.db
      .select()
      .from(schema.gstDocuments)
      .where(
        and(
          eq(schema.gstDocuments.refType, "sale"),
          eq(schema.gstDocuments.refId, createdSale.saleId),
        ),
      );
    if (gstDoc) {
      expect(gstDoc.status).toBe("cancelled");
    }

    // 8. Verify loyalty points were reversed (🤝 B2.5)
    const [updatedCustomer] = await t.db
      .select({ loyaltyPoints: schema.customers.loyaltyPoints })
      .from(schema.customers)
      .where(eq(schema.customers.id, customer.id));
    expect(updatedCustomer.loyaltyPoints).toBe(0);

    // 9. Verify audit log entry was written
    const auditEntries = await t.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, "sale"),
          eq(schema.auditLogs.entityId, createdSale.saleId),
          eq(schema.auditLogs.action, "cancel"),
        ),
      );
    expect(auditEntries.length).toBe(1);
    expect(auditEntries[0].reason).toBe("Customer cancelled bill before leaving counter");
  });

  it("annotates statutory Schedule H/H1/X dispensing logs and never deletes them", async () => {
    const s = await setupSaleScene({ schedule: "H1", initialStock: 30 });
    const customer = await makeCustomer(t.db, s.w.tenant.id, {
      name: "Anil Kapoor",
      phone: "9988776655",
    });

    const saleInput: SaleInput = {
      customerId: customer.id,
      compliance: {
        doctorName: "Dr. A. Verma",
        doctorRegNo: "MCI-554433",
        patientName: "Anil Kapoor",
        patientAge: 45,
        patientGender: "male",
      },
      lines: [
        {
          medicineId: s.medicine.id,
          batchId: s.batch.id,
          qty: 5,
          discountBp: 0,
        },
      ],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 5000 }],
      redeemPoints: 0,
    };

    const now = new Date();
    const created = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { now, source: "pos" }),
    );

    // Verify statutory dispensing log was created
    const logsBefore = await t.db
      .select()
      .from(schema.dispensingLogs)
      .where(eq(schema.dispensingLogs.saleId, created.saleId));
    expect(logsBefore.length).toBe(1);
    expect(logsBefore[0].schedule).toBe("H1");

    // Cancel sale
    await t.db.transaction((tx) =>
      cancelSale(tx, s.ctx, {
        saleId: created.saleId,
        reason: "Patient returned prescription due to dosage error",
      }, { now }),
    );

    // Verify log was NOT deleted, but annotated with [CANCELLED: ...]
    const logsAfter = await t.db
      .select()
      .from(schema.dispensingLogs)
      .where(eq(schema.dispensingLogs.saleId, created.saleId));
    expect(logsAfter.length).toBe(1);
    expect(logsAfter[0].notes).toContain("[CANCELLED: Patient returned prescription due to dosage error");
  });

  it("rejects cancellation if the sale was completed on a previous business day", async () => {
    const s = await setupSaleScene({ initialStock: 50 });
    const now = new Date();
    const yesterday = subDays(now, 1);

    const saleInput: SaleInput = {
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 2, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 2000 }],
      redeemPoints: 0,
    };

    const created = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { now: yesterday, source: "pos" }),
    );

    // Attempt to cancel today
    await expect(
      t.db.transaction((tx) =>
        cancelSale(
          tx,
          s.ctx,
          {
            saleId: created.saleId,
            reason: "Trying to cancel yesterday bill",
          },
          { now },
        ),
      ),
    ).rejects.toThrow(/same business day/i);

    // Verify status was NOT changed
    const [sale] = await t.db
      .select({ status: schema.sales.status })
      .from(schema.sales)
      .where(eq(schema.sales.id, created.saleId));
    expect(sale.status).toBe("completed");
  });

  it("rejects cancellation if returns have already been recorded against the sale", async () => {
    const s = await setupSaleScene({ initialStock: 50 });
    const now = new Date();

    const saleInput: SaleInput = {
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 5, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 5000 }],
      redeemPoints: 0,
    };

    const created = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { now, source: "pos" }),
    );

    // Simulate a partial return
    await t.db
      .update(schema.sales)
      .set({ returnedAmount: 1000 })
      .where(eq(schema.sales.id, created.saleId));

    await expect(
      t.db.transaction((tx) =>
        cancelSale(
          tx,
          s.ctx,
          {
            saleId: created.saleId,
            reason: "Cancelling partially returned bill",
          },
          { now },
        ),
      ),
    ).rejects.toThrow(/returns recorded/i);
  });

  it("rejects cancellation if sale is already cancelled", async () => {
    const s = await setupSaleScene({ initialStock: 50 });
    const now = new Date();

    const saleInput: SaleInput = {
      lines: [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 2, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 2000 }],
      redeemPoints: 0,
    };

    const created = await t.db.transaction((tx) =>
      createSale(tx, s.ctx, saleInput, { now, source: "pos" }),
    );

    // Cancel once
    await t.db.transaction((tx) =>
      cancelSale(tx, s.ctx, { saleId: created.saleId, reason: "First cancellation" }, { now }),
    );

    // Attempt second cancel
    await expect(
      t.db.transaction((tx) =>
        cancelSale(tx, s.ctx, { saleId: created.saleId, reason: "Second cancellation" }, { now }),
      ),
    ).rejects.toThrow(/already been cancelled/i);
  });
});
