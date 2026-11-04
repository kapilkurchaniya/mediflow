/**
 * src/server/domain/transfers-eway.ts
 *
 * Bridges inter-store stock transfers with statutory GST compliance & E-Way Bills (B5.2).
 * Handles:
 * - Automatic evaluation of consignment threshold (₹50,000)
 * - Integration with createGstDocumentFromTransfer for delivery challans & tax invoices
 * - Generating E-Way Bills on transfers and updating transfer records
 *
 * Lane B (B5.2)
 */

import { schema, type DbOrTx } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { createGstDocumentFromTransfer } from "./gst";
import {
  generateEWayBillForDocument,
  validateVehicleNumber,
  type EWayBillInput,
  type IRPProvider,
} from "./e-invoice";

export interface GenerateTransferEWayBillParams {
  tenantId: string;
  transferId: string;
  transportDetails: EWayBillInput;
  provider?: IRPProvider;
}

export async function generateEWayBillForTransfer(
  db: DbOrTx,
  params: GenerateTransferEWayBillParams
) {
  // 1. Fetch transfer details
  const [transfer] = await db
    .select()
    .from(schema.stockTransfers)
    .where(
      and(
        eq(schema.stockTransfers.id, params.transferId),
        eq(schema.stockTransfers.tenantId, params.tenantId)
      )
    );

  if (!transfer) {
    throw new Error(`Stock transfer ${params.transferId} not found`);
  }

  // 2. Validate vehicle format if provided
  if (params.transportDetails.vehicleNo) {
    const vCheck = validateVehicleNumber(params.transportDetails.vehicleNo);
    if (!vCheck.valid) {
      throw new Error(vCheck.error);
    }
  }

  // 3. Locate or create corresponding outward GST document
  let [gstDoc] = await db
    .select()
    .from(schema.gstDocuments)
    .where(
      and(
        eq(schema.gstDocuments.tenantId, params.tenantId),
        eq(schema.gstDocuments.refType, "transfer"),
        eq(schema.gstDocuments.refId, params.transferId),
        eq(schema.gstDocuments.status, "active")
      )
    )
    .limit(1);

  if (!gstDoc) {
    // Fetch items to build transfer document
    const items = await db
      .select()
      .from(schema.stockTransferItems)
      .where(
        and(
          eq(schema.stockTransferItems.tenantId, params.tenantId),
          eq(schema.stockTransferItems.transferId, params.transferId)
        )
      );

    const lines = items.map((item) => ({
      medicineId: item.medicineId,
      qty: item.qtyDispatched > 0 ? item.qtyDispatched : item.qty,
      unitCostPaise: item.unitCost ?? 0,
      gstRateBp: item.gstRateBp ?? 0,
    }));

    const result = await createGstDocumentFromTransfer(db, {
      tenantId: params.tenantId,
      transferId: transfer.id,
      transferNo: transfer.transferNo,
      fromStoreId: transfer.fromStoreId,
      toStoreId: transfer.toStoreId,
      lines,
      transferDate: transfer.documentDate ? transfer.documentDate.toISOString().split("T")[0] : undefined,
    });

    gstDoc = result.outwardDoc;
  }

  if (!gstDoc) {
    throw new Error("Failed to resolve or create GST document for stock transfer");
  }

  // 4. Generate statutory E-Way Bill on the GST document
  const ewbResult = await generateEWayBillForDocument(db, {
    gstDocumentId: gstDoc.id,
    tenantId: params.tenantId,
    transportDetails: params.transportDetails,
    provider: params.provider,
  });

  // 5. Update stock transfer record
  await db
    .update(schema.stockTransfers)
    .set({
      eWayBillNo: ewbResult.ewayBillNo,
      eWayBillDate: new Date(),
      vehicleNo: params.transportDetails.vehicleNo
        ? validateVehicleNumber(params.transportDetails.vehicleNo).normalized
        : transfer.vehicleNo,
      transporterId: params.transportDetails.transporterId || transfer.transporterId,
      transporterName: params.transportDetails.transporterName || transfer.transporterName,
      transportMode: params.transportDetails.transportMode || transfer.transportMode,
      gstDocumentId: gstDoc.id,
      updatedAt: new Date(),
    })
    .where(eq(schema.stockTransfers.id, transfer.id));

  return {
    success: true,
    ewayBillNo: ewbResult.ewayBillNo,
    validUpto: ewbResult.validUpto,
    gstDocumentId: gstDoc.id,
  };
}

