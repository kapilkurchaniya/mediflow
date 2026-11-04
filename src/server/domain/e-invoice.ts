import crypto from "crypto";
import { schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { DEFAULT_GST_RATE_BP } from "@/lib/regulatory";
import { resolveIRPProvider } from "./einvoice-provider-factory";

export * from "./einvoice-types";
export * from "./einvoice-simulator";
export { resolveIRPProvider } from "./einvoice-provider-factory";

import {
  type IRPProvider,
  type EInvoicePayload,
  type EInvoiceItemPayload,
  type EInvoiceSellerDetails,
  type EInvoiceBuyerDetails,
  type EInvoiceBatchDetails,
  type IRNResult,
  type EWayBillInput,
  type EWayBillResult,
  type EInvoiceMode,
  getEInvoiceMode,
} from "./einvoice-types";
import { defaultIRPProvider, calculateIrnHash } from "./einvoice-simulator";

/**
 * Maps pharmacy packaging and selling units to official GST UQC codes.
 */
export function mapToGstUqc(unit?: string | null): string {
  if (!unit) return "NOS";
  const clean = unit.trim().toUpperCase();
  if (["STRIP", "TAB", "TABLET", "CAP", "CAPSULE", "BOX", "STR"].includes(clean)) return "BOX";
  if (["BOTTLE", "BTL"].includes(clean)) return "BTL";
  if (["VIAL", "AMP", "AMPOULE"].includes(clean)) return "VIAL";
  if (["TUBE", "TUB"].includes(clean)) return "TUB";
  if (["GM", "GRAM", "GMS"].includes(clean)) return "GMS";
  if (["KG", "KILOGRAM", "KGS"].includes(clean)) return "KGS";
  if (["ML", "MILLILITRE", "MLT"].includes(clean)) return "MLT";
  if (["LTR", "LITRE"].includes(clean)) return "LTR";
  if (["PACK", "PAC", "KIT"].includes(clean)) return "PAC";
  return "NOS";
}

/** Formats YYYY-MM-DD to DD/MM/YYYY for NIC API */
export function formatGstDate(dateStr?: string | null): string | undefined {
  if (!dateStr) return undefined;
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
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
        hsn: schema.saleItems.hsn,
        medHsn: schema.medicines.hsn,
        unit: schema.medicines.unit,
        packUnit: schema.saleItems.packUnit,
        gstRateBp: schema.saleItems.gstRateBp,
        batchNo: schema.saleItems.batchNo,
        expiryDate: schema.saleItems.expiryDate,
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
      const hsnCode = item.hsn?.trim() || item.medHsn?.trim() || "30049099";

      return {
        slNo: idx + 1,
        itemDescription: item.medicineName,
        hsnCode,
        quantity: item.qty,
        unit: mapToGstUqc(item.packUnit || item.unit),
        unitPrice: unitPriceRs,
        grossAmount: Number((unitPriceRs * item.qty).toFixed(2)),
        discount: discountRs,
        taxableAmount: taxableRs,
        gstRate: Number(((item.gstRateBp ?? DEFAULT_GST_RATE_BP) / 100).toFixed(2)),
        cgstAmount: cgstRs,
        sgstAmount: sgstRs,
        igstAmount: igstRs,
        totalItemValue: totalRs,
        batchDetails: item.batchNo
          ? {
              batchNo: item.batchNo,
              expiryDate: formatGstDate(item.expiryDate),
            }
          : undefined,
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

  const sumAss = itemsPayload.reduce((acc, it) => acc + it.taxableAmount, 0);
  const sumCgst = itemsPayload.reduce((acc, it) => acc + it.cgstAmount, 0);
  const sumSgst = itemsPayload.reduce((acc, it) => acc + it.sgstAmount, 0);
  const sumIgst = itemsPayload.reduce((acc, it) => acc + it.igstAmount, 0);
  const calcTotal = Number((sumAss + sumCgst + sumSgst + sumIgst).toFixed(2));
  const docTotalRs = Number((doc.total / 100).toFixed(2));
  const roundOff = Number((docTotalRs - calcTotal).toFixed(2));

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
      roundOff,
      totalInvoiceValue: docTotalRs,
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

  const [doc] = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(eq(schema.gstDocuments.id, params.gstDocumentId), eq(schema.gstDocuments.tenantId, params.tenantId)));

  if (!doc) {
    throw new Error("GST Document not found");
  }

  let provider = params.provider;
  if (!provider) {
    provider = await resolveIRPProvider(db, {
      tenantId: params.tenantId,
      storeId: doc.storeId ?? undefined,
    });
  }

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
        signedInvoice: response.signedInvoice || null,
        einvoiceProvider: provider.name,
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
      throw new Error(
        `Cannot cancel IRN after statutory 24-hour limit (${hoursElapsed.toFixed(1)} hrs elapsed). ` +
          "Per GST statutory rules, you must issue a Credit Note (GSTR-1 Table 9B) instead."
      );
    }
  }

  let provider = params.provider;
  if (!provider) {
    provider = await resolveIRPProvider(db, {
      tenantId: params.tenantId,
      storeId: doc.storeId ?? undefined,
    });
  }

  const result = await provider.cancelIRN(doc.irn, params.reasonCode, params.remarks);

  // Update doc status
  const [updatedDoc] = await db
    .update(schema.gstDocuments)
    .set({
      status: "cancelled",
      cancelledReason: params.reasonCode,
      cancelledRemarks: params.remarks.trim(),
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
