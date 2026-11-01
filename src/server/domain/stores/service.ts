import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { schema, type DbOrTx, type Tx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { isValidGstin } from "@/server/domain/gst";
import type { AuthCtx } from "@/server/rbac";
import { validateInvoiceSeriesConfig } from "./policies";
import {
  CreateStoreInputSchema,
  DEFAULT_STORE_SETTINGS,
  StoreSettingsSchema,
  UpdateStoreInputSchema,
  type CreateStoreInput,
  type StoreListFilter,
  type UpdateStoreInput,
} from "./types";

export type StoreActorCtx = Pick<AuthCtx, "tenantId" | "userId"> & { storeId?: string };

/**
 * Creates a new store or warehouse branch for the tenant.
 * Validates store code uniqueness, GSTIN state consistency, and statutory invoice formatting.
 */
export async function createStore(tx: DbOrTx, ctx: StoreActorCtx, rawInput: CreateStoreInput) {
  const input = CreateStoreInputSchema.parse(rawInput);

  // 1. Validate Statutory Invoice Series (CGST Rule 46(b) - max 16 chars)
  const invoiceVal = validateInvoiceSeriesConfig({ prefix: input.invoicePrefix });
  if (!invoiceVal.valid) {
    throw new DomainError("INVALID_INVOICE_PREFIX", invoiceVal.error ?? "Invalid invoice prefix.");
  }

  // 2. Validate GSTIN (if provided) and state consistency
  if (input.gstin && input.gstin.trim().length > 0) {
    const cleanGstin = input.gstin.trim().toUpperCase();
    if (!isValidGstin(cleanGstin)) {
      throw new DomainError("INVALID_GSTIN", "Provided GSTIN is not valid.");
    }
    const gstinState = cleanGstin.slice(0, 2);
    if (gstinState !== input.stateCode) {
      throw new DomainError(
        "GSTIN_STATE_MISMATCH",
        `GSTIN state code (${gstinState}) does not match the store state code (${input.stateCode}).`,
      );
    }
  }

  // 3. Unique store code per tenant (case-insensitive)
  const existingCode = await tx
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.tenantId, ctx.tenantId),
        sql`lower(${schema.stores.code}) = lower(${input.code})`,
      ),
    )
    .limit(1);

  if (existingCode.length > 0) {
    throw new DomainError("DUPLICATE_STORE_CODE", `A store with code "${input.code}" already exists in this pharmacy.`);
  }

  // 4. Merge settings with default baseline
  const mergedSettings = StoreSettingsSchema.parse({
    ...DEFAULT_STORE_SETTINGS,
    ...(input.settings ?? {}),
  });

  const [newStore] = await tx
    .insert(schema.stores)
    .values({
      tenantId: ctx.tenantId,
      name: input.name,
      code: input.code,
      kind: input.kind,
      address: input.address ?? null,
      city: input.city ?? null,
      stateCode: input.stateCode,
      pincode: input.pincode ?? null,
      phone: input.phone ?? null,
      gstin: input.gstin?.trim().toUpperCase() || null,
      drugLicenseNo: input.drugLicenseNo ?? null,
      drugLicenseExpiry: input.drugLicenseExpiry ? input.drugLicenseExpiry : null,
      fssaiNo: input.fssaiNo ?? null,
      invoicePrefix: input.invoicePrefix,
      isActive: true,
      settings: mergedSettings,
    })
    .returning();

  // 5. Append audit log
  await writeAudit(tx, { tenantId: ctx.tenantId, storeId: newStore.id, userId: ctx.userId }, {
    action: "create",
    entityType: "store",
    entityId: newStore.id,
    newValue: newStore,
    reason: `Created ${newStore.kind} store "${newStore.name}" (${newStore.code})`,
  });

  return newStore;
}

/**
 * Updates an existing store.
 * Enforces immutability:
 * - Code cannot be changed once transactions exist.
 * - Kind cannot be changed once sales or batch inventory exist.
 * Settings updates perform a validated partial merge.
 */
export async function updateStore(
  tx: DbOrTx,
  ctx: StoreActorCtx,
  storeId: string,
  rawInput: UpdateStoreInput,
) {
  const input = UpdateStoreInputSchema.parse(rawInput);

  const [existing] = await tx
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, ctx.tenantId)))
    .limit(1);

  if (!existing) {
    throw new DomainError("STORE_NOT_FOUND", "Store not found.");
  }

  // 1. Code immutability & uniqueness check
  if (input.code && input.code !== existing.code) {
    const [hasSales] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.storeId, storeId)).limit(1);
    const [hasPurchases] = await tx.select({ id: schema.purchases.id }).from(schema.purchases).where(eq(schema.purchases.storeId, storeId)).limit(1);
    const [hasMovements] = await tx.select({ id: schema.stockMovements.id }).from(schema.stockMovements).where(eq(schema.stockMovements.storeId, storeId)).limit(1);

    if (hasSales || hasPurchases || hasMovements) {
      throw new DomainError("STORE_CODE_IMMUTABLE", "Store code cannot be changed after transactions have been recorded.");
    }

    const duplicateCode = await tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.tenantId, ctx.tenantId),
          sql`lower(${schema.stores.code}) = lower(${input.code})`,
          sql`${schema.stores.id} != ${storeId}`,
        ),
      )
      .limit(1);

    if (duplicateCode.length > 0) {
      throw new DomainError("DUPLICATE_STORE_CODE", `A store with code "${input.code}" already exists in this pharmacy.`);
    }
  }

  // 2. Kind immutability check
  if (input.kind && input.kind !== existing.kind) {
    const [hasSales] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.storeId, storeId)).limit(1);
    const [hasBatches] = await tx.select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.storeId, storeId)).limit(1);

    if (hasSales || hasBatches) {
      throw new DomainError("STORE_KIND_IMMUTABLE", "Store kind cannot be changed after transactions or batch inventory exist.");
    }
  }

  // 3. Invoice series validation if changed
  if (input.invoicePrefix && input.invoicePrefix !== existing.invoicePrefix) {
    const invoiceVal = validateInvoiceSeriesConfig({ prefix: input.invoicePrefix });
    if (!invoiceVal.valid) {
      throw new DomainError("INVALID_INVOICE_PREFIX", invoiceVal.error ?? "Invalid invoice prefix.");
    }
  }

  // 4. GSTIN validation if updated
  const targetStateCode = input.stateCode ?? existing.stateCode;
  const targetGstin = input.gstin !== undefined ? (input.gstin?.trim().toUpperCase() || null) : existing.gstin;

  if (targetGstin) {
    if (!isValidGstin(targetGstin)) {
      throw new DomainError("INVALID_GSTIN", "Provided GSTIN is not valid.");
    }
    const gstinState = targetGstin.slice(0, 2);
    if (gstinState !== targetStateCode) {
      throw new DomainError(
        "GSTIN_STATE_MISMATCH",
        `GSTIN state code (${gstinState}) does not match the store state code (${targetStateCode}).`,
      );
    }
  }

  // 5. Settings merge
  const mergedSettings = input.settings
    ? StoreSettingsSchema.parse({
        ...existing.settings,
        ...input.settings,
      })
    : existing.settings;

  const [updated] = await tx
    .update(schema.stores)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.code ? { code: input.code } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.address !== undefined ? { address: input.address ?? null } : {}),
      ...(input.city !== undefined ? { city: input.city ?? null } : {}),
      ...(input.stateCode ? { stateCode: input.stateCode } : {}),
      ...(input.pincode !== undefined ? { pincode: input.pincode ?? null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.gstin !== undefined ? { gstin: targetGstin } : {}),
      ...(input.drugLicenseNo !== undefined ? { drugLicenseNo: input.drugLicenseNo ?? null } : {}),
      ...(input.drugLicenseExpiry !== undefined ? { drugLicenseExpiry: input.drugLicenseExpiry ? input.drugLicenseExpiry : null } : {}),
      ...(input.fssaiNo !== undefined ? { fssaiNo: input.fssaiNo ?? null } : {}),
      ...(input.invoicePrefix ? { invoicePrefix: input.invoicePrefix } : {}),
      settings: mergedSettings,
    })
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, ctx.tenantId)))
    .returning();

  await writeAudit(tx, { tenantId: ctx.tenantId, storeId, userId: ctx.userId }, {
    action: "update",
    entityType: "store",
    entityId: storeId,
    oldValue: existing,
    newValue: updated,
    reason: `Updated store configuration for "${updated.name}"`,
  });

  return updated;
}

/**
 * Safely deactivates a store inside a transaction with row locking.
 * Safeguards:
 * - Tenant must retain at least one active store.
 * - Rejects if an open cash register shift exists.
 * - Rejects if active held bills exist.
 * - Rejects if in-transit stock transfers exist.
 */
export async function deactivateStore(tx: DbOrTx, ctx: StoreActorCtx, storeId: string) {
  // Row-level lock to prevent concurrent shift opening or billing
  const [store] = await tx
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, ctx.tenantId)))
    .for("update");

  if (!store) {
    throw new DomainError("STORE_NOT_FOUND", "Store not found.");
  }

  if (!store.isActive) {
    return store;
  }

  // 1. Tenant must have at least one active store
  const [{ activeCount }] = await tx
    .select({ activeCount: count() })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.isActive, true)));

  if (Number(activeCount) <= 1) {
    throw new DomainError("LAST_ACTIVE_STORE", "Cannot deactivate the only active store in this pharmacy.");
  }

  // 2. Reject if open cash register shift exists
  const [openShift] = await tx
    .select({ id: schema.cashSessions.id })
    .from(schema.cashSessions)
    .where(and(eq(schema.cashSessions.storeId, storeId), eq(schema.cashSessions.status, "open")))
    .limit(1);

  if (openShift) {
    throw new DomainError(
      "OPEN_SHIFT_EXISTS",
      "Cannot deactivate store while an open cash register shift exists. Please close the shift first.",
    );
  }

  // 3. Reject if held bills exist
  const [heldBill] = await tx
    .select({ id: schema.sales.id })
    .from(schema.sales)
    .where(and(eq(schema.sales.storeId, storeId), eq(schema.sales.status, "held")))
    .limit(1);

  if (heldBill) {
    throw new DomainError(
      "HELD_BILLS_EXIST",
      "Cannot deactivate store with active held bills. Please complete or discard pending bills.",
    );
  }

  // 4. Reject if in-transit transfers exist
  const [inTransitTransfer] = await tx
    .select({ id: schema.stockTransfers.id })
    .from(schema.stockTransfers)
    .where(
      and(
        or(eq(schema.stockTransfers.fromStoreId, storeId), eq(schema.stockTransfers.toStoreId, storeId)),
        eq(schema.stockTransfers.status, "dispatched"),
      ),
    )
    .limit(1);

  if (inTransitTransfer) {
    throw new DomainError(
      "IN_TRANSIT_TRANSFERS_EXIST",
      "Cannot deactivate store with in-transit stock transfers.",
    );
  }

  // Deactivate store
  const [deactivated] = await tx
    .update(schema.stores)
    .set({ isActive: false })
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, ctx.tenantId)))
    .returning();

  await writeAudit(tx, { tenantId: ctx.tenantId, storeId, userId: ctx.userId }, {
    action: "update",
    entityType: "store",
    entityId: storeId,
    oldValue: { isActive: true },
    newValue: { isActive: false },
    reason: `Deactivated store "${deactivated.name}"`,
  });

  return deactivated;
}

/**
 * Reactivates a previously deactivated store.
 */
export async function reactivateStore(tx: DbOrTx, ctx: StoreActorCtx, storeId: string) {
  const [existing] = await tx
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, ctx.tenantId)))
    .limit(1);

  if (!existing) {
    throw new DomainError("STORE_NOT_FOUND", "Store not found.");
  }

  if (existing.isActive) {
    return existing;
  }

  const [reactivated] = await tx
    .update(schema.stores)
    .set({ isActive: true })
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, ctx.tenantId)))
    .returning();

  await writeAudit(tx, { tenantId: ctx.tenantId, storeId, userId: ctx.userId }, {
    action: "update",
    entityType: "store",
    entityId: storeId,
    oldValue: { isActive: false },
    newValue: { isActive: true },
    reason: `Reactivated store "${reactivated.name}"`,
  });

  return reactivated;
}

/**
 * Lists all stores for a tenant, with optional filters.
 */
export async function listStores(db: DbOrTx, tenantId: string, filter?: StoreListFilter) {
  const conditions = [eq(schema.stores.tenantId, tenantId)];

  if (filter?.kind) {
    conditions.push(eq(schema.stores.kind, filter.kind));
  }
  if (filter?.isActive !== undefined) {
    conditions.push(eq(schema.stores.isActive, filter.isActive));
  }
  if (filter?.search && filter.search.trim().length > 0) {
    const term = `%${filter.search.trim()}%`;
    conditions.push(or(ilike(schema.stores.name, term), ilike(schema.stores.code, term))!);
  }

  return db
    .select()
    .from(schema.stores)
    .where(and(...conditions))
    .orderBy(asc(schema.stores.createdAt));
}

/**
 * Retrieves a single store by ID scoped to the tenant.
 */
export async function getStore(db: DbOrTx, tenantId: string, storeId: string) {
  const [store] = await db
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, tenantId)))
    .limit(1);

  if (!store) {
    throw new DomainError("STORE_NOT_FOUND", "Store not found.");
  }

  return store;
}
