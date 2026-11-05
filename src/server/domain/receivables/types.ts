import type { ReportStoreScope } from "../accounting-reports/types";

export type { ReportStoreScope };

export type AgeingMode = "due_date" | "invoice_date";

export type AgeingBucketKey =
  | "current"
  | "days1to30"
  | "days31to60"
  | "days61to90"
  | "over90";

export interface AgeingBuckets {
  current: number; // paise
  days1to30: number; // paise
  days31to60: number; // paise
  days61to90: number; // paise
  over90: number; // paise
  total: number; // paise
}

export interface InvoiceOpenBalance {
  saleId: string;
  invoiceNo: string;
  completedAt: string;
  storeId: string;
  storeName?: string;
  customerId: string;
  totalAmount: number;
  paidAmount: number;
  returnedAmount: number;
  creditAmount: number;
  openBalance: number;
  dueDate: string;
  daysOverdue: number;
  daysSinceInvoice: number;
  bucket: AgeingBucketKey;
}

export interface CustomerCredits {
  unallocatedAdvances: number; // paise (from payments in without bill allocation)
  unallocatedCreditNotes: number; // paise (from credit note returns without sale offset)
  totalAvailableCredits: number; // paise
}

export interface CustomerExposure {
  customerId: string;
  customerName: string;
  phone: string | null;
  creditLimit: number; // paise
  creditDays: number;
  groupId: string | null;
  groupName: string | null;
  groupCreditLimit: number | null; // paise
  groupTotalExposure: number | null; // paise
  grossReceivables: number; // sum of open invoice balances
  availableCredits: number; // advances + unallocated credit notes
  netExposure: number; // gross - credits
  oldestOverdueDate: string | null;
  maxDaysOverdue: number;
  isOverdue: boolean;
  isLimitExceeded: boolean;
  buckets: AgeingBuckets;
  openInvoices?: InvoiceOpenBalance[];
}

export interface ReceivablesAgeingFilter {
  asOfDate?: string; // YYYY-MM-DD
  mode?: AgeingMode;
  storeScope: ReportStoreScope;
  search?: string;
  customerId?: string;
  onlyOverdue?: boolean;
  limit?: number;
  offset?: number;
}

export interface ReceivablesReport {
  asOfDate: string;
  mode: AgeingMode;
  storeScope: ReportStoreScope;
  totalCustomers: number;
  summaryBuckets: AgeingBuckets;
  totalGrossReceivables: number;
  totalAvailableCredits: number;
  totalNetExposure: number;
  customers: CustomerExposure[];
}

export interface CreditEvaluationResult {
  allowed: boolean;
  code: "ALLOWED" | "CREDIT_LIMIT_EXCEEDED" | "ACCOUNT_ON_CREDIT_HOLD" | "REQUIRES_OVERRIDE";
  reason?: string;
  currentExposure: number; // paise
  creditLimit: number; // paise
  availableCredit: number; // paise (can be negative if over limit)
  maxDaysOverdue: number;
  isPooled: boolean;
  requiresOverride: boolean;
}

export interface SendPaymentReminderInput {
  customerId: string;
  phone: string;
  message?: string;
}

export interface ReceivablesReconciliationResult {
  storeScope: ReportStoreScope;
  asOfDate: string;
  totalOpenInvoiceBalances: number;
  totalAvailableCustomerCredits: number;
  netSubledgerReceivables: number;
  debtorsControlAccountBalance: number;
  unattributedControlDebit: number;
  variance: number;
  isReconciled: boolean;
}
