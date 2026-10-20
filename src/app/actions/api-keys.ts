"use server";

import "server-only";
import { db, schema } from "@/server/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { generateRawKey, hashKey } from "@/server/api-auth";
import { z } from "zod";

const createKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(80, "Name too long"),
  scopes: z.array(z.enum(["stock.read", "orders.write", "orders.read"])).min(1, "Select at least one scope"),
  storeId: z.string().uuid().nullable().optional(),
});

/**
 * List all active (non-revoked) API keys for the current tenant.
 * Returns masked data only — no key hashes, no raw keys.
 */
export async function listApiKeys() {
  const { session } = await requireAuth();

  const keys = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      scopes: schema.apiKeys.scopes,
      storeId: schema.apiKeys.storeId,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.tenantId, session.tenantId),
        isNull(schema.apiKeys.revokedAt),
      ),
    );

  return keys;
}

/**
 * Create a new API key.
 * Returns the raw key ONCE — it is not stored and cannot be recovered.
 */
export async function createApiKey(formData: FormData) {
  const { session } = await requireAuth();

  const rawScopes = formData.getAll("scopes") as string[];
  const input = {
    name: formData.get("name") as string,
    scopes: rawScopes,
    storeId: (formData.get("storeId") as string) || null,
  };

  const parsed = createKeySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);

  try {
    const [key] = await db
      .insert(schema.apiKeys)
      .values({
        tenantId: session.tenantId,
        storeId: parsed.data.storeId || null,
        name: parsed.data.name.trim(),
        keyHash,
        scopes: parsed.data.scopes,
      })
      .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name });

    revalidatePath("/dashboard/settings/api-keys");

    // rawKey is returned ONCE — the client must copy it immediately.
    return { success: true, key, rawKey };
  } catch (err: unknown) {
    return { error: { _: [(err instanceof Error ? err.message : "Failed to create API key")] } };
  }
}

/**
 * Revoke (soft-delete) an API key.
 * Validates the key belongs to the current tenant before revoking.
 */
export async function revokeApiKey(keyId: string) {
  const { session } = await requireAuth();

  try {
    const result = await db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.apiKeys.id, keyId),
          eq(schema.apiKeys.tenantId, session.tenantId),
          isNull(schema.apiKeys.revokedAt),
        ),
      )
      .returning({ id: schema.apiKeys.id });

    if (result.length === 0) {
      return { error: "Key not found or already revoked" };
    }

    revalidatePath("/dashboard/settings/api-keys");
    return { success: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to revoke key" };
  }
}
