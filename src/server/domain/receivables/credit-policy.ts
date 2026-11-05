import type { DbOrTx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { can } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { formatINR } from "@/lib/format";
import type { CreditEvaluationResult } from "./types";
import { getCustomerExposure } from "./outstanding";

export const MAX_ALLOWED_OVERDUE_DAYS = 60;

export interface EvaluateCreditInput {
  customerId?: string | null;
  creditPaise: number;
  override?: {
    managerId?: string;
    reason: string;
  };
}

/**
 * Server-side evaluation of customer credit availability.
 * Evaluates individual credit limits, pooled family limits, and overdue holds.
 */
export async function evaluateCreditSale(
  d: DbOrTx,
  ctx: AuthCtx,
  input: EvaluateCreditInput,
): Promise<CreditEvaluationResult> {
  const { customerId, creditPaise, override } = input;

  // 1. Full immediate settlements (Cash, Card, UPI) are never blocked
  if (creditPaise <= 0) {
    return {
      allowed: true,
      code: "ALLOWED",
      currentExposure: 0,
      creditLimit: 0,
      availableCredit: 0,
      maxDaysOverdue: 0,
      isPooled: false,
      requiresOverride: false,
    };
  }

  // 2. Credit requires a valid customer
  if (!customerId) {
    throw new DomainError("CREDIT_NEEDS_CUSTOMER", "Choose a customer to put the unpaid amount on credit.");
  }

  if (!can(ctx, "customer.credit")) {
    throw new DomainError(
      "CREDIT_NOT_ALLOWED",
      'You don\'t have permission to sell on credit (permission "customer.credit"). Collect the full amount.',
    );
  }

  // 3. Fetch customer exposure & credit terms
  const exposure = await getCustomerExposure(
    ctx.tenantId,
    customerId,
    { type: "all" }, // Credit limits are evaluated across all stores
    undefined,
    "due_date",
    d,
  );

  if (!exposure) {
    throw new DomainError("NOT_FOUND", "Customer not found.");
  }

  // 4. Determine effective limit (Family pooled or individual)
  const isPooled = Boolean(exposure.groupId && exposure.groupCreditLimit && exposure.groupCreditLimit > 0);
  const effectiveLimit = isPooled
    ? exposure.groupCreditLimit!
    : exposure.creditLimit;

  if (effectiveLimit <= 0) {
    throw new DomainError(
      "NO_CREDIT_LIMIT",
      `${exposure.customerName} has no credit limit. Set one on the customer's profile, or collect the full amount.`,
    );
  }

  const currentExposure = isPooled
    ? exposure.groupTotalExposure ?? exposure.netExposure
    : exposure.netExposure;

  const availableCredit = effectiveLimit - currentExposure;
  const isLimitExceeded = currentExposure + creditPaise > effectiveLimit;
  const isOverdueHold = exposure.maxDaysOverdue > MAX_ALLOWED_OVERDUE_DAYS;

  // 5. Evaluate policy violations
  if (isLimitExceeded || isOverdueHold) {
    const violationReason = isOverdueHold
      ? `${exposure.customerName} has invoices overdue by ${exposure.maxDaysOverdue} days (limit is ${MAX_ALLOWED_OVERDUE_DAYS} days).`
      : `Credit limit exceeded: ${exposure.customerName} already owes ${formatINR(currentExposure)} and the limit is ${formatINR(effectiveLimit)}. Collect more now.`;

    // Check for authorized manager override
    const hasOverridePerm = can(ctx, "sale.discount_override");
    const hasValidOverride = (hasOverridePerm || Boolean(override?.managerId)) && Boolean(override?.reason?.trim());

    if (hasValidOverride) {
      return {
        allowed: true,
        code: "REQUIRES_OVERRIDE",
        reason: violationReason,
        currentExposure,
        creditLimit: effectiveLimit,
        availableCredit,
        maxDaysOverdue: exposure.maxDaysOverdue,
        isPooled,
        requiresOverride: true,
      };
    }

    return {
      allowed: false,
      code: isOverdueHold ? "ACCOUNT_ON_CREDIT_HOLD" : "CREDIT_LIMIT_EXCEEDED",
      reason: violationReason,
      currentExposure,
      creditLimit: effectiveLimit,
      availableCredit,
      maxDaysOverdue: exposure.maxDaysOverdue,
      isPooled,
      requiresOverride: true,
    };
  }

  return {
    allowed: true,
    code: "ALLOWED",
    currentExposure,
    creditLimit: effectiveLimit,
    availableCredit,
    maxDaysOverdue: exposure.maxDaysOverdue,
    isPooled,
    requiresOverride: false,
  };
}

/**
 * Asserts that a credit sale is permitted, throwing a DomainError if violated
 * unless an authorized manager override with a valid reason is recorded.
 */
export async function assertCreditSaleAllowed(
  tx: DbOrTx,
  ctx: AuthCtx,
  input: EvaluateCreditInput,
): Promise<void> {
  const result = await evaluateCreditSale(tx, ctx, input);

  if (!result.allowed) {
    const errorCode = result.code === "CREDIT_LIMIT_EXCEEDED" ? "CREDIT_LIMIT" : result.code;
    throw new DomainError(
      errorCode,
      result.reason || "Credit sale not permitted.",
    );
  }

  if (result.requiresOverride && input.override) {
    await writeAudit(tx, ctx, {
      action: "credit_override",
      entityType: "customer",
      entityId: input.customerId ?? undefined,
      newValue: {
        creditPaise: input.creditPaise,
        currentExposure: result.currentExposure,
        creditLimit: result.creditLimit,
        maxDaysOverdue: result.maxDaysOverdue,
        overrideBy: input.override.managerId ?? ctx.userId,
      },
      reason: input.override.reason,
    });
  }
}
