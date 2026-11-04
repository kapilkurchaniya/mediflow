/**
 * src/server/domain/einvoice-types.ts
 *
 * Core types, interfaces, and mode helpers for NIC E-Invoicing & E-Way Bills.
 * Kept free of DB or complex domain imports to prevent circular dependencies.
 *
 * Lane B (B5.1)
 */

export interface EInvoiceSellerDetails {
  gstin: string;
  legalName: string;
  tradeName?: string;
  address: string;
  location: string;
  pincode: string;
  stateCode: string;
}

export interface EInvoiceBuyerDetails {
  gstin: string;
  legalName: string;
  tradeName?: string;
  address: string;
  location: string;
  pincode: string;
  stateCode: string;
  placeOfSupply: string;
}

export interface EInvoiceBatchDetails {
  batchNo: string;
  expiryDate?: string; // DD/MM/YYYY
  warrantyDate?: string;
}

export interface EInvoiceItemPayload {
  slNo: number;
  itemDescription: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  unitPrice: number; // in rupees
  grossAmount: number;
  discount: number;
  taxableAmount: number;
  gstRate: number; // e.g. 12.0
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalItemValue: number;
  batchDetails?: EInvoiceBatchDetails;
}

export interface EInvoicePayload {
  version: "1.1";
  transactionDetails: {
    taxScheme: "GST";
    supplyType: "B2B" | "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP" | "DEXP";
    reverseCharge: "Y" | "N";
    igstOnIntra: "Y" | "N";
  };
  documentDetails: {
    documentType: "INV" | "CRN" | "DBN";
    documentNumber: string;
    documentDate: string; // DD/MM/YYYY
  };
  sellerDetails: EInvoiceSellerDetails;
  buyerDetails: EInvoiceBuyerDetails;
  itemList: EInvoiceItemPayload[];
  valueDetails: {
    assValue: number;
    cgstValue: number;
    sgstValue: number;
    igstValue: number;
    cessValue: number;
    roundOff: number;
    totalInvoiceValue: number;
  };
}

export interface IRNResult {
  irn: string;
  ackNo: string;
  ackDate: string;
  signedQrCode: string;
  signedInvoice?: string;
  status: "ACT" | "CNL";
  remarks?: string;
}

export interface EWayBillInput {
  transporterId?: string;
  transporterName?: string;
  transportMode?: "1" | "2" | "3" | "4"; // 1: Road, 2: Rail, 3: Air, 4: Ship
  vehicleNo?: string;
  distanceKm: number;
  vehicleType?: "R" | "O"; // Regular | Over Dimensional Cargo
}

export interface EWayBillResult {
  ewayBillNo: string;
  ewayBillDate: string;
  validUpto: string;
}

export interface IRPProvider {
  name: string;
  generateIRN(payload: EInvoicePayload): Promise<IRNResult>;
  cancelIRN(irn: string, reasonCode: string, remarks: string): Promise<{ success: boolean; cancelledDate: string }>;
  getIRNDetails?(irn: string): Promise<IRNResult>;
  generateEWayBill(irn: string, details: EWayBillInput): Promise<EWayBillResult>;
  cancelEWayBill(ewayBillNo: string, reason: string): Promise<{ success: boolean }>;
}

/** Valid EINVOICE_MODE values */
export type EInvoiceMode = "disabled" | "simulator" | "sandbox" | "production";

/** Returns the current e-invoice mode from env (defaults to 'disabled'). */
export function getEInvoiceMode(): EInvoiceMode {
  const mode = process.env.EINVOICE_MODE ?? "disabled";
  if (["disabled", "simulator", "sandbox", "production"].includes(mode)) {
    return mode as EInvoiceMode;
  }
  return "disabled";
}

