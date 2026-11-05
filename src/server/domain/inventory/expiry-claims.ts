import { schema, type DbOrTx, type Tx } from "@/server/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { nextDocNumber } from "@/server/domain/sequence";
import { format } from "date-fns";
import { postPurchaseReturnJournalEntry, getOrSeedAccounts } from "@/server/domain/accounting";
import { assertAccountingPeriodOpen } from "@/server/domain/accounting-periods";

export interface QuarantineBatchInput {
  tenantId: string;
  storeId: string;
  batchId: string;
  qty: number;
  reason?: "expired" | "damaged" | "recalled";
  notes?: string;
  userId: string;
}

export interface CreateExpiryClaimInput {
  tenantId: string;
  storeId: string;
  supplierId: string;
  quarantineIds: string[];
  notes?: string;
  userId: string;
}

export interface SettleExpiryClaimInput {
  tenantId: string;
  storeId: string;
  claimId: string;
  settlementType: "credit_note" | "replacement_stock" | "written_off";
  supplierCreditNoteNo?: string;
  notes?: string;
  userId: string;
}

/**
 * Isolates expired, damaged, or recalled stock away from active POS sales.
 * Enforces row-level lock on the batch, deducts quantity from active inventory,
 * writes an immutable stock movement, and creates a quarantined record.
 */
export async function quarantineBatch(
  tx: Tx,
  params: QuarantineBatchInput
) {
  const { tenantId, storeId, batchId, qty, reason = "expired", notes, userId } = params;

  if (qty <= 0) {
    throw new DomainError("INVALID_QTY", "Quarantine quantity must be greater than zero");
  }

  // 1. Lock the batch row for update
  const [lockedBatch] = await tx
    .select({
      id: schema.batches.id,
      medicineId: schema.batches.medicineId,
      batchNo: schema.batches.batchNo,
      expiryDate: schema.batches.expiryDate,
      purchaseRate: schema.batches.purchaseRate,
      mrp: schema.batches.mrp,
      supplierId: schema.batches.supplierId,
      qtyOnHand: schema.batches.qtyOnHand,
      status: schema.batches.status,
    })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.id, batchId),
        eq(schema.batches.tenantId, tenantId),
        eq(schema.batches.storeId, storeId)
      )
    )
    .for("update");

  if (!lockedBatch) {
    throw new DomainError("BATCH_NOT_FOUND", "Batch not found in this pharmacy store");
  }

  if (lockedBatch.qtyOnHand < qty) {
    throw new DomainError(
      "INSUFFICIENT_STOCK",
      `Cannot quarantine ${qty} units. Only ${lockedBatch.qtyOnHand} units available on hand.`
    );
  }

  const newQtyOnHand = lockedBatch.qtyOnHand - qty;
  const newStatus = newQtyOnHand === 0 ? "hold" : lockedBatch.status;

  // 2. Deduct active batch stock
  await tx
    .update(schema.batches)
    .set({
      qtyOnHand: newQtyOnHand,
      status: newStatus,
    })
    .where(eq(schema.batches.id, batchId));

  // 3. Write immutable stock movement
  const movementType = reason === "damaged" ? "damage" : "expired";
  await tx.insert(schema.stockMovements).values({
    tenantId,
    storeId,
    batchId,
    medicineId: lockedBatch.medicineId,
    type: movementType,
    qtyChange: -qty,
    balanceAfter: newQtyOnHand,
    unitCost: lockedBatch.purchaseRate,
    refType: "quarantine",
    note: notes || `Quarantined as ${reason}`,
    userId,
  });

  // 4. Create quarantine batch record
  const [quarantine] = await tx
    .insert(schema.quarantineBatches)
    .values({
      tenantId,
      storeId,
      batchId,
      medicineId: lockedBatch.medicineId,
      supplierId: lockedBatch.supplierId,
      qty,
      reason,
      status: "quarantined",
      notes,
      quarantinedBy: userId,
    })
    .returning();

  return quarantine;
}

/**
 * Retrieves quarantined items with full medicine, batch, and supplier metadata.
 */
export async function getQuarantinedBatches(
  dbOrTx: DbOrTx,
  params: {
    tenantId: string;
    storeId?: string;
    status?: "quarantined" | "claimed" | "written_off";
    supplierId?: string;
  }
) {
  const conditions = [eq(schema.quarantineBatches.tenantId, params.tenantId)];

  if (params.storeId) {
    conditions.push(eq(schema.quarantineBatches.storeId, params.storeId));
  }
  if (params.status) {
    conditions.push(eq(schema.quarantineBatches.status, params.status));
  }
  if (params.supplierId) {
    conditions.push(eq(schema.quarantineBatches.supplierId, params.supplierId));
  }

  const rows = await dbOrTx
    .select({
      quarantine: schema.quarantineBatches,
      medicine: schema.medicines,
      batch: schema.batches,
      supplier: schema.suppliers,
    })
    .from(schema.quarantineBatches)
    .innerJoin(schema.medicines, eq(schema.quarantineBatches.medicineId, schema.medicines.id))
    .innerJoin(schema.batches, eq(schema.quarantineBatches.batchId, schema.batches.id))
    .leftJoin(schema.suppliers, eq(schema.quarantineBatches.supplierId, schema.suppliers.id))
    .where(and(...conditions))
    .orderBy(schema.quarantineBatches.quarantinedAt);

  return rows.map((r) => ({
    id: r.quarantine.id,
    storeId: r.quarantine.storeId,
    batchId: r.quarantine.batchId,
    medicineId: r.quarantine.medicineId,
    medicineName: r.medicine.name,
    genericName: r.medicine.genericName,
    packUnit: r.medicine.packUnit || "pack",
    looseUnit: r.medicine.looseUnit || "unit",
    batchNo: r.batch.batchNo,
    expiryDate: r.batch.expiryDate,
    supplierId: r.quarantine.supplierId,
    supplierName: r.supplier?.name || "Unassigned Distributor",
    qty: r.quarantine.qty,
    ratePaise: r.batch.purchaseRate || 0,
    mrpPaise: r.batch.mrp || 0,
    totalPaise: (r.batch.purchaseRate || 0) * r.quarantine.qty,
    reason: r.quarantine.reason,
    status: r.quarantine.status,
    claimId: r.quarantine.claimId,
    quarantinedAt: r.quarantine.quarantinedAt,
    notes: r.quarantine.notes,
  }));
}

/**
 * Bundles quarantined batches by supplier into a formal distributor debit claim note (DN/EXP/...).
 * Debits Supplier Accounts Payable (Creditors) and Credits Purchase Returns in the general ledger.
 */
export async function createSupplierExpiryClaim(
  tx: Tx,
  params: CreateExpiryClaimInput
) {
  const { tenantId, storeId, supplierId, quarantineIds, notes, userId } = params;

  if (quarantineIds.length === 0) {
    throw new DomainError("EMPTY_CLAIM", "At least one quarantined batch is required to create a claim");
  }

  // 1. Fetch and validate quarantine items
  const items = await tx
    .select({
      quarantine: schema.quarantineBatches,
      batch: schema.batches,
      medicine: schema.medicines,
    })
    .from(schema.quarantineBatches)
    .innerJoin(schema.batches, eq(schema.quarantineBatches.batchId, schema.batches.id))
    .innerJoin(schema.medicines, eq(schema.quarantineBatches.medicineId, schema.medicines.id))
    .where(
      and(
        eq(schema.quarantineBatches.tenantId, tenantId),
        eq(schema.quarantineBatches.storeId, storeId),
        eq(schema.quarantineBatches.status, "quarantined"),
        inArray(schema.quarantineBatches.id, quarantineIds)
      )
    );

  if (items.length !== quarantineIds.length) {
    throw new DomainError(
      "INVALID_QUARANTINE_ITEMS",
      "One or more quarantined batches are not in quarantined status or do not match this branch"
    );
  }

  // Verify all belong to specified supplier
  for (const item of items) {
    if (item.quarantine.supplierId !== supplierId) {
      throw new DomainError(
        "SUPPLIER_MISMATCH",
        `Quarantined item ${item.medicine.name} (Batch ${item.batch.batchNo}) does not belong to the selected supplier`
      );
    }
  }

  // 2. Generate claim document number (DN/EXP/...)
  const claimNo = await nextDocNumber(tx, tenantId, storeId, "debit_note", "DN-EXP");

  let totalPaise = 0;
  const lineItemsData = items.map((i) => {
    const rate = i.batch.purchaseRate || 0;
    const lineTotal = rate * i.quarantine.qty;
    totalPaise += lineTotal;
    return {
      batchId: i.batch.id,
      medicineId: i.medicine.id,
      qty: i.quarantine.qty,
      ratePaise: rate,
      totalPaise: lineTotal,
    };
  });

  // 3. Create expiry claim record
  const [claim] = await tx
    .insert(schema.expiryClaims)
    .values({
      tenantId,
      storeId,
      claimNo,
      supplierId,
      status: "submitted",
      totalPaise,
      notes: notes || "Formal supplier claim for expired/damaged dump stock",
      createdBy: userId,
    })
    .returning();

  // 4. Create line items
  for (const line of lineItemsData) {
    await tx.insert(schema.expiryClaimItems).values({
      tenantId,
      claimId: claim.id,
      batchId: line.batchId,
      medicineId: line.medicineId,
      qty: line.qty,
      ratePaise: line.ratePaise,
      totalPaise: line.totalPaise,
    });
  }

  // 5. Update quarantine records to "claimed"
  await tx
    .update(schema.quarantineBatches)
    .set({
      status: "claimed",
      claimId: claim.id,
    })
    .where(inArray(schema.quarantineBatches.id, quarantineIds));

  // 6. Post double-entry accounting journal entry (Dr Supplier Payable, Cr Purchase Returns)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  await postPurchaseReturnJournalEntry({
    tx,
    tenantId,
    storeId,
    userId,
    returnId: claim.id,
    returnNo: claimNo,
    supplierId,
    returnDate: todayStr,
    taxableAmount: totalPaise,
    cgst: 0,
    sgst: 0,
    igst: 0,
    roundOff: 0,
    totalAmount: totalPaise,
  });

  return {
    claimId: claim.id,
    claimNo: claim.claimNo,
    totalPaise,
    itemCount: items.length,
  };
}

/**
 * Settles an expiry debit claim against distributor credit note, replacement goods, or write-off.
 */
export async function settleSupplierExpiryClaim(
  tx: Tx,
  params: SettleExpiryClaimInput
) {
  const { tenantId, storeId, claimId, settlementType, supplierCreditNoteNo, notes, userId } =
    params;

  const [claim] = await tx
    .select()
    .from(schema.expiryClaims)
    .where(
      and(
        eq(schema.expiryClaims.id, claimId),
        eq(schema.expiryClaims.tenantId, tenantId),
        eq(schema.expiryClaims.storeId, storeId)
      )
    )
    .limit(1);

  if (!claim) {
    throw new DomainError("CLAIM_NOT_FOUND", "Expiry claim not found");
  }

  if (claim.status === "settled") {
    throw new DomainError("ALREADY_SETTLED", "Claim has already been settled");
  }

  const now = new Date();

  // If settled via replacement stock: add incoming replacement units into inventory
  if (settlementType === "replacement_stock") {
    const claimItems = await tx
      .select({
        item: schema.expiryClaimItems,
        batch: schema.batches,
      })
      .from(schema.expiryClaimItems)
      .innerJoin(schema.batches, eq(schema.expiryClaimItems.batchId, schema.batches.id))
      .where(eq(schema.expiryClaimItems.claimId, claimId));

    for (const { item, batch } of claimItems) {
      // Find or create active replacement batch
      const replacementBatchNo = `${batch.batchNo}-REP`;
      const [existingBatch] = await tx
        .select()
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.tenantId, tenantId),
            eq(schema.batches.storeId, storeId),
            eq(schema.batches.medicineId, item.medicineId),
            eq(schema.batches.batchNo, replacementBatchNo)
          )
        )
        .limit(1);

      let targetBatchId: string;

      if (existingBatch) {
        targetBatchId = existingBatch.id;
        await tx
          .update(schema.batches)
          .set({
            qtyOnHand: sql`${schema.batches.qtyOnHand} + ${item.qty}`,
            status: "active",
          })
          .where(eq(schema.batches.id, existingBatch.id));
      } else {
        const [newBatch] = await tx
          .insert(schema.batches)
          .values({
            tenantId,
            storeId,
            medicineId: item.medicineId,
            batchNo: replacementBatchNo,
            expiryDate: format(new Date(now.getTime() + 365 * 86400000), "yyyy-MM-dd"), // 1 year forward
            purchaseRate: item.ratePaise,
            mrp: batch.mrp,
            saleRate: batch.saleRate,
            supplierId: claim.supplierId,
            qtyOnHand: item.qty,
            status: "active",
          })
          .returning({ id: schema.batches.id });
        targetBatchId = newBatch.id;
      }

      await tx.insert(schema.stockMovements).values({
        tenantId,
        storeId,
        batchId: targetBatchId,
        medicineId: item.medicineId,
        type: "purchase",
        qtyChange: item.qty,
        balanceAfter: item.qty,
        unitCost: item.ratePaise,
        refType: "claim_replacement",
        note: `Replacement stock for claim ${claim.claimNo}`,
        userId,
      });
    }
  }

  // If rejected / written off: book Loss on Expired Goods expense and reverse creditor debit
  if (settlementType === "written_off" && claim.totalPaise > 0) {
    const accounts = await getOrSeedAccounts(tx, tenantId);
    const entryNo = await nextDocNumber(tx, tenantId, storeId, "journal", "JV");
    const entryDateStr = format(now, "yyyy-MM-dd");

    await assertAccountingPeriodOpen(tx, { tenantId, entryDate: entryDateStr, storeId });

    const [jv] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId,
        entryNo,
        entryDate: entryDateStr,
        narration: `Loss on Expired Goods - Claim ${claim.claimNo} rejected/written-off`,
        refType: "claim_writeoff",
        refId: claimId,
        createdBy: userId,
      })
      .returning({ id: schema.journalEntries.id });

    // Debit: Purchases / Loss (4010), Credit: Supplier Creditors (2010 reversal)
    if (accounts.purchases && accounts.creditors) {
      await tx.insert(schema.journalLines).values([
        {
          tenantId,
          entryId: jv.id,
          accountId: accounts.purchases,
          debit: claim.totalPaise,
          credit: 0,
        },
        {
          tenantId,
          entryId: jv.id,
          accountId: accounts.creditors,
          debit: 0,
          credit: claim.totalPaise,
          partyType: "supplier",
          partyId: claim.supplierId,
        },
      ]);
    }
  }

  // Update claim status
  const finalStatus = settlementType === "written_off" ? "rejected" : "settled";
  const [updatedClaim] = await tx
    .update(schema.expiryClaims)
    .set({
      status: finalStatus,
      settlementType,
      supplierCreditNoteNo: supplierCreditNoteNo || null,
      settledBy: userId,
      settledAt: now,
      notes: notes ? `${claim.notes || ""}\n${notes}` : claim.notes,
    })
    .where(eq(schema.expiryClaims.id, claimId))
    .returning();

  // Update quarantine batches status
  await tx
    .update(schema.quarantineBatches)
    .set({
      status: settlementType === "written_off" ? "written_off" : "claimed",
    })
    .where(eq(schema.quarantineBatches.claimId, claimId));

  return updatedClaim;
}

