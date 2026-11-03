export interface CreateAuditSessionParams {
  tenantId: string;
  storeId: string;
  scope: "full_store" | "racks";
  rackIds?: string[];
  blindCount?: boolean;
  notes?: string;
  userId: string;
}

export interface RecordAuditCountsParams {
  tenantId: string;
  sessionId: string;
  counts: Array<{
    itemId: string;
    countedQty: number;
    observedAt?: Date | string;
  }>;
  userId: string;
}

export interface ApproveAuditSessionParams {
  tenantId: string;
  storeId: string;
  sessionId: string;
  userId: string;
  notes?: string;
}

export interface StocktakeSummary {
  totalLines: number;
  countedLines: number;
  pendingLines: number;
  shortageLines: number;
  excessLines: number;
  exactLines: number;
  totalShortageCostPaise: number;
  totalExcessCostPaise: number;
  netVarianceCostPaise: number;
}

export interface FormattedAuditItem {
  id: string;
  batchId: string;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  batchNo: string;
  expiryDate: string;
  rackId: string | null;
  rackCode: string;
  rackName: string;
  systemQty: number | null;
  countedQty: number | null;
  varianceQty: number | null;
  unitCostPaise: number;
  varianceCostPaise: number | null;
  status: string;
  countedAt: Date | null;
}

export interface ReconciliationCalculation {
  finalBalance: number;
  adjustmentDelta: number;
  varianceCostPaise: number;
}
