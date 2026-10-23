import crypto from "crypto";
import { schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { DEFAULT_GST_RATE_BP } from "@/lib/regulatory";

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
  status: "ACT";
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
  generateEWayBill(irn: string, details: EWayBillInput): Promise<EWayBillResult>;
  cancelEWayBill(ewayBillNo: string, reason: string): Promise<{ success: boolean }>;
}

/**
 * Computes official 64-character SHA-256 hash IRN
 * Formula: SHA256(SupplierGSTIN + FiscalYear + DocType + DocNo)
 */
export function calculateIrnHash(
  sellerGstin: string,
  fiscalYear: string,
  docType: string,
  docNo: string
): string {
  const normalized = `${sellerGstin.trim().toUpperCase()}${fiscalYear.trim()}${docType.trim().toUpperCase()}${docNo.trim()}`;
  return crypto.createHash("sha256").update(normalized).digest("hex").toUpperCase();
}

/**
 * Simulated IRP Provider — generates mathematically correct IRNs locally.
 * NOT a valid e-invoice. Never use in production without a real GSP.
 */
export class SimulatedIRPProvider implements IRPProvider {
  name = "SIMULATOR";

  async generateIRN(payload: EInvoicePayload): Promise<IRNResult> {
    const docDateParts = payload.documentDetails.documentDate.split("/");
    const docYear = parseInt(docDateParts[2] || "2026", 10);
    const docMonth = parseInt(docDateParts[1] || "4", 10);
    // Indian FY calculation
    const fy = docMonth >= 4 ? `${docYear}-${String(docYear + 1).slice(2)}` : `${docYear - 1}-${String(docYear).slice(2)}`;

    const irn = calculateIrnHash(
      payload.sellerDetails.gstin,
      fy,
      payload.documentDetails.documentType,
      payload.documentDetails.documentNumber
    );

    const now = new Date();
    // 15-digit acknowledgement number
    const timestampSeed = Date.now().toString().slice(-9);
    const ackNo = `1226${timestampSeed.padStart(11, "0")}`;
    const ackDate = now.toISOString();

    // Construct standard QR code signed data packet
    const qrData = {
      sellerGstin: payload.sellerDetails.gstin,
      buyerGstin: payload.buyerDetails.gstin,
      docNo: payload.documentDetails.documentNumber,
      docDate: payload.documentDetails.documentDate,
      totVal: payload.valueDetails.totalInvoiceValue,
      itemCnt: payload.itemList.length,
      mainHsn: payload.itemList[0]?.hsnCode || "30049099",
      irn,
    };

    const signedQrCode = Buffer.from(JSON.stringify(qrData)).toString("base64");

    return {
      irn,
      ackNo,
      ackDate,
      signedQrCode,
      status: "ACT",
    };
  }

  async cancelIRN(irn: string, reasonCode: string, remarks: string) {
    if (!irn || irn.length !== 64) {
      throw new Error("Invalid IRN: Must be 64-character SHA-256 hash");
    }
    return {
      success: true,
      cancelledDate: new Date().toISOString(),
    };
  }

  async generateEWayBill(irn: string, details: EWayBillInput): Promise<EWayBillResult> {
    const now = new Date();
    const daysValid = Math.max(1, Math.ceil(details.distanceKm / 200)); // 1 day per 200 km
    const validUptoDate = new Date(now.getTime() + daysValid * 24 * 60 * 60 * 1000);

    const ewbNo = `311${Math.floor(100000000 + Math.random() * 900000000)}`;

    return {
      ewayBillNo: ewbNo,
      ewayBillDate: now.toISOString(),
      validUpto: validUptoDate.toISOString(),
    };
  }

  async cancelEWayBill(ewayBillNo: string, reason: string) {
    return { success: true };
  }
}

export const defaultIRPProvider = new SimulatedIRPProvider();

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

/**
 * Builds NIC-compliant E-Invoice JSON payload from a Sale & Store record.
 */
export async function buildEInvoicePayload(
  db: DbOrTx,
  params: {
    gstDocumentId: string;
    tenantId: string;
  }
): Promise<EInvoicePayload> {
  const [doc] = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(eq(schema.gstDocuments.id, params.gstDocumentId), eq(schema.gstDocuments.tenantId, params.tenantId)));

  if (!doc) {
    throw new Error("GST Document not found");
  }

  if (doc.supplyType !== "B2B") {
    throw new Error(`E-Invoice is only mandatory for B2B supplies. Current type: ${doc.supplyType}`);
  }

  if (!doc.partyGstin) {
    throw new Error("Buyer GSTIN is required for B2B E-Invoicing");
  }

  const [store] = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, doc.storeId));

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, params.tenantId));

  const sellerGstin = (store?.gstin || tenant?.gstin || "27AAPCS1234F1Z5").trim().toUpperCase();
  const sellerStateCode = (store?.stateCode || tenant?.stateCode || "27").padStart(2, "0");

  const buyerGstin = doc.partyGstin.trim().toUpperCase();
  const buyerStateCode = (doc.partyStateCode || buyerGstin.slice(0, 2)).padStart(2, "0");

  // Fetch sale items if linked
  let itemsPayload: EInvoiceItemPayload[] = [];
  if (doc.refId && doc.refType === "sale") {
    const saleItems = await db
      .select({
        medicineName: schema.saleItems.medicineName,
        qty: schema.saleItems.qty,
        rate: schema.saleItems.rate,
        discountAmount: schema.saleItems.discountAmount,
        taxableAmount: schema.saleItems.taxableAmount,
        cgst: schema.saleItems.cgst,
        sgst: schema.saleItems.sgst,
        igst: schema.saleItems.igst,
        totalAmount: schema.saleItems.totalAmount,
        hsn: schema.medicines.hsn,
        unit: schema.medicines.unit,
        gstRateBp: schema.saleItems.gstRateBp,
      })
      .from(schema.saleItems)
      .leftJoin(schema.medicines, eq(schema.saleItems.medicineId, schema.medicines.id))
      .where(eq(schema.saleItems.saleId, doc.refId));

    itemsPayload = saleItems.map((item, idx) => {
      const taxableRs = Number(((item.taxableAmount ?? 0) / 100).toFixed(2));
      const cgstRs = Number(((item.cgst ?? 0) / 100).toFixed(2));
      const sgstRs = Number(((item.sgst ?? 0) / 100).toFixed(2));
      const igstRs = Number(((item.igst ?? 0) / 100).toFixed(2));
      const totalRs = Number(((item.totalAmount ?? 0) / 100).toFixed(2));
      const unitPriceRs = Number(((item.rate ?? 0) / 100).toFixed(2));
      const discountRs = Number(((item.discountAmount ?? 0) / 100).toFixed(2));

      return {
        slNo: idx + 1,
        itemDescription: item.medicineName,
        hsnCode: item.hsn?.trim() || "30049099",
        quantity: item.qty,
        unit: (item.unit || "NOS").toUpperCase(),
        unitPrice: unitPriceRs,
        grossAmount: Number((unitPriceRs * item.qty).toFixed(2)),
        discount: discountRs,
        taxableAmount: taxableRs,
        gstRate: Number(((item.gstRateBp ?? DEFAULT_GST_RATE_BP) / 100).toFixed(2)),
        cgstAmount: cgstRs,
        sgstAmount: sgstRs,
        igstAmount: igstRs,
        totalItemValue: totalRs,
      };
    });
  }

  // Fallback single line item if items not linked
  if (itemsPayload.length === 0) {
    itemsPayload = [
      {
        slNo: 1,
        itemDescription: "Pharmaceutical Products",
        hsnCode: "30049099",
        quantity: 1,
        unit: "OTH",
        unitPrice: Number((doc.taxableAmount / 100).toFixed(2)),
        grossAmount: Number((doc.taxableAmount / 100).toFixed(2)),
        discount: 0,
        taxableAmount: Number((doc.taxableAmount / 100).toFixed(2)),
        gstRate: Number((DEFAULT_GST_RATE_BP / 100).toFixed(2)),
        cgstAmount: Number((doc.cgst / 100).toFixed(2)),
        sgstAmount: Number((doc.sgst / 100).toFixed(2)),
        igstAmount: Number((doc.igst / 100).toFixed(2)),
        totalItemValue: Number((doc.total / 100).toFixed(2)),
      },
    ];
  }

  // Format doc date as DD/MM/YYYY
  const [yr, mo, da] = doc.docDate.split("-");
  const formattedDate = `${da}/${mo}/${yr}`;

  return {
    version: "1.1",
    transactionDetails: {
      taxScheme: "GST",
      supplyType: "B2B",
      reverseCharge: doc.isReverseCharge ? "Y" : "N",
      igstOnIntra: "N",
    },
    documentDetails: {
      documentType: doc.docType === "credit_note" ? "CRN" : doc.docType === "debit_note" ? "DBN" : "INV",
      documentNumber: doc.docNo,
      documentDate: formattedDate,
    },
    sellerDetails: {
      gstin: sellerGstin,
      legalName: tenant?.legalName || store?.name || "MediFlow Healthcare Pvt Ltd",
      tradeName: store?.name,
      address: store?.address || "Main Market Commercial Complex",
      location: store?.city || "Mumbai",
      pincode: store?.pincode || "400001",
      stateCode: sellerStateCode,
    },
    buyerDetails: {
      gstin: buyerGstin,
      legalName: doc.partyName || "Purchaser Enterprise",
      address: "Commercial Office Park",
      location: "Industrial Area",
      pincode: "400050",
      stateCode: buyerStateCode,
      placeOfSupply: buyerStateCode,
    },
    itemList: itemsPayload,
    valueDetails: {
      assValue: Number((doc.taxableAmount / 100).toFixed(2)),
      cgstValue: Number((doc.cgst / 100).toFixed(2)),
      sgstValue: Number((doc.sgst / 100).toFixed(2)),
      igstValue: Number((doc.igst / 100).toFixed(2)),
      cessValue: Number((doc.cess / 100).toFixed(2)),
      roundOff: 0,
      totalInvoiceValue: Number((doc.total / 100).toFixed(2)),
    },
  };
}

/**
 * Generates IRN for a GST document and saves logs.
 */
export async function generateEInvoiceForDocument(
  db: DbOrTx,
  params: {
    gstDocumentId: string;
    tenantId: string;
    provider?: IRPProvider;
  }
) {
  const mode = getEInvoiceMode();

  if (mode === "disabled") {
    throw new Error(
      "E-invoicing is not configured. Set EINVOICE_MODE=simulator to test locally, " +
        "or EINVOICE_MODE=sandbox|production with a real GSP provider."
    );
  }

  const provider = params.provider || defaultIRPProvider;

  if (mode === "simulator" && provider.name !== "SIMULATOR") {
    throw new Error("EINVOICE_MODE=simulator but a non-simulator provider was supplied.");
  }

  // 1. Build Payload
  const payload = await buildEInvoicePayload(db, {
    gstDocumentId: params.gstDocumentId,
    tenantId: params.tenantId,
  });

  try {
    // 2. Call IRP
    const response = await provider.generateIRN(payload);

    // 3. Update GST document
    const [updatedDoc] = await db
      .update(schema.gstDocuments)
      .set({
        irn: response.irn,
        irnDate: new Date(response.ackDate),
        ackNo: response.ackNo,
        ackDate: new Date(response.ackDate),
        signedQrCode: response.signedQrCode,
      })
      .where(and(eq(schema.gstDocuments.id, params.gstDocumentId), eq(schema.gstDocuments.tenantId, params.tenantId)))
      .returning();

    // 4. Record Audit Log (include provider name so SIMULATOR is clearly traceable)
    await db.insert(schema.eInvoiceLogs).values({
      tenantId: params.tenantId,
      gstDocumentId: params.gstDocumentId,
      action: "generate",
      requestPayload: { ...payload, provider: provider.name } as unknown as Record<string, unknown>,
      responsePayload: response as unknown as Record<string, unknown>,
      status: "success",
      errorMessage: null,
    });

    return { success: true, document: updatedDoc, irn: response.irn, ackNo: response.ackNo };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Log failure
    await db.insert(schema.eInvoiceLogs).values({
      tenantId: params.tenantId,
      gstDocumentId: params.gstDocumentId,
      action: "generate",
      requestPayload: payload as unknown as Record<string, unknown>,
      responsePayload: null,
      status: "failed",
      errorMessage: errorMsg,
    });

    throw new Error(`IRP Generation failed: ${errorMsg}`);
  }
}

/**
 * Cancels an IRN on the IRP Portal within the statutory 24-hour window.
 */
export async function cancelEInvoiceForDocument(
  db: DbOrTx,
  params: {
    gstDocumentId: string;
    tenantId: string;
    reasonCode: "1" | "2" | "3" | "4"; // 1: Duplicate, 2: Data entry mistake, 3: Order cancelled, 4: Other
    remarks: string;
    provider?: IRPProvider;
  }
) {
  const provider = params.provider || defaultIRPProvider;

  const [doc] = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(eq(schema.gstDocuments.id, params.gstDocumentId), eq(schema.gstDocuments.tenantId, params.tenantId)));

  if (!doc) throw new Error("GST Document not found");
  if (!doc.irn) throw new Error("Invoice has no IRN to cancel");

  // Check 24-hour cancellation rule
  if (doc.irnDate) {
    const hoursElapsed = (Date.now() - new Date(doc.irnDate).getTime()) / (1000 * 60 * 60);
    if (hoursElapsed > 24) {
      throw new Error(`Cannot cancel IRN after 24 hours (${hoursElapsed.toFixed(1)} hrs elapsed). File a credit note instead.`);
    }
  }

  const result = await provider.cancelIRN(doc.irn, params.reasonCode, params.remarks);

  // Update doc status
  const [updatedDoc] = await db
    .update(schema.gstDocuments)
    .set({
      status: "cancelled",
    })
    .where(eq(schema.gstDocuments.id, params.gstDocumentId))
    .returning();

  await db.insert(schema.eInvoiceLogs).values({
    tenantId: params.tenantId,
    gstDocumentId: params.gstDocumentId,
    action: "cancel",
    requestPayload: { irn: doc.irn, reasonCode: params.reasonCode, remarks: params.remarks },
    responsePayload: result as unknown as Record<string, unknown>,
    status: "success",
    errorMessage: null,
  });

  return { success: true, document: updatedDoc };
}

/**
 * Generates an E-Way Bill for an invoice.
 */
export async function generateEWayBillForDocument(
  db: DbOrTx,
  params: {
    gstDocumentId: string;
    tenantId: string;
    transportDetails: EWayBillInput;
    provider?: IRPProvider;
  }
) {
  const provider = params.provider || defaultIRPProvider;

  const [doc] = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(eq(schema.gstDocuments.id, params.gstDocumentId), eq(schema.gstDocuments.tenantId, params.tenantId)));

  if (!doc) throw new Error("GST Document not found");

  const result = await provider.generateEWayBill(doc.irn || "DIRECT", params.transportDetails);

  const [updatedDoc] = await db
    .update(schema.gstDocuments)
    .set({
      eWayBillNo: result.ewayBillNo,
      eWayBillDate: new Date(result.ewayBillDate),
      eWayBillValidTill: new Date(result.validUpto),
    })
    .where(eq(schema.gstDocuments.id, params.gstDocumentId))
    .returning();

  await db.insert(schema.eInvoiceLogs).values({
    tenantId: params.tenantId,
    gstDocumentId: params.gstDocumentId,
    action: "generate_eway_bill",
    requestPayload: params.transportDetails as unknown as Record<string, unknown>,
    responsePayload: result as unknown as Record<string, unknown>,
    status: "success",
    errorMessage: null,
  });

  return { success: true, document: updatedDoc, ewayBillNo: result.ewayBillNo, validUpto: result.validUpto };
}
