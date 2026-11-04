import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { generateEInvoiceForDocument } from "@/server/domain/e-invoice";

export async function handleEInvoiceGenerate(event: {
  tenantId: string;
  payload: Record<string, unknown>;
}) {
  const gstDocumentId = typeof event.payload.gstDocumentId === "string" ? event.payload.gstDocumentId : "";
  if (!gstDocumentId) throw new Error("Missing gstDocumentId in einvoice.generate payload");

  // Idempotency check: Skip if IRN already generated
  const [doc] = await db
    .select({ irn: schema.gstDocuments.irn })
    .from(schema.gstDocuments)
    .where(and(eq(schema.gstDocuments.id, gstDocumentId), eq(schema.gstDocuments.tenantId, event.tenantId)));

  if (doc?.irn) {
    return; // Already generated
  }

  await generateEInvoiceForDocument(db, {
    gstDocumentId,
    tenantId: event.tenantId,
  });
}
