"use server";

import { and, desc, eq, gte, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { listCustomersWithDue } from "@/server/domain/payments";
import { computeUdhaarSummary } from "@/lib/receivables/udhaar-summary";

const uuid = z.string().uuid();

export async function getCustomerUdhaarDashboardAction() {
  const ctx = await requirePermission("accounting.post");
  const todayStr = new Date().toISOString().slice(0, 10);

  const [customersWithDue, todayReceipts, allCustomers] = await Promise.all([
    listCustomersWithDue(db, ctx.tenantId, ctx.storeId),
    db
      .select({ amount: schema.payments.amount })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tenantId, ctx.tenantId),
          eq(schema.payments.storeId, ctx.storeId),
          eq(schema.payments.direction, "in"),
          eq(schema.payments.partyType, "customer"),
          gte(schema.payments.paymentDate, todayStr),
        ),
      ),
    db
      .select({ id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone })
      .from(schema.customers)
      .where(and(eq(schema.customers.tenantId, ctx.tenantId), eq(schema.customers.isActive, true)))
      .orderBy(schema.customers.name)
      .limit(300),
  ]);

  const dueMap = new Map(customersWithDue.map((c) => [c.id, c]));
  const normalizedDueRows = customersWithDue.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone ?? null,
    duePaise: Number(c.due ?? 0),
    openBills: Number(c.bills ?? 0),
  }));

  const summary = computeUdhaarSummary(normalizedDueRows);
  const collectedTodayPaise = todayReceipts.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const directoryCustomers = allCustomers.map((c) => {
    const dueRow = dueMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      duePaise: Number(dueRow?.due ?? 0),
      openBills: Number(dueRow?.bills ?? 0),
    };
  });

  // Sort customers with pending dues first, then alphabetically
  directoryCustomers.sort((a, b) => {
    if (b.duePaise !== a.duePaise) return b.duePaise - a.duePaise;
    return a.name.localeCompare(b.name);
  });

  return {
    summary,
    collectedTodayPaise,
    customers: directoryCustomers,
  };
}

export async function getCustomerUdhaarHistoryAction(customerId: string) {
  const ctx = await requirePermission("accounting.post");
  const validCustomerId = uuid.parse(customerId);

  const [customerRows, bills, receipts] = await Promise.all([
    db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        phone: schema.customers.phone,
        creditLimit: schema.customers.creditLimit,
      })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, validCustomerId), eq(schema.customers.tenantId, ctx.tenantId)))
      .limit(1),
    db
      .select({
        id: schema.sales.id,
        invoiceNo: schema.sales.invoiceNo,
        status: schema.sales.status,
        totalAmount: schema.sales.totalAmount,
        paidAmount: schema.sales.paidAmount,
        creditAmount: schema.sales.creditAmount,
        returnedAmount: schema.sales.returnedAmount,
        completedAt: schema.sales.completedAt,
        createdAt: schema.sales.createdAt,
      })
      .from(schema.sales)
      .where(
        and(
          eq(schema.sales.tenantId, ctx.tenantId),
          eq(schema.sales.storeId, ctx.storeId),
          eq(schema.sales.customerId, validCustomerId),
          ne(schema.sales.status, "held"),
          ne(schema.sales.status, "cancelled"),
        ),
      )
      .orderBy(desc(schema.sales.createdAt))
      .limit(100),
    db
      .select({
        id: schema.payments.id,
        paymentNo: schema.payments.paymentNo,
        paymentDate: schema.payments.paymentDate,
        method: schema.payments.method,
        amount: schema.payments.amount,
        reference: schema.payments.reference,
        note: schema.payments.note,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tenantId, ctx.tenantId),
          eq(schema.payments.storeId, ctx.storeId),
          eq(schema.payments.direction, "in"),
          eq(schema.payments.partyType, "customer"),
          eq(schema.payments.partyId, validCustomerId),
        ),
      )
      .orderBy(desc(schema.payments.paymentDate), desc(schema.payments.createdAt))
      .limit(50),
  ]);

  const customer = customerRows[0] ?? null;
  if (!customer) return null;

  const totalPendingPaise = bills.reduce((sum, b) => sum + Math.max(0, Number(b.creditAmount ?? 0)), 0);
  const totalPurchasedPaise = bills.reduce((sum, b) => sum + Number(b.totalAmount ?? 0), 0);
  const totalPaidPaise = bills.reduce((sum, b) => sum + Number(b.paidAmount ?? 0), 0);

  return {
    customer,
    totals: {
      totalPendingPaise,
      totalPurchasedPaise,
      totalPaidPaise,
      openBillsCount: bills.filter((b) => Number(b.creditAmount ?? 0) > 0).length,
    },
    bills,
    receipts,
  };
}
