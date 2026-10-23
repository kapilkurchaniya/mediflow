"use server";

import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { LoyaltyService } from "@/server/domain/loyalty";
import { writeAudit } from "@/server/audit";

export async function getLoyaltyConfig() {
  const ctx = await requirePermission("customer.view");

  const [config] = await db
    .select()
    .from(schema.loyaltyConfigs)
    .where(eq(schema.loyaltyConfigs.tenantId, ctx.tenantId))
    .limit(1);

  return config || null;
}

export async function saveLoyaltyConfig(formData: FormData) {
  const ctx = await requirePermission("settings.manage");

  const pointsPerRupee = parseInt(formData.get("pointsPerRupee") as string) || 1;
  const redemptionValueRupees = parseFloat(formData.get("redemptionValueRupees") as string) || 1.0;
  const minRedemptionPoints = parseInt(formData.get("minRedemptionPoints") as string) || 10;
  const isActive = formData.get("isActive") === "on";

  const redemptionValuePaise = Math.round(redemptionValueRupees * 100);

  try {
    const [existing] = await db
      .select()
      .from(schema.loyaltyConfigs)
      .where(eq(schema.loyaltyConfigs.tenantId, ctx.tenantId))
      .limit(1);

    if (existing) {
      await db
        .update(schema.loyaltyConfigs)
        .set({
          pointsPerRupee,
          redemptionValuePaise,
          minRedemptionPoints,
          isActive,
        })
        .where(eq(schema.loyaltyConfigs.id, existing.id));
    } else {
      await db.insert(schema.loyaltyConfigs).values({
        tenantId: ctx.tenantId,
        pointsPerRupee,
        redemptionValuePaise,
        minRedemptionPoints,
        isActive,
      });
    }

    revalidatePath("/dashboard/settings/loyalty");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to save loyalty settings" };
  }
}

export async function getCustomerLoyalty(customerId: string) {
  const ctx = await requirePermission("customer.view");

  const [customer] = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      phone: schema.customers.phone,
      loyaltyPoints: schema.customers.loyaltyPoints,
    })
    .from(schema.customers)
    .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, ctx.tenantId)))
    .limit(1);

  if (!customer) return null;

  const history = await LoyaltyService.getCustomerHistory(ctx.tenantId, customerId);

  return {
    customer,
    history,
  };
}

export async function adjustCustomerLoyalty(customerId: string, pointsChange: number, note?: string) {
  const ctx = await requirePermission("customer.manage");

  try {
    await db.transaction(async (tx) => {
      const [cust] = await tx
        .select({ points: schema.customers.loyaltyPoints })
        .from(schema.customers)
        .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, ctx.tenantId)))
        .limit(1);

      if (!cust) throw new Error("Customer not found");

      const newBalance = Math.max(0, (cust.points || 0) + pointsChange);

      await tx
        .update(schema.customers)
        .set({ loyaltyPoints: newBalance })
        .where(eq(schema.customers.id, customerId));

      await tx.insert(schema.loyaltyTransactions).values({
        tenantId: ctx.tenantId,
        customerId,
        type: "adjust",
        points: pointsChange,
        balanceAfter: newBalance,
        note: note?.trim() || "Manual adjustment by pharmacy manager",
      });

      await writeAudit(tx, ctx, {
        action: "update",
        entityType: "loyalty_points",
        entityId: customerId,
        oldValue: { points: cust.points },
        newValue: { points: newBalance, change: pointsChange },
        reason: note?.trim() || "Manual loyalty points adjustment",
      });
    });

    revalidatePath(`/dashboard/customers/${customerId}/loyalty`);
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to adjust points" };
  }
}
