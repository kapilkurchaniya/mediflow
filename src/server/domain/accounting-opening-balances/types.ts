import { z } from "zod";
import { createHash } from "crypto";

export const customerOpeningSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID"),
  amountPaise: z.number().int("Amount must be in integer paise").refine((n) => n !== 0, "Amount cannot be zero"),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  storeId: z.string().uuid("Invalid store ID").optional(),
});

export const supplierOpeningSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID"),
  amountPaise: z.number().int("Amount must be in integer paise").refine((n) => n !== 0, "Amount cannot be zero"),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  storeId: z.string().uuid("Invalid store ID").optional(),
});

export const inventorySnapshotSchema = z.object({
  storeId: z.string().uuid("Invalid store ID"),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

export const glOpeningSchema = z.object({
  accountId: z.string().uuid("Invalid account ID"),
  direction: z.enum(["debit", "credit"]),
  amountPaise: z.number().int("Amount must be in integer paise").positive("Amount must be positive"),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  narration: z.string().min(3, "Narration must be at least 3 characters"),
  storeId: z.string().uuid("Invalid store ID").optional(),
});

export const reclassifyEquitySchema = z.object({
  targetAccountId: z.string().uuid("Invalid target account ID"),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  reason: z.string().min(5, "Reason must be at least 5 characters"),
  storeId: z.string().uuid("Invalid store ID").optional(),
});

export interface OpeningBalanceResult {
  recordId: string;
  journalEntryId: string;
  alreadyPosted: boolean;
  status: "posted" | "reversed";
}

export interface InventorySnapshotResult {
  snapshotId: string;
  journalEntryId: string;
  itemsCount: number;
  totalValuePaise: number;
  alreadyPosted: boolean;
  status?: "captured" | "posted";
}

/**
 * Computes deterministic canonical SHA-256 hash for opening balance idempotency.
 * Normalizes key order, dates, string trimming, and integer values.
 */
export function computeCanonicalPayloadHash(payload: Record<string, unknown>): string {
  const sortedKeys = Object.keys(payload).sort();
  const canonicalObj: Record<string, unknown> = {};

  for (const k of sortedKeys) {
    const val = payload[k];
    if (val === undefined || val === null) continue;
    if (typeof val === "string") {
      canonicalObj[k] = val.trim();
    } else if (typeof val === "number") {
      canonicalObj[k] = Math.round(val);
    } else {
      canonicalObj[k] = val;
    }
  }

  return createHash("sha256").update(JSON.stringify(canonicalObj)).digest("hex");
}
