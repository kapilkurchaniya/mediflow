"use server";

import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import {
  ConsentService,
  ErasureService,
  type ConsentPurpose,
} from "@/server/domain/privacy";

const DEFAULT_PRIVACY_NOTICE = {
  title: "Pharmacy Patient Privacy Notice",
  noticeText:
    "We collect personal and health data solely to dispense medications, maintain statutory prescription registers under Rule 65 of the Drugs and Cosmetics Rules, 1945, generate tax invoices under the CGST Act, 2017, and communicate prescription refill alerts with your consent. Your data is not sold or shared with third parties for commercial advertising.",
  dpoName: "Grievance Officer / Chief Pharmacist",
  dpoContact: "support@pharmacy.com",
  retentionPolicySummary:
    "Tax invoices are retained for 72 months per Section 36 of the CGST Act. Prescription logs and Schedule H registers are preserved for 3 years under Rule 65 of the Drugs and Cosmetics Rules, 1945.",
};

export async function getCustomerPrivacyDetailsAction(customerId: string) {
  const ctx = await requirePermission("customer.view");

  const [customer] = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      phone: schema.customers.phone,
      email: schema.customers.email,
      address: schema.customers.address,
      isActive: schema.customers.isActive,
      notes: schema.customers.notes,
      createdAt: schema.customers.createdAt,
    })
    .from(schema.customers)
    .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, ctx.tenantId)))
    .limit(1);

  if (!customer) {
    return { error: "Customer not found" };
  }

  const consents = await ConsentService.getCustomerConsents(ctx.tenantId, customerId);

  return {
    customer,
    consents,
  };
}

export async function updateCustomerConsentAction(
  customerId: string,
  purpose: ConsentPurpose,
  granted: boolean,
  notes?: string
) {
  const ctx = await requirePermission("customer.manage");

  try {
    await ConsentService.captureConsent({
      tenantId: ctx.tenantId,
      customerId,
      purpose,
      granted,
      source: "privacy_portal",
      capturedBy: ctx.userId,
      notes: notes || `Updated via Privacy Console by staff user`,
    });

    revalidatePath(`/dashboard/customers/${customerId}/privacy`);
    return { success: true };
  } catch (err: unknown) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) || "Failed to update customer consent",
    };
  }
}

export async function exportCustomerDataAction(customerId: string) {
  const ctx = await requirePermission("customer.view");

  try {
    const data = await ErasureService.exportCustomerData(ctx.tenantId, customerId);
    return { success: true, data };
  } catch (err: unknown) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) || "Failed to export customer data",
    };
  }
}

export async function anonymiseCustomerAction(
  customerId: string,
  confirmationText: string,
  reason?: string
) {
  const ctx = await requirePermission("customer.manage");

  if (confirmationText !== "CONFIRM ERASURE") {
    return { error: "Confirmation text must match 'CONFIRM ERASURE' exactly." };
  }

  try {
    const res = await ErasureService.anonymiseCustomer({
      tenantId: ctx.tenantId,
      customerId,
      actorUserId: ctx.userId,
      reason,
    });

    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${customerId}/privacy`);
    return res;
  } catch (err: unknown) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) || "Failed to anonymise customer data",
    };
  }
}

export async function getPrivacyNoticeAction() {
  const ctx = await requirePermission("settings.manage");

  const [notice] = await db
    .select()
    .from(schema.privacyNotices)
    .where(and(eq(schema.privacyNotices.tenantId, ctx.tenantId), eq(schema.privacyNotices.isActive, true)))
    .limit(1);

  if (!notice) {
    return {
      id: null,
      ...DEFAULT_PRIVACY_NOTICE,
    };
  }

  return notice;
}

export async function savePrivacyNoticeAction(formData: FormData) {
  const ctx = await requirePermission("settings.manage");

  const title = (formData.get("title") as string)?.trim() || DEFAULT_PRIVACY_NOTICE.title;
  const noticeText = (formData.get("noticeText") as string)?.trim();
  const dpoName = (formData.get("dpoName") as string)?.trim() || null;
  const dpoContact = (formData.get("dpoContact") as string)?.trim() || null;
  const retentionPolicySummary =
    (formData.get("retentionPolicySummary") as string)?.trim() ||
    DEFAULT_PRIVACY_NOTICE.retentionPolicySummary;

  if (!noticeText) {
    return { error: "Privacy notice content is required." };
  }

  try {
    const [existing] = await db
      .select()
      .from(schema.privacyNotices)
      .where(eq(schema.privacyNotices.tenantId, ctx.tenantId))
      .limit(1);

    if (existing) {
      await db
        .update(schema.privacyNotices)
        .set({
          title,
          noticeText,
          dpoName,
          dpoContact,
          retentionPolicySummary,
          version: existing.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.privacyNotices.id, existing.id));
    } else {
      await db.insert(schema.privacyNotices).values({
        tenantId: ctx.tenantId,
        title,
        noticeText,
        dpoName,
        dpoContact,
        retentionPolicySummary,
      });
    }

    revalidatePath("/dashboard/settings/privacy");
    return { success: true };
  } catch (err: unknown) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) || "Failed to save privacy notice",
    };
  }
}

