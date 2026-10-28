import type { Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import type { CreateSaleOptions, CreateSaleResult, SaleInput } from "./types";

/**
 * 🤝 CONTRACT (ROADMAP A2.1). Creates one completed sale inside the caller's transaction:
 * re-reads batches/prices on the server, checks expiry and stock, validates drug-schedule compliance,
 * decides the tax context (CGST+SGST vs IGST), numbers the invoice, writes the sale, stock movements,
 * dispensing logs, payments, the journal entry, the GST document and loyalty points, and queues the receipt.
 *
 * Throws DomainError for expected failures (message is shown to the user).
 *
 * NOT IMPLEMENTED YET: this file only fixes the signature so other code can be written against it.
 */
export async function createSale(
  _tx: Tx,
  _ctx: AuthCtx,
  _input: SaleInput,
  _opts: CreateSaleOptions,
): Promise<CreateSaleResult> {
  throw new Error("createSale is not implemented yet (ROADMAP A2.1)");
}
