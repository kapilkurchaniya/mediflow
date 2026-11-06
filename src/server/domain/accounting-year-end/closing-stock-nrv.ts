import type { NrvClassification } from "./types";

export interface BatchValuationParams {
  expiryDate: string; // 'YYYY-MM-DD'
  landedCostPaise: number;
  catalogSaleRatePaise: number;
  retailMedianSellingRatePaise?: number | null;
  explicitClassification?: NrvClassification;
  hasSupplierClaimCredit?: boolean;
  evidencedSupplierClaimPaise?: number | null; // Evidenced recovery claim amount (can be partial)
  policyNearExpiryDiscountPct?: number; // Configurable: defaults to 20%
  policyCriticalDiscountPct?: number; // Configurable: defaults to 80%
}

export interface CalculatedNrvResult {
  classification: NrvClassification;
  estimatedNrvPaise: number;
  finalValuationPaisePerUnit: number;
  provisionPaisePerUnit: number;
  nrvBasis: string;
  nrvSource: string;
}

/**
 * Derives evidence-backed Net Realisable Value (NRV) per unit under ICDS II / AS-2.
 * Lower of cost and net realisable value policy.
 */
export function calculate6TierNrv(params: BatchValuationParams, cutoffDate: Date): CalculatedNrvResult {
  const cutoffTime = cutoffDate.getTime();
  const expiryTime = new Date(`${params.expiryDate}T23:59:59.999Z`).getTime();
  const msInDay = 24 * 60 * 60 * 1000;
  const daysUntilExpiry = Math.floor((expiryTime - cutoffTime) / msInDay);

  // Base retail selling rate: 90-day retail median less 2% direct selling expenses (200 basis points)
  const baseRate = params.retailMedianSellingRatePaise ?? params.catalogSaleRatePaise;
  const netRetailRatePaise = Math.max(0, Math.round(baseRate * 0.98));
  const rateSource = params.retailMedianSellingRatePaise ? "sales_ledger" : "catalog_sale_rate";

  let classification: NrvClassification = "active";
  let estimatedNrvPaise = netRetailRatePaise;
  let nrvBasis = "sales_history_90d";
  let nrvSource = rateSource;

  // Evidenced supplier recovery: bounded by landed cost, supporting partial credit notes
  const hasClaim = params.hasSupplierClaimCredit || (params.evidencedSupplierClaimPaise !== undefined && params.evidencedSupplierClaimPaise !== null);
  const recoveryPaise = params.evidencedSupplierClaimPaise !== undefined && params.evidencedSupplierClaimPaise !== null
    ? Math.min(params.landedCostPaise, Math.max(0, params.evidencedSupplierClaimPaise))
    : (params.hasSupplierClaimCredit ? params.landedCostPaise : 0);

  const nearDiscount = (params.policyNearExpiryDiscountPct ?? 20) / 100;
  const criticalDiscount = (params.policyCriticalDiscountPct ?? 80) / 100;

  // Tier 1: Quarantined / Damaged
  if (params.explicitClassification === "quarantined") {
    classification = "quarantined";
    estimatedNrvPaise = params.landedCostPaise; // held at cost pending QA inspection
    nrvBasis = "quarantine_pending_inspection";
    nrvSource = "policy_rules";
  } else if (params.explicitClassification === "damaged") {
    classification = "damaged";
    estimatedNrvPaise = hasClaim ? recoveryPaise : 0;
    nrvBasis = hasClaim ? (params.evidencedSupplierClaimPaise ? "supplier_claim_evidence" : "supplier_credit_claim") : "salvage_zero";
    nrvSource = hasClaim ? "supplier_claim_credit" : "inspection_report";
  } else if (daysUntilExpiry <= 0) {
    // Tier 2: Expired on or before cutoff date (31 March)
    classification = "expired";
    estimatedNrvPaise = hasClaim ? recoveryPaise : 0;
    nrvBasis = hasClaim ? (params.evidencedSupplierClaimPaise ? "supplier_claim_evidence" : "supplier_credit_claim") : "statutory_write_down";
    nrvSource = hasClaim ? "supplier_claim_credit" : "statutory_expiry_rule";
  } else if (daysUntilExpiry < 30) {
    // Tier 3: Critical Expiry (< 30 days) -> configurable policy discount
    classification = "critical";
    estimatedNrvPaise = Math.round(netRetailRatePaise * (1 - criticalDiscount));
    nrvBasis = `critical_expiry_${Math.round(criticalDiscount * 100)}pct_discount`;
    nrvSource = "policy_rules";
  } else if (daysUntilExpiry <= 90) {
    // Tier 4: Near Expiry (30 - 90 days) -> configurable policy discount
    classification = "near_expiry";
    estimatedNrvPaise = Math.round(netRetailRatePaise * (1 - nearDiscount));
    nrvBasis = `near_expiry_${Math.round(nearDiscount * 100)}pct_discount`;
    nrvSource = "policy_rules";
  }

  const finalValuationPaisePerUnit = Math.min(params.landedCostPaise, estimatedNrvPaise);
  const provisionPaisePerUnit = Math.max(0, params.landedCostPaise - finalValuationPaisePerUnit);

  return {
    classification,
    estimatedNrvPaise,
    finalValuationPaisePerUnit,
    provisionPaisePerUnit,
    nrvBasis,
    nrvSource,
  };
}
