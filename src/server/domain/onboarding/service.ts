import { eq, sql, and } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { schema } from "@/server/db";
import { GST_STATE_CODES } from "@/lib/regulatory";
import {
  type BusinessDetailsInput,
  type StoreProfileInput,
  type OnboardingStatus,
  deriveStateFromGstin,
  validateInvoicePrefix,
} from "./types";
import { ESSENTIAL_STARTER_MEDICINES } from "./starter-catalog";

export async function getOnboardingStatus(
  db: DbOrTx,
  tenantId: string,
  storeId?: string,
): Promise<OnboardingStatus> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new Error("Tenant not found");

  const [store] = storeId
    ? await db.select().from(schema.stores).where(eq(schema.stores.id, storeId)).limit(1)
    : await db.select().from(schema.stores).where(eq(schema.stores.tenantId, tenantId)).limit(1);

  const [medCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.medicines)
    .where(eq(schema.medicines.tenantId, tenantId));

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.memberships)
    .where(eq(schema.memberships.tenantId, tenantId));

  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  const completed = Boolean(settings.onboardingCompleted);
  const currentStep = typeof settings.onboardingStep === "number" ? settings.onboardingStep : 1;
  const taxScheme = (settings.taxScheme as "regular" | "composition") ?? "regular";

  const stateCode = tenant.stateCode || (store ? store.stateCode : null);
  const stateName = stateCode ? GST_STATE_CODES[stateCode] ?? null : null;

  return {
    completed,
    currentStep,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      legalName: tenant.legalName,
      gstin: tenant.gstin,
      stateCode,
      stateName,
      taxScheme,
    },
    store: store
      ? {
          id: store.id,
          name: store.name,
          kind: store.kind,
          invoicePrefix: store.invoicePrefix,
          form20No: store.form20No,
          form21No: store.form21No,
          form20bNo: store.form20bNo,
          form21bNo: store.form21bNo,
          fssaiNo: store.fssaiNo,
        }
      : null,
    inventoryCount: medCount?.count ?? 0,
    staffCount: memberCount?.count ?? 0,
  };
}

export async function saveBusinessDetails(
  db: DbOrTx,
  tenantId: string,
  storeId: string | undefined,
  input: BusinessDetailsInput,
): Promise<{ success: boolean; stateCode: string; stateName: string }> {
  let effectiveStateCode = input.stateCode?.trim() || "";

  if (input.gstin && input.gstin.trim()) {
    const derived = deriveStateFromGstin(input.gstin);
    if (derived.stateCode) {
      effectiveStateCode = derived.stateCode;
    }
  }

  if (!effectiveStateCode || !GST_STATE_CODES[effectiveStateCode]) {
    throw new Error("Invalid or unselected Indian state code");
  }

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  const existingSettings = (tenant?.settings ?? {}) as Record<string, unknown>;

  await db
    .update(schema.tenants)
    .set({
      legalName: input.legalName.trim(),
      gstin: input.gstin?.trim().toUpperCase() || null,
      stateCode: effectiveStateCode,
      settings: {
        ...existingSettings,
        taxScheme: input.taxScheme,
        pan: input.pan?.trim().toUpperCase() || null,
        onboardingStep: Math.max((existingSettings.onboardingStep as number) || 1, 2),
      },
    })
    .where(eq(schema.tenants.id, tenantId));

  // Propagate stateCode and GSTIN to primary store if it had the default "00"
  if (storeId) {
    await db
      .update(schema.stores)
      .set({
        stateCode: effectiveStateCode,
        gstin: input.gstin?.trim().toUpperCase() || null,
      })
      .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, tenantId)));
  }

  return {
    success: true,
    stateCode: effectiveStateCode,
    stateName: GST_STATE_CODES[effectiveStateCode] || "Selected State",
  };
}

export async function saveStoreProfile(
  db: DbOrTx,
  tenantId: string,
  storeId: string,
  input: StoreProfileInput,
): Promise<{ success: boolean }> {
  const prefixValidation = validateInvoicePrefix(input.invoicePrefix);
  if (!prefixValidation.valid) {
    throw new Error(prefixValidation.error ?? "Invalid invoice prefix");
  }

  await db
    .update(schema.stores)
    .set({
      name: input.name.trim(),
      kind: input.kind,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      pincode: input.pincode?.trim() || null,
      phone: input.phone?.trim() || null,
      form20No: input.form20No?.trim() || null,
      form20Expiry: input.form20Expiry || null,
      form21No: input.form21No?.trim() || null,
      form21Expiry: input.form21Expiry || null,
      form20bNo: input.form20bNo?.trim() || null,
      form20bExpiry: input.form20bExpiry || null,
      form21bNo: input.form21bNo?.trim() || null,
      form21bExpiry: input.form21bExpiry || null,
      fssaiNo: input.fssaiNo?.trim() || null,
      fssaiExpiry: input.fssaiExpiry || null,
      invoicePrefix: input.invoicePrefix.trim().toUpperCase(),
    })
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, tenantId)));

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  const existingSettings = (tenant?.settings ?? {}) as Record<string, unknown>;
  await db
    .update(schema.tenants)
    .set({
      settings: {
        ...existingSettings,
        onboardingStep: Math.max((existingSettings.onboardingStep as number) || 1, 3),
      },
    })
    .where(eq(schema.tenants.id, tenantId));

  return { success: true };
}

export async function bootstrapStarterCatalogue(
  db: DbOrTx,
  tenantId: string,
  storeId: string,
): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const item of ESSENTIAL_STARTER_MEDICINES) {
    // Check or insert manufacturer
    let [mfr] = await db
      .select({ id: schema.manufacturers.id })
      .from(schema.manufacturers)
      .where(
        and(
          eq(schema.manufacturers.tenantId, tenantId),
          sql`lower(${schema.manufacturers.name}) = ${item.manufacturer.toLowerCase().trim()}`,
        ),
      )
      .limit(1);

    if (!mfr) {
      const [newMfr] = await db
        .insert(schema.manufacturers)
        .values({
          tenantId,
          name: item.manufacturer,
        })
        .returning({ id: schema.manufacturers.id });
      mfr = newMfr;
    }

    // Insert medicine
    const [med] = await db
      .insert(schema.medicines)
      .values({
        tenantId,
        name: item.name,
        genericName: item.genericName,
        manufacturerId: mfr.id,
        hsn: item.hsnCode,
        gstRateBp: item.gstRateBp,
        schedule: item.schedule,
        rxRequired: item.schedule === "H" || item.schedule === "H1" || item.schedule === "X",
        mrp: item.mrpPaise,
        purchasePrice: item.purchasePricePaise,
        unit: item.unit,
        unitsPerPack: item.packSize,
      })
      .returning({ id: schema.medicines.id });

    // Seed an initial demo batch (10 packs) with 18 months expiry
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 18);
    const expiryStr = expiry.toISOString().split("T")[0];

    await db.insert(schema.batches).values({
      tenantId,
      storeId,
      medicineId: med.id,
      batchNo: `DEMO-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: expiryStr,
      mrp: item.mrpPaise,
      purchaseRate: item.purchasePricePaise,
      saleRate: item.mrpPaise,
      qtyOnHand: 10,
    });

    count++;
  }

  return { insertedCount: count };
}

export async function completeOnboarding(
  db: DbOrTx,
  tenantId: string,
): Promise<{ success: boolean }> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  const existingSettings = (tenant?.settings ?? {}) as Record<string, unknown>;

  await db
    .update(schema.tenants)
    .set({
      settings: {
        ...existingSettings,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date().toISOString(),
        onboardingStep: 5,
      },
    })
    .where(eq(schema.tenants.id, tenantId));

  return { success: true };
}
