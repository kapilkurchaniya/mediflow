import { and, eq } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { DomainError, ForbiddenError, NotFoundError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { updateSessionStore } from "@/server/auth";

export interface SwitchStoreInput {
  sessionId: string;
  userId: string;
  tenantId: string;
  targetStoreId: string;
  currentStoreId?: string;
  ip?: string | null;
}

export interface StoreSwitchResult {
  ok: true;
  storeId: string;
  storeName: string;
  storeCode: string;
  kind: "retail" | "warehouse";
}

export interface AllowedStoreItem {
  id: string;
  name: string;
  code: string;
  kind: "retail" | "warehouse";
  stateCode: string;
  gstin: string | null;
  isActive: boolean;
}

/**
 * Validates store access and switches the active session store in an atomic transaction.
 * Also persists the member's lastStoreId preference and writes an audit log.
 */
export async function switchStore(
  database: DbOrTx,
  input: SwitchStoreInput,
): Promise<StoreSwitchResult> {
  // 1. Fetch target store and membership (+ switch_any permission) in parallel
  const [[targetStore], [membershipRow]] = await Promise.all([
    database
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        code: schema.stores.code,
        kind: schema.stores.kind,
        isActive: schema.stores.isActive,
        tenantId: schema.stores.tenantId,
      })
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.id, input.targetStoreId),
          eq(schema.stores.tenantId, input.tenantId),
        ),
      )
      .limit(1),
    database
      .select({
        membership: schema.memberships,
        switchAnyPerm: schema.rolePermissions.permission,
      })
      .from(schema.memberships)
      .leftJoin(
        schema.rolePermissions,
        and(
          eq(schema.rolePermissions.roleId, schema.memberships.roleId),
          eq(schema.rolePermissions.permission, "store.switch_any"),
        ),
      )
      .where(
        and(
          eq(schema.memberships.tenantId, input.tenantId),
          eq(schema.memberships.userId, input.userId),
        ),
      )
      .limit(1),
  ]);

  if (!targetStore) {
    throw new NotFoundError("Store not found");
  }

  if (!targetStore.isActive) {
    throw new DomainError("STORE_INACTIVE", "Cannot switch to a deactivated store.");
  }

  const membership = membershipRow?.membership;
  if (!membership || membership.status !== "active") {
    throw new ForbiddenError("membership.active");
  }

  const maySwitchAny =
    membership.allStores || membershipRow?.switchAnyPerm === "store.switch_any";

  const isAllowed =
    maySwitchAny ||
    (Array.isArray(membership.storeIds) &&
      membership.storeIds.includes(input.targetStoreId));

  if (!isAllowed) {
    throw new ForbiddenError("store.access");
  }

  // 4. Atomic transaction update: session storeId, membership lastStoreId, audit log
  const executeUpdates = async (tx: DbOrTx) => {
    await Promise.all([
      updateSessionStore(input.sessionId, input.targetStoreId, tx),
      tx
        .update(schema.memberships)
        .set({ lastStoreId: input.targetStoreId })
        .where(eq(schema.memberships.id, membership.id)),
      writeAudit(
        tx,
        {
          tenantId: input.tenantId,
          storeId: input.targetStoreId,
          userId: input.userId,
        },
        {
          action: "store_switch",
          entityType: "session",
          entityId: input.sessionId,
          oldValue: { storeId: input.currentStoreId ?? null },
          newValue: { storeId: input.targetStoreId },
          ip: input.ip ?? undefined,
        },
      ),
    ]);
  };

  if ("transaction" in database && typeof database.transaction === "function") {
    await database.transaction(async (tx) => {
      await executeUpdates(tx);
    });
  } else {
    await executeUpdates(database);
  }

  return {
    ok: true,
    storeId: targetStore.id,
    storeName: targetStore.name,
    storeCode: targetStore.code,
    kind: targetStore.kind as "retail" | "warehouse",
  };
}

/**
 * Returns the list of active stores the user is permitted to access.
 */
export async function listAllowedStores(
  database: DbOrTx,
  params: { tenantId: string; userId: string },
): Promise<AllowedStoreItem[]> {
  const [membershipRows, allActiveStores] = await Promise.all([
    database
      .select({
        membership: schema.memberships,
        switchAnyPerm: schema.rolePermissions.permission,
      })
      .from(schema.memberships)
      .leftJoin(
        schema.rolePermissions,
        and(
          eq(schema.rolePermissions.roleId, schema.memberships.roleId),
          eq(schema.rolePermissions.permission, "store.switch_any"),
        ),
      )
      .where(
        and(
          eq(schema.memberships.tenantId, params.tenantId),
          eq(schema.memberships.userId, params.userId),
        ),
      )
      .limit(1),
    database
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        code: schema.stores.code,
        kind: schema.stores.kind,
        stateCode: schema.stores.stateCode,
        gstin: schema.stores.gstin,
        isActive: schema.stores.isActive,
      })
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.tenantId, params.tenantId),
          eq(schema.stores.isActive, true),
        ),
      )
      .orderBy(schema.stores.name),
  ]);

  const row = membershipRows[0];
  const m = row?.membership;
  if (!m || m.status !== "active") return [];

  const maySwitchAny = m.allStores || row?.switchAnyPerm === "store.switch_any";
  if (maySwitchAny) {
    return allActiveStores as AllowedStoreItem[];
  }

  const allowedIds = new Set(m.storeIds ?? []);
  return allActiveStores.filter((s) => allowedIds.has(s.id)) as AllowedStoreItem[];
}
