"use server";

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/server/db";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import { ForbiddenError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { sanitizeBillingTemplateHtml } from "@/server/domain/sales/template-engine";

export async function getBillingTemplatesAction(storeId?: string) {
  const ctx = await requirePermission("settings.manage");
  const targetStoreId = storeId || ctx.storeId;
  if (ctx.allowedStoreIds !== "all" && !ctx.allowedStoreIds.includes(targetStoreId)) {
    throw new ForbiddenError("store.access");
  }

  return db
    .select()
    .from(schema.billingTemplates)
    .where(
      and(
        eq(schema.billingTemplates.tenantId, ctx.tenantId),
        eq(schema.billingTemplates.storeId, targetStoreId),
      ),
    )
    .orderBy(desc(schema.billingTemplates.isActive), desc(schema.billingTemplates.updatedAt));
}

const SaveBillingTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  format: z.enum(["a4", "thermal_80mm"]),
  name: z.string().trim().min(2, "Template name must be at least 2 characters").max(80),
  htmlContent: z.string().trim().min(10, "HTML content cannot be empty").max(200_000),
  sourceType: z.enum(["manual", "ocr"]).default("manual"),
  activate: z.boolean().default(false),
});

export const saveBillingTemplateAction = protectedAction("settings.manage")
  .schema(SaveBillingTemplateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const targetStoreId = parsedInput.storeId || ctx.storeId;
    if (ctx.allowedStoreIds !== "all" && !ctx.allowedStoreIds.includes(targetStoreId)) {
      throw new ForbiddenError("store.access");
    }

    const sanitizedHtml = sanitizeBillingTemplateHtml(parsedInput.htmlContent);
    if (!sanitizedHtml) {
      throw new Error("Template HTML is empty after sanitization.");
    }

    const saved = await db.transaction(async (tx) => {
      if (parsedInput.activate) {
        await tx
          .update(schema.billingTemplates)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(schema.billingTemplates.tenantId, ctx.tenantId),
              eq(schema.billingTemplates.storeId, targetStoreId),
              eq(schema.billingTemplates.format, parsedInput.format),
              eq(schema.billingTemplates.isActive, true),
            ),
          );
      }

      if (parsedInput.id) {
        const [updated] = await tx
          .update(schema.billingTemplates)
          .set({
            name: parsedInput.name,
            htmlContent: sanitizedHtml,
            sourceType: parsedInput.sourceType,
            ...(parsedInput.activate ? { isActive: true } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.billingTemplates.id, parsedInput.id),
              eq(schema.billingTemplates.tenantId, ctx.tenantId),
              eq(schema.billingTemplates.storeId, targetStoreId),
            ),
          )
          .returning();
        if (!updated) throw new Error("Template not found.");
        return updated;
      }

      const [inserted] = await tx
        .insert(schema.billingTemplates)
        .values({
          tenantId: ctx.tenantId,
          storeId: targetStoreId,
          format: parsedInput.format,
          name: parsedInput.name,
          htmlContent: sanitizedHtml,
          isActive: parsedInput.activate,
          sourceType: parsedInput.sourceType,
          createdBy: ctx.userId,
        })
        .returning();
      return inserted;
    });

    await writeAudit(db, { tenantId: ctx.tenantId, storeId: targetStoreId, userId: ctx.userId }, {
      action: parsedInput.id ? "update" : "create",
      entityType: "billing_template",
      entityId: saved.id,
      newValue: { name: saved.name, format: saved.format, isActive: saved.isActive },
    });

    revalidatePath("/dashboard/settings/printers");
    return saved;
  });

const SetActiveTemplateSchema = z.object({
  storeId: z.string().uuid().optional(),
  format: z.enum(["a4", "thermal_80mm"]),
  templateId: z.string().uuid().nullable(),
});

export const setActiveBillingTemplateAction = protectedAction("settings.manage")
  .schema(SetActiveTemplateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const targetStoreId = parsedInput.storeId || ctx.storeId;
    if (ctx.allowedStoreIds !== "all" && !ctx.allowedStoreIds.includes(targetStoreId)) {
      throw new ForbiddenError("store.access");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.billingTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.billingTemplates.tenantId, ctx.tenantId),
            eq(schema.billingTemplates.storeId, targetStoreId),
            eq(schema.billingTemplates.format, parsedInput.format),
            eq(schema.billingTemplates.isActive, true),
          ),
        );

      if (parsedInput.templateId) {
        await tx
          .update(schema.billingTemplates)
          .set({ isActive: true, updatedAt: new Date() })
          .where(
            and(
              eq(schema.billingTemplates.id, parsedInput.templateId),
              eq(schema.billingTemplates.tenantId, ctx.tenantId),
              eq(schema.billingTemplates.storeId, targetStoreId),
            ),
          );
      }
    });

    revalidatePath("/dashboard/settings/printers");
    return { ok: true };
  });

const DeleteTemplateSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid().optional(),
});

export const deleteBillingTemplateAction = protectedAction("settings.manage")
  .schema(DeleteTemplateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const targetStoreId = parsedInput.storeId || ctx.storeId;
    if (ctx.allowedStoreIds !== "all" && !ctx.allowedStoreIds.includes(targetStoreId)) {
      throw new ForbiddenError("store.access");
    }

    await db
      .delete(schema.billingTemplates)
      .where(
        and(
          eq(schema.billingTemplates.id, parsedInput.id),
          eq(schema.billingTemplates.tenantId, ctx.tenantId),
          eq(schema.billingTemplates.storeId, targetStoreId),
        ),
      );

    revalidatePath("/dashboard/settings/printers");
    return { deleted: true };
  });

const SaveStorePrintFormatSchema = z.object({
  storeId: z.string().uuid().optional(),
  printFormat: z.enum(["thermal_80mm", "thermal_58mm", "a4"]),
});

export const saveStorePrintFormatAction = protectedAction("settings.manage")
  .schema(SaveStorePrintFormatSchema)
  .action(async ({ parsedInput, ctx }) => {
    const targetStoreId = parsedInput.storeId || ctx.storeId;
    if (ctx.allowedStoreIds !== "all" && !ctx.allowedStoreIds.includes(targetStoreId)) {
      throw new ForbiddenError("store.access");
    }

    const [store] = await db
      .select({ id: schema.stores.id, settings: schema.stores.settings })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, targetStoreId), eq(schema.stores.tenantId, ctx.tenantId)))
      .limit(1);

    if (!store) throw new Error("Store not found.");

    const updatedSettings = {
      ...store.settings,
      printFormat: parsedInput.printFormat,
    };

    await db
      .update(schema.stores)
      .set({ settings: updatedSettings })
      .where(and(eq(schema.stores.id, targetStoreId), eq(schema.stores.tenantId, ctx.tenantId)));

    revalidatePath("/dashboard/settings/printers");
    return { printFormat: parsedInput.printFormat };
  });

