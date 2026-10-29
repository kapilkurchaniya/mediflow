import { db } from "@/server/db";
import { generateEInvoiceForDocument } from "@/server/domain/e-invoice";

export async function handleEInvoiceGenerate(event: {
  tenantId: string;
  payload: Record<string, unknown>;
}) {
  const gstDocumentId = typeof event.payload.gstDocumentId === "string" ? event.payload.gstDocumentId : "";
  if (!gstDocumentId) throw new Error("Missing gstDocumentId in einvoice.generate payload");

  await generateEInvoiceForDocument(db, {
    gstDocumentId,
    tenantId: event.tenantId,
  });
}
