import type { StoreKind } from "./types";
import { MAX_INVOICE_NO_LENGTH } from "@/lib/regulatory";

/**
 * Capability check: Only active retail stores are permitted to process retail POS billing.
 * Warehouses or deactivated stores must be strictly rejected at the domain boundary.
 */
export function canStoreUsePos(store: { kind: StoreKind; isActive: boolean }): boolean {
  return store.isActive && store.kind === "retail";
}

/**
 * Capability check: Only active retail stores manage cash register shifts and physical drawers.
 */
export function canStoreManageShifts(store: { kind: StoreKind; isActive: boolean }): boolean {
  return store.isActive && store.kind === "retail";
}

/**
 * Capability check: Only active retail stores can park held counter sales.
 */
export function canStoreParkBills(store: { kind: StoreKind; isActive: boolean }): boolean {
  return store.isActive && store.kind === "retail";
}

/**
 * Capability check: Only active retail stores process walk-in customer sale returns.
 */
export function canStoreProcessSaleReturns(store: { kind: StoreKind; isActive: boolean }): boolean {
  return store.isActive && store.kind === "retail";
}

/**
 * Capability check: Both active retail stores and warehouses can receive supplier purchases and GRNs.
 */
export function canStoreReceivePurchases(store: { isActive: boolean }): boolean {
  return store.isActive;
}

/**
 * Capability check: Both active retail stores and warehouses can dispatch stock transfers.
 */
export function canStoreDispatchTransfers(store: { isActive: boolean }): boolean {
  return store.isActive;
}

/**
 * Capability check: Active stores (retail or warehouse) can perform inventory operations (adjustments, audits).
 */
export function canStorePerformInventoryOperations(store: { isActive: boolean }): boolean {
  return store.isActive;
}

export interface InvoiceSeriesConfig {
  prefix: string;
  financialYear?: string;
  maxSequenceDigits?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates the complete invoice numbering configuration according to CGST Rule 46(b).
 * Ensures that the rendered serial number `${prefix}/${fy}/${sequence}` never exceeds
 * the statutory 16-character limit at the maximum supported sequence width.
 */
export function validateInvoiceSeriesConfig(config: InvoiceSeriesConfig): ValidationResult {
  const prefix = config.prefix.trim().toUpperCase();
  if (!prefix) {
    return { valid: false, error: "Invoice prefix is required." };
  }

  // CGST permitted characters: alphanumeric, hyphen, slash
  if (!/^[A-Z0-9/-]+$/.test(prefix)) {
    return {
      valid: false,
      error: "Invoice prefix may only contain uppercase letters, numbers, hyphens, and slashes.",
    };
  }

  const fy = config.financialYear ?? "26-27";
  const seqDigits = config.maxSequenceDigits ?? 6;
  const maxSeq = "9".repeat(seqDigits);
  const sampleInvoiceNo = `${prefix}/${fy}/${maxSeq}`;

  if (sampleInvoiceNo.length > MAX_INVOICE_NO_LENGTH) {
    const suffixLength = `/${fy}/${maxSeq}`.length;
    const maxPrefixLen = MAX_INVOICE_NO_LENGTH - suffixLength;
    return {
      valid: false,
      error: `Invoice format "${sampleInvoiceNo}" (${sampleInvoiceNo.length} chars) exceeds the ${MAX_INVOICE_NO_LENGTH}-character statutory limit under GST Rule 46(b). Prefix can be at most ${maxPrefixLen} character(s).`,
    };
  }

  return { valid: true };
}
