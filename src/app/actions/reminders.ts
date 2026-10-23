"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { RemindersService } from "@/server/domain/reminders";

export async function getReminders(statusFilter?: string) {
  const ctx = await requirePermission("customer.view");

  const conditions = [eq(schema.reminders.tenantId, ctx.tenantId)];

  if (statusFilter && statusFilter !== "all") {
    conditions.push(eq(schema.reminders.status, statusFilter));
  }

  const list = await db
    .select({
      id: schema.reminders.id,
      customerName: schema.reminders.customerName,
      customerPhone: schema.reminders.customerPhone,
      type: schema.reminders.type,
      scheduledDate: schema.reminders.scheduledDate,
      message: schema.reminders.message,
      channel: schema.reminders.channel,
      status: schema.reminders.status,
      sentAt: schema.reminders.sentAt,
      createdAt: schema.reminders.createdAt,
      medicineName: schema.medicines.name,
    })
    .from(schema.reminders)
    .leftJoin(schema.medicines, eq(schema.reminders.medicineId, schema.medicines.id))
    .where(and(...conditions))
    .orderBy(desc(schema.reminders.scheduledDate))
    .limit(100);

  return list;
}

export async function triggerDueRemindersBatch() {
  const ctx = await requirePermission("customer.manage");

  try {
    const results = await RemindersService.processDueReminders(ctx.tenantId, ctx.storeId);
    revalidatePath("/dashboard/reminders");
    return { success: true, ...results };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to process due reminders" };
  }
}

export async function createManualReminder(formData: FormData) {
  const ctx = await requirePermission("customer.manage");

  const customerName = formData.get("customerName") as string;
  const customerPhone = formData.get("customerPhone") as string;
  const type = (formData.get("type") as string) || "custom";
  const medicineId = formData.get("medicineId") as string;
  const scheduledDate = formData.get("scheduledDate") as string;
  const channel = (formData.get("channel") as string) || "both";
  const message = formData.get("message") as string;

  if (!customerPhone?.trim()) return { error: "Customer phone number is required" };
  if (!scheduledDate) return { error: "Scheduled date is required" };
  if (!message?.trim()) return { error: "Message content is required" };

  try {
    const [reminder] = await db
      .insert(schema.reminders)
      .values({
        tenantId: ctx.tenantId,
        storeId: ctx.storeId || null,
        customerName: customerName?.trim() || "Customer",
        customerPhone: customerPhone.trim(),
        type,
        medicineId: medicineId?.trim() || null,
        scheduledDate,
        channel,
        message: message.trim(),
        status: "pending",
      })
      .returning();

    revalidatePath("/dashboard/reminders");
    return { success: true, reminder };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create reminder" };
  }
}

export async function cancelReminder(id: string) {
  const ctx = await requirePermission("customer.manage");

  try {
    await db
      .update(schema.reminders)
      .set({ status: "cancelled" })
      .where(and(eq(schema.reminders.id, id), eq(schema.reminders.tenantId, ctx.tenantId)));

    revalidatePath("/dashboard/reminders");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to cancel reminder" };
  }
}
