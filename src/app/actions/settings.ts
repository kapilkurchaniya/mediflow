"use server";

import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { validateInvoicePrefix } from "@/lib/invoice-no";
import { revalidatePath } from "next/cache";

export async function getStoreSettings() {
  const { session, user } = await requireAuth();

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
  const { session } = await requireAuth();

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
    await db
      .update(schema.stores)
      .set({
        name,
        address,
        city,
        stateCode,
        pincode,
        phone,
        gstin,
        drugLicenseNo,
        invoicePrefix,
      })
      .where(eq(schema.stores.id, session.storeId));

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to update store settings.",
    };
  }
}
