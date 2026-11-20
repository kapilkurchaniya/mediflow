import type { PosDB } from "./db";
import type { OfflineMedicine, OfflineBatch, OfflineCustomer, OfflineDoctor } from "./types";

export interface BatchStockSummary {
  batch: OfflineBatch;
  serverQty: number;
  allocatedQty: number;
  availableQty: number;
  isExpired: boolean;
}

export interface MedicineSearchResult {
  medicine: OfflineMedicine;
  batches: BatchStockSummary[];
  totalAvailableStock: number;
}

function isBatchActive(b: OfflineBatch): boolean {
  if (typeof b.isActive === "boolean") return b.isActive;
  if (typeof (b as unknown as { status?: string }).status === "string") {
    return (b as unknown as { status?: string }).status === "active";
  }
  return true;
}

/**
 * Calculates effective available stock for a batch taking into account provisional offline consumption.
 */
export async function getBatchAvailableStock(
  db: PosDB,
  storeId: string,
  batchId: string,
): Promise<BatchStockSummary | null> {
  const batch = await db.batches.get(batchId);
  if (!batch || batch.storeId !== storeId || !isBatchActive(batch)) {
    return null;
  }

  const allocations = await db.provisionalAllocations
    .where("[storeId+batchId]")
    .equals([storeId, batchId])
    .toArray();

  const allocatedQty = allocations.reduce((sum, a) => sum + a.qty, 0);
  const availableQty = Math.max(0, batch.qtyOnHand - allocatedQty);
  const isExpired = new Date(batch.expiryDate).getTime() < Date.now();

  return {
    batch,
    serverQty: batch.qtyOnHand,
    allocatedQty,
    availableQty,
    isExpired,
  };
}

/**
 * Searches medicines offline in Dexie by barcode, brand name, or generic molecule.
 * Batches are ranked according to FEFO (First-Expiry-First-Out) with provisional stock applied.
 */
export async function searchMedicines(
  db: PosDB,
  tenantId: string,
  storeId: string,
  query: string,
  limit = 20,
): Promise<MedicineSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // 1. Try exact barcode lookup first
  const byBarcode = await db.medicines
    .where("barcode")
    .equals(query.trim())
    .toArray();

  let matchedMeds: OfflineMedicine[] = byBarcode.filter(
    (m) => (tenantId === "default-tenant" || m.tenantId === tenantId) && m.isActive,
  );

  // 2. If no barcode match or query might be a name, search name and genericName
  if (matchedMeds.length === 0) {
    const allTenantMeds = tenantId === "default-tenant"
      ? await db.medicines.toArray()
      : await db.medicines
          .where("tenantId")
          .equals(tenantId)
          .toArray();

    matchedMeds = allTenantMeds
      .filter((m) => {
        if (!m.isActive) return false;
        const nameMatch = m.name.toLowerCase().includes(q);
        const genericMatch = m.genericName ? m.genericName.toLowerCase().includes(q) : false;
        return nameMatch || genericMatch;
      })
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aRank = aName === q ? 0 : aName.startsWith(q) ? 1 : aName.includes(q) ? 2 : 3;
        const bRank = bName === q ? 0 : bName.startsWith(q) ? 1 : bName.includes(q) ? 2 : 3;
        if (aRank !== bRank) return aRank - bRank;
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);
  }

  // 3. For each matched medicine, fetch active batches for this store and calculate stock
  const results: MedicineSearchResult[] = [];

  for (const medicine of matchedMeds) {
    const storeBatches = await db.batches
      .where("[storeId+medicineId]")
      .equals([storeId, medicine.id])
      .toArray();

    const activeBatches = storeBatches.filter(isBatchActive);

    const batchSummaries: BatchStockSummary[] = [];
    let totalStock = 0;

    for (const batch of activeBatches) {
      const summary = await getBatchAvailableStock(db, storeId, batch.id);
      if (summary && summary.availableQty > 0) {
        batchSummaries.push(summary);
        totalStock += summary.availableQty;
      }
    }

    // FEFO order: earliest expiry date first
    batchSummaries.sort((a, b) =>
      a.batch.expiryDate.localeCompare(b.batch.expiryDate),
    );

    results.push({
      medicine,
      batches: batchSummaries,
      totalAvailableStock: totalStock,
    });
  }

  return results;
}

/**
 * Searches customers offline in Dexie by phone or customer name.
 */
export async function searchCustomers(
  db: PosDB,
  tenantId: string,
  query: string,
  limit = 10,
): Promise<OfflineCustomer[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Try phone exact prefix match
  const byPhone = await db.customers
    .where("phone")
    .startsWith(query.trim())
    .toArray();

  const phoneMatches = byPhone.filter((c) => c.tenantId === tenantId && c.isActive);
  if (phoneMatches.length >= limit) {
    return phoneMatches.slice(0, limit);
  }

  // Otherwise scan tenant customers by name
  const allCustomers = await db.customers
    .where("tenantId")
    .equals(tenantId)
    .toArray();

  const nameMatches = allCustomers.filter(
    (c) =>
      c.isActive &&
      c.name.toLowerCase().includes(q) &&
      !phoneMatches.some((pm) => pm.id === c.id),
  );

  return [...phoneMatches, ...nameMatches].slice(0, limit);
}

/**
 * Searches registered doctors offline in Dexie by name or registration number.
 */
export async function searchDoctors(
  db: PosDB,
  tenantId: string,
  query: string,
  limit = 10,
): Promise<OfflineDoctor[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const allDoctors = await db.doctors
    .where("tenantId")
    .equals(tenantId)
    .toArray();

  return allDoctors
    .filter(
      (d) =>
        d.isActive &&
        (d.name.toLowerCase().includes(q) ||
          (d.regNo && d.regNo.toLowerCase().includes(q))),
    )
    .slice(0, limit);
}
