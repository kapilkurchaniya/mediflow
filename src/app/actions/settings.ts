"use server";

import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { checkPermission, requirePermission } from "@/server/rbac";
import { validateInvoicePrefix } from "@/lib/invoice-no";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/server/audit";

export async function getStoreSettings() {
  const session = await requirePermission("settings.manage");
  const { user } = await requireAuth(); // for the profile card (phone is not part of AuthCtx)

  let store = null;
  if (session.storeId) {
    const [foundStore] = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, session.storeId))
      .limit(1);
    store = foundStore;
  }

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, session.tenantId))
    .limit(1);

  return {
    user: {
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
    store: store || {
      name: "My Pharmacy",
      code: "MAIN",
      address: "",
      city: "",
      stateCode: "27",
      pincode: "",
      phone: "",
      gstin: "",
      drugLicenseNo: "",
      invoicePrefix: "INV",
    },
    tenant: {
      name: tenant?.name ?? "",
      legalName: tenant?.legalName ?? "",
      plan: tenant?.plan ?? "starter",
    },
  };
}

export async function updateStoreSettings(formData: FormData) {
  const auth = await checkPermission("settings.manage");
  if (!auth.ok) return { error: auth.error };
  const session = auth.ctx;

  if (!session.storeId) {
    return { error: "No store associated with this session." };
  }

  const name = formData.get("name")?.toString().trim();
  const address = formData.get("address")?.toString().trim();
  const city = formData.get("city")?.toString().trim();
  const stateCode = formData.get("stateCode")?.toString().trim() || "27";
  const pincode = formData.get("pincode")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const gstin = formData.get("gstin")?.toString().trim().toUpperCase();
  const drugLicenseNo = formData.get("drugLicenseNo")?.toString().trim();
  const invoicePrefix = formData.get("invoicePrefix")?.toString().trim().toUpperCase() || "INV";

  if (!name) {
    return { error: "Pharmacy name is required." };
  }

  const prefixError = validateInvoicePrefix(invoicePrefix);
  if (prefixError) {
    return { error: prefixError };
  }

  try {
    const next = { name, address, city, stateCode, pincode, phone, gstin, drugLicenseNo, invoicePrefix };
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.stores).where(eq(schema.stores.id, session.storeId));
      await tx.update(schema.stores).set(next).where(eq(schema.stores.id, session.storeId));

      // Audit only the fields that actually changed (old -> new).
      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(next)) {
        const prev = (before as Record<string, unknown> | undefined)?.[k] ?? null;
        if ((prev ?? "") !== (v ?? "")) {
          oldValue[k] = prev;
          newValue[k] = v ?? null;
        }
      }
      if (Object.keys(newValue).length > 0) {
        await writeAudit(tx, session, { action: "update", entityType: "store", entityId: session.storeId, oldValue, newValue });
      }
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to update store settings.",
    };
  }
}
