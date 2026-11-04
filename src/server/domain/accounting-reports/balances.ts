import { schema } from "@/server/db";
import { eq, type SQL } from "drizzle-orm";
import type { AuthCtx } from "@/server/rbac";
import type {
  AccountType,
  NormalBalanceSide,
  ReportStoreScope,
} from "./types";
import { buildStoreScopeCondition } from "./day-book";

export function resolveStoreScope(
  ctx: AuthCtx,
  requestedScope?: { type: "store"; storeId: string } | { type: "unallocated" } | { type: "all" },
): ReportStoreScope {
  const canViewAll = ctx.permissions.has("report.all_stores") || ctx.allowedStoreIds === "all";

  if (!requestedScope || requestedScope.type === "store") {
    const targetStoreId = requestedScope?.storeId ?? ctx.storeId;
    if (ctx.allowedStoreIds !== "all" && !ctx.allowedStoreIds.includes(targetStoreId)) {
      throw new Error(`Unauthorized store access: ${targetStoreId}`);
    }
    return { type: "store", storeId: targetStoreId };
  }

  // Requested unallocated or all stores
  if (!canViewAll) {
    return { type: "store", storeId: ctx.storeId };
  }

  return requestedScope;
}

export function getNormalBalanceSide(type: AccountType): NormalBalanceSide {
  return type === "asset" || type === "expense" ? "dr" : "cr";
}

export function computeBalanceValueAndSide(
  totalDebit: number,
  totalCredit: number,
  normalSide: NormalBalanceSide,
): { balance: number; side: NormalBalanceSide } {
  if (normalSide === "dr") {
    const net = totalDebit - totalCredit;
    return { balance: Math.abs(net), side: net >= 0 ? "dr" : "cr" };
  }
  const net = totalCredit - totalDebit;
  return { balance: Math.abs(net), side: net >= 0 ? "cr" : "dr" };
}

export function buildBaseLedgerConditions(
  tenantId: string,
  accountId: string,
  storeScope: ReportStoreScope,
  partyType?: "customer" | "supplier" | null,
  partyId?: string | null,
): SQL[] {
  const conds: SQL[] = [
    eq(schema.journalLines.tenantId, tenantId),
    eq(schema.journalLines.accountId, accountId),
    buildStoreScopeCondition(storeScope),
  ];
  if (partyType) conds.push(eq(schema.journalLines.partyType, partyType));
  if (partyId) conds.push(eq(schema.journalLines.partyId, partyId));
  return conds;
}
