import { can, type AuthCtx } from "@/server/rbac";

export function canViewCost(ctx: Pick<AuthCtx, "permissions">): boolean {
  return can(ctx as AuthCtx, "cost.view");
}

export function canViewMargin(ctx: Pick<AuthCtx, "permissions">): boolean {
  return can(ctx as AuthCtx, "margin.view");
}

export function redactBatchCost<T extends { purchaseRate?: number | null }>(
  batch: T,
  ctx: Pick<AuthCtx, "permissions">
): T {
  if (canViewCost(ctx)) return batch;
  return { ...batch, purchaseRate: null };
}

export function redactMedicineCost<T extends { purchasePrice?: number | null }>(
  medicine: T,
  ctx: Pick<AuthCtx, "permissions">
): T {
  if (canViewCost(ctx)) return medicine;
  return { ...medicine, purchasePrice: null };
}
