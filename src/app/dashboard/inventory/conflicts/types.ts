export interface ConflictCaseItem {
  id: string;
  tenantId: string;
  storeId: string;
  batchId: string;
  medicineId: string;
  status: string;
  requiredReconciliationQty: number;
  reconciledQty: number;
  outstandingQty: number;
  openedAt: Date | string;
  resolvedAt: Date | string | null;
  resolutionType: string | null;
  resolutionNotes: string | null;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  medicineName: string;
}

export interface ConflictContributionItem {
  id: string;
  tenantId: string;
  conflictCaseId: string;
  saleId: string;
  clientSaleId: string;
  deviceId: string;
  invoiceNo: string;
  contributedQty: number;
  syncedAt: Date | string;
}

export interface ConflictResolutionItem {
  id: string;
  operationKey: string;
  resolutionType: string;
  reconciledQty: number;
  evidenceNotes: string | null;
  createdAt: Date | string;
  performedByName: string;
}

export interface AlternativeBatchItem {
  id: string;
  batchNo: string;
  qtyOnHand: number;
  expiryDate: string;
}

export interface ConflictDetailsData {
  conflictCase: ConflictCaseItem;
  contributions: ConflictContributionItem[];
  resolutions: ConflictResolutionItem[];
  alternativeBatches: AlternativeBatchItem[];
}
