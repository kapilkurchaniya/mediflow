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

export interface FefoBatchCandidate {
  id: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  status?: string;
  createdAt?: string | Date;
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
 * Checks whether selecting a specific batch skips earlier-expiring active batches that have stock.
 */
export function isFefoOverride<T extends { id: string; expiryDate: string; qtyOnHand: number; status?: string }>(
  chosenBatch: { id: string; expiryDate: string },
  availableBatches: T[],
  todayStr?: string
): { isOverride: boolean; skippedBatches: T[] } {
  const skippedBatches = availableBatches.filter((b) => {
    if (b.id === chosenBatch.id) return false;
    if (b.qtyOnHand <= 0) return false;
    if (b.status && b.status !== "active") return false;
    if (todayStr && b.expiryDate <= todayStr) return false;
    return b.expiryDate < chosenBatch.expiryDate;
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
  todayStr?: string
): FefoPreviewResult {
  const eligible = batches
    .filter((b) => {
      if (b.qtyOnHand <= 0) return false;
      if (b.status && b.status !== "active") return false;
      if (todayStr && b.expiryDate <= todayStr) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.expiryDate !== b.expiryDate) {
        return a.expiryDate.localeCompare(b.expiryDate);
      }
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (aCreated !== bCreated) {
        return aCreated - bCreated;
      }
      return a.id.localeCompare(b.id);
    });

  const totalAvailable = eligible.reduce((sum, b) => sum + b.qtyOnHand, 0);
  const hasShortage = totalAvailable < requestedQty;

  const slices: FefoSlice[] = [];
  let remaining = requestedQty;

  for (const b of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.qtyOnHand);
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
