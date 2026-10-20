import { schema } from "@/server/db";
import { sql } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { MAX_INVOICE_NO_LENGTH } from "@/lib/regulatory";
import type { Tx } from "@/server/db";

export async function nextDocNumber(
  tx: Tx,
  tenantId: string,
  storeId: string,
  docType: string,
  prefix: string = "INV",
  now: Date = new Date()
): Promise<string> {
  const date = now;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fiscalYear = month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

  const [seq] = await tx
    .insert(schema.docSequences)
    .values({
      tenantId,
      storeId,
      docType,
      fiscalYear,
      nextValue: 2,
    })
    .onConflictDoUpdate({
      target: [
        schema.docSequences.tenantId,
        schema.docSequences.storeId,
        schema.docSequences.docType,
        schema.docSequences.fiscalYear,
      ],
      set: { nextValue: sql`${schema.docSequences.nextValue} + 1` },
    })
    .returning({ nextValue: schema.docSequences.nextValue });

  // If nextValue became 2, the current document gets 1
  const currentVal = seq.nextValue - 1;
  const numStr = currentVal.toString().padStart(6, "0");
  const fyShort = fiscalYear.slice(2, 4) + "-" + fiscalYear.slice(7, 9);
  
  const docNo = `${prefix}/${fyShort}/${numStr}`;
  if (docType === "sale" && docNo.length > MAX_INVOICE_NO_LENGTH) {
    // GST Rule 46(b): an invoice number may not exceed 16 characters. Fail the whole sale rather than
    // issue an invalid invoice (the surrounding transaction rolls back, so no serial is burned).
    throw new DomainError(
      "INVOICE_NO_TOO_LONG",
      `Invoice number "${docNo}" is longer than the ${MAX_INVOICE_NO_LENGTH} characters GST allows. Shorten the bill prefix in Settings.`,
    );
  }
  return docNo;
}
