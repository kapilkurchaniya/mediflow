import { z } from "zod";

/**
 * 🤝 CONTRACT (ROADMAP A2.1): the input and result of the sale domain service.
 * Shared by the POS action, held-bill completion (A2.3), offline sync (A4.3) and tests.
 * Money is integer paise, rates are basis points. Never put tenantId / storeId / userId in here:
 * they come from the AuthCtx.
 */

export const PAYMENT_METHODS = ["cash", "upi", "card", "credit", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const optText = z.string().trim().max(500).optional();

/** Doctor / patient / prescription details needed for Schedule H, H1, X and narcotic drugs. */
export const ComplianceDetailsSchema = z.object({
  doctorId: z.string().uuid().optional(),
  doctorName: optText,
  doctorRegNo: optText,
  doctorAddress: optText,
  patientName: optText,
  patientAge: z.number().int().min(0).max(130).optional(),
  patientGender: optText,
  patientAddress: optText,
  patientPhone: optText,
  prescriptionRef: optText,
  prescriptionDate: optText,
  /** 🤝 Lane B: when set, `applyPrescriptionDispensing` is called inside the sale transaction. */
  prescriptionId: z.string().uuid().optional(),
});
export type ComplianceDetails = z.infer<typeof ComplianceDetailsSchema>;

export const SaleLineSchema = z
  .object({
    batchId: z.string().uuid().optional(),
    medicineId: z.string().uuid().optional(),
    qty: z.number().int().positive().optional(),
    packQty: z.number().int().min(0).optional(),
    looseQty: z.number().int().min(0).optional(),
    discountBp: z.number().int().min(0).max(10000),
    autoFefo: z.boolean().optional(),
    overrideBatch: z.boolean().optional(),
    overrideReason: z.string().trim().max(255).optional(),
    daysSupply: z.number().int().min(1).max(365).optional(),
  })
  .refine(
    (l) => Boolean(l.batchId || l.medicineId),
    { message: "Either batchId or medicineId must be provided." },
  )
  .refine(
    (l) => (l.qty !== undefined && l.qty > 0) || ((l.packQty ?? 0) > 0 || (l.looseQty ?? 0) > 0),
    { message: "Quantity must be greater than zero." },
  );
export type SaleLine = z.infer<typeof SaleLineSchema>;

export const SalePaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  /** paise */
  amount: z.number().int().positive(),
  reference: z.string().trim().max(64).optional(),
});
export type SalePayment = z.infer<typeof SalePaymentSchema>;

export const SaleInput = z.object({
  /** Idempotency key (double click, offline retry). A second call with the same id returns the first sale. */
  clientSaleId: z.string().uuid().optional(),
  /** Resumed held sale ID to delete/clean up upon completion (A2.3). */
  heldSaleId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  lines: z.array(SaleLineSchema).min(1, "No items to bill"),
  /** Extra discount on the whole bill, paise (A2.2+). */
  billDiscountPaise: z.number().int().min(0).default(0),
  /** Whatever is not covered by payments is credit (A2.2 adds the credit rules). */
  payments: z.array(SalePaymentSchema).default([]),
  /** Loyalty points to redeem (🤝 B2.5, used from A2.7). */
  redeemPoints: z.number().int().min(0).default(0),
  compliance: ComplianceDetailsSchema.optional(),
  medicalRepId: z.string().uuid().optional(),
  creditOverride: z
    .object({
      managerId: z.string().uuid().optional(),
      reason: z.string().trim().min(1),
    })
    .optional(),
});
export type SaleInput = z.infer<typeof SaleInput>;
/** What callers may pass (defaults not applied yet). */
export type SaleInputData = z.input<typeof SaleInput>;

export interface CreateSaleOptions {
  /** Where the sale came from. Offline sales may be recorded even if stock went negative (A4.3). */
  source: "pos" | "offline" | "external_order";
  allowNegativeStock?: boolean;
  /** Pre-assigned invoice number (offline device series). Normally omitted: the server numbers it. */
  invoiceNo?: string;
  /** Injectable clock for tests (financial-year rollover). */
  now?: Date;
}

export interface CreateSaleResult {
  saleId: string;
  invoiceNo: string;
  /** paise */
  total: number;
  /** Cash handed back to the customer (paise) when they paid more than the bill. 0 otherwise. */
  changeDue: number;
  /** true when `clientSaleId` matched an earlier sale and nothing new was written. */
  duplicate: boolean;
}
