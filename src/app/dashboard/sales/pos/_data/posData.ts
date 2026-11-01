"use client";

import {
  searchPosItems,
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
  searchItems(query: string): Promise<SearchResult[]>;
  findSubstitutes(genericName: string): Promise<SubstituteItem[]>;
  getCustomers(query?: string): Promise<CustomerRow[]>;
  createQuickCustomer(name: string, phone?: string): Promise<{ customer?: CustomerRow; error?: string }>;
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

export const defaultPosDataSource: PosDataSource = {
  async searchItems(query: string) {
    return (await searchPosItems(query)) as unknown as SearchResult[];
  },
  async findSubstitutes(genericName: string) {
    return (await findSubstitutes(genericName)) as unknown as SubstituteItem[];
  },
  async getCustomers(query?: string) {
    return (await getCustomers(query)) as unknown as CustomerRow[];
  },
  async createQuickCustomer(name: string, phone?: string) {
    const res = await createQuickCustomer(name, phone);
    if ("error" in res && res.error) return { error: res.error };
    return { customer: res as unknown as CustomerRow };
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
    return createSaleInvoice(
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
