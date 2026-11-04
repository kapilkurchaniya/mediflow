import { z, ZodError } from "zod";
import { NextResponse } from "next/server";
import { DomainError } from "@/server/errors";
import { ComplianceDetailsSchema } from "@/server/domain/sales/types";

export const PAYMENT_METHODS = ["cash", "upi", "card", "credit", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SyncEntityPageParamSchema = z.object({
  since: z.string().datetime().optional(),
  sessionId: z.string().uuid().optional(),
  snapshotTime: z.string().datetime().optional(),
  entity: z
    .enum([
      "medicines",
      "batches",
      "customers",
      "doctors",
      "schemes",
      "storeMedicineSettings",
      "storeSettings",
    ])
    .optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export interface SyncEntityPageParam {
  since?: string;
  sessionId?: string;
  snapshotTime?: string;
  entity?:
    | "medicines"
    | "batches"
    | "customers"
    | "doctors"
    | "schemes"
    | "storeMedicineSettings"
    | "storeSettings";
  cursor?: string;
  limit?: number;
}

export interface SyncEntityPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SyncPullResponse {
  sessionId: string;
  serverTime: string;
  snapshotTime: string;
  expiresAt: string;
  entities: {
    medicines: SyncEntityPage<Record<string, unknown>>;
    batches: SyncEntityPage<Record<string, unknown>>;
    customers: SyncEntityPage<Record<string, unknown>>;
    doctors: SyncEntityPage<Record<string, unknown>>;
    schemes: SyncEntityPage<Record<string, unknown>>;
    storeMedicineSettings: SyncEntityPage<Record<string, unknown>>;
    storeSettings: SyncEntityPage<Record<string, unknown>>;
  };
}

export const ReserveNumbersRequestSchema = z.object({
  clientReservationId: z.string().min(1).max(100),
  count: z.number().int().min(1).max(500),
});

export type ReserveNumbersRequest = z.infer<typeof ReserveNumbersRequestSchema>;

export interface ReserveNumbersResponse {
  reservationId: string;
  fiscalYear: string;
  storeCode: string;
  deviceCode: string;
  startSeq: number;
  endSeq: number;
  count: number;
  sampleStartInvoiceNo: string;
  sampleEndInvoiceNo: string;
}

export const OfflineSaleLineSchema = z
  .object({
    batchId: z.string().uuid().optional(),
    medicineId: z.string().uuid().optional(),
    qty: z.number().int().positive().optional(),
    packQty: z.number().int().min(0).optional(),
    looseQty: z.number().int().min(0).optional(),
    discountBp: z.number().int().min(0).max(10000).default(0),
    autoFefo: z.boolean().optional(),
    overrideBatch: z.boolean().optional(),
    overrideReason: z.string().trim().max(255).optional(),
  })
  .refine((l) => Boolean(l.batchId || l.medicineId), {
    message: "Either batchId or medicineId must be provided.",
  })
  .refine(
    (l) =>
      (l.qty !== undefined && l.qty > 0) ||
      ((l.packQty ?? 0) > 0 || (l.looseQty ?? 0) > 0),
    { message: "Quantity must be greater than zero." },
  );

export interface OfflineSaleLine {
  batchId?: string;
  medicineId?: string;
  qty?: number;
  packQty?: number;
  looseQty?: number;
  discountBp?: number;
  autoFefo?: boolean;
  overrideBatch?: boolean;
  overrideReason?: string;
}

export const OfflineSalePaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().int().positive(),
  reference: z.string().trim().max(64).optional(),
});

export interface OfflineSalePayment {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export const OfflineSaleSchema = z.object({
  clientSaleId: z.string().uuid(),
  invoiceNo: z.string().min(1).max(16),
  fiscalYear: z.string().regex(/^\d{4}-\d{4}$/),
  sequenceNumber: z.number().int().positive(),
  reservationId: z.string().uuid().optional(),
  createdBy: z.string().uuid(),
  completedAt: z.string().datetime(),
  customerId: z.string().uuid().optional(),
  lines: z.array(OfflineSaleLineSchema).min(1, "At least one sale line required"),
  payments: z.array(OfflineSalePaymentSchema).default([]),
  billDiscountPaise: z.number().int().min(0).default(0),
  compliance: ComplianceDetailsSchema.optional(),
  medicalRepId: z.string().uuid().optional(),
});

export interface OfflineSale {
  clientSaleId: string;
  invoiceNo: string;
  fiscalYear: string;
  sequenceNumber: number;
  reservationId?: string;
  createdBy: string;
  completedAt: string;
  customerId?: string;
  lines: OfflineSaleLine[];
  payments?: OfflineSalePayment[];
  billDiscountPaise?: number;
  compliance?: z.infer<typeof ComplianceDetailsSchema>;
  medicalRepId?: string;
}

export const IngestOfflineSalesRequestSchema = z.object({
  sales: z.array(OfflineSaleSchema).min(1).max(50),
});

export interface IngestOfflineSalesRequest {
  sales: OfflineSale[];
}

export type IngestSaleResult =
  | {
      clientSaleId: string;
      status: "created" | "duplicate";
      saleId: string;
      invoiceNo: string;
      total: number;
    }
  | {
      clientSaleId: string;
      status: "rejected";
      code: string;
      error: string;
    };

export interface IngestOfflineSalesResponse {
  results: IngestSaleResult[];
}

/**
 * Standard error response mapper for device sync HTTP routes.
 */
export function syncErrorResponse(e: unknown): NextResponse {
  if (e instanceof DomainError) {
    const status =
      e.code === "DEVICE_UNAUTHORIZED" || e.code === "DEVICE_REVOKED"
        ? 401
        : e.code === "STORE_INACTIVE" || e.code === "FORBIDDEN"
          ? 403
          : e.code === "NOT_FOUND"
            ? 404
            : 400;
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: e.flatten() },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("[sync] Unexpected error:", e);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
