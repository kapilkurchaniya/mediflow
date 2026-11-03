import { z } from "zod";

export const HeldSaleItemSchema = z.object({
  medicineId: z.string().uuid(),
  medicineName: z.string().min(1),
  genericName: z.string().optional(),
  batchId: z.string().uuid(),
  batchNo: z.string().min(1),
  expiryDate: z.string().min(1),
  packQty: z.number().int().min(0).default(0),
  looseQty: z.number().int().min(0).default(0),
  unitsPerPack: z.number().int().min(1).default(1),
  packUnit: z.string().default("strip"),
  looseUnit: z.string().default("tablet"),
  rate: z.number().int().min(0), // paise
  mrp: z.number().int().min(0), // paise
  discountBp: z.number().int().min(0).max(10000).default(0),
  gstRateBp: z.number().int().default(500),
  isAutoFefo: z.boolean().optional(),
});
export type HeldSaleItem = z.infer<typeof HeldSaleItemSchema>;

export const HoldSaleInputSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().trim().max(100).optional().nullable(),
  customerPhone: z.string().trim().max(20).optional().nullable(),
  doctorName: z.string().trim().max(100).optional().nullable(),
  doctorRegNo: z.string().trim().max(50).optional().nullable(),
  doctorAddress: z.string().trim().max(255).optional().nullable(),
  patientAge: z.number().int().min(0).max(130).optional().nullable(),
  patientGender: z.string().trim().max(20).optional().nullable(),
  patientAddress: z.string().trim().max(255).optional().nullable(),
  prescriptionRef: z.string().trim().max(50).optional().nullable(),
  prescriptionId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(255).optional().nullable(),
  items: z.array(HeldSaleItemSchema).min(1, "Cannot hold an empty bill"),
});
export type HoldSaleInput = z.input<typeof HoldSaleInputSchema>;

export interface HeldSalePayload extends z.output<typeof HoldSaleInputSchema> {
  heldAt: string;
}

export interface RevalidatedHeldItem extends HeldSaleItem {
  availableQtyOnHand: number;
  isAvailable: boolean;
  isExpired: boolean;
  isStockShortage: boolean;
  priceChanged: boolean;
  currentRate: number;
}

export interface ResumeHeldSaleResult {
  heldSaleId: string;
  payload: HeldSalePayload;
  revalidation: {
    hasIssues: boolean;
    hasStockShortage: boolean;
    hasExpiredBatches: boolean;
    items: RevalidatedHeldItem[];
  };
}
