import type { OfflineSale, PaymentMethod } from "@/server/domain/sync/types";

export type { PaymentMethod };

export interface OfflineMedicine {
  id: string;
  tenantId: string;
  name: string;
  genericName?: string | null;
  barcode?: string | null;
  schedule?: string | null;
  hsnCode?: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface OfflineBatch {
  id: string;
  storeId: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  mrpPaise: number;
  saleRatePaise: number;
  qtyOnHand: number;
  isActive: boolean;
  updatedAt: string;
}

export interface OfflineCustomer {
  id: string;
  tenantId: string;
  phone: string;
  name: string;
  creditLimitPaise: number;
  currentCreditPaise: number;
  isActive: boolean;
  updatedAt: string;
}

export interface OfflineDoctor {
  id: string;
  tenantId: string;
  name: string;
  regNo?: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface OfflineScheme {
  id: string;
  storeId?: string | null;
  tenantId: string;
  name: string;
  schemeType: string;
  isActive: boolean;
  updatedAt: string;
}

export interface OfflineStoreMedicineSetting {
  id: string;
  storeId: string;
  medicineId: string;
  minStockAlert?: number | null;
  maxStockAlert?: number | null;
  updatedAt: string;
}

export interface OfflineStoreSetting {
  id: string;
  storeId: string;
  invoicePrefix?: string | null;
  storeCode?: string | null;
  updatedAt: string;
}

export type PendingSaleStatus = "pending" | "syncing" | "synced" | "rejected";

export interface OfflinePendingSale {
  clientSaleId: string;
  storeId: string;
  deviceId: string;
  status: PendingSaleStatus;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  nextRetryAt: string;
  invoiceNo: string;
  fiscalYear: string;
  sequenceNumber: number;
  payload: OfflineSale;
  serverSaleId?: string;
  lastError?: string;
  errorRetryable?: boolean;
}

export interface OfflineProvisionalAllocation {
  id: string;
  storeId: string;
  batchId: string;
  clientSaleId: string;
  qty: number;
  createdAt: string;
}

export interface OfflineNumberBlock {
  id: string;
  storeId: string;
  deviceId: string;
  fiscalYear: string;
  reservationId: string;
  storeCode: string;
  deviceCode: string;
  startSeq: number;
  endSeq: number;
  nextSeq: number;
  active: number; // 1 for active, 0 for exhausted
}

export type ConflictType =
  | "stock_shortage"
  | "idempotency_mismatch"
  | "rejected_sale"
  | "stale_session";

export interface OfflineSyncConflict {
  id: string;
  storeId: string;
  deviceId: string;
  clientSaleId: string;
  batchId?: string;
  conflictType: ConflictType;
  message: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface OfflineMetaEntry<T = unknown> {
  key: string;
  value: T;
}

export interface SyncStatusSummary {
  online: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  rejectedCount: number;
  remainingInvoiceNumbers: number;
  lastError: string | null;
}

export interface OfflineDeviceConfig {
  tenantId: string;
  storeId: string;
  deviceId: string;
  deviceCode: string;
  storeCode: string;
  deviceToken: string;
}
