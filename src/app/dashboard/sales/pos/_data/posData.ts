"use client";

import {
  createSaleInvoice,
  findSubstitutes,
  holdSaleAction,
  listHeldSalesAction,
  resumeHeldSaleAction,
  discardHeldSaleAction,
  type PosItemInput,
  type ComplianceDetailsInput,
} from "@/app/actions/sales";
import type { SalePayment } from "@/server/domain/sales/types";
import { getCustomers, createQuickCustomer, getCustomerRedeemablePoints } from "@/app/actions/customers";
import { getDoctors } from "@/app/actions/compliance";
import { getMedicalReps } from "@/app/actions/medical-reps";
import { createPromiseOrder } from "@/app/actions/promise-orders";
import { getPosShiftStatusAction } from "@/app/actions/cash-sessions";
import type { CurrentShiftStats } from "@/server/domain/cash-sessions";
import type { HoldSaleInput, ResumeHeldSaleResult } from "@/server/domain/sales/held";

export interface SearchResultBatch {
  id: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  mrp: number;
  saleRate?: number;
}

export interface SearchResultMedicine {
  id: string;
  name: string;
  genericName?: string | null;
  gstRateBp: number;
  rxRequired?: boolean | null;
  schedule?: string | null;
  rackCode?: string | null;
  rackName?: string | null;
  targetSegment?: string | null;
  unitsPerPack?: number;
  packUnit?: string;
  looseUnit?: string;
}

export interface SearchResult {
  medicine: SearchResultMedicine;
  batches: SearchResultBatch[];
}

export interface SubstituteItem {
  medicine: {
    id: string;
    name: string;
    genericName?: string | null;
    gstRateBp: number;
  };
  batches: SearchResultBatch[];
  totalStock: number;
}

export interface CustomerRow {
  id: string;
  name: string;
  phone?: string | null;
  loyaltyPoints?: number;
  creditLimit?: number | null;
}

export interface DoctorRow {
  id: string;
  name: string;
  regNo: string;
  hospital?: string | null;
}

export interface MedicalRepRow {
  id: string;
  name: string;
  companyName: string | null;
}

export interface HeldSaleItem {
  id: string;
  customerName: string;
  customerPhone?: string | null;
  doctorName?: string | null;
  itemCount: number;
  totalAmount: number;
  notes?: string | null;
  createdAt: Date | string;
  cashierName: string;
  isOlderThan24h: boolean;
}

export interface PosDataSource {
  searchItems(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
  findSubstitutes(genericName: string): Promise<SubstituteItem[]>;
  getCustomers(query?: string): Promise<CustomerRow[]>;
  createQuickCustomer(name: string, phone?: string, consentReminders?: boolean): Promise<{ customer?: CustomerRow; error?: string }>;
  getCustomerRedeemablePoints(customerId: string): Promise<{ points: number; valuePaise: number }>;
  getDoctors(query?: string): Promise<DoctorRow[]>;
  getMedicalReps(): Promise<MedicalRepRow[]>;
  getShiftStatus(): Promise<{ activeShift: CurrentShiftStats | null; requireShift: boolean } | null>;
  holdSale(input: HoldSaleInput): Promise<{ success: boolean; heldSaleId?: string; error?: string }>;
  listHeldSales(): Promise<{ sales: HeldSaleItem[]; count: number }>;
  resumeHeldSale(heldSaleId: string): Promise<({ success: true } & ResumeHeldSaleResult) | { success: false; error: string }>;
  discardHeldSale(heldSaleId: string): Promise<{ success: boolean; error?: string }>;
  createPromiseOrder(data: {
    customerName: string;
    customerPhone: string;
    medicineId: string;
    medicineName?: string;
    qtyRequested: number;
    notes?: string;
  }): Promise<{ success?: boolean; error?: string }>;
  createSale(params: {
    customerId?: string;
    doctorName: string;
    items: PosItemInput[];
    paymentMethod: string;
    amountPaid: number;
    complianceDetails?: ComplianceDetailsInput;
    medicalRepId?: string;
    paymentsInput?: SalePayment[];
    heldSaleId?: string;
    redeemPoints?: number;
  }): Promise<{ saleId?: string; invoiceNo?: string; changeDue?: number; error?: string }>;
}

const POS_SEARCH_LIMIT = 25;
const POS_SEARCH_CACHE_TTL_MS = 20_000;
const POS_SEARCH_CACHE_MAX_ENTRIES = 80;

interface PosSearchCacheEntry {
  items: SearchResult[];
  complete: boolean;
  ts: number;
}

const posSearchCache = new Map<string, PosSearchCacheEntry>();

export function clearPosSearchCache(): void {
  posSearchCache.clear();
}

export function filterCachedSearchResults(items: SearchResult[], query: string): SearchResult[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items;

  return items.filter((entry) => {
    const name = entry.medicine.name.toLowerCase();
    const generic = entry.medicine.genericName?.toLowerCase() ?? "";
    const matchTarget = `${name} ${generic}`;
    let pos = 0;
    const matchesName = tokens.every((tok) => {
      const idx = name.indexOf(tok, pos);
      if (idx === -1) return false;
      pos = idx + tok.length;
      return true;
    });
    if (matchesName) return true;

    let gPos = 0;
    const matchesGeneric = tokens.every((tok) => {
      const idx = generic.indexOf(tok, gPos);
      if (idx === -1) return false;
      gPos = idx + tok.length;
      return true;
    });
    if (matchesGeneric) return true;

    return tokens.every((tok) => matchTarget.includes(tok));
  });
}

function getFreshCachedSearchEntry(key: string, now: number): PosSearchCacheEntry | null {
  const entry = posSearchCache.get(key);
  if (!entry) return null;
  if (now - entry.ts > POS_SEARCH_CACHE_TTL_MS) {
    posSearchCache.delete(key);
    return null;
  }
  return entry;
}

export function lookupInstantPosSearchCache(query: string, now = Date.now()): SearchResult[] | null {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const key = trimmed.toLowerCase();

  const exact = getFreshCachedSearchEntry(key, now);
  if (exact) return exact.items;

  // Narrow from longest cached prefix when that prefix returned all matching rows (< limit)
  for (let len = key.length - 1; len >= 2; len--) {
    const prefixKey = key.slice(0, len);
    const prefixEntry = getFreshCachedSearchEntry(prefixKey, now);
    if (prefixEntry && prefixEntry.complete) {
      return filterCachedSearchResults(prefixEntry.items, trimmed);
    }
  }
  return null;
}

function setPosSearchCacheEntry(key: string, items: SearchResult[], now = Date.now()): void {
  if (posSearchCache.size >= POS_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = posSearchCache.keys().next().value;
    if (oldestKey !== undefined) posSearchCache.delete(oldestKey);
  }
  posSearchCache.set(key, {
    items,
    complete: items.length < POS_SEARCH_LIMIT,
    ts: now,
  });
}

export const defaultPosDataSource: PosDataSource = {
  async searchItems(query: string, signal?: AbortSignal) {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const cached = lookupInstantPosSearchCache(trimmed);
    if (cached !== null) {
      return cached;
    }

    const res = await fetch(
      `/api/pos/search?q=${encodeURIComponent(trimmed)}&limit=${POS_SEARCH_LIMIT}`,
      {
        method: "GET",
        credentials: "same-origin",
        signal,
      },
    );
    if (!res.ok) {
      throw new Error(`POS search failed with status ${res.status}`);
    }
    const data = (await res.json()) as { success?: boolean; items?: SearchResult[] };
    const items = Array.isArray(data.items) ? data.items : [];
    setPosSearchCacheEntry(trimmed.toLowerCase(), items);
    return items;
  },
  async findSubstitutes(genericName: string) {
    return (await findSubstitutes(genericName)) as unknown as SubstituteItem[];
  },
  async getCustomers(query?: string) {
    return (await getCustomers(query)) as unknown as CustomerRow[];
  },
  async createQuickCustomer(name: string, phone?: string, consentReminders?: boolean) {
    const res = await createQuickCustomer(name, phone, consentReminders);
    if ("error" in res && res.error) return { error: res.error };
    return { customer: (res.customer || res) as unknown as CustomerRow };
  },
  async getCustomerRedeemablePoints(customerId: string) {
    return getCustomerRedeemablePoints(customerId);
  },
  async getDoctors(query?: string) {
    return (await getDoctors(query)) as unknown as DoctorRow[];
  },
  async getMedicalReps() {
    return (await getMedicalReps()) as unknown as MedicalRepRow[];
  },
  async getShiftStatus() {
    const res = await getPosShiftStatusAction();
    if (res.ok) {
      return { activeShift: res.shift, requireShift: res.requireShift };
    }
    return null;
  },
  async holdSale(input: HoldSaleInput) {
    return holdSaleAction(input);
  },
  async listHeldSales() {
    const res = await listHeldSalesAction();
    if (res.success && res.data) {
      return { sales: res.data, count: res.data.length };
    }
    return { sales: [], count: 0 };
  },
  async resumeHeldSale(heldSaleId: string) {
    return resumeHeldSaleAction(heldSaleId);
  },
  async discardHeldSale(heldSaleId: string) {
    return discardHeldSaleAction(heldSaleId);
  },
  async createPromiseOrder(data) {
    return createPromiseOrder(data);
  },
  async createSale(params) {
    const res = await createSaleInvoice(
      params.customerId,
      params.doctorName,
      params.items,
      params.paymentMethod,
      params.amountPaid,
      params.complianceDetails,
      params.medicalRepId,
      params.paymentsInput,
      params.heldSaleId,
      params.redeemPoints
    );
    if (res.saleId) {
      clearPosSearchCache();
    }
    return res;
  },
};

export function mapHeldItemsToCartLines(items: ResumeHeldSaleResult["payload"]["items"]) {
  return items.map((it) => {
    const upp = it.unitsPerPack || 1;
    const packQty = it.packQty || 0;
    const looseQty = it.looseQty || 0;
    return {
      batchId: it.batchId,
      medicineId: it.medicineId,
      medicineName: it.medicineName,
      genericName: it.genericName,
      batchNo: it.batchNo,
      expiryDate: it.expiryDate,
      qty: packQty * upp + looseQty,
      packQty,
      looseQty,
      unitsPerPack: upp,
      packUnit: it.packUnit || "strip",
      looseUnit: it.looseUnit || "tablet",
      qtyOnHand: 0,
      mrp: it.mrp,
      saleRate: it.rate,
      discountBp: it.discountBp || 0,
      gstRateBp: it.gstRateBp,
      autoFefo: Boolean(it.isAutoFefo),
    };
  });
}
