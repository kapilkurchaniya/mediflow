/**
 * src/server/domain/einvoice-simulator.ts
 *
 * Simulated IRP Provider — generates mathematically correct IRNs locally.
 * NOT a valid e-invoice. Used for offline testing and dev without external network calls.
 *
 * Lane B (B5.1)
 */

import crypto from "crypto";
import type {
  IRPProvider,
  EInvoicePayload,
  IRNResult,
  EWayBillInput,
  EWayBillResult,
} from "./einvoice-types";

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
