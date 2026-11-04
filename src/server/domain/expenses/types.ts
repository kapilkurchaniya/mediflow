import { z } from "zod";
import { POST_PAYMENT_METHODS } from "./../payments";

export const RecordExpenseInputSchema = z.object({
  clientOperationId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  amount: z.number().int().positive(),
  method: z.enum(POST_PAYMENT_METHODS),
  paidFromTill: z.boolean().default(false),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(64).optional(),
  note: z.string().trim().max(500).optional(),
  payeeName: z.string().trim().max(255).optional(),
  vendorInvoiceNo: z.string().trim().max(100).optional(),
  vendorInvoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vendorGstin: z.string().trim().max(20).optional(),
});
export type RecordExpenseInput = z.infer<typeof RecordExpenseInputSchema>;

export interface RecordExpenseResult {
  paymentId: string;
  paymentNo: string;
  isDuplicate?: boolean;
}

export interface ExpenseSummaryStats {
  totalExpenses: number;
  cashPayouts: number;
  digitalPayments: number;
  voucherCount: number;
  topCategory: { name: string; total: number } | null;
}
