import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createPurchase, resolvePendingPurchaseSupplier } from "@/server/domain/purchases";
import { getBatchesForExpiryReturn } from "@/server/domain/purchasing/purchase-returns";
import { normalizeExpiryDate } from "@/server/domain/import/normalize";
import { parseDistributorInvoice } from "@/server/domain/import/distributor-invoice";
import { PENDING_SUPPLIER_PLACEHOLDER_NAME } from "@/lib/pending-supplier";
import { makeTenant, makeStore, makeUser, makeMedicine } from "../setup/factories";

describe("GRN Pending Supplier Flow & CSV Header Extraction", () => {
  let tenantId: string;
  let storeId: string;
  let userId: string;
  let medId: string;

  beforeAll(async () => {
    const tenant = await makeTenant(db);
    tenantId = tenant.id;
    const store = await makeStore(db, tenantId);
    storeId = store.id;
    const user = await makeUser(db);
    userId = user.id;
    const med = await makeMedicine(db, tenantId, { name: "Dolo 650", gstRateBp: 1200 });
    medId = med.id;
  });

  it("extracts invoice header & supplier metadata from distributor CSVs", async () => {
    const csv = [
      "Supplier Name,Supplier GSTIN,Invoice No,Invoice Date,Item Name,Batch,Expiry,Qty,PTR,MRP,GST %",
      "J.B MEDICAL STORES,27ABCDE1234F1Z5,INV-8841,15-11-2026,Dolo 650,B201,12/2027,10,24.00,30.00,12",
    ].join("\n");

    const parsed = await parseDistributorInvoice(csv, { db, tenantId });
    expect(parsed.header?.invoiceNo).toBe("INV-8841");
    expect(parsed.header?.invoiceDate).toBe("2026-11-15");
    expect(parsed.extractedSupplier?.name).toBe("J.B MEDICAL STORES");
    expect(parsed.extractedSupplier?.gstin).toBe("27ABCDE1234F1Z5");
    expect(parsed.purchaseItems).toHaveLength(1);
  });

  it("posts GRN with pendingSupplierMeta and links everything when supplier is registered later", async () => {
    const posted = await db.transaction(async (tx) => {
      return createPurchase(
        tx,
        { tenantId, storeId, userId },
        {
          supplierId: "",
          supplierInvoiceNo: "INV-PEND-1",
          invoiceDate: "2026-11-20",
          pendingSupplierMeta: {
            name: "J.B MEDICAL STORES",
            gstin: "27ABCDE1234F1Z5",
            phone: "9876543210",
            drugLicenseNo: "MH-MZ-9988",
            address: "Dadar Wholesale Market",
          },
          items: [
            {
              medicineId: medId,
              batchNo: "JB-101",
              expiryDate: "2028-05-31",
              qty: 5,
              freeQty: 0,
              rate: 2400,
              mrp: 3000,
              saleRate: 3000,
              gstRateBp: 1200,
            },
          ],
        }
      );
    });

    expect(posted.purchase.pendingSupplierMeta?.name).toBe("J.B MEDICAL STORES");

    const [placeholder] = await db
      .select()
      .from(schema.suppliers)
      .where(
        and(
          eq(schema.suppliers.tenantId, tenantId),
          eq(schema.suppliers.name, PENDING_SUPPLIER_PLACEHOLDER_NAME)
        )
      );
    expect(placeholder).toBeDefined();
    expect(posted.purchase.supplierId).toBe(placeholder.id);

    // Register real supplier later and link the pending purchase
    const [realSupplier] = await db
      .insert(schema.suppliers)
      .values({
        tenantId,
        name: "J.B MEDICAL STORES",
        gstin: "27ABCDE1234F1Z5",
        stateCode: "27",
        phone: "9876543210",
        drugLicenseNo: "MH-MZ-9988",
        address: "Dadar Wholesale Market",
        isActive: true,
      })
      .returning();

    await db.transaction(async (tx) => {
      await resolvePendingPurchaseSupplier(tx, { tenantId }, {
        purchaseId: posted.purchase.id,
        supplierId: realSupplier.id,
      });
    });

    const [updatedPurchase] = await db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.id, posted.purchase.id));

    expect(updatedPurchase.supplierId).toBe(realSupplier.id);
    expect(updatedPurchase.pendingSupplierMeta).toBeNull();

    const [updatedGst] = await db
      .select()
      .from(schema.gstDocuments)
      .where(
        and(
          eq(schema.gstDocuments.tenantId, tenantId),
          eq(schema.gstDocuments.refType, "purchase"),
          eq(schema.gstDocuments.refId, posted.purchase.id)
        )
      );
    expect(updatedGst?.partyName).toBe("J.B MEDICAL STORES");
    expect(updatedGst?.partyGstin).toBe("27ABCDE1234F1Z5");
  });

  it("exposes expired and near-expiry GRN batches in Expiry Returns and normalizes diverse expiry formats", async () => {
    expect(normalizeExpiryDate("10/25")).toEqual({ success: true, date: "2025-10-31" });
    expect(normalizeExpiryDate("2025-10")).toEqual({ success: true, date: "2025-10-31" });
    expect(normalizeExpiryDate("Oct-25")).toEqual({ success: true, date: "2025-10-31" });

    const medExpired = await makeMedicine(db, tenantId, { name: "Starpress T 50 XL Tab.", gstRateBp: 1200 });
    const medNear = await makeMedicine(db, tenantId, { name: "Pantocid DCR Cap.", gstRateBp: 1200 });

    const todayIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const dNear = new Date(`${todayIst}T00:00:00.000Z`);
    dNear.setUTCDate(dNear.getUTCDate() + 20);
    const nearExpiryStr = dNear.toISOString().split("T")[0]!;

    const posted = await db.transaction(async (tx) => {
      return createPurchase(
        tx,
        { tenantId, storeId, userId },
        {
          supplierId: "",
          supplierInvoiceNo: "C-4754",
          invoiceDate: todayIst,
          pendingSupplierMeta: {
            name: "J.B MEDICAL STORES",
            phone: "8000682056",
            drugLicenseNo: "20-136251",
            address: "1-2, S K Complex, Khanpur, Ahmedabad -1.",
          },
          items: [
            {
              medicineId: medExpired.id,
              batchNo: "U200239",
              expiryDate: "2025-10-31",
              qty: 4,
              freeQty: 0,
              rate: 38700,
              mrp: 0,
              saleRate: 38700,
              gstRateBp: 1200,
            },
            {
              medicineId: medNear.id,
              batchNo: "230710540",
              expiryDate: nearExpiryStr,
              qty: 5,
              freeQty: 0,
              rate: 22900,
              mrp: 0,
              saleRate: 22900,
              gstRateBp: 1200,
            },
          ],
        }
      );
    });

    const candidatesPending = await getBatchesForExpiryReturn(db, tenantId, storeId, 60);
    const expCand = candidatesPending.find((c) => c.batchNo === "U200239");
    const nearCand = candidatesPending.find((c) => c.batchNo === "230710540");

    expect(expCand).toBeDefined();
    expect(expCand?.expiryDate).toBe("2025-10-31");
    expect(expCand?.qtyOnHand).toBe(4);
    expect(expCand?.supplierName).toBe("J.B MEDICAL STORES (Unregistered)");
    expect(expCand?.isPendingSupplier).toBe(true);
    expect(expCand?.supplierId).toBeNull();
    expect(nearCand).toBeDefined();
    expect(nearCand?.qtyOnHand).toBe(5);

    const [sup] = await db
      .insert(schema.suppliers)
      .values({
        tenantId,
        name: "J.B MEDICAL STORES",
        phone: "8000682056",
        stateCode: "24",
        isActive: true,
      })
      .returning();

    await db.transaction(async (tx) => {
      await resolvePendingPurchaseSupplier(tx, { tenantId }, {
        purchaseId: posted.purchase.id,
        supplierId: sup.id,
      });
    });

    const candidatesLinked = await getBatchesForExpiryReturn(db, tenantId, storeId, 60);
    const linkedExp = candidatesLinked.find((c) => c.batchNo === "U200239");
    expect(linkedExp?.supplierId).toBe(sup.id);
    expect(linkedExp?.supplierName).toBe("J.B MEDICAL STORES");
    expect(linkedExp?.isPendingSupplier).toBe(false);
  });
});
