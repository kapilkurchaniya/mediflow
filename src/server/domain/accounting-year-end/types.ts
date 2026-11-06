import { z } from "zod";

export const NRV_CLASSIFICATIONS = [
  "active",
  "near_expiry",
  "critical",
  "expired",
  "damaged",
  "quarantined",
] as const;

export type NrvClassification = (typeof NRV_CLASSIFICATIONS)[number];

export const generateYearEndSnapshotSchema = z.object({
  tenantId: z.string().uuid(),
  storeId: z.string().uuid(),
  fiscalYear: z.string().regex(/^[0-9]{4}-[0-9]{4}$/, "Must be in YYYY-YYYY format"),
});

export type GenerateYearEndSnapshotInput = z.infer<typeof generateYearEndSnapshotSchema>;

export const overrideNrvSchema = z.object({
  tenantId: z.string().uuid(),
  storeId: z.string().uuid(),
  itemId: z.string().uuid(),
  overrideNrvPaise: z.number().int().min(0).max(100_000_000_000),
  reason: z.string().min(5, "Reason must be at least 5 characters"),
});

export type OverrideNrvInput = z.infer<typeof overrideNrvSchema>;

export const finalizeYearEndSchema = z.object({
  tenantId: z.string().uuid(),
  storeId: z.string().uuid(),
  fiscalYear: z.string().regex(/^[0-9]{4}-[0-9]{4}$/, "Must be in YYYY-YYYY format"),
});

export type FinalizeYearEndInput = z.infer<typeof finalizeYearEndSchema>;

export interface GlReconcilingItem {
  id: string;
  refType: string;
  refId: string;
  category: "unposted_physical" | "gl_only";
  amountPaise: number;
  notes: string;
}

export interface Gl1080SignedBridge {
  closingPhysicalStockPaise: number; // V_closing
  openingBalancePaise: number; // B_open
  postedAdjustmentsPaise: number; // A_posted
  unpostedPhysicalReconcilingPaise: number; // R_unposted_physical
  glOnlyReconcilingPaise: number; // R_gl_only
  residualDiscrepancyPaise: number; // Delta_residual = V - (B + A + R_phys - R_gl)
  isReconciled: boolean; // Math.abs(residualDiscrepancyPaise) === 0
  items: GlReconcilingItem[];
}

export interface HistoricalProvenanceCheck {
  valid: boolean;
  anomalousBatches: Array<{
    batchId: string;
    batchNumber: string;
    discrepancyReason: string;
  }>;
}

export interface ReadinessCheckItem {
  id: string;
  label: string;
  passed: boolean;
  details: string;
  blocker: boolean;
}

export interface YearEndReadinessResult {
  canFinalize: boolean;
  fiscalYear: string;
  cutoffDate: string;
  checks: ReadinessCheckItem[];
  trialBalanceBalanced: boolean;
  controlAccountsStatus: {
    account1050Balanced: boolean; // Inventory clearing
    account2010Balanced: boolean; // AP clearing
  };
  tillSessionsClosed: boolean;
  offlineSyncCompleted: boolean;
  unresolvedStockConflicts: number;
  unpostedVouchersCount: number;
  all12MonthPeriodLocksFinalized: boolean;
  historicalProvenance: HistoricalProvenanceCheck;
  gl1080Bridge: Gl1080SignedBridge;
}

export interface SequenceRolloverDocType {
  docType: string;
  currentClosingFiscalYear: string;
  currentSequenceValue: number;
  nextFiscalYear: string;
  simulatedFirstDocNumber: string;
  length: number;
  maxLength: number;
  isValidGstRule46b: boolean;
}

export interface SequenceRolloverPreview {
  currentFiscalYear: string;
  nextFiscalYear: string;
  docTypes: SequenceRolloverDocType[];
  allValidGstRule46b: boolean;
}
