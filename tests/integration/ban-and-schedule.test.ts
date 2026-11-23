import { describe, it, expect, beforeAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { makeTenant, makeStore, makeUser, makeMedicine, makeBatch } from "../setup/factories";
import { recordStockMovement } from "@/server/domain/stock";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import type { AuthCtx } from "@/server/rbac";

let mockCtx: AuthCtx;

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/server/rbac", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/rbac")>();
  return {
    ...actual,
    getAuthCtx: async () => mockCtx,
    requirePermission: async () => mockCtx,
    checkPermission: async () => ({ ok: true as const, ctx: mockCtx }),
  };
});

import { getCategories, discontinueOrDeleteMedicine } from "@/app/actions/inventory";
import { commitOcrStockUpdateAction, removeOrRecallBatchStock } from "@/app/actions/stock";

describe("Schedule OCR persistence, default categories, and ban/remove stock flows", () => {
  let tenantId: string;
  let storeId: string;
  let userId: string;

  beforeAll(async () => {
    const tenant = await makeTenant(db);
    tenantId = tenant.id;
    const store = await makeStore(db, tenantId);
    storeId = store.id;
    const user = await makeUser(db);
    userId = user.id;

    mockCtx = {
      tenantId,
      storeId,
      userId,
      user: { id: userId, name: "Pharmacist", email: "ph@test.local", pharmacistRegNo: "MH-123" },
      permissions: new Set(ALL_PERMISSIONS),
      allowedStoreIds: "all",
    };
  });

  it("auto-seeds default Indian pharmacy categories when a tenant has none", async () => {
    const cats = await getCategories();
    expect(cats.length).toBeGreaterThanOrEqual(10);
    expect(cats.some((c) => c.name === "Cardiovascular & BP")).toBe(true);
    expect(cats.some((c) => c.name === "Antibiotic")).toBe(true);
  });

  it("persists Schedule H on new OCR medicines and upgrades existing 'none' medicines", async () => {
    const existingMed = await makeMedicine(db, tenantId, {
      name: "AMLONG 2.5MG TAB",
      schedule: "none",
      rxRequired: false,
    });

    const res = await commitOcrStockUpdateAction({
      mode: "add",
      createMissingMedicines: true,
      items: [
        {
          medicineId: existingMed.id,
          medicineName: "AMLONG 2.5MG TAB",
          schedule: "H",
          rxRequired: true,
          batchNo: "AMTS0009",
          expiryDate: "2028-09-30",
          unitsPerPack: 15,
          baseQty: 60,
          ptrPaise: 153,
          mrpPaise: 191,
          saleRatePaise: 191,
          gstRateBp: 500,
          updateCatalogPackSize: false,
        },
        {
          medicineId: null,
          medicineName: "GLYCOMET-GP 4MG FORTE TAB",
          schedule: "G & H",
          rxRequired: true,
          batchNo: "APD25055",
          expiryDate: "2027-11-30",
          unitsPerPack: 10,
          baseQty: 40,
          ptrPaise: 1050,
          mrpPaise: 1321,
          saleRatePaise: 1321,
          gstRateBp: 500,
          updateCatalogPackSize: false,
        },
      ],
    });

    expect(res?.data?.updatedCount).toBe(2);

    const [upgraded] = await db
      .select()
      .from(schema.medicines)
      .where(eq(schema.medicines.id, existingMed.id));
    expect(upgraded.schedule).toBe("H");
    expect(upgraded.rxRequired).toBe(true);

    const [created] = await db
      .select()
      .from(schema.medicines)
      .where(
        and(
          eq(schema.medicines.tenantId, tenantId),
          eq(schema.medicines.name, "GLYCOMET-GP 4MG FORTE TAB")
        )
      );
    expect(created).toBeDefined();
    expect(created.schedule).toBe("H");
    expect(created.rxRequired).toBe(true);
  });

  it("bans a medicine (blocking POS & recalling/quarantining stock) and deletes unused batches/medicines", async () => {
    const bannedMed = await makeMedicine(db, tenantId, { name: "Banned FDC Tab" });
    const batch = await makeBatch(db, {
      tenantId,
      storeId,
      medicineId: bannedMed.id,
      batchNo: "BAN-01",
      expiryDate: "2028-12-31",
      qtyOnHand: 0,
    });
    await db.transaction(async (tx) => {
      await recordStockMovement({
        tx,
        tenantId,
        storeId,
        batchId: batch.id,
        medicineId: bannedMed.id,
        type: "opening",
        qtyChange: 50,
        unitCost: 500,
        userId,
      });
    });

    const banRes = await discontinueOrDeleteMedicine({
      medicineId: bannedMed.id,
      mode: "ban",
      reason: "CDSCO FDC ban notification",
      zeroOutStock: true,
    });
    expect(banRes.success).toBe(true);
    expect(banRes.deleted).toBe(false);

    const [medAfter] = await db
      .select()
      .from(schema.medicines)
      .where(eq(schema.medicines.id, bannedMed.id));
    expect(medAfter.isActive).toBe(false);

    const [batchAfter] = await db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, batch.id));
    expect(batchAfter.qtyOnHand).toBe(0);
    expect(batchAfter.status).toBe("hold");

    const qRows = await db
      .select()
      .from(schema.quarantineBatches)
      .where(eq(schema.quarantineBatches.batchId, batch.id));
    expect(qRows).toHaveLength(1);
    expect(qRows[0].reason).toBe("recalled");
    expect(qRows[0].qty).toBe(50);

    // Unused batch & medicine permanent deletion
    const unusedMed = await makeMedicine(db, tenantId, { name: "Typo Med Unused" });
    const unusedBatch = await makeBatch(db, {
      tenantId,
      storeId,
      medicineId: unusedMed.id,
      batchNo: "TYPO-01",
      expiryDate: "2028-12-31",
      qtyOnHand: 0,
    });

    const delBatchRes = await removeOrRecallBatchStock({
      batchId: unusedBatch.id,
      mode: "delete",
      reason: "Typo batch entry",
    });
    expect(delBatchRes.success).toBe(true);
    expect(delBatchRes.deleted).toBe(true);

    const delMedRes = await discontinueOrDeleteMedicine({
      medicineId: unusedMed.id,
      mode: "delete",
      reason: "Typo medicine entry",
    });
    expect(delMedRes.success).toBe(true);
    expect(delMedRes.deleted).toBe(true);
  });
});
