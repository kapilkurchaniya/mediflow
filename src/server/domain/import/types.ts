import { z } from "zod";

export const ImportEntitySchema = z.enum(["medicines", "batches", "customers", "suppliers", "doctors"]);
export type ImportEntity = z.infer<typeof ImportEntitySchema>;

export const ImportSourceSchema = z.enum(["marg", "gofrugal", "generic", "pharmarack", "retailio"]);
export type ImportSource = z.infer<typeof ImportSourceSchema>;

export const ImportJobStatusSchema = z.enum([
  "uploaded",
  "mapped",
  "validated",
  "committing",
  "done",
  "failed",
]);
export type ImportJobStatus = z.infer<typeof ImportJobStatusSchema>;

export const ImportRowStatusSchema = z.enum(["pending", "valid", "error", "skipped", "committed"]);
export type ImportRowStatus = z.infer<typeof ImportRowStatusSchema>;

export interface ImportRowErrorDetail {
  field: string;
  message: string;
  code?: string;
  value?: unknown;
}

export interface NormalizedMedicineRow {
  [key: string]: unknown;
  name: string;
  code?: string;
  composition?: string;
  manufacturerName?: string;
  categoryName?: string;
  packaging?: string;
  unitsPerPack: number;
  hsn: string;
  gstRateBp: number;
  legacyGstFlag?: boolean;
  mrpPaise: number;
  saleRatePaise: number;
  purchaseCostPaise: number;
  rackLocation?: string;
  schedule: "regular" | "g" | "h" | "h1" | "x";
  barcode?: string;
  isChronic?: boolean;
  minStockLevel?: number;
}

export interface NormalizedBatchRow {
  [key: string]: unknown;
  medicineCodeOrName: string;
  batchNo: string;
  expiryDate: string; // YYYY-MM-DD
  openingQty: number;
  closingQty: number;
  mrpPaise: number;
  purchaseRatePaise: number;
  saleRatePaise?: number;
  barcode?: string;
}

export interface NormalizedCustomerRow {
  [key: string]: unknown;
  name: string;
  code?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  city?: string;
  gstin?: string;
  stateCode?: string;
  creditLimitPaise?: number;
  openingBalancePaise?: number;
}

export interface NormalizedSupplierRow {
  [key: string]: unknown;
  name: string;
  code?: string;
  contactPerson?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  city?: string;
  gstin?: string;
  stateCode?: string;
  drugLicenseNo?: string;
  creditDays?: number;
  leadTimeDays?: number;
  openingBalancePaise?: number;
}

export interface NormalizedDoctorRow {
  [key: string]: unknown;
  name: string;
  code?: string;
  regNo?: string;
  specialization?: string;
  phone?: string;
  email?: string;
  hospitalClinic?: string;
}

export type NormalizedRowPayload =
  | { entity: "medicines"; data: NormalizedMedicineRow }
  | { entity: "batches"; data: NormalizedBatchRow }
  | { entity: "customers"; data: NormalizedCustomerRow }
  | { entity: "suppliers"; data: NormalizedSupplierRow }
  | { entity: "doctors"; data: NormalizedDoctorRow };
