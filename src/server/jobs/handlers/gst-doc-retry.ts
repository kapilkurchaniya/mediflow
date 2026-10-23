import { db } from "@/server/db";
import { createGstDocumentFromSale, createGstDocumentFromPurchase } from "@/server/domain/gst";

export async function handleGstDocRetry(event: {
  tenantId: string;
  payload: any;
}) {
  const { refType, refId, storeId } = event.payload;
  if (!refId || !refType) throw new Error("Missing refType or refId in gst.doc_retry payload");

  if (refType === "sale") {
    await createGstDocumentFromSale(db, {
      saleId: refId,
      tenantId: event.tenantId,
      storeId,
    });
  } else if (refType === "purchase") {
    await createGstDocumentFromPurchase(db, {
      purchaseId: refId,
      tenantId: event.tenantId,
      storeId,
    });
  } else {
    throw new Error(`Unsupported refType '${refType}' for gst.doc_retry`);
  }
}
