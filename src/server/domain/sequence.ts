import { schema } from "@/server/db";
import { sql } from "drizzle-orm";
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
  
  return `${prefix}/${fyShort}/${numStr}`;
}
