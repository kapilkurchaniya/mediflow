/**
 * Hardware Bridge & Desktop POS Core Types
 * Defines contracts for raw printing (ESC/POS, ESC/P), barcode scanning, and hardware controls.
 */

export type PrinterKind = "thermal" | "dotmatrix" | "generic";

export interface PrinterDevice {
  id: string;
  name: string;
  isDefault: boolean;
  kind: PrinterKind;
  port?: string;
}

export type PrintFormat = "thermal-80mm" | "thermal-58mm" | "dotmatrix-80col";

export interface SalePrintItem {
  name: string;
  batchNo: string;
  expiryDate: string;
  packQty: number;
  looseQty: number;
  unitsPerPack: number;
  packUnit?: string;
  looseUnit?: string;
  mrpPaise: number;
  ratePaise: number;
  discountBp: number;
  gstRateBp: number;
  amountPaise: number;
  hsn?: string;
}

export interface SalePrintPayment {
  method: "cash" | "card" | "upi" | "credit" | "bank";
  amountPaise: number;
  reference?: string;
}

export interface SalePrintData {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeGstin?: string;
  storeDlNumbers?: string[];
  fssaiNo?: string;
  invoiceNo: string;
  completedAt: string;
  cashierName?: string;
  doctorName?: string;
  doctorRegNo?: string;
  prescriptionRef?: string;
  patientName?: string;
  patientPhone?: string;
  customerGstin?: string;
  items: SalePrintItem[];
  payments: SalePrintPayment[];
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise?: number;
  roundOffPaise: number;
  totalPaise: number;
  upiQrPayload?: string;
}

export interface ThermalPrintOptions {
  widthCols?: 32 | 48; // 32 for 58mm, 48 for 80mm
  cutPaper?: boolean;
  kickDrawer?: boolean;
  printUpiQr?: boolean;
  copies?: number;
}

export interface DotMatrixPrintOptions {
  pitch?: "10cpi" | "12cpi" | "condensed";
  lineSpacing?: "1/6" | "1/8";
  formFeed?: boolean;
  copies?: number;
}

export interface PrintResult {
  success: boolean;
  durationMs: number;
  printerName: string;
  format: PrintFormat;
  bytesSent: number;
  error?: string;
}

export interface BarcodeScanEvent {
  barcode: string;
  timestamp: number;
  scanDurationMs: number;
}

export interface DrawerKickOptions {
  printerName?: string;
  pin?: 0 | 1;
  onTimeMs?: number;
  offTimeMs?: number;
}

export interface HardwareBridge {
  isDesktop(): boolean;
  listPrinters(): Promise<PrinterDevice[]>;
  printRaw(printerName: string, data: Uint8Array): Promise<boolean>;
  openCashDrawer(options?: DrawerKickOptions): Promise<boolean>;
  onBarcodeScanned(callback: (event: BarcodeScanEvent) => void): () => void;
}
