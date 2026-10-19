import { db, schema } from "@/server/db";
import { eq, and, desc, sql } from "drizzle-orm";

export class LoyaltyService {
  /**
   * Fetch active loyalty program configuration for a tenant
   */
  static async getConfig(tenantId: string) {
    const [config] = await db
      .select()
      .from(schema.loyaltyConfigs)
      .where(and(eq(schema.loyaltyConfigs.tenantId, tenantId), eq(schema.loyaltyConfigs.isActive, true)))
      .limit(1);

    return config || null;
  }

  /**
   * Earn loyalty reward points on a sale completion
   */
  static async earnPoints(
    tx: any,
    opts: {
      tenantId: string;
      customerId: string;
      saleAmountPaise: number;
      saleId?: string;
    }
  ) {
    const config = await this.getConfig(opts.tenantId);
    if (!config || !config.isActive) return 0;

    // Default rule: 1 point per ₹100 (10,000 paise) spent
    const rupeesSpent = Math.floor(opts.saleAmountPaise / 100);
    const pointsPerRupeeRatio = config.pointsPerRupee || 1; // e.g. 1 point per ₹100
    const pointsEarned = Math.floor(rupeesSpent / (100 / pointsPerRupeeRatio));

    if (pointsEarned <= 0) return 0;

    // Fetch and update customer balance
    const [cust] = await tx
      .select({ points: schema.customers.loyaltyPoints })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, opts.customerId), eq(schema.customers.tenantId, opts.tenantId)))
      .limit(1);

    const currentPoints = cust?.points || 0;
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
   * Redeem loyalty points for rupee discount at checkout
   */
  static async redeemPoints(
    tx: any,
    opts: {
      tenantId: string;
      customerId: string;
      pointsToRedeem: number;
      saleId?: string;
    }
  ) {
    const config = await this.getConfig(opts.tenantId);
    if (!config || !config.isActive) throw new Error("Loyalty program is not active");

    if (opts.pointsToRedeem < config.minRedemptionPoints) {
      throw new Error(`Minimum ${config.minRedemptionPoints} points required for redemption`);
    }

    const [cust] = await tx
      .select({ points: schema.customers.loyaltyPoints })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, opts.customerId), eq(schema.customers.tenantId, opts.tenantId)))
      .limit(1);

    const currentPoints = cust?.points || 0;
    if (currentPoints < opts.pointsToRedeem) {
      throw new Error(`Insufficient loyalty points balance (Available: ${currentPoints})`);
    }

    const discountPaise = opts.pointsToRedeem * config.redemptionValuePaise;
    const newBalance = currentPoints - opts.pointsToRedeem;

    await tx
      .update(schema.customers)
      .set({ loyaltyPoints: newBalance })
      .where(eq(schema.customers.id, opts.customerId));

    await tx.insert(schema.loyaltyTransactions).values({
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      type: "redeem",
      points: -opts.pointsToRedeem,
      balanceAfter: newBalance,
      saleId: opts.saleId || null,
      note: `Redeemed ${opts.pointsToRedeem} points for ₹${(discountPaise / 100).toFixed(2)} bill discount`,
    });

    return {
      pointsRedeemed: opts.pointsToRedeem,
      discountPaise,
      newBalance,
    };
  }

  /**
   * Get transaction history for customer
   */
  static async getCustomerHistory(tenantId: string, customerId: string) {
    return db
      .select()
      .from(schema.loyaltyTransactions)
      .where(and(eq(schema.loyaltyTransactions.tenantId, tenantId), eq(schema.loyaltyTransactions.customerId, customerId)))
      .orderBy(desc(schema.loyaltyTransactions.createdAt));
  }
}
