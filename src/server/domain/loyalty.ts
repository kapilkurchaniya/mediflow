import { db, schema, type Tx, type DbOrTx } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";

export class LoyaltyService {
  /**
   * Fetch active loyalty program configuration for a tenant.
   * Can be called with (tx, tenantId) or (tenantId).
   */
  static async getConfig(
    txOrTenantId: DbOrTx | string,
    maybeTenantId?: string
  ) {
    const tx: DbOrTx = typeof txOrTenantId === "string" ? db : txOrTenantId;
    const tenantId: string = typeof txOrTenantId === "string" ? txOrTenantId : maybeTenantId!;

    const [config] = await tx
      .select()
      .from(schema.loyaltyConfigs)
      .where(and(eq(schema.loyaltyConfigs.tenantId, tenantId), eq(schema.loyaltyConfigs.isActive, true)))
      .limit(1);

    return config || null;
  }

  /**
   * Fetch redeemable points and their monetary value in paise for a customer (B2.5).
   * Returns { points: 0, valuePaise: 0 } if loyalty is inactive or points are below minRedemptionPoints.
   */
  static async getRedeemable(
    tx: DbOrTx,
    tenantId: string,
    customerId: string
  ): Promise<{ points: number; valuePaise: number }> {
    const config = await this.getConfig(tx, tenantId);
    if (!config || !config.isActive) {
      return { points: 0, valuePaise: 0 };
    }

    const [cust] = await tx
      .select({ points: schema.customers.loyaltyPoints })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)))
      .limit(1);

    const points = cust?.points ?? 0;
    const minPoints = config.minRedemptionPoints ?? 10;
    if (points < minPoints || points <= 0) {
      return { points: 0, valuePaise: 0 };
    }

    const valuePaise = points * (config.redemptionValuePaise ?? 100);
    return { points, valuePaise };
  }

  /**
   * Earn loyalty reward points on a sale completion (B2.5).
   * Note: Earned points are calculated on the amount actually paid, excluding the redeemed value.
   * Row-level locking via SELECT ... FOR UPDATE prevents race conditions.
   */
  static async earnPoints(
    tx: Tx,
    opts: {
      tenantId: string;
      customerId: string;
      saleAmountPaise: number;
      saleId?: string;
    }
  ): Promise<number> {
    const config = await this.getConfig(tx, opts.tenantId);
    if (!config || !config.isActive) return 0;

    // Default rule: 1 point per ₹100 (10,000 paise) spent
    const rupeesSpent = Math.floor(opts.saleAmountPaise / 100);
    const pointsPerRupeeRatio = config.pointsPerRupee || 1; // e.g. 1 point per ₹100
    const pointsEarned = Math.floor(rupeesSpent / (100 / pointsPerRupeeRatio));

    if (pointsEarned <= 0) return 0;

    // Fetch and lock customer balance for atomic update
    const [cust] = await tx
      .select({ points: schema.customers.loyaltyPoints })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, opts.customerId), eq(schema.customers.tenantId, opts.tenantId)))
      .for("update")
      .limit(1);

    if (!cust) return 0;

    const currentPoints = cust.points || 0;
    const newBalance = currentPoints + pointsEarned;

    await tx
      .update(schema.customers)
      .set({ loyaltyPoints: newBalance })
      .where(eq(schema.customers.id, opts.customerId));

    await tx.insert(schema.loyaltyTransactions).values({
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      type: "earn",
      points: pointsEarned,
      balanceAfter: newBalance,
      saleId: opts.saleId || null,
      note: `Earned on Bill #${opts.saleId?.slice(-6) || "Sale"} (₹${(opts.saleAmountPaise / 100).toFixed(2)})`,
    });

    return pointsEarned;
  }

  /**
   * Redeem loyalty points for rupee discount at checkout (B2.5).
   * Row-level locking via SELECT ... FOR UPDATE.
   * Throws if points < minRedemptionPoints or points > customer balance.
   */
  static async redeemPoints(
    tx: Tx,
    opts: {
      tenantId: string;
      customerId: string;
      points?: number;
      pointsToRedeem?: number;
      saleId?: string;
    }
  ): Promise<{ valuePaise: number; pointsRedeemed: number; newBalance: number }> {
    const points = opts.points ?? opts.pointsToRedeem ?? 0;
    if (points <= 0) {
      throw new Error("Points to redeem must be greater than zero");
    }

    const config = await this.getConfig(tx, opts.tenantId);
    if (!config || !config.isActive) {
      throw new Error("Loyalty program is not active");
    }

    if (points < config.minRedemptionPoints) {
      throw new Error(`Minimum ${config.minRedemptionPoints} points required for redemption`);
    }

    // Lock customer row
    const [cust] = await tx
      .select({ points: schema.customers.loyaltyPoints })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, opts.customerId), eq(schema.customers.tenantId, opts.tenantId)))
      .for("update")
      .limit(1);

    if (!cust) {
      throw new Error(`Customer ${opts.customerId} not found`);
    }

    const currentPoints = cust.points || 0;
    if (currentPoints < points) {
      throw new Error(`Insufficient loyalty points balance (Available: ${currentPoints})`);
    }

    const discountPaise = points * (config.redemptionValuePaise ?? 100);
    const newBalance = currentPoints - points;

    await tx
      .update(schema.customers)
      .set({ loyaltyPoints: newBalance })
      .where(eq(schema.customers.id, opts.customerId));

    await tx.insert(schema.loyaltyTransactions).values({
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      type: "redeem",
      points: -points,
      balanceAfter: newBalance,
      saleId: opts.saleId || null,
      note: `Redeemed ${points} points for ₹${(discountPaise / 100).toFixed(2)} bill discount`,
    });

    return {
      valuePaise: discountPaise,
      pointsRedeemed: points,
      newBalance,
    };
  }

  /**
   * Reverse loyalty points for a sale that was cancelled or returned (B2.5).
   * - For full cancellation: fraction = 1
   * - For partial returns: fraction = returnedAmount / totalAmount (0 < fraction <= 1)
   *
   * Rules:
   * 1. If points were EARNED on the sale: reverses the earned points (deducts from customer balance).
   * 2. If points were REDEEMED on the sale: refunds the redeemed points back to the customer balance.
   */
  static async reverseForSale(
    tx: Tx,
    opts: {
      tenantId: string;
      saleId: string;
      fraction: number;
    }
  ): Promise<void> {
    const fraction = Math.min(1, Math.max(0, opts.fraction));
    if (fraction <= 0) return;

    // Fetch prior loyalty transactions for this sale
    const saleTxs = await tx
      .select()
      .from(schema.loyaltyTransactions)
      .where(
        and(
          eq(schema.loyaltyTransactions.tenantId, opts.tenantId),
          eq(schema.loyaltyTransactions.saleId, opts.saleId)
        )
      );

    if (saleTxs.length === 0) return;

    const customerId = saleTxs[0].customerId;
    if (!customerId) return;

    let earnedPoints = 0;
    let redeemedPoints = 0;

    for (const t of saleTxs) {
      if (t.type === "earn") {
        earnedPoints += t.points;
      } else if (t.type === "redeem") {
        redeemedPoints += Math.abs(t.points);
      }
    }

    const pointsToDeduct = Math.round(earnedPoints * fraction);
    const pointsToRefund = Math.round(redeemedPoints * fraction);

    if (pointsToDeduct === 0 && pointsToRefund === 0) return;

    // Lock customer row
    const [cust] = await tx
      .select({ points: schema.customers.loyaltyPoints })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, opts.tenantId)))
      .for("update")
      .limit(1);

    if (!cust) return;

    let currentPoints = cust.points || 0;

    // 1. Deduct earned points if any were earned on the sale
    if (pointsToDeduct > 0) {
      currentPoints = Math.max(0, currentPoints - pointsToDeduct);
      await tx
        .update(schema.customers)
        .set({ loyaltyPoints: currentPoints })
        .where(eq(schema.customers.id, customerId));

      await tx.insert(schema.loyaltyTransactions).values({
        tenantId: opts.tenantId,
        customerId,
        type: "adjust",
        points: -pointsToDeduct,
        balanceAfter: currentPoints,
        saleId: opts.saleId,
        note: `Reversal of earned points on return/cancel (${Math.round(fraction * 100)}%) for Bill #${opts.saleId.slice(-6)}`,
      });
    }

    // 2. Refund redeemed points if any were spent on the sale
    if (pointsToRefund > 0) {
      currentPoints = currentPoints + pointsToRefund;
      await tx
        .update(schema.customers)
        .set({ loyaltyPoints: currentPoints })
        .where(eq(schema.customers.id, customerId));

      await tx.insert(schema.loyaltyTransactions).values({
        tenantId: opts.tenantId,
        customerId,
        type: "adjust",
        points: pointsToRefund,
        balanceAfter: currentPoints,
        saleId: opts.saleId,
        note: `Refund of redeemed points on return/cancel (${Math.round(fraction * 100)}%) for Bill #${opts.saleId.slice(-6)}`,
      });
    }
  }

  /**
   * Get transaction history for customer.
   * Can be called with (tx, tenantId, customerId) or (tenantId, customerId).
   */
  static async getCustomerHistory(
    txOrTenantId: DbOrTx | string,
    tenantIdOrCustomerId: string,
    maybeCustomerId?: string
  ) {
    const tx: DbOrTx = typeof txOrTenantId === "string" ? db : txOrTenantId;
    const tenantId = typeof txOrTenantId === "string" ? txOrTenantId : tenantIdOrCustomerId;
    const customerId = maybeCustomerId || tenantIdOrCustomerId;

    return tx
      .select()
      .from(schema.loyaltyTransactions)
      .where(
        and(
          eq(schema.loyaltyTransactions.tenantId, tenantId),
          eq(schema.loyaltyTransactions.customerId, customerId)
        )
      )
      .orderBy(desc(schema.loyaltyTransactions.createdAt));
  }
}
