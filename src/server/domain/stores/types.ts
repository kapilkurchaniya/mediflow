import { z } from "zod";
import type { StoreKind, StoreSettings } from "@/server/db/schema/platform";
import { DEFAULT_STORE_SETTINGS } from "@/server/db/schema/platform";

export { DEFAULT_STORE_SETTINGS };
export type { StoreKind, StoreSettings };

export const StoreSettingsInputSchema = z.object({
  requireShift: z.boolean().optional(),
  maxDiscountBp: z.number().int().min(0).max(10000).optional().nullable(),
  printFormat: z.enum(["thermal_80mm", "thermal_58mm", "a4"]).optional(),
  defaultPaymentMethod: z.enum(["cash", "upi", "card", "credit"]).optional(),
});

export const StoreSettingsSchema = z.object({
  requireShift: z.boolean().default(false),
  maxDiscountBp: z.number().int().min(0).max(10000).optional(),
  printFormat: z.enum(["thermal_80mm", "thermal_58mm", "a4"]).default("thermal_80mm"),
  defaultPaymentMethod: z.enum(["cash", "upi", "card", "credit"]).default("cash"),
});

export const CreateStoreInputSchema = z.object({
  name: z.string().trim().min(1, "Store name is required").max(100),
  code: z
    .string()
    .trim()
    .min(1, "Store code is required")
    .max(4, "Store code cannot exceed 4 characters")
    .regex(/^[A-Za-z0-9]+$/, "Store code must be alphanumeric")
    .transform((val) => val.toUpperCase()),
  kind: z.enum(["retail", "warehouse"]).default("retail"),
  address: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  stateCode: z.string().trim().regex(/^\d{2}$/, "State code must be 2 digits"),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Pincode must be 6 digits")
    .optional()
    .nullable()
    .or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  gstin: z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .optional()
    .nullable()
    .or(z.literal("")),
  drugLicenseNo: z.string().trim().max(50).optional().nullable().or(z.literal("")),
  drugLicenseExpiry: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry must be in YYYY-MM-DD format")
    .optional()
    .nullable()
    .or(z.literal("")),
  fssaiNo: z.string().trim().max(50).optional().nullable().or(z.literal("")),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, "Invoice prefix is required")
    .transform((val) => val.toUpperCase()),
  settings: StoreSettingsInputSchema.optional(),
});

export type CreateStoreInput = z.input<typeof CreateStoreInputSchema>;

export const UpdateStoreInputSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(4)
    .regex(/^[A-Za-z0-9]+$/)
    .transform((val) => val.toUpperCase())
    .optional(),
  kind: z.enum(["retail", "warehouse"]).optional(),
  address: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  stateCode: z.string().trim().regex(/^\d{2}$/).optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  gstin: z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .optional()
    .nullable()
    .or(z.literal("")),
  drugLicenseNo: z.string().trim().max(50).optional().nullable().or(z.literal("")),
  drugLicenseExpiry: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  fssaiNo: z.string().trim().max(50).optional().nullable().or(z.literal("")),
  invoicePrefix: z
    .string()
    .trim()
    .min(1)
    .transform((val) => val.toUpperCase())
    .optional(),
  settings: StoreSettingsInputSchema.optional(),
});

export type UpdateStoreInput = z.input<typeof UpdateStoreInputSchema>;

export interface StoreListFilter {
  kind?: StoreKind;
  isActive?: boolean;
  search?: string;
}
