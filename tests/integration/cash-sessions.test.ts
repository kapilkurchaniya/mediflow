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
import { returnSale } from "@/server/domain/sales/return-sale";
import { postPayment } from "@/server/domain/payments";
import {
  openShift,
  closeShift,
  getCurrentShift,
  computeExpectedCash,
  getXReport,
  getZReport,
  getShiftHistory,
  calculateDenominationTotalPaise,
  formatDenominationSummary,
} from "@/server/domain/cash-sessions";
import type { SaleInput } from "@/server/domain/sales/types";
import type { AuthCtx } from "@/server/rbac";
import { addDays, format } from "date-fns";

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

async function setupTestScene(opts: { initialStock?: number; requireShift?: boolean } = {}) {
  const tenant = await makeTenant(t.db, {
    settings: opts.requireShift ? { requireShift: true } : {},
  });
  const store = await makeStore(t.db, tenant.id, { stateCode: "27" });
  const user = await makeUser(t.db);
  const maker = (
    await t.db.insert(schema.manufacturers).values({ tenantId: tenant.id, name: "Sun Pharma" }).returning()
  )[0];

  const medicine = await makeMedicine(t.db, tenant.id, {
    manufacturerId: maker.id,
    name: "Paracetamol 650",
    hsn: "30049099",
    gstRateBp: 1200, // 12%
    unitsPerPack: 10,
    packUnit: "strip",
    looseUnit: "tablet",
  });

  const batch = await makeBatch(t.db, {
    tenantId: tenant.id,
    storeId: store.id,
    medicineId: medicine.id,
    batchNo: "BATCH-CS-001",
    expiryDate: format(addDays(new Date(), 365), "yyyy-MM-dd"),
    qtyOnHand: opts.initialStock ?? 100,
    mrp: 5000, // ₹50.00
    saleRate: 5000, // ₹50.00
    purchaseRate: 2500, // ₹25.00
  });

  const customer = await makeCustomer(t.db, tenant.id, {
    name: "Rajesh Kumar",
    phone: "9876543210",
    creditLimit: 500000, // ₹5,000 credit line
  });

  const ctx = ctxFor({ tenant, store, user });
  return { tenant, store, user, medicine, batch, customer, ctx };
}

describe("Task A2.6: Cash Register & Shifts Domain Service", () => {
  it("computes denomination totals and formats summaries accurately", () => {
    const denoms = { "500": 4, "200": 5, "100": 10, "50": 6 };
    // 4*500 + 5*200 + 10*100 + 6*50 = 2000 + 1000 + 1000 + 300 = ₹4,300 = 430,000 paise
    const totalPaise = calculateDenominationTotalPaise(denoms);
    expect(totalPaise).toBe(430000);

    const summary = formatDenominationSummary(denoms);
    expect(summary).toContain("₹500×4");
    expect(summary).toContain("₹200×5");
    expect(summary).toContain("₹100×10");
    expect(summary).toContain("₹50×6");
  });

  it("opens a new shift and prevents opening a second active shift for the same store", async () => {
    const scene = await setupTestScene();
    const { ctx, store } = scene;

    // 1. Open shift with ₹1,000 opening float
    const shift = await t.db.transaction(async (tx) => {
      return openShift(tx, ctx, {
        openingCash: 100000,
        denominations: { "500": 2 },
        notes: "Morning shift start",
      });
    });

    expect(shift.status).toBe("open");
    expect(shift.openingCash).toBe(100000);
    expect(shift.storeId).toBe(store.id);
    expect(shift.notes).toContain("[Opening Denominations: ₹500×2]");

    // 2. Query current active shift
    const current = await getCurrentShift(t.db, ctx);
    expect(current).not.toBeNull();
    expect(current?.session.id).toBe(shift.id);
    expect(current?.stats.openingCash).toBe(100000);
    expect(current?.stats.expectedCash).toBe(100000);

    // 3. Attempting to open another shift in the same store fails
    await expect(
      t.db.transaction(async (tx) => {
        return openShift(tx, ctx, { openingCash: 50000 });
      }),
    ).rejects.toThrow("An active register shift is already open for this store");

    // Close shift to leave clean state
    await t.db.transaction(async (tx) => {
      return closeShift(tx, ctx, { actualCash: 100000 });
    });
  });

  it("enforces requireShift rule: billing fails if shift is closed and succeeds when opened", async () => {
    // Scene configured with tenant setting requireShift = true
    const scene = await setupTestScene({ requireShift: true });
    const { ctx, batch, customer } = scene;

    const saleInput: SaleInput = {
      customerId: customer.id,
      payments: [{ method: "cash", amount: 5000 }],
      billDiscountPaise: 0,
      redeemPoints: 0,
      lines: [
        {
          batchId: batch.id,
          packQty: 1,
          looseQty: 0,
          discountBp: 0,
        },
      ],
    };

    // 1. Trying to bill without an active shift fails
    await expect(
      t.db.transaction(async (tx) => {
        return createSale(tx, ctx, saleInput);
      }),
    ).rejects.toThrow("An open cash register shift is required to complete sales");

    // 2. Open shift with ₹1,000
    await t.db.transaction(async (tx) => {
      return openShift(tx, ctx, { openingCash: 100000 });
    });

    // 3. Billing now succeeds!
    const bill = await t.db.transaction(async (tx) => {
      return createSale(tx, ctx, saleInput);
    });
    expect(bill.saleId).toBeDefined();

    // Clean up: close shift
    await t.db.transaction(async (tx) => {
      return closeShift(tx, ctx, { actualCash: 105000 });
    });
  });

  it("accurately computes expected cash across cash sales, UPI, split tenders, returns, cancels, and payouts", async () => {
    const scene = await setupTestScene({ initialStock: 100 });
    const { ctx, batch, customer, tenant, store, user } = scene;

    // 1. Open shift with ₹1,000 (100,000 paise)
    const shift = await t.db.transaction(async (tx) => {
      return openShift(tx, ctx, { openingCash: 100000 });
    });

    // 2. Cash sale 1: ₹50.00 (5,000 paise)
    const sale1 = await t.db.transaction(async (tx) => {
      return createSale(tx, ctx, {
        customerId: customer.id,
        payments: [{ method: "cash", amount: 5000 }],
        billDiscountPaise: 0,
        redeemPoints: 0,
        lines: [{ batchId: batch.id, packQty: 1, looseQty: 0, discountBp: 0 }],
      });
    });

    // 3. Non-cash sale 2: UPI ₹100.00 (10,000 paise) - does not affect physical drawer cash
    await t.db.transaction(async (tx) => {
      return createSale(tx, ctx, {
        customerId: customer.id,
        payments: [{ method: "upi", amount: 10000 }],
        billDiscountPaise: 0,
        redeemPoints: 0,
        lines: [{ batchId: batch.id, packQty: 2, looseQty: 0, discountBp: 0 }],
      });
    });

    // 4. Split tender sale 3: ₹50 cash + ₹50 card (total ₹100.00 / 10,000 paise)
    await t.db.transaction(async (tx) => {
      return createSale(tx, ctx, {
        customerId: customer.id,
        payments: [
          { method: "cash", amount: 5000 },
          { method: "card", amount: 5000 },
        ],
        billDiscountPaise: 0,
        redeemPoints: 0,
        lines: [{ batchId: batch.id, packQty: 2, looseQty: 0, discountBp: 0 }],
      });
    });

    // 5. Cash sale 4: ₹50 cash, which is then CANCELLED during this shift
    const sale4 = await t.db.transaction(async (tx) => {
      return createSale(tx, ctx, {
        customerId: customer.id,
        payments: [{ method: "cash", amount: 5000 }],
        billDiscountPaise: 0,
        redeemPoints: 0,
        lines: [{ batchId: batch.id, packQty: 1, looseQty: 0, discountBp: 0 }],
      });
    });

    await t.db.transaction(async (tx) => {
      return cancelSale(tx, ctx, {
        saleId: sale4.saleId,
        reason: "Customer changed mind at counter",
      });
    });

    // 6. Sale Return on Sale 1: 1 pack returned, cash refund of ₹50.00
    const [sale1Item] = await t.db
      .select({ id: schema.saleItems.id })
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, sale1.saleId))
      .limit(1);

    await t.db.transaction(async (tx) => {
      return returnSale(tx, ctx, {
        saleId: sale1.saleId,
        refundMethod: "cash",
        reason: "Medicine damaged box",
        items: [{ saleItemId: sale1Item.id, packQty: 1, looseQty: 0 }],
      });
    });

    // 7. Cash payout voucher: ₹20.00 (2,000 paise) expense paid out in cash
    const expenseAccount = (
      await t.db
        .insert(schema.accounts)
        .values({
          tenantId: tenant.id,
          code: `EXP-${Date.now()}`,
          name: "Tea & Refreshments",
          type: "expense",
        })
        .returning()
    )[0];

    await t.db.transaction(async (tx) => {
      return postPayment(tx, ctx, {
        direction: "out",
        partyType: "expense",
        expenseAccountId: expenseAccount.id,
        method: "cash",
        amount: 2000,
        paymentDate: format(new Date(), "yyyy-MM-dd"),
        note: "Daily tea expense",
      });
    });

    // 8. Verify Expected Cash Calculation:
    // Opening Float: ₹1,000 (100,000 p)
    // + Cash Sales: ₹50 (Sale 1) + ₹50 (Sale 3) + ₹50 (Sale 4) = ₹150 (15,000 p)
    // - Cash Cancels: ₹50 (Sale 4 cancelled) = 5,000 p
    // - Cash Returns: ₹50 (Sale 1 return) = 5,000 p
    // - Cash Payouts: ₹20 (Tea expense) = 2,000 p
    // Expected Cash = 100,000 + 15,000 - 5,000 - 5,000 - 2,000 = 103,000 paise (₹1,030.00)
    const stats = await computeExpectedCash(t.db, ctx, shift.id);

    expect(stats.openingCash).toBe(100000);
    expect(stats.cashSales).toBe(15000);
    expect(stats.cashCancels).toBe(5000);
    expect(stats.cashRefunds).toBe(5000);
    expect(stats.cashPayouts).toBe(2000);
    expect(stats.expectedCash).toBe(103000);

    // Verify non-cash tenders are recorded
    expect(stats.tenders.upi).toBe(10000);
    expect(stats.tenders.card).toBe(5000);

    // Clean up: close shift
    await t.db.transaction(async (tx) => {
      return closeShift(tx, ctx, { actualCash: 103000 });
    });
  });

  it("closes shift, records over/short discrepancy, generates X/Z reports, and allows opening subsequent shifts", async () => {
    const scene = await setupTestScene();
    const { ctx, store, user } = scene;

    // 1. Open shift
    const shift = await t.db.transaction(async (tx) => {
      return openShift(tx, ctx, { openingCash: 100000 });
    });

    // 2. Generate mid-shift X-Report snapshot while open
    const xReport = await getXReport(t.db, ctx);
    expect(xReport.type).toBe("x_report");
    expect(xReport.shift.status).toBe("open");
    expect(xReport.store.name).toBe(store.name);
    expect(xReport.cashDrawer.expectedCash).toBe(100000);
    expect(xReport.cashDrawer.actualCash).toBeNull();

    // 3. Close shift with shortage: counted ₹950 instead of expected ₹1,000 (short by ₹50 / 5,000 paise)
    const closed = await t.db.transaction(async (tx) => {
      return closeShift(tx, ctx, {
        actualCash: 95000,
        denominations: { "500": 1, "200": 2, "50": 1 },
        notes: "Missing ₹50 in loose coins",
      });
    });

    expect(closed.status).toBe("closed");
    expect(closed.expectedCash).toBe(100000);
    expect(closed.actualCash).toBe(95000);
    expect(closed.difference).toBe(-5000); // 5000 paise shortage
    expect(closed.closedBy).toBe(user.id);
    expect(closed.notes).toContain("Closing Variance: ₹50.00 SHORT");

    // 4. Generate end-of-shift Z-Report audit sheet
    const zReport = await getZReport(t.db, ctx, closed.id);
    expect(zReport.type).toBe("z_report");
    expect(zReport.shift.status).toBe("closed");
    expect(zReport.cashDrawer.actualCash).toBe(95000);
    expect(zReport.cashDrawer.difference).toBe(-5000);
    expect(zReport.shift.closedByName).toBe(user.name);

    // 5. Shift history reflects closed shift
    const history = await getShiftHistory(t.db, ctx);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].id).toBe(closed.id);
    expect(history[0].difference).toBe(-5000);

    // 6. Active shift is now null
    const active = await getCurrentShift(t.db, ctx);
    expect(active).toBeNull();

    // 7. Store can open a new shift now!
    const newShift = await t.db.transaction(async (tx) => {
      return openShift(tx, ctx, { openingCash: 120000 });
    });
    expect(newShift.status).toBe("open");

    // Clean up
    await t.db.transaction(async (tx) => {
      return closeShift(tx, ctx, { actualCash: 120000 });
    });
  });
});
