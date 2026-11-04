import type { PosDB } from "./db";
import type { PaymentMethod, OfflinePendingSale, OfflineProvisionalAllocation } from "./types";
import type { OfflineSale, OfflineSaleLine, OfflineSalePayment } from "@/server/domain/sync/types";
import { computeSaleTotals, type DocTotals, type SaleLineInput } from "@/lib/money";
import { allocateNextInvoiceNumber } from "./invoice-series";

export interface CreateOfflineSaleLineInput {
  batchId: string;
  medicineId: string;
  qty?: number;
  packQty?: number;
  looseQty?: number;
  unitsPerPack?: number;
  ratePaise: number; // GST-inclusive rate
  discountBp?: number;
  gstRateBp?: number;
}

export interface CreateOfflineSaleInput {
  storeId: string;
  deviceId: string;
  cashierId: string;
  customerId?: string;
  lines: CreateOfflineSaleLineInput[];
  payments: Array<{
    method: PaymentMethod;
    amountPaise: number;
    reference?: string;
  }>;
  billDiscountPaise?: number;
  compliance?: OfflineSale["compliance"];
  medicalRepId?: string;
}

export interface CreateOfflineSaleResult {
  clientSaleId: string;
  invoiceNo: string;
  sequenceNumber: number;
  fiscalYear: string;
  reservationId: string;
  totals: DocTotals;
  shouldReplenish: boolean;
}

/**
 * Creates an offline sale, allocates the next invoice number, records provisional stock allocations,
 * and enqueues the immutable sale payload in Dexie pendingSales outbox.
 */
export async function createOfflineSale(
  db: PosDB,
  input: CreateOfflineSaleInput,
): Promise<CreateOfflineSaleResult> {
  if (!input.lines || input.lines.length === 0) {
    throw new Error("Offline sale must contain at least one line item.");
  }

  // 1. Calculate totals using exact shared money math
  const saleLineInputs: SaleLineInput[] = input.lines.map((l) => ({
    qty: l.qty,
    packQty: l.packQty,
    looseQty: l.looseQty,
    unitsPerPack: l.unitsPerPack ?? 1,
    rate: l.ratePaise,
    discountBp: l.discountBp ?? 0,
    gstRateBp: l.gstRateBp ?? 500,
  }));

  const totals = computeSaleTotals(saleLineInputs, false, input.billDiscountPaise ?? 0);

  // Authoritatively prioritize device configuration from local Dexie storage
  const cfg = await db.getDeviceConfig();
  const effectiveStoreId = cfg?.storeId || input.storeId;
  const effectiveDeviceId = cfg?.deviceId || input.deviceId;
  const effectiveCashierId =
    (input.cashierId && input.cashierId !== "cashier-default" ? input.cashierId : null) ||
    cfg?.cashierId ||
    input.cashierId;

  // 2. Allocate consecutive invoice number from local block
  const allocated = await allocateNextInvoiceNumber(db, effectiveStoreId, effectiveDeviceId);

  const clientSaleId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sale-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const now = new Date().toISOString();

  // 3. Prepare server-compatible OfflineSale DTO
  const offlineLines: OfflineSaleLine[] = input.lines.map((l, i) => {
    const calcLine = totals.lines[i];
    return {
      batchId: l.batchId,
      medicineId: l.medicineId,
      qty: calcLine.baseQty,
      packQty: calcLine.packQty,
      looseQty: calcLine.looseQty,
      discountBp: l.discountBp ?? 0,
    };
  });

  const offlinePayments: OfflineSalePayment[] = input.payments.map((p) => ({
    method: p.method,
    amount: p.amountPaise,
    reference: p.reference,
  }));

  const salePayload: OfflineSale = {
    clientSaleId,
    invoiceNo: allocated.invoiceNo,
    fiscalYear: allocated.fiscalYear,
    sequenceNumber: allocated.sequenceNumber,
    reservationId: allocated.reservationId || undefined,
    createdBy: effectiveCashierId,
    completedAt: now,
    customerId: input.customerId?.trim() ? input.customerId.trim() : undefined,
    lines: offlineLines,
    payments: offlinePayments,
    billDiscountPaise: input.billDiscountPaise ?? 0,
    compliance: input.compliance,
    medicalRepId: input.medicalRepId?.trim() ? input.medicalRepId.trim() : undefined,
  };

  const pendingSale: OfflinePendingSale = {
    clientSaleId,
    storeId: effectiveStoreId,
    deviceId: effectiveDeviceId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    nextRetryAt: now,
    invoiceNo: allocated.invoiceNo,
    fiscalYear: allocated.fiscalYear,
    sequenceNumber: allocated.sequenceNumber,
    payload: salePayload,
  };

  // 4. Commit sale and provisional stock allocations in a single atomic Dexie transaction
  await db.transaction("rw", [db.pendingSales, db.provisionalAllocations], async () => {
    await db.pendingSales.put(pendingSale);

    const allocations: OfflineProvisionalAllocation[] = input.lines.map((l, i) => ({
      id: `${clientSaleId}-line-${i}`,
      storeId: effectiveStoreId,
      batchId: l.batchId,
      clientSaleId,
      qty: totals.lines[i].baseQty,
      createdAt: now,
    }));

    await db.provisionalAllocations.bulkPut(allocations);
  });

  return {
    clientSaleId,
    invoiceNo: allocated.invoiceNo,
    sequenceNumber: allocated.sequenceNumber,
    fiscalYear: allocated.fiscalYear,
    reservationId: allocated.reservationId,
    totals,
    shouldReplenish: allocated.shouldReplenish,
  };
}
