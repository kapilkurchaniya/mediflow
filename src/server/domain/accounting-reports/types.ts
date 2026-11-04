/**
 * Type definitions for Day Book, Account Ledgers, and Control Account Reconciliation.
 * Strictly read-only financial reporting contracts.
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type NormalBalanceSide = "dr" | "cr";

export type ReportStoreScope =
  | { type: "store"; storeId: string }
  | { type: "unallocated" }
  | { type: "all" };

export interface DateRangeFilter {
  from?: string | null;
  to?: string | null;
}

export type VoucherTypeFilter =
  | "all"
  | "sale"
  | "sale_return"
  | "purchase"
  | "purchase_return"
  | "expense"
  | "payment"
  | "receipt"
  | "journal";

export interface DayBookFilter {
  dateRange: DateRangeFilter;
  storeScope: ReportStoreScope;
  voucherType?: VoucherTypeFilter;
  limit?: number;
  offset?: number;
}

export interface DayBookLineItem {
  id: string; // bigserial string
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debit: number;
  credit: number;
  partyType?: string | null;
  partyId?: string | null;
  partyName?: string | null;
}

export interface DayBookEntryRow {
  id: string;
  entryNo: string;
  entryDate: string; // YYYY-MM-DD
  createdAt: string;
  narration: string;
  refType: string | null;
  refId: string | null;
  storeId: string | null;
  storeName?: string | null;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  lines: DayBookLineItem[];
}

export interface DayBookReport {
  entries: DayBookEntryRow[];
  totalVouchers: number;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  hasMore: boolean;
  page: number;
  limit: number;
}

export interface LedgerCursor {
  entryDate: string;
  createdAt: string;
  lineId: string; // bigserial string representation
}

export interface LedgerFilter {
  accountId: string;
  dateRange: DateRangeFilter;
  storeScope: ReportStoreScope;
  partyType?: "customer" | "supplier" | null;
  partyId?: string | null;
  cursor?: LedgerCursor | null;
  limit?: number;
}

export interface LedgerRow {
  lineId: string;
  entryId: string;
  entryNo: string;
  entryDate: string;
  createdAt: string;
  voucherType: string | null;
  refId: string | null;
  narration: string;
  particulars: string;
  isCompound: boolean;
  partyName?: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  runningSide: NormalBalanceSide;
}

export interface AccountInfo {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normalSide: NormalBalanceSide;
  systemKey: string | null;
  isActive: boolean;
}

export interface LedgerReport {
  account: AccountInfo;
  periodOpeningBalance: number;
  periodOpeningSide: NormalBalanceSide;
  pageOpeningBalance: number;
  pageOpeningSide: NormalBalanceSide;
  rows: LedgerRow[];
  periodDebitTotal: number;
  periodCreditTotal: number;
  periodClosingBalance: number;
  periodClosingSide: NormalBalanceSide;
  nextCursor: LedgerCursor | null;
  hasMore: boolean;
}

export interface UnattributedPosting {
  entryId: string;
  entryNo: string;
  entryDate: string;
  narration: string;
  refType: string | null;
  refId: string | null;
  debit: number;
  credit: number;
}

export interface ReconciliationReport {
  account: AccountInfo;
  partyType: "customer" | "supplier";
  partyId?: string | null;
  partyName?: string | null;
  controlDebit: number;
  controlCredit: number;
  controlNet: number;
  subledgerDebit: number;
  subledgerCredit: number;
  subledgerNet: number;
  unattributedDebit: number;
  unattributedCredit: number;
  unattributedNet: number;
  debitVariance: number;
  creditVariance: number;
  netVariance: number;
  isReconciled: boolean;
  unattributedCount: number;
  unattributedPostings: UnattributedPosting[];
}
