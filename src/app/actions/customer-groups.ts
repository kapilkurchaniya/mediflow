"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { FamilyLedgerService } from "@/server/domain/family-ledger";

export async function getCustomerGroups() {
  const ctx = await requirePermission("customer.view");

  const groups = await db
    .select({
      id: schema.customerGroups.id,
      name: schema.customerGroups.name,
      creditLimit: schema.customerGroups.creditLimit,
      notes: schema.customerGroups.notes,
      createdAt: schema.customerGroups.createdAt,
      memberCount: sql<number>`count(${schema.customers.id})::int`,
    })
    .from(schema.customerGroups)
    .leftJoin(schema.customers, eq(schema.customerGroups.id, schema.customers.groupId))
    .where(eq(schema.customerGroups.tenantId, ctx.tenantId))
    .groupBy(schema.customerGroups.id)
    .orderBy(schema.customerGroups.name);

  return groups;
}

export async function createCustomerGroup(formData: FormData) {
  const ctx = await requirePermission("customer.manage");

  const name = formData.get("name") as string;
  const creditLimitStr = formData.get("creditLimit") as string;
  const notes = formData.get("notes") as string;

  if (!name?.trim()) return { error: "Family / Group name is required" };

  const creditLimit = creditLimitStr ? Math.round(parseFloat(creditLimitStr) * 100) : null;

  try {
    const [group] = await db
      .insert(schema.customerGroups)
      .values({
        tenantId: ctx.tenantId,
        name: name.trim(),
        creditLimit: creditLimit ?? undefined,
        notes: notes?.trim() || null,
      })
      .returning();

    revalidatePath("/dashboard/customers/groups");
    return { success: true, group };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create group" };
  }
}

export async function addCustomerToGroup(groupId: string, customerId: string) {
  const ctx = await requirePermission("customer.manage");

  try {
    await db
      .update(schema.customers)
      .set({ groupId })
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, ctx.tenantId)));

    revalidatePath("/dashboard/customers/groups");
    revalidatePath("/dashboard/customers");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to add member to group" };
  }
}

export async function removeCustomerFromGroup(customerId: string) {
  const ctx = await requirePermission("customer.manage");

  try {
    await db
      .update(schema.customers)
      .set({ groupId: null })
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, ctx.tenantId)));

    revalidatePath("/dashboard/customers/groups");
    revalidatePath("/dashboard/customers");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to remove member" };
  }
}

export async function getFamilyGroupDetails(groupId: string) {
  const ctx = await requirePermission("customer.view");

  const [summary, ledger] = await Promise.all([
    FamilyLedgerService.getGroupSummary(ctx.tenantId, groupId),
    FamilyLedgerService.getCombinedGroupLedger(ctx.tenantId, groupId),
  ]);

  return {
    summary,
    ledger,
  };
}
