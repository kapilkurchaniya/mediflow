import type { SearchResultBatch, SearchResultMedicine } from "../_data/posData";

export interface PosCartLine {
  batchId: string;
  medicineId: string;
  medicineName: string;
  genericName?: string | null;
  batchNo: string;
  expiryDate: string;
  mrp: number; // in paise
  saleRate?: number; // in paise
  qty: number; // total base units
  packQty: number;
  looseQty: number;
  unitsPerPack: number;
  packUnit: string;
  looseUnit: string;
  qtyOnHand: number;
  totalAvailableStock?: number;
  discountBp: number;
  gstRateBp: number;
  rxRequired?: boolean | null;
  schedule?: string | null;
  schemeText?: string;
  autoFefo?: boolean;
  overrideBatch?: boolean;
  overrideReason?: string;
  availableBatches?: SearchResultBatch[];
}

export interface SelectedCustomer {
  id: string;
  name: string;
  phone?: string | null;
  loyaltyPoints?: number;
  creditLimit?: number | null;
  redeemablePoints?: number;
  redeemableValuePaise?: number;
}

export interface ComplianceState {
  doctorId: string;
  doctorName: string;
  doctorRegNo: string;
  doctorAddress: string;
  patientAge: number | "";
  patientGender: string;
  patientAddress: string;
  prescriptionRef: string;
  prescriptionDate: string;
  medicalRepId: string;
}

export interface SplitPayments {
  cash: string;
  upi: string;
  card: string;
}

export interface PosState {
  cart: PosCartLine[];
  customer: SelectedCustomer | null;
  compliance: ComplianceState;
  splitPayments: SplitPayments;
  paymentMethod: string;
  redeemPoints: number;
  resumedHeldId: string | null;
  soundEnabled: boolean;
}

export type PosAction =
  | { type: "ADD_LINE"; payload: { medicine: SearchResultMedicine; batch: SearchResultBatch; allBatches?: SearchResultBatch[]; schemeText?: string } }
  | { type: "UPDATE_LINE_PACK_QTY"; payload: { batchId: string; packQty: number } }
  | { type: "UPDATE_LINE_LOOSE_QTY"; payload: { batchId: string; looseQty: number } }
  | { type: "UPDATE_LINE_DISCOUNT"; payload: { batchId: string; discountBp: number } }
  | { type: "UPDATE_LINE_BATCH"; payload: { oldBatchId: string; newBatch: SearchResultBatch; reason?: string } }
  | { type: "REMOVE_LINE"; payload: { batchId: string } }
  | { type: "CLEAR_CART" }
  | { type: "SET_CUSTOMER"; payload: SelectedCustomer | null }
  | { type: "SET_CUSTOMER_REDEEMABLE"; payload: { redeemablePoints: number; redeemableValuePaise: number } }
  | { type: "SET_COMPLIANCE"; payload: Partial<ComplianceState> }
  | { type: "SET_PAYMENT_METHOD"; payload: string }
  | { type: "SET_SPLIT_PAYMENTS"; payload: Partial<SplitPayments> }
  | { type: "SET_REDEEM_POINTS"; payload: number }
  | { type: "SET_SOUND_ENABLED"; payload: boolean }
  | { type: "HYDRATE_HELD_SALE"; payload: { heldSaleId: string; lines: PosCartLine[]; customer?: SelectedCustomer | null; doctorName?: string } }
  | { type: "RESET_SALE" };
