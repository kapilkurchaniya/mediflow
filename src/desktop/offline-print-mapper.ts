import { getPosDB } from "@/offline/db";
import type { OfflinePendingSale } from "@/offline/types";
import type { SalePrintData, SalePrintItem, SalePrintPayment } from "./types";

/**
 * Maps an OfflinePendingSale record to SalePrintData for ESC/POS or ESC/P raw printing.
 * Enriches medicine name and batch details from local Dexie database if available.
 */
export async function mapOfflineSaleToPrintData(
  bill: OfflinePendingSale,
  storeName = "MediFlow Pharmacy",
  storeCode = "STORE",
  dbInstance?: ReturnType<typeof getPosDB>,
): Promise<SalePrintData> {
  let db = dbInstance;
  if (!db) {
    try {
      db = getPosDB();
    } catch {
      db = undefined;
    }
  }

  const items: SalePrintItem[] = await Promise.all(
    bill.payload.lines.map(async (l) => {
      let medName = `Med #${l.medicineId ? l.medicineId.slice(0, 8) : "item"}`;
      let batchNo = l.batchId ? l.batchId.slice(0, 8) : "N/A";
      let expiryDate = "--/--";
      let mrpPaise = 0;
      let ratePaise = 0;
      const gstRateBp = 500;

      if (db && l.medicineId) {
        try {
          const med = await db.medicines.get(l.medicineId);
          if (med?.name) medName = med.name;
        } catch {
          // fallback to truncated ID
        }
      }

      if (db && l.batchId) {
        try {
          const b = await db.batches.get(l.batchId);
          if (b) {
            batchNo = b.batchNumber;
            expiryDate = b.expiryDate ? b.expiryDate.slice(0, 7) : "--/--";
            mrpPaise = b.mrpPaise;
            ratePaise = b.saleRatePaise || b.mrpPaise;
          }
        } catch {
          // fallback
        }
      }

      const totalPaise =
        ratePaise > 0 && l.qty
          ? Math.round(ratePaise * l.qty * (1 - (l.discountBp || 0) / 10000))
          : 0;

      return {
        name: medName,
        batchNo,
        expiryDate,
        packQty: l.packQty ?? 0,
        looseQty: l.looseQty ?? (l.qty ?? 1),
        unitsPerPack: 1,
        mrpPaise,
        ratePaise,
        discountBp: l.discountBp || 0,
        gstRateBp,
        amountPaise: totalPaise,
      };
    }),
  );

  const payments: SalePrintPayment[] = (bill.payload.payments || []).map((p) => ({
    method: p.method,
    amountPaise: p.amount,
    reference: p.reference,
  }));

  const totalPaise = payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const grossPaise = items.reduce((sum, it) => sum + it.amountPaise, 0) || totalPaise;
  const taxablePaise = Math.round(grossPaise / 1.05);
  const taxTotal = grossPaise - taxablePaise;
  const halfTax = Math.round(taxTotal / 2);

  return {
    storeName,
    storeAddress: `Branch Code: [${storeCode}]`,
    invoiceNo: bill.invoiceNo,
    completedAt: bill.createdAt,
    doctorName: bill.payload.compliance?.doctorName,
    doctorRegNo: bill.payload.compliance?.doctorRegNo,
    prescriptionRef: bill.payload.compliance?.prescriptionRef,
    patientName: "Walking Customer",
    items,
    payments,
    grossPaise,
    discountPaise: bill.payload.billDiscountPaise || 0,
    taxablePaise,
    cgstPaise: halfTax,
    sgstPaise: taxTotal - halfTax,
    roundOffPaise: 0,
    totalPaise,
  };
}
