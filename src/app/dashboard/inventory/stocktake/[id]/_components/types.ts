export interface AuditItem {
  id: string;
  batchId: string;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  batchNo: string;
  expiryDate: string;
  rackCode: string;
  rackName: string;
  systemQty: number | null;
  countedQty: number | null;
  varianceQty: number | null;
  unitCostPaise: number;
  varianceCostPaise: number;
  status: string;
}

export interface AuditSession {
  id: string;
  sessionNo: string;
  storeId: string;
  storeName: string;
  storeCode: string;
  scope: string;
  rackIds: string[] | null;
  blindCount: boolean;
  status: string;
  notes: string | null;
  startedBy: string;
  approvedBy: string | null;
  approvedAt: Date | string | null;
  createdAt: Date | string;
}

export interface AuditSummary {
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

export function calculateAuditSummary(items: AuditItem[]): AuditSummary {
  const counted = items.filter((i) => i.countedQty !== null);
  const shortage = items.filter((i) => (i.varianceQty || 0) < 0);
  const excess = items.filter((i) => (i.varianceQty || 0) > 0);
  const exact = items.filter((i) => i.varianceQty === 0);
  const shortageCost = shortage.reduce((acc, i) => acc + Math.abs(i.varianceCostPaise || 0), 0);
  const excessCost = excess.reduce((acc, i) => acc + (i.varianceCostPaise || 0), 0);

  return {
    totalLines: items.length,
    countedLines: counted.length,
    pendingLines: items.length - counted.length,
    shortageLines: shortage.length,
    excessLines: excess.length,
    exactLines: exact.length,
    totalShortageCostPaise: shortageCost,
    totalExcessCostPaise: excessCost,
    netVarianceCostPaise: excessCost - shortageCost,
  };
}
