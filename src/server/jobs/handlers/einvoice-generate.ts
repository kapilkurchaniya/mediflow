import { db } from "@/server/db";
import { generateEInvoiceForDocument } from "@/server/domain/e-invoice";

export async function handleEInvoiceGenerate(event: {
  tenantId: string;
  payload: any;
}) {
  const { gstDocumentId } = event.payload;
  if (!gstDocumentId) throw new Error("Missing gstDocumentId in einvoice.generate payload");

  await generateEInvoiceForDocument(db, {
    gstDocumentId,
    tenantId: event.tenantId,
  });
}
