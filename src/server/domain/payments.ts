import { z } from "zod";
import type { Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";

/**
 * 🤝 CONTRACT (ROADMAP A2.9): receipts and payment vouchers.
 * Lane B builds supplier payments (B2.4) on top of `postPayment`; bank reconciliation matches its rows.
 * Money is integer paise.
 */

export const POST_PAYMENT_METHODS = ["cash", "upi", "card", "bank"] as const;

export const PostPaymentInput = z.object({
  /** in = we receive (customer receipt), out = we pay (supplier payment, expense). */
  direction: z.enum(["in", "out"]),
  partyType: z.enum(["customer", "supplier", "expense"]),
  partyId: z.string().uuid().optional(),
  /** Required when partyType is "expense": the expense account to debit. */
  expenseAccountId: z.string().uuid().optional(),
  method: z.enum(POST_PAYMENT_METHODS),
  /** paise */
  amount: z.number().int().positive(),
  reference: z.string().trim().max(64).optional(),
  /** YYYY-MM-DD business date. */
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
  /** Bill-wise settlement: which invoices this payment pays off. The allocations must sum to <= amount. */
  allocations: z
    .array(
      z.object({
        refType: z.enum(["sale", "purchase"]),
        refId: z.string().uuid(),
        /** paise */
        amount: z.number().int().positive(),
      }),
    )
    .optional(),
});
export type PostPaymentInput = z.infer<typeof PostPaymentInput>;

export interface PostPaymentResult {
  paymentId: string;
  paymentNo: string;
}

/**
 * Creates the `payments` row (number from `nextDocNumber`), a balanced journal entry
 * (receipt: Dr Cash/Bank, Cr Customer; payment: Dr Supplier, Cr Cash/Bank) and updates
 * `sales.paid_amount` / `credit_amount` or `purchases.paid_amount` for the allocated bills.
 *
 * NOT IMPLEMENTED YET: this file only fixes the signature so other code can be written against it.
 */
export async function postPayment(
  _tx: Tx,
  _ctx: AuthCtx,
  _input: PostPaymentInput,
): Promise<PostPaymentResult> {
  throw new Error("postPayment is not implemented yet (ROADMAP A2.9)");
}
