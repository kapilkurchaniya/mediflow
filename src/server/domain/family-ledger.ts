import { db, schema } from "@/server/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";

export class FamilyLedgerService {
  /**
   * Fetch all members belonging to a family group with their balances
   */
  static async getGroupSummary(tenantId: string, groupId: string) {
    const [group] = await db
      .select()
      .from(schema.customerGroups)
      .where(and(eq(schema.customerGroups.id, groupId), eq(schema.customerGroups.tenantId, tenantId)))
      .limit(1);

    if (!group) return null;

    const members = await db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        phone: schema.customers.phone,
        loyaltyPoints: schema.customers.loyaltyPoints,
        openingBalance: schema.customers.openingBalance,
      })
      .from(schema.customers)
      .where(and(eq(schema.customers.groupId, groupId), eq(schema.customers.tenantId, tenantId)));

    const memberIds = members.map((m) => m.id);

    // Compute sales total per member
    let totalSalesPaise = 0;
    let totalPaidPaise = 0;

    if (memberIds.length > 0) {
      const sales = await db
        .select({
          customerId: schema.sales.customerId,
          total: schema.sales.totalAmount,
          paid: schema.sales.paidAmount,
        })
        .from(schema.sales)
        .where(
          and(
            eq(schema.sales.tenantId, tenantId),
            eq(schema.sales.status, "completed"),
            inArray(schema.sales.customerId, memberIds)
          )
        );

      for (const s of sales) {
        totalSalesPaise += s.total || 0;
        totalPaidPaise += s.paid || 0;
      }
    }

    const totalOpeningPaise = members.reduce((acc, m) => acc + (m.openingBalance || 0), 0);
    const combinedOutstandingPaise = totalOpeningPaise + totalSalesPaise - totalPaidPaise;

    return {
      group,
      members,
      memberCount: members.length,
      combinedOutstandingPaise,
      totalSalesPaise,
      totalPaidPaise,
    };
  }

  /**
   * Fetch combined transaction ledger across all family group members
   */
  static async getCombinedGroupLedger(tenantId: string, groupId: string) {
    const members = await db
      .select({ id: schema.customers.id, name: schema.customers.name })
      .from(schema.customers)
      .where(and(eq(schema.customers.groupId, groupId), eq(schema.customers.tenantId, tenantId)));

    const memberIds = members.map((m) => m.id);
    if (memberIds.length === 0) return [];

    const memberNameMap = new Map(members.map((m) => [m.id, m.name]));

    const sales = await db
      .select({
        id: schema.sales.id,
        invoiceNo: schema.sales.invoiceNo,
        date: schema.sales.createdAt,
        customerId: schema.sales.customerId,
        totalAmount: schema.sales.totalAmount,
        paidAmount: schema.sales.paidAmount,
      })
      .from(schema.sales)
      .where(
        and(
          eq(schema.sales.tenantId, tenantId),
          eq(schema.sales.status, "completed"),
          inArray(schema.sales.customerId, memberIds)
        )
      )
      .orderBy(desc(schema.sales.createdAt));

    return sales.map((s) => ({
      ...s,
      patientName: memberNameMap.get(s.customerId || "") || "Family Member",
    }));
  }
}
