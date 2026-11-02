export interface QuarantinedItem {
  id: string;
  storeId: string;
  batchId: string;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  batchNo: string;
  expiryDate: string;
  supplierId: string | null;
  supplierName: string;
  qty: number;
  ratePaise: number;
  mrpPaise: number;
  totalPaise: number;
  reason: string;
  status: string;
  claimId: string | null;
  quarantinedAt: Date | string;
  notes: string | null;
}

export interface NearExpiryBatch {
  id: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  purchaseRatePaise: number;
  mrpPaise: number;
  supplierId: string | null;
  supplierName: string | null;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string | null;
  looseUnit: string | null;
  isExpired: boolean;
}

export interface ExpiryClaimItem {
  id: string;
  claimNo: string;
  supplierId: string;
  supplierName: string;
  status: string;
  totalPaise: number;
  settlementType: string | null;
  supplierCreditNoteNo: string | null;
  notes: string | null;
  createdAt: Date | string;
  settledAt: Date | string | null;
}
