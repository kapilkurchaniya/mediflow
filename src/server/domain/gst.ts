import { schema } from "@/server/db";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import {
  B2CL_THRESHOLD_PAISE,
  DEFAULT_GST_RATE_BP,
} from "@/lib/regulatory";

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export function getStateName(code?: string | null): string {
  if (!code) return "Unknown";
  const normalized = code.padStart(2, "0");
  return GST_STATE_CODES[normalized] || `State (${normalized})`;
}

export function extractStateCodeFromGstin(gstin?: string | null): string | null {
  if (!gstin || gstin.trim().length < 2) return null;
  const prefix = gstin.trim().slice(0, 2);
  return /^\d{2}$/.test(prefix) ? prefix : null;
}

const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Computes official mod-36 Luhn check digit for a 14-char GSTIN prefix.
 */
export function computeGstinCheckDigit(gstin14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const val = GSTIN_ALPHABET.indexOf(gstin14[i]!);
    if (val === -1) return "";
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = val * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checkCode = (36 - (sum % 36)) % 36;
  return GSTIN_ALPHABET[checkCode]!;
}

/**
 * Validates a GSTIN string against the 15-character standard format
 * and verifies the official mod-36 checksum digit.
 */
export function isValidGstin(gstin?: string | null): boolean {
  if (!gstin) return false;
  const clean = gstin.trim().toUpperCase();
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!regex.test(clean)) return false;
  return computeGstinCheckDigit(clean.slice(0, 14)) === clean[14];
}

export interface TaxContext {
  supplyType: "B2B" | "B2C";
  placeOfSupply: string;
  isInterState: boolean;
}

/**
 * Pure function: decides place of supply & inter-state status for a sale (B1.2).
 *
 * Rules:
 * - If the customer has a valid GSTIN:
 *     - supplyType: "B2B"
 *     - placeOfSupply: GSTIN's first 2 digits
 *     - isInterState: differs from the store's state code
 * - Otherwise (no GSTIN or invalid GSTIN):
 *     - supplyType: "B2C" (counter sale)
 *     - placeOfSupply: store's state code
 *     - isInterState: false (counter sale is always intra-state)
 */
export function determineTaxContext(input: {
  storeStateCode: string;
  storeGstin?: string | null;
  customerGstin?: string | null;
  customerStateCode?: string | null;
}): TaxContext {
  const storeState = (
    input.storeStateCode ||
    (input.storeGstin ? extractStateCodeFromGstin(input.storeGstin) : null) ||
    "27"
  ).padStart(2, "0");

  const cleanGstin = input.customerGstin?.trim().toUpperCase();
  if (cleanGstin && isValidGstin(cleanGstin)) {
    const customerState =
      extractStateCodeFromGstin(cleanGstin) ||
      input.customerStateCode?.padStart(2, "0") ||
      storeState;
    return {
      supplyType: "B2B",
      placeOfSupply: customerState,
      isInterState: customerState !== storeState,
    };
  }

  return {
    supplyType: "B2C",
    placeOfSupply: storeState,
    isInterState: false,
  };
}

/**
 * Determine Supply Type:
 * - B2B: Buyer has valid GSTIN
 * - B2CL: B2C Large (Interstate sale with total invoice value > ₹2,50,000)
 * - B2C: Intrastate or interstate <= ₹2,50,000 without GSTIN
 * - EXPORT: Out of country
 */
export function determineSupplyType(params: {
  sellerStateCode: string;
  buyerStateCode?: string | null;
  buyerGstin?: string | null;
  totalAmountPaise?: number;
  isExport?: boolean;
}): "B2B" | "B2C" | "B2CL" | "EXPORT" {
  if (params.isExport) return "EXPORT";

  const cleanGstin = params.buyerGstin?.trim().toUpperCase();
  if (cleanGstin && cleanGstin.length === 15) {
    return "B2B";
  }

  const sState = params.sellerStateCode.padStart(2, "0");
  const bState = (params.buyerStateCode || sState).padStart(2, "0");
  const isInterState = sState !== bState;
  const total = params.totalAmountPaise ?? 0;

  // ₹2,50,000 = 25,000,000 paise
  if (isInterState && total > B2CL_THRESHOLD_PAISE) {
    return "B2CL";
  }

  return "B2C";
}

/**
 * Auto-creates a GST document when a sale invoice is finalized.
 */
export async function createGstDocumentFromSale(
  dbOrTx: DbOrTx,
  params: {
    saleId: string;
    tenantId: string;
    storeId: string;
  }
) {
  // 1. Fetch sale with store and customer details
  const [sale] = await dbOrTx
    .select({
      id: schema.sales.id,
      invoiceNo: schema.sales.invoiceNo,
      completedAt: schema.sales.completedAt,
      createdAt: schema.sales.createdAt,
      customerId: schema.sales.customerId,
      customerName: schema.sales.customerName,
      taxableAmount: schema.sales.taxableAmount,
      cgst: schema.sales.cgst,
      sgst: schema.sales.sgst,
      igst: schema.sales.igst,
      totalAmount: schema.sales.totalAmount,
    })
    .from(schema.sales)
    .where(and(eq(schema.sales.id, params.saleId), eq(schema.sales.tenantId, params.tenantId)));

  if (!sale || !sale.invoiceNo) {
    throw new Error(`Sale ${params.saleId} not found or has no invoice number`);
  }

  // 2. Fetch Store Details
  const [store] = await dbOrTx
    .select({
      stateCode: schema.stores.stateCode,
      gstin: schema.stores.gstin,
    })
    .from(schema.stores)
    .where(eq(schema.stores.id, params.storeId));

  const sellerStateCode = (store?.stateCode || "27").padStart(2, "0");

  // 3. Fetch Customer Details if linked
  let buyerGstin: string | null = null;
  let buyerName: string | null = sale.customerName;
  let buyerStateCode: string = sellerStateCode;

  if (sale.customerId) {
    const [cust] = await dbOrTx
      .select({
        name: schema.customers.name,
        gstin: schema.customers.gstin,
      })
      .from(schema.customers)
      .where(eq(schema.customers.id, sale.customerId));

    if (cust) {
      if (cust.name) buyerName = cust.name;
      if (cust.gstin) {
        buyerGstin = cust.gstin.trim().toUpperCase();
        const extracted = extractStateCodeFromGstin(buyerGstin);
        if (extracted) buyerStateCode = extracted;
      }
    }
  }

  const supplyType = determineSupplyType({
    sellerStateCode,
    buyerStateCode,
    buyerGstin,
    totalAmountPaise: sale.totalAmount ?? 0,
  });

  const docDate = (sale.completedAt || sale.createdAt || new Date()).toISOString().slice(0, 10);
  const placeOfSupply = `${buyerStateCode}-${getStateName(buyerStateCode)}`;

  // 4. Upsert GST Document
  const [gstDoc] = await dbOrTx
    .insert(schema.gstDocuments)
    .values({
      tenantId: params.tenantId,
      storeId: params.storeId,
      docType: "invoice",
      docNo: sale.invoiceNo,
      docDate,
      partyGstin: buyerGstin,
      partyName: buyerName || "Walk-in Customer",
      partyStateCode: buyerStateCode,
      placeOfSupply,
      supplyType,
      isReverseCharge: false,
      taxableAmount: sale.taxableAmount ?? 0,
      cgst: sale.cgst ?? 0,
      sgst: sale.sgst ?? 0,
      igst: sale.igst ?? 0,
      cess: 0,
      total: sale.totalAmount ?? 0,
      refType: "sale",
      refId: sale.id,
      status: "active",
    })
    .returning();

  return gstDoc;
}

/**
 * Creates inward GST document from a purchase GRN.
 */
export async function createGstDocumentFromPurchase(
  dbOrTx: DbOrTx,
  params: {
    purchaseId: string;
    tenantId: string;
    storeId: string;
  }
) {
  const [purchase] = await dbOrTx
    .select({
      id: schema.purchases.id,
      purchaseNo: schema.purchases.purchaseNo,
      supplierInvoiceNo: schema.purchases.supplierInvoiceNo,
      invoiceDate: schema.purchases.invoiceDate,
      supplierId: schema.purchases.supplierId,
      taxableAmount: schema.purchases.taxableAmount,
      cgst: schema.purchases.cgst,
      sgst: schema.purchases.sgst,
      igst: schema.purchases.igst,
      totalAmount: schema.purchases.totalAmount,
    })
    .from(schema.purchases)
    .where(and(eq(schema.purchases.id, params.purchaseId), eq(schema.purchases.tenantId, params.tenantId)));

  if (!purchase) {
    throw new Error(`Purchase ${params.purchaseId} not found`);
  }

  // Fetch supplier details
  const [supplier] = await dbOrTx
    .select({
      name: schema.suppliers.name,
      gstin: schema.suppliers.gstin,
      stateCode: schema.suppliers.stateCode,
    })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.id, purchase.supplierId));

  const [store] = await dbOrTx
    .select({
      stateCode: schema.stores.stateCode,
    })
    .from(schema.stores)
    .where(eq(schema.stores.id, params.storeId));

  const storeStateCode = (store?.stateCode || "27").padStart(2, "0");
  const supplierStateCode = (supplier?.stateCode || extractStateCodeFromGstin(supplier?.gstin) || storeStateCode).padStart(2, "0");

  const [gstDoc] = await dbOrTx
    .insert(schema.gstDocuments)
    .values({
      tenantId: params.tenantId,
      storeId: params.storeId,
      docType: "invoice",
      docNo: purchase.supplierInvoiceNo || purchase.purchaseNo,
      docDate: purchase.invoiceDate,
      partyGstin: supplier?.gstin || null,
      partyName: supplier?.name || "Supplier",
      partyStateCode: supplierStateCode,
      placeOfSupply: `${storeStateCode}-${getStateName(storeStateCode)}`,
      supplyType: "B2B",
      isReverseCharge: false,
      taxableAmount: purchase.taxableAmount ?? 0,
      cgst: purchase.cgst ?? 0,
      sgst: purchase.sgst ?? 0,
      igst: purchase.igst ?? 0,
      cess: 0,
      total: purchase.totalAmount ?? 0,
      refType: "purchase",
      refId: purchase.id,
      status: "active",
    })
    .returning();

  return gstDoc;
}

export interface Gstr1Summary {
  period: { month: number; year: number; fromDate: string; toDate: string };
  b2b: Array<{
    id: string;
    docNo: string;
    docDate: string;
    partyName: string;
    partyGstin: string;
    placeOfSupply: string;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    irn?: string | null;
    status: string;
  }>;
  b2cs: Array<{
    placeOfSupply: string;
    taxRateBp: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }>;
  b2cl: Array<{
    id: string;
    docNo: string;
    docDate: string;
    placeOfSupply: string;
    taxableAmount: number;
    igst: number;
    total: number;
  }>;
  hsnSummary: Array<{
    hsn: string;
    description: string;
    uqc: string;
    totalQty: number;
    totalValue: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>;
  docSummary: {
    totalIssued: number;
    cancelled: number;
    netIssued: number;
    fromDocNo: string;
    toDocNo: string;
  };
  totals: {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    totalTax: number;
    grossTotal: number;
    b2bCount: number;
    b2cCount: number;
  };
}

/**
 * Builds standard GSTR-1 Outward Supplies return dataset.
 */
export async function buildGstr1Data(
  db: DbOrTx,
  params: {
    tenantId: string;
    month: number; // 1-12
    year: number;
    storeId?: string;
  }
): Promise<Gstr1Summary> {
  const fromDate = `${params.year}-${String(params.month).padStart(2, "0")}-01`;
  const lastDay = new Date(params.year, params.month, 0).getDate();
  const toDate = `${params.year}-${String(params.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const conditions = [
    eq(schema.gstDocuments.tenantId, params.tenantId),
    eq(schema.gstDocuments.refType, "sale"),
    gte(schema.gstDocuments.docDate, fromDate),
    lte(schema.gstDocuments.docDate, toDate),
  ];

  if (params.storeId) {
    conditions.push(eq(schema.gstDocuments.storeId, params.storeId));
  }

  const docs = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(...conditions))
    .orderBy(desc(schema.gstDocuments.docDate), desc(schema.gstDocuments.docNo));

  const b2b: Gstr1Summary["b2b"] = [];
  const b2cl: Gstr1Summary["b2cl"] = [];
  let b2bCount = 0;
  let b2cCount = 0;
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;
  let totalGross = 0;
  let cancelledCount = 0;

  const saleIds: string[] = [];

  for (const doc of docs) {
    if (doc.status === "cancelled") {
      cancelledCount++;
      continue;
    }

    if (doc.refId) {
      saleIds.push(doc.refId);
    }

    totalTaxable += doc.taxableAmount;
    totalCgst += doc.cgst;
    totalSgst += doc.sgst;
    totalIgst += doc.igst;
    totalCess += doc.cess;
    totalGross += doc.total;

    if (doc.supplyType === "B2B") {
      b2bCount++;
      b2b.push({
        id: doc.id,
        docNo: doc.docNo,
        docDate: doc.docDate,
        partyName: doc.partyName || "B2B Client",
        partyGstin: doc.partyGstin || "",
        placeOfSupply: doc.placeOfSupply || "27-Maharashtra",
        taxableAmount: doc.taxableAmount,
        cgst: doc.cgst,
        sgst: doc.sgst,
        igst: doc.igst,
        total: doc.total,
        irn: doc.irn,
        status: doc.status,
      });
    } else if (doc.supplyType === "B2CL") {
      b2cCount++;
      b2cl.push({
        id: doc.id,
        docNo: doc.docNo,
        docDate: doc.docDate,
        placeOfSupply: doc.placeOfSupply || "Unknown",
        taxableAmount: doc.taxableAmount,
        igst: doc.igst,
        total: doc.total,
      });
    } else {
      b2cCount++;
    }
  }

  // Fetch HSN summary from sale items
  const hsnMap = new Map<
    string,
    {
      description: string;
      uqc: string;
      totalQty: number;
      totalValue: number;
      taxableAmount: number;
      cgst: number;
      sgst: number;
      igst: number;
    }
  >();

  if (saleIds.length > 0) {
    // Read in chunks if large
    const chunkSize = 200;
    for (let i = 0; i < saleIds.length; i += chunkSize) {
      const chunk = saleIds.slice(i, i + chunkSize);
      const items = await db
        .select({
          medicineId: schema.saleItems.medicineId,
          medicineName: schema.saleItems.medicineName,
          qty: schema.saleItems.qty,
          taxableAmount: schema.saleItems.taxableAmount,
          cgst: schema.saleItems.cgst,
          sgst: schema.saleItems.sgst,
          igst: schema.saleItems.igst,
          totalAmount: schema.saleItems.totalAmount,
          hsn: schema.medicines.hsn,
          unit: schema.medicines.unit,
        })
        .from(schema.saleItems)
        .leftJoin(schema.medicines, eq(schema.saleItems.medicineId, schema.medicines.id))
        .where(inArray(schema.saleItems.saleId, chunk));

      for (const item of items) {
        const hsn = item.hsn?.trim() || "30049099"; // default pharma formulations HSN
        const existing = hsnMap.get(hsn) || {
          description: item.medicineName || "Medicaments",
          uqc: (item.unit || "NOS").toUpperCase(),
          totalQty: 0,
          totalValue: 0,
          taxableAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        };

        existing.totalQty += item.qty;
        existing.totalValue += item.totalAmount ?? 0;
        existing.taxableAmount += item.taxableAmount ?? 0;
        existing.cgst += item.cgst ?? 0;
        existing.sgst += item.sgst ?? 0;
        existing.igst += item.igst ?? 0;

        hsnMap.set(hsn, existing);
      }
    }
  }

  const hsnSummary: Gstr1Summary["hsnSummary"] = Array.from(hsnMap.entries()).map(([hsn, val]) => ({
    hsn,
    ...val,
  }));

  // Group B2CS by place of supply
  const b2csMap = new Map<
    string,
    {
      placeOfSupply: string;
      taxRateBp: number;
      taxableAmount: number;
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
    }
  >();

  for (const doc of docs) {
    if (doc.status === "cancelled" || doc.supplyType === "B2B" || doc.supplyType === "B2CL") continue;
    const pos = doc.placeOfSupply || "27-Maharashtra";
    const existing = b2csMap.get(pos) || {
      placeOfSupply: pos,
      taxRateBp: DEFAULT_GST_RATE_BP,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
    };
    existing.taxableAmount += doc.taxableAmount;
    existing.cgst += doc.cgst;
    existing.sgst += doc.sgst;
    existing.igst += doc.igst;
    existing.total += doc.total;
    b2csMap.set(pos, existing);
  }

  const b2cs = Array.from(b2csMap.values());

  const docSummary = {
    totalIssued: docs.length,
    cancelled: cancelledCount,
    netIssued: docs.length - cancelledCount,
    fromDocNo: docs[docs.length - 1]?.docNo || "None",
    toDocNo: docs[0]?.docNo || "None",
  };

  return {
    period: { month: params.month, year: params.year, fromDate, toDate },
    b2b,
    b2cs,
    b2cl,
    hsnSummary,
    docSummary,
    totals: {
      taxable: totalTaxable,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      cess: totalCess,
      totalTax: totalCgst + totalSgst + totalIgst + totalCess,
      grossTotal: totalGross,
      b2bCount,
      b2cCount,
    },
  };
}

export interface Gstr2Summary {
  period: { month: number; year: number; fromDate: string; toDate: string };
  inwardSupplies: Array<{
    id: string;
    docNo: string;
    docDate: string;
    supplierName: string;
    supplierGstin: string;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    itcEligible: boolean;
  }>;
  totals: {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalItc: number;
    grossTotal: number;
    billCount: number;
  };
}

/**
 * Builds GSTR-2 Inward Supplies (Input Tax Credit) dataset.
 */
export async function buildGstr2Data(
  db: DbOrTx,
  params: {
    tenantId: string;
    month: number;
    year: number;
    storeId?: string;
  }
): Promise<Gstr2Summary> {
  const fromDate = `${params.year}-${String(params.month).padStart(2, "0")}-01`;
  const lastDay = new Date(params.year, params.month, 0).getDate();
  const toDate = `${params.year}-${String(params.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const conditions = [
    eq(schema.gstDocuments.tenantId, params.tenantId),
    eq(schema.gstDocuments.refType, "purchase"),
    gte(schema.gstDocuments.docDate, fromDate),
    lte(schema.gstDocuments.docDate, toDate),
  ];

  if (params.storeId) {
    conditions.push(eq(schema.gstDocuments.storeId, params.storeId));
  }

  const docs = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(...conditions))
    .orderBy(desc(schema.gstDocuments.docDate));

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalGross = 0;

  const inwardSupplies = docs.map((doc) => {
    totalTaxable += doc.taxableAmount;
    totalCgst += doc.cgst;
    totalSgst += doc.sgst;
    totalIgst += doc.igst;
    totalGross += doc.total;

    return {
      id: doc.id,
      docNo: doc.docNo,
      docDate: doc.docDate,
      supplierName: doc.partyName || "Registered Supplier",
      supplierGstin: doc.partyGstin || "Unregistered",
      taxableAmount: doc.taxableAmount,
      cgst: doc.cgst,
      sgst: doc.sgst,
      igst: doc.igst,
      total: doc.total,
      itcEligible: Boolean(doc.partyGstin && doc.partyGstin.trim().length === 15),
    };
  });

  return {
    period: { month: params.month, year: params.year, fromDate, toDate },
    inwardSupplies,
    totals: {
      taxable: totalTaxable,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      totalItc: totalCgst + totalSgst + totalIgst,
      grossTotal: totalGross,
      billCount: docs.length,
    },
  };
}

export interface GstReconciliationResult {
  period: { month: number; year: number };
  outwardTaxLiability: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  inwardItcAvailable: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  netTaxPayable: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  itcCarriedForward: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  discrepancies: Array<{
    type: "missing_gstin" | "tax_rate_mismatch" | "missing_hsn" | "unclaimed_itc";
    severity: "warning" | "danger" | "info";
    title: string;
    description: string;
    docNo?: string;
    amount?: number;
  }>;
}

/**
 * Computes GST Liability vs ITC netting and audit flags.
 */
export async function reconcileGst(
  db: DbOrTx,
  params: {
    tenantId: string;
    month: number;
    year: number;
    storeId?: string;
  }
): Promise<GstReconciliationResult> {
  const [gstr1, gstr2] = await Promise.all([
    buildGstr1Data(db, params),
    buildGstr2Data(db, params),
  ]);

  const outward = {
    cgst: gstr1.totals.cgst,
    sgst: gstr1.totals.sgst,
    igst: gstr1.totals.igst,
    total: gstr1.totals.totalTax,
  };

  const inward = {
    cgst: gstr2.totals.cgst,
    sgst: gstr2.totals.sgst,
    igst: gstr2.totals.igst,
    total: gstr2.totals.totalItc,
  };

  // Net payable in cash (Paise)
  const netCgst = Math.max(0, outward.cgst - inward.cgst);
  const netSgst = Math.max(0, outward.sgst - inward.sgst);
  const netIgst = Math.max(0, outward.igst - inward.igst);

  const cfCgst = Math.max(0, inward.cgst - outward.cgst);
  const cfSgst = Math.max(0, inward.sgst - outward.sgst);
  const cfIgst = Math.max(0, inward.igst - outward.igst);

  const discrepancies: GstReconciliationResult["discrepancies"] = [];

  // Check 1: B2B sales with missing or invalid GSTIN
  for (const inv of gstr1.b2b) {
    if (!isValidGstin(inv.partyGstin)) {
      discrepancies.push({
        type: "missing_gstin",
        severity: "danger",
        title: "Invalid GSTIN on B2B Invoice",
        description: `Invoice ${inv.docNo} for '${inv.partyName}' has invalid GSTIN '${inv.partyGstin}'. GSTR-1 will reject this line.`,
        docNo: inv.docNo,
        amount: inv.total,
      });
    }
  }

  // Check 2: Inward purchases missing supplier GSTIN (lost ITC)
  for (const bill of gstr2.inwardSupplies) {
    if (!bill.itcEligible) {
      discrepancies.push({
        type: "unclaimed_itc",
        severity: "warning",
        title: "Ineligible ITC on Unregistered Purchase",
        description: `Purchase Bill ${bill.docNo} from '${bill.supplierName}' does not provide supplier GSTIN. ITC of ₹${((bill.cgst + bill.sgst + bill.igst) / 100).toFixed(2)} cannot be claimed.`,
        docNo: bill.docNo,
        amount: bill.cgst + bill.sgst + bill.igst,
      });
    }
  }

  // Check 3: Missing HSN on sold items
  for (const hsn of gstr1.hsnSummary) {
    if (!hsn.hsn || hsn.hsn === "30049099" && hsn.description.toLowerCase().includes("default")) {
      discrepancies.push({
        type: "missing_hsn",
        severity: "info",
        title: "Default HSN Code Applied",
        description: `Items without custom HSN were mapped to pharmaceutical code 30049099. Check item master to confirm.`,
      });
      break;
    }
  }

  return {
    period: { month: params.month, year: params.year },
    outwardTaxLiability: outward,
    inwardItcAvailable: inward,
    netTaxPayable: {
      cgst: netCgst,
      sgst: netSgst,
      igst: netIgst,
      total: netCgst + netSgst + netIgst,
    },
    itcCarriedForward: {
      cgst: cfCgst,
      sgst: cfSgst,
      igst: cfIgst,
      total: cfCgst + cfSgst + cfIgst,
    },
    discrepancies,
  };
}

/**
 * Builds Government Portal Compliant JSON Payload for GSTR-1 filing.
 */
export function buildGstr1JsonPayload(
  gstr1: Gstr1Summary,
  gstin: string
) {
  const fp = `${String(gstr1.period.month).padStart(2, "0")}${gstr1.period.year}`;

  const b2bFormatted = gstr1.b2b.map((inv) => ({
    ctin: inv.partyGstin,
    inv: [
      {
        inum: inv.docNo,
        idt: inv.docDate.split("-").reverse().join("-"), // DD-MM-YYYY
        val: Number((inv.total / 100).toFixed(2)),
        pos: inv.placeOfSupply.slice(0, 2),
        rchrg: "N",
        inv_typ: "R",
        itms: [
          {
            num: 1,
            itm_det: {
              txval: Number((inv.taxableAmount / 100).toFixed(2)),
              rt: 12.0,
              camt: Number((inv.cgst / 100).toFixed(2)),
              samt: Number((inv.sgst / 100).toFixed(2)),
              iamt: Number((inv.igst / 100).toFixed(2)),
              csamt: 0.0,
            },
          },
        ],
      },
    ],
  }));

  const hsnFormatted = {
    data: gstr1.hsnSummary.map((h, idx) => ({
      num: idx + 1,
      hsn_sc: h.hsn,
      desc: h.description,
      uqc: h.uqc,
      qty: h.totalQty,
      val: Number((h.totalValue / 100).toFixed(2)),
      txval: Number((h.taxableAmount / 100).toFixed(2)),
      iamt: Number((h.igst / 100).toFixed(2)),
      camt: Number((h.cgst / 100).toFixed(2)),
      samt: Number((h.sgst / 100).toFixed(2)),
      csamt: 0.0,
    })),
  };

  const docIssueFormatted = {
    doc_det: [
      {
        doc_num: 1,
        doc_typ: "Invoices for outward supply",
        docs: [
          {
            num: 1,
            from: gstr1.docSummary.fromDocNo,
            to: gstr1.docSummary.toDocNo,
            totnum: gstr1.docSummary.totalIssued,
            canc: gstr1.docSummary.cancelled,
            net_issue: gstr1.docSummary.netIssued,
          },
        ],
      },
    ],
  };

  return {
    gstin,
    fp,
    gt: Number((gstr1.totals.grossTotal / 100).toFixed(2)),
    cur_gt: Number((gstr1.totals.grossTotal / 100).toFixed(2)),
    b2b: b2bFormatted,
    b2cs: gstr1.b2cs.map((item) => ({
      sply_ty: "INTRA",
      pos: item.placeOfSupply.slice(0, 2),
      typ: "OE",
      rt: 12.0,
      txval: Number((item.taxableAmount / 100).toFixed(2)),
      camt: Number((item.cgst / 100).toFixed(2)),
      samt: Number((item.sgst / 100).toFixed(2)),
      iamt: Number((item.igst / 100).toFixed(2)),
      csamt: 0.0,
    })),
    hsn: hsnFormatted,
    doc_issue: docIssueFormatted,
  };
}
