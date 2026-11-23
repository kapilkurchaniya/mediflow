"use server";

import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { writeAudit } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { format } from "date-fns";
import { PENDING_SUPPLIER_PLACEHOLDER_NAME } from "@/lib/pending-supplier";
import {
  quarantineBatch,
  getQuarantinedBatches,
  createSupplierExpiryClaim,
  settleSupplierExpiryClaim,
} from "@/server/domain/inventory/expiry-claims";

export async function getQuarantinedBatchesAction(options?: {
  storeId?: string;
  status?: "quarantined" | "claimed" | "written_off";
  supplierId?: string;
}) {
  const ctx = await requirePermission("inventory.view");
  const storeId = options?.storeId || ctx.storeId;

  return getQuarantinedBatches(db, {
    tenantId: ctx.tenantId,
    storeId,
    status: options?.status,
    supplierId: options?.supplierId,
  });
}

export async function getNearExpiryBatchesForQuarantineAction(options?: {
  storeId?: string;
}) {
  const ctx = await requirePermission("inventory.view");
  const storeId = options?.storeId || ctx.storeId;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const ninetyDaysFromNow = format(
    new Date(Date.now() + 90 * 86400000),
    "yyyy-MM-dd"
  );

  const batches = await db
    .select({
      id: schema.batches.id,
      batchNo: schema.batches.batchNo,
      expiryDate: schema.batches.expiryDate,
      qtyOnHand: schema.batches.qtyOnHand,
      purchaseRate: schema.batches.purchaseRate,
      mrp: schema.batches.mrp,
      supplierId: schema.batches.supplierId,
      supplierName: schema.suppliers.name,
      medicineId: schema.medicines.id,
      medicineName: schema.medicines.name,
      genericName: schema.medicines.genericName,
      packUnit: schema.medicines.packUnit,
      looseUnit: schema.medicines.looseUnit,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .leftJoin(schema.suppliers, eq(schema.batches.supplierId, schema.suppliers.id))
    .where(
      and(
        eq(schema.batches.tenantId, ctx.tenantId),
        eq(schema.batches.storeId, storeId),
        eq(schema.batches.status, "active"),
        sql`${schema.batches.qtyOnHand} > 0`,
        lte(schema.batches.expiryDate, ninetyDaysFromNow)
      )
    )
    .orderBy(schema.batches.expiryDate);

  return batches.map((b) => ({
    ...b,
    supplierName:
      b.supplierName === PENDING_SUPPLIER_PLACEHOLDER_NAME
        ? "Unregistered Supplier"
        : b.supplierName,
    isExpired: b.expiryDate <= todayStr,
    purchaseRatePaise: b.purchaseRate || 0,
    mrpPaise: b.mrp || 0,
  }));
}

export async function getExpiryClaimsAction(options?: { storeId?: string }) {
  const ctx = await requirePermission("inventory.view");
  const storeId = options?.storeId || ctx.storeId;

  const claims = await db
    .select({
      claim: schema.expiryClaims,
      supplier: schema.suppliers,
    })
    .from(schema.expiryClaims)
    .innerJoin(schema.suppliers, eq(schema.expiryClaims.supplierId, schema.suppliers.id))
    .where(
      and(
        eq(schema.expiryClaims.tenantId, ctx.tenantId),
        eq(schema.expiryClaims.storeId, storeId)
      )
    )
    .orderBy(desc(schema.expiryClaims.createdAt));

  return claims.map((c) => ({
    id: c.claim.id,
    claimNo: c.claim.claimNo,
    supplierId: c.claim.supplierId,
    supplierName: c.supplier.name,
    status: c.claim.status,
    totalPaise: c.claim.totalPaise,
    settlementType: c.claim.settlementType,
    supplierCreditNoteNo: c.claim.supplierCreditNoteNo,
    notes: c.claim.notes,
    createdAt: c.claim.createdAt,
    settledAt: c.claim.settledAt,
  }));
}

export async function quarantineBatchAction(params: {
  storeId?: string;
  batchId: string;
  qty: number;
  reason?: "expired" | "damaged" | "recalled";
  notes?: string;
}) {
  const ctx = await requirePermission("inventory.adjust");
  const storeId = params.storeId || ctx.storeId;

  try {
    const quarantine = await db.transaction(async (tx) => {
      const q = await quarantineBatch(tx, {
        tenantId: ctx.tenantId,
        storeId,
        batchId: params.batchId,
        qty: params.qty,
        reason: params.reason,
        notes: params.notes,
        userId: ctx.userId,
      });

      await writeAudit(
        tx,
        {
          tenantId: ctx.tenantId,
          storeId,
          userId: ctx.userId,
        },
        {
          action: "stock_adjust",
          entityType: "quarantine_batch",
          entityId: q.id,
          newValue: {
            batchId: params.batchId,
            qty: params.qty,
            reason: params.reason,
          },
        }
      );

      return q;
    });

    revalidatePath("/dashboard/inventory/quarantine");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/batches");

    return { success: true, quarantineId: quarantine.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to quarantine batch";
    return { success: false, error: message };
  }
}

export async function createSupplierExpiryClaimAction(params: {
  storeId?: string;
  supplierId: string;
  quarantineIds: string[];
  notes?: string;
}) {
  const ctx = await requirePermission("purchase.return");
  const storeId = params.storeId || ctx.storeId;

  try {
    const claim = await db.transaction(async (tx) => {
      const c = await createSupplierExpiryClaim(tx, {
        tenantId: ctx.tenantId,
        storeId,
        supplierId: params.supplierId,
        quarantineIds: params.quarantineIds,
        notes: params.notes,
        userId: ctx.userId,
      });

      await writeAudit(
        tx,
        {
          tenantId: ctx.tenantId,
          storeId,
          userId: ctx.userId,
        },
        {
          action: "create",
          entityType: "expiry_claim",
          entityId: c.claimId,
          newValue: {
            claimNo: c.claimNo,
            supplierId: params.supplierId,
            totalPaise: c.totalPaise,
            itemCount: c.itemCount,
          },
        }
      );

      return c;
    });

    revalidatePath("/dashboard/inventory/quarantine");
    revalidatePath("/dashboard/purchases/returns");
    revalidatePath("/dashboard/accounting");

    return {
      success: true,
      claimId: claim.claimId,
      claimNo: claim.claimNo,
      totalPaise: claim.totalPaise,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate claim";
    return { success: false, error: message };
  }
}

export async function settleSupplierExpiryClaimAction(params: {
  storeId?: string;
  claimId: string;
  settlementType: "credit_note" | "replacement_stock" | "written_off";
  supplierCreditNoteNo?: string;
  notes?: string;
}) {
  const ctx = await requirePermission("purchase.return");
  const storeId = params.storeId || ctx.storeId;

  try {
    const settled = await db.transaction(async (tx) => {
      const s = await settleSupplierExpiryClaim(tx, {
        tenantId: ctx.tenantId,
        storeId,
        claimId: params.claimId,
        settlementType: params.settlementType,
        supplierCreditNoteNo: params.supplierCreditNoteNo,
        notes: params.notes,
        userId: ctx.userId,
      });

      await writeAudit(
        tx,
        {
          tenantId: ctx.tenantId,
          storeId,
          userId: ctx.userId,
        },
        {
          action: "update",
          entityType: "expiry_claim",
          entityId: params.claimId,
          newValue: {
            settlementType: params.settlementType,
            supplierCreditNoteNo: params.supplierCreditNoteNo,
            status: s.status,
          },
        }
      );

      return s;
    });

    revalidatePath("/dashboard/inventory/quarantine");
    revalidatePath("/dashboard/purchases/returns");

    return { success: true, status: settled.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to settle claim";
    return { success: false, error: message };
  }
}

