"use server";

import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import {
  validateSenderId,
  extractDltVariables,
  DltService,
} from "@/server/domain/sms";

export interface SmsTemplateRecord {
  id: string;
  tenantId: string;
  name: string;
  senderId: string;
  dltTemplateId: string;
  entityId: string | null;
  category: string;
  body: string;
  variables: string[];
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_TEMPLATES = [
  {
    name: "invoice_receipt",
    senderId: "MEDFLW",
    dltTemplateId: "",
    entityId: "",
    category: "service_implicit",
    body: "Dear {#var#}, thank you for shopping at {#var#}. Tax invoice #{#var#} for Rs {#var#} is ready. View bill: {#var#}. MediFlow",
    variables: ["customerName", "pharmacyName", "invoiceNo", "amount", "receiptUrl"],
    description: "Tax invoice receipt notification with public web link",
    isActive: true,
  },
  {
    name: "refill_reminder",
    senderId: "MEDFLW",
    dltTemplateId: "",
    entityId: "",
    category: "service_implicit",
    body: "Dear {#var#}, reminder from {#var#}: your medication {#var#} is due for refill on {#var#}. Reply or call counter to reserve. MediFlow",
    variables: ["customerName", "pharmacyName", "medicineName", "refillDate"],
    description: "Patient chronic prescription refill reminder",
    isActive: true,
  },
  {
    name: "payment_reminder",
    senderId: "MEDFLW",
    dltTemplateId: "",
    entityId: "",
    category: "service_implicit",
    body: "Dear {#var#}, reminder from {#var#}: outstanding ledger balance is Rs {#var#}. Clear dues via UPI or at pharmacy. MediFlow",
    variables: ["customerName", "pharmacyName", "balanceAmount"],
    description: "Outstanding credit ledger payment reminder",
    isActive: true,
  },
];

export async function getSmsTemplatesAction(): Promise<SmsTemplateRecord[]> {
  const ctx = await requirePermission("settings.manage");

  let templates = await db
    .select()
    .from(schema.smsTemplates)
    .where(eq(schema.smsTemplates.tenantId, ctx.tenantId));

  // If no templates exist yet, seed default templates for this tenant
  if (templates.length === 0) {
    try {
      await db.insert(schema.smsTemplates).values(
        DEFAULT_TEMPLATES.map((tmpl) => ({
          tenantId: ctx.tenantId,
          ...tmpl,
        }))
      );
      templates = await db
        .select()
        .from(schema.smsTemplates)
        .where(eq(schema.smsTemplates.tenantId, ctx.tenantId));
    } catch {
      // Ignore duplicate seeding race condition
    }
  }

  return templates as SmsTemplateRecord[];
}

export async function saveSmsTemplateAction(formData: FormData) {
  const ctx = await requirePermission("settings.manage");

  const id = (formData.get("id") as string)?.trim() || null;
  const name = (formData.get("name") as string)?.trim();
  const senderId = (formData.get("senderId") as string)?.trim().toUpperCase();
  const dltTemplateId = (formData.get("dltTemplateId") as string)?.trim();
  const entityId = (formData.get("entityId") as string)?.trim() || null;
  const category = (formData.get("category") as string)?.trim() || "service_implicit";
  const body = (formData.get("body") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";

  if (!name) {
    return { error: "Template name is required" };
  }
  if (!body) {
    return { error: "Message body is required" };
  }
  if (!dltTemplateId) {
    return { error: "Approved DLT Content Template ID is required" };
  }

  const senderValidation = validateSenderId(senderId);
  if (!senderValidation.valid) {
    return { error: senderValidation.error || "Invalid Sender ID" };
  }

  const variables = extractDltVariables(body);

  try {
    if (id) {
      await db
        .update(schema.smsTemplates)
        .set({
          name,
          senderId,
          dltTemplateId,
          entityId,
          category,
          body,
          variables,
          description,
          isActive,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.smsTemplates.id, id),
            eq(schema.smsTemplates.tenantId, ctx.tenantId)
          )
        );
    } else {
      await db.insert(schema.smsTemplates).values({
        tenantId: ctx.tenantId,
        name,
        senderId,
        dltTemplateId,
        entityId,
        category,
        body,
        variables,
        description,
        isActive,
      });
    }

    revalidatePath("/dashboard/settings/sms");
    return { success: true };
  } catch (err: unknown) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) ||
        "Failed to save DLT SMS template",
    };
  }
}

export async function toggleSmsTemplateAction(templateId: string, isActive: boolean) {
  const ctx = await requirePermission("settings.manage");

  try {
    await db
      .update(schema.smsTemplates)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.smsTemplates.id, templateId),
          eq(schema.smsTemplates.tenantId, ctx.tenantId)
        )
      );

    revalidatePath("/dashboard/settings/sms");
    return { success: true };
  } catch (err: unknown) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) ||
        "Failed to toggle DLT template status",
    };
  }
}

export async function deleteSmsTemplateAction(templateId: string) {
  const ctx = await requirePermission("settings.manage");

  try {
    await db
      .delete(schema.smsTemplates)
      .where(
        and(
          eq(schema.smsTemplates.id, templateId),
          eq(schema.smsTemplates.tenantId, ctx.tenantId)
        )
      );

    revalidatePath("/dashboard/settings/sms");
    return { success: true };
  } catch (err: unknown) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) ||
        "Failed to delete DLT template",
    };
  }
}

export async function testDltSmsDispatchAction(
  templateName: string,
  phone: string,
  variables: Record<string, string> | string[]
) {
  const ctx = await requirePermission("customer.manage");

  if (!phone?.trim()) return { error: "Phone number is required" };
  if (!templateName?.trim()) return { error: "Template name is required" };

  try {
    const res = await DltService.sendTemplateSms({
      tenantId: ctx.tenantId,
      to: phone,
      templateName,
      variables,
    });
    return res;
  } catch (err: unknown) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) ||
        "Failed to dispatch DLT template test SMS",
    };
  }
}
