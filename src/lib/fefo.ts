/**
 * FEFO (First-Expiry, First-Out) utility helpers for POS counter and domain services.
 */

export const FEFO_OVERRIDE_REASONS = [
  { code: "CUSTOMER_REQUEST", label: "Customer requested specific batch" },
  { code: "SHELF_DISCREPANCY", label: "Shelf batch discrepancy" },
  { code: "PACKAGING_DAMAGED", label: "Packaging damaged on earlier batch" },
  { code: "NEAR_EXPIRY_REJECTED", label: "Customer declined near-expiry batch" },
  { code: "STOCK_COUNT_ERROR", label: "Stock count discrepancy" },
  { code: "OTHER", label: "Other (specify)" },
] as const;

export type FefoOverrideReasonCode = (typeof FEFO_OVERRIDE_REASONS)[number]["code"];

export interface FefoComparableBatch {
  id: string;
  expiryDate: string;
  createdAt?: string | Date | null;
}

export interface FefoBatchCandidate extends FefoComparableBatch {
  batchNo: string;
  qtyOnHand: number;
  status?: string;
}

export interface FefoSlice {
  batchId: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
}

export interface FefoPreviewResult {
  isSplit: boolean;
  slices: FefoSlice[];
  totalAvailable: number;
  hasShortage: boolean;
  summaryText: string;
}

/**
 * Deterministic FEFO comparator implementing the contract:
 * expiryDate ASC -> createdAt ASC -> id ASC
 */
export function isFefoEarlier(a: FefoComparableBatch, b: FefoComparableBatch): boolean {
  if (a.expiryDate !== b.expiryDate) {
    return a.expiryDate < b.expiryDate;
  }
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  const safeATime = Number.isNaN(aTime) ? 0 : aTime;
  const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
  if (safeATime !== safeBTime) {
    return safeATime < safeBTime;
  }
  return a.id.localeCompare(b.id) < 0;
}

/**
 * Checks whether selecting a specific batch skips earlier-expiring active batches that have stock.
 * Evaluates the full deterministic FEFO tuple: expiryDate ASC -> createdAt ASC -> id ASC.
 */
export function isFefoOverride<T extends { id: string; expiryDate: string; qtyOnHand: number; status?: string; createdAt?: string | Date | null }>(
  chosenBatch: { id: string; expiryDate: string; createdAt?: string | Date | null },
  availableBatches: T[],
  todayStr: string
): { isOverride: boolean; skippedBatches: T[] } {
  const skippedBatches = availableBatches.filter((b) => {
    if (b.id === chosenBatch.id) return false;
    const qty = typeof b.qtyOnHand === "number" && !Number.isNaN(b.qtyOnHand) ? b.qtyOnHand : 0;
    if (qty <= 0) return false;
    if (b.status && b.status !== "active") return false;
    if (b.expiryDate <= todayStr) return false;
    return isFefoEarlier(b, chosenBatch);
  });

  return {
    isOverride: skippedBatches.length > 0,
    skippedBatches,
  };
}

/**
 * Computes greedy FEFO allocation preview across active, non-expired batches with stock.
 */
export function computeFefoPreview(
  batches: FefoBatchCandidate[],
  requestedQty: number,
  todayStr: string
): FefoPreviewResult {
  const safeReqQty = Math.max(0, Math.floor(Number(requestedQty) || 0));

  const eligible = batches
    .filter((b) => {
      const qty = typeof b.qtyOnHand === "number" && !Number.isNaN(b.qtyOnHand) ? b.qtyOnHand : 0;
      if (qty <= 0) return false;
      if (b.status && b.status !== "active") return false;
      if (b.expiryDate <= todayStr) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.expiryDate !== b.expiryDate) {
        return a.expiryDate.localeCompare(b.expiryDate);
      }
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const safeATime = Number.isNaN(aTime) ? 0 : aTime;
      const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
      if (safeATime !== safeBTime) {
        return safeATime - safeBTime;
      }
      return a.id.localeCompare(b.id);
    });

  const totalAvailable = eligible.reduce((sum, b) => sum + Math.max(0, b.qtyOnHand || 0), 0);
  const hasShortage = totalAvailable < safeReqQty;

  const slices: FefoSlice[] = [];
  let remaining = safeReqQty;

  for (const b of eligible) {
    if (remaining <= 0) break;
    const avail = Math.max(0, b.qtyOnHand || 0);
    const take = Math.min(remaining, avail);
    if (take <= 0) continue;
    slices.push({
      batchId: b.id,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      qty: take,
    });
    remaining -= take;
  }

  const isSplit = slices.length > 1;
  const summaryText = slices.map((s) => `${s.qty} from ${s.batchNo}`).join(" + ");

  return {
    isSplit,
    slices,
    totalAvailable,
    hasShortage,
    summaryText,
  };
}
