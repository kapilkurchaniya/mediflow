"use server";

import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { getSmsProvider } from "@/server/domain/sms";
import { encryptSecret, maskSecret, isMasked } from "@/server/crypto";

export async function getSmsConfig() {
  const { session } = await requireAuth();

  const [config] = await db
    .select()
    .from(schema.smsConfigs)
    .where(eq(schema.smsConfigs.tenantId, session.tenantId))
    .limit(1);

  if (!config) return null;

  // Never send the real API key to the client — return a masked version.
  return {
    ...config,
    apiKey: maskSecret(config.apiKey),
  };
}

export async function saveSmsConfig(formData: FormData) {
  const { session } = await requireAuth();

  const provider = (formData.get("provider") as string) || "msg91";
  const apiKeyInput = formData.get("apiKey") as string;
  const senderId = formData.get("senderId") as string;
  const isActive = formData.get("isActive") === "on";

  // Masked placeholder means "unchanged" — don't overwrite the stored key.
  const newApiKey =
    apiKeyInput && !isMasked(apiKeyInput)
      ? encryptSecret(apiKeyInput.trim())
      : undefined;

  try {
    // Re-read raw (encrypted) record to preserve the existing key when not changing.
    const [rawExisting] = await db
      .select()
      .from(schema.smsConfigs)
      .where(eq(schema.smsConfigs.tenantId, session.tenantId))
      .limit(1);

    if (rawExisting) {
      await db
        .update(schema.smsConfigs)
        .set({
          provider,
          ...(newApiKey !== undefined ? { apiKey: newApiKey } : {}),
          senderId: senderId?.trim() || null,
          isActive,
        })
        .where(eq(schema.smsConfigs.id, rawExisting.id));
    } else {
      await db.insert(schema.smsConfigs).values({
        tenantId: session.tenantId,
        provider,
        apiKey: newApiKey ?? null,
        senderId: senderId?.trim() || null,
        isActive,
      });
    }

    revalidatePath("/dashboard/settings/sms");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to save SMS config" };
  }
}

export async function sendTestSms(phone: string, message: string) {
  const { session } = await requireAuth();

  if (!phone?.trim()) return { error: "Phone number required" };
  if (!message?.trim()) return { error: "Message content required" };

  try {
    const provider = await getSmsProvider(session.tenantId);
    const res = await provider.sendSms(phone, message);
    return res;
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to dispatch SMS" };
  }
}
