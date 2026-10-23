"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { WhatsAppService } from "@/server/domain/whatsapp";
import { encryptSecret, maskSecret, isMasked } from "@/server/crypto";

export async function getWhatsAppConfig() {
  const ctx = await requirePermission("settings.manage");

  const [config] = await db
    .select()
    .from(schema.whatsappConfigs)
    .where(eq(schema.whatsappConfigs.tenantId, ctx.tenantId))
    .limit(1);

  if (!config) return null;

  // Never send the real token to the client — return a masked version.
  return {
    ...config,
    accessToken: maskSecret(config.accessToken),
  };
}

export async function saveWhatsAppConfig(formData: FormData) {
  const ctx = await requirePermission("settings.manage");

  const phoneNumberId = formData.get("phoneNumberId") as string;
  const businessAccountId = formData.get("businessAccountId") as string;
  const accessTokenInput = formData.get("accessToken") as string;
  const webhookVerifyToken = formData.get("webhookVerifyToken") as string;
  const isActive = formData.get("isActive") === "on";

  // If the user submits the masked placeholder ("••••XXXX"), they did not
  // change the token — keep whatever is in the DB.
  const newAccessToken =
    accessTokenInput && !isMasked(accessTokenInput)
      ? encryptSecret(accessTokenInput.trim())
      : undefined; // undefined means "don't overwrite"

  try {
    const [rawExisting] = await db
      .select()
      .from(schema.whatsappConfigs)
      .where(eq(schema.whatsappConfigs.tenantId, ctx.tenantId))
      .limit(1);

    if (rawExisting) {
      await db
        .update(schema.whatsappConfigs)
        .set({
          phoneNumberId: phoneNumberId?.trim() || null,
          businessAccountId: businessAccountId?.trim() || null,
          ...(newAccessToken !== undefined ? { accessToken: newAccessToken } : {}),
          webhookVerifyToken: webhookVerifyToken?.trim() || null,
          isActive,
        })
        .where(eq(schema.whatsappConfigs.id, rawExisting.id));
    } else {
      await db.insert(schema.whatsappConfigs).values({
        tenantId: ctx.tenantId,
        phoneNumberId: phoneNumberId?.trim() || null,
        businessAccountId: businessAccountId?.trim() || null,
        accessToken: newAccessToken ?? null,
        webhookVerifyToken: webhookVerifyToken?.trim() || null,
        isActive,
      });
    }

    revalidatePath("/dashboard/settings/whatsapp");
    revalidatePath("/dashboard/whatsapp");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to save WhatsApp config" };
  }
}

export async function getWhatsAppMessages(selectedPhone?: string) {
  const ctx = await requirePermission("customer.view");

  const conditions = [eq(schema.whatsappMessages.tenantId, ctx.tenantId)];

  if (selectedPhone?.trim()) {
    const clean = selectedPhone.replace(/\D/g, "").slice(-10);
    conditions.push(sql`${schema.whatsappMessages.customerPhone} LIKE ${`%${clean}%`}`);
  }

  const messages = await db
    .select({
      id: schema.whatsappMessages.id,
      direction: schema.whatsappMessages.direction,
      customerPhone: schema.whatsappMessages.customerPhone,
      customerId: schema.whatsappMessages.customerId,
      messageBody: schema.whatsappMessages.messageBody,
      messageType: schema.whatsappMessages.messageType,
      status: schema.whatsappMessages.status,
      createdAt: schema.whatsappMessages.createdAt,
      customerName: schema.customers.name,
    })
    .from(schema.whatsappMessages)
    .leftJoin(schema.customers, eq(schema.whatsappMessages.customerId, schema.customers.id))
    .where(and(...conditions))
    .orderBy(desc(schema.whatsappMessages.createdAt))
    .limit(100);

  // Group into conversations
  const conversationsMap = new Map<string, { phone: string; customerName: string | null; lastMessage: string; lastAt: Date; unreadCount: number }>();

  for (const m of messages) {
    const phone = m.customerPhone.slice(-10);
    if (!conversationsMap.has(phone)) {
      conversationsMap.set(phone, {
        phone: m.customerPhone,
        customerName: m.customerName,
        lastMessage: m.messageBody,
        lastAt: m.createdAt,
        unreadCount: m.direction === "inbound" && m.status !== "read" ? 1 : 0,
      });
    }
  }

  return {
    messages,
    conversations: Array.from(conversationsMap.values()),
  };
}

export async function sendManualWhatsAppMessage(phone: string, text: string) {
  const ctx = await requirePermission("customer.manage");

  if (!phone?.trim()) return { error: "Customer phone number is required" };
  if (!text?.trim()) return { error: "Message body cannot be empty" };

  try {
    const result = await WhatsAppService.sendMessage({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      customerPhone: phone.trim(),
      messageBody: text.trim(),
      messageType: "text",
    });

    revalidatePath("/dashboard/whatsapp");
    return result;
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to send message" };
  }
}

export async function getWhatsAppTemplates() {
  const ctx = await requirePermission("settings.manage");

  return db
    .select()
    .from(schema.whatsappTemplates)
    .where(eq(schema.whatsappTemplates.tenantId, ctx.tenantId))
    .orderBy(desc(schema.whatsappTemplates.createdAt));
}

export async function createWhatsAppTemplate(formData: FormData) {
  const ctx = await requirePermission("settings.manage");

  const name = formData.get("name") as string;
  const category = (formData.get("category") as string) || "UTILITY";
  const header = formData.get("header") as string;
  const body = formData.get("body") as string;
  const footer = formData.get("footer") as string;

  if (!name?.trim()) return { error: "Template name is required" };
  if (!body?.trim()) return { error: "Template body text is required" };

  try {
    const [tmpl] = await db
      .insert(schema.whatsappTemplates)
      .values({
        tenantId: ctx.tenantId,
        name: name.trim().toLowerCase().replace(/\s+/g, "_"),
        category,
        languageCode: "en",
        header: header?.trim() || null,
        body: body.trim(),
        footer: footer?.trim() || null,
        status: "approved",
      })
      .returning();

    revalidatePath("/dashboard/whatsapp/templates");
    return { success: true, template: tmpl };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create template" };
  }
}
