import { z } from "zod";
import type { StockTransfer, StockTransferItem } from "@/server/db/schema";

export const CreateTransferItemSchema = z.object({
  medicineId: z.string().uuid(),
  fromBatchId: z.string().uuid(),
  qty: z.number().int().positive("Quantity must be greater than zero"),
});

export const CreateTransferSchema = z
  .object({
    fromStoreId: z.string().uuid("Invalid source store ID"),
    toStoreId: z.string().uuid("Invalid destination store ID"),
    notes: z.string().max(500).optional().nullable(),
    items: z.array(CreateTransferItemSchema).min(1, "At least one item is required"),
  })
  .refine((data) => data.fromStoreId !== data.toStoreId, {
    message: "Source and destination store cannot be the same",
    path: ["toStoreId"],
  });

export const DispatchTransferItemSchema = z.object({
  itemId: z.string().uuid(),
  qtyDispatched: z.number().int().positive("Dispatched quantity must be positive"),
});

export const DispatchTransferSchema = z.object({
  transferId: z.string().uuid("Invalid transfer ID"),
  transportMode: z.enum(["road", "rail", "air"]).default("road"),
  vehicleNo: z.string().max(32).optional().nullable(),
  transporterName: z.string().max(128).optional().nullable(),
  transporterId: z.string().max(32).optional().nullable(),
  eWayBillNo: z.string().max(64).optional().nullable(),
  items: z.array(DispatchTransferItemSchema).optional(),
  idempotencyKey: z.string().min(1, "Idempotency key required").max(128),
});

export const ReceiveTransferItemSchema = z
  .object({
    itemId: z.string().uuid(),
    qtyReceived: z.number().int().min(0, "Received quantity must be non-negative"),
    qtyDamaged: z.number().int().min(0, "Damaged quantity must be non-negative").default(0),
    qtyShortage: z.number().int().min(0, "Shortage quantity must be non-negative").default(0),
    discrepancyReason: z.string().max(256).optional().nullable(),
  })
  .refine(
    (item) => item.qtyReceived + item.qtyDamaged + item.qtyShortage > 0,
    {
      message: "At least one quantity (received, damaged, or shortage) must be greater than zero",
      path: ["qtyReceived"],
    },
  );

export const ReceiveTransferSchema = z.object({
  transferId: z.string().uuid("Invalid transfer ID"),
  items: z.array(ReceiveTransferItemSchema).min(1, "At least one item must be received"),
  idempotencyKey: z.string().min(1, "Idempotency key required").max(128),
  notes: z.string().max(500).optional().nullable(),
});

export const CancelTransferSchema = z.object({
  transferId: z.string().uuid("Invalid transfer ID"),
  reason: z.string().min(1, "Cancellation reason is required").max(256),
});

export type CreateTransferInput = z.input<typeof CreateTransferSchema>;
export type DispatchTransferInput = z.input<typeof DispatchTransferSchema>;
export type ReceiveTransferInput = z.input<typeof ReceiveTransferSchema>;
export type CancelTransferInput = z.input<typeof CancelTransferSchema>;

export interface TransferWithDetails extends StockTransfer {
  fromStoreName: string;
  toStoreName: string;
  items: (StockTransferItem & {
    medicineName: string;
  })[];
}
