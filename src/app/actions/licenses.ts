"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getAuthCtx, assertPermission } from "@/server/rbac";
import { writeAudit } from "@/server/audit";
import {
  getStoreLicenseSummary,
  getAllStoreLicenseAlerts,
  getPharmacistRegistrationAlerts,
  type StoreLicenseReport,
  type LicenseAlertItem,
  type PharmacistAlertItem,
} from "@/server/domain/compliance/license-tracker";

const updateStoreLicensesSchema = z.object({
  storeId: z.string().uuid(),
  form20No: z.string().trim().optional().nullable(),
  form20Expiry: z.string().trim().optional().nullable(),
  form21No: z.string().trim().optional().nullable(),
  form21Expiry: z.string().trim().optional().nullable(),
  form20bNo: z.string().trim().optional().nullable(),
  form20bExpiry: z.string().trim().optional().nullable(),
  form21bNo: z.string().trim().optional().nullable(),
  form21bExpiry: z.string().trim().optional().nullable(),
  fssaiNo: z.string().trim().optional().nullable(),
  fssaiExpiry: z.string().trim().optional().nullable(),
  chiefPharmacistId: z.string().uuid().optional().nullable(),
});

export type UpdateStoreLicensesInput = z.infer<typeof updateStoreLicensesSchema>;

const updatePharmacistRegSchema = z.object({
  userId: z.string().uuid(),
  pharmacistRegNo: z.string().trim().optional().nullable(),
  pharmacistRegExpiry: z.string().trim().optional().nullable(),
  pharmacistCouncilState: z.string().trim().optional().nullable(),
});

export type UpdatePharmacistRegInput = z.infer<typeof updatePharmacistRegSchema>;

/**
 * Retrieves statutory license status for all stores or a specific store.
 */
export async function getStoreLicensesAction(
  storeId?: string
): Promise<{ success: boolean; data?: StoreLicenseReport[]; error?: string }> {
  try {
    const ctx = await getAuthCtx();
    assertPermission(ctx, "report.view");

    const reports = await getStoreLicenseSummary(ctx.tenantId, storeId);
    return { success: true, data: reports };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load store licenses",
    };
  }
}

/**
 * Updates statutory licenses for a store (Form 20, 21, 20B, 21B, FSSAI, Chief Pharmacist).
 */
export async function updateStoreLicensesAction(
  rawInput: UpdateStoreLicensesInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthCtx();
    assertPermission(ctx, "store.manage");

    const input = updateStoreLicensesSchema.parse(rawInput);

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.stores)
        .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.tenantId, ctx.tenantId)))
        .limit(1);

      if (!existing) {
        throw new Error("Store not found or unauthorized");
      }

      const updateData = {
        form20No: input.form20No || null,
        form20Expiry: input.form20Expiry || null,
        form21No: input.form21No || null,
        form21Expiry: input.form21Expiry || null,
        form20bNo: input.form20bNo || null,
        form20bExpiry: input.form20bExpiry || null,
        form21bNo: input.form21bNo || null,
        form21bExpiry: input.form21bExpiry || null,
        fssaiNo: input.fssaiNo || null,
        fssaiExpiry: input.fssaiExpiry || null,
        chiefPharmacistId: input.chiefPharmacistId || null,
        // Also sync general drugLicenseNo for legacy fallbacks
        drugLicenseNo: input.form20No || existing.drugLicenseNo,
        drugLicenseExpiry: input.form20Expiry || existing.drugLicenseExpiry,
      };

      await tx
        .update(schema.stores)
        .set(updateData)
        .where(eq(schema.stores.id, input.storeId));

      await writeAudit(tx, ctx, {
        action: "update",
        entityType: "store_licenses",
        entityId: input.storeId,
        oldValue: {
          form20No: existing.form20No,
          form20Expiry: existing.form20Expiry,
          form21No: existing.form21No,
          form21Expiry: existing.form21Expiry,
          fssaiNo: existing.fssaiNo,
          fssaiExpiry: existing.fssaiExpiry,
          chiefPharmacistId: existing.chiefPharmacistId,
        },
        newValue: updateData,
      });
    });

    revalidatePath("/dashboard/compliance/licenses");
    revalidatePath("/dashboard/settings/stores");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update store licenses",
    };
  }
}

/**
 * Updates pharmacist council registration details for a member.
 */
export async function updatePharmacistRegistrationAction(
  rawInput: UpdatePharmacistRegInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthCtx();
    assertPermission(ctx, "settings.manage");

    const input = updatePharmacistRegSchema.parse(rawInput);

    await db
      .update(schema.users)
      .set({
        pharmacistRegNo: input.pharmacistRegNo || null,
        pharmacistRegExpiry: input.pharmacistRegExpiry || null,
        pharmacistCouncilState: input.pharmacistCouncilState || null,
      })
      .where(eq(schema.users.id, input.userId));

    revalidatePath("/dashboard/compliance/licenses");
    revalidatePath("/dashboard/settings/users");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update pharmacist registration",
    };
  }
}

/**
 * Returns active compliance warning alerts across all stores and pharmacists.
 */
export async function getComplianceAlertsAction(): Promise<{
  success: boolean;
  storeAlerts: LicenseAlertItem[];
  pharmacistAlerts: PharmacistAlertItem[];
  error?: string;
}> {
  try {
    const ctx = await getAuthCtx();
    const [storeAlerts, pharmacistAlerts] = await Promise.all([
      getAllStoreLicenseAlerts(ctx.tenantId),
      getPharmacistRegistrationAlerts(ctx.tenantId),
    ]);

    return {
      success: true,
      storeAlerts,
      pharmacistAlerts,
    };
  } catch (error: unknown) {
    return {
      success: false,
      storeAlerts: [],
      pharmacistAlerts: [],
      error: error instanceof Error ? error.message : "Failed to fetch compliance alerts",
    };
  }
}

/**
 * Lists available pharmacist users in the tenant to assign as Chief Pharmacist.
 */
export async function getPharmacistsListAction(): Promise<{
  success: boolean;
  data: { id: string; name: string; email: string; regNo: string | null; councilState: string | null }[];
  error?: string;
}> {
  try {
    const ctx = await getAuthCtx();
    assertPermission(ctx, "store.manage");

    const members = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        regNo: schema.users.pharmacistRegNo,
        councilState: schema.users.pharmacistCouncilState,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(eq(schema.memberships.tenantId, ctx.tenantId));

    return { success: true, data: members };
  } catch (error: unknown) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Failed to fetch pharmacists",
    };
  }
}
