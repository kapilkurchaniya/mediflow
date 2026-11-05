import { schema, type DbOrTx } from "@/server/db";
import { getOrSeedAccounts } from "@/server/domain/accounting";

export interface ReceivablesFixture {
  tenantId: string;
  storeA: string;
  storeB: string;
  customer1Id: string;
  customer2Id: string;
  customer3Id: string;
  groupId: string;
  sale1Id: string;
  sale2Id: string;
  accounts: Record<string, string>;
}

export async function setupReceivablesFixture(d: DbOrTx): Promise<ReceivablesFixture> {
  // 1. Setup Tenant and Stores
  const [ten] = await d
    .insert(schema.tenants)
    .values({ name: `Tenant Receivables ${Date.now()}` })
    .returning();
  const tenantId = ten.id;

  const [sA] = await d
    .insert(schema.stores)
    .values({ tenantId, name: "Store Alpha", code: `SA${Date.now().toString().slice(-4)}`, stateCode: "27" })
    .returning();
  const storeA = sA.id;

  const [sB] = await d
    .insert(schema.stores)
    .values({ tenantId, name: "Store Beta", code: `SB${Date.now().toString().slice(-4)}`, stateCode: "27" })
    .returning();
  const storeB = sB.id;

  const accounts = await getOrSeedAccounts(d, tenantId);

  // 2. Setup Family Group with ₹20,000 pooled limit
  const [grp] = await d
    .insert(schema.customerGroups)
    .values({ tenantId, name: "Mehta Family", creditLimit: 2000000 })
    .returning();
  const groupId = grp.id;

  // 3. Setup Customers
  const [c1] = await d
    .insert(schema.customers)
    .values({ tenantId, name: "Anand Verma", phone: "9820011111", creditLimit: 1000000, creditDays: 15 })
    .returning();
  const customer1Id = c1.id;

  const [c2] = await d
    .insert(schema.customers)
    .values({ tenantId, groupId, name: "Rajesh Mehta", phone: "9820022222", creditLimit: 1500000, creditDays: 30 })
    .returning();
  const customer2Id = c2.id;

  const [c3] = await d
    .insert(schema.customers)
    .values({ tenantId, groupId, name: "Sunita Mehta", phone: "9820033333", creditLimit: 1000000, creditDays: 30 })
    .returning();
  const customer3Id = c3.id;

  // 4. Setup Sales & Journal Entries
  // Sale 1: Store A, completed 40 days ago, total ₹6,000, credit ₹6,000
  const [s1] = await d
    .insert(schema.sales)
    .values({
      tenantId,
      storeId: storeA,
      customerId: customer1Id,
      invoiceNo: "INV-A1",
      status: "completed",
      totalAmount: 600000,
      paidAmount: 0,
      creditAmount: 600000,
      completedAt: new Date(Date.now() - 40 * 86400000),
      createdBy: "00000000-0000-0000-0000-000000000001",
    })
    .returning();
  const sale1Id = s1.id;

  const [j1] = await d
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId: storeA,
      entryNo: "JV-S1",
      entryDate: "2026-09-25",
      narration: "Credit sale INV-A1",
      refType: "sale",
      refId: s1.id,
    })
    .returning();
  await d.insert(schema.journalLines).values([
    { tenantId, entryId: j1.id, accountId: accounts.debtors, debit: 600000, credit: 0, partyType: "customer", partyId: customer1Id },
    { tenantId, entryId: j1.id, accountId: accounts.sales, debit: 0, credit: 600000 },
  ]);

  // Sale 2: Store A, completed 5 days ago, total ₹4,000, credit ₹4,000
  const [s2] = await d
    .insert(schema.sales)
    .values({
      tenantId,
      storeId: storeA,
      customerId: customer1Id,
      invoiceNo: "INV-A2",
      status: "completed",
      totalAmount: 400000,
      paidAmount: 0,
      creditAmount: 400000,
      completedAt: new Date(Date.now() - 5 * 86400000),
      createdBy: "00000000-0000-0000-0000-000000000001",
    })
    .returning();
  const sale2Id = s2.id;

  const [j2] = await d
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId: storeA,
      entryNo: "JV-S2",
      entryDate: "2026-10-30",
      narration: "Credit sale INV-A2",
      refType: "sale",
      refId: s2.id,
    })
    .returning();
  await d.insert(schema.journalLines).values([
    { tenantId, entryId: j2.id, accountId: accounts.debtors, debit: 400000, credit: 0, partyType: "customer", partyId: customer1Id },
    { tenantId, entryId: j2.id, accountId: accounts.sales, debit: 0, credit: 400000 },
  ]);

  // Sale 3: Store B, Rajesh Mehta, completed 10 days ago, total ₹12,000 credit
  const [s3] = await d
    .insert(schema.sales)
    .values({
      tenantId,
      storeId: storeB,
      customerId: customer2Id,
      invoiceNo: "INV-B1",
      status: "completed",
      totalAmount: 1200000,
      paidAmount: 0,
      creditAmount: 1200000,
      completedAt: new Date(Date.now() - 10 * 86400000),
      createdBy: "00000000-0000-0000-0000-000000000001",
    })
    .returning();

  const [j3] = await d
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId: storeB,
      entryNo: "JV-S3",
      entryDate: "2026-10-25",
      narration: "Credit sale INV-B1",
      refType: "sale",
      refId: s3.id,
    })
    .returning();
  await d.insert(schema.journalLines).values([
    { tenantId, entryId: j3.id, accountId: accounts.debtors, debit: 1200000, credit: 0, partyType: "customer", partyId: customer2Id },
    { tenantId, entryId: j3.id, accountId: accounts.sales, debit: 0, credit: 1200000 },
  ]);

  return {
    tenantId,
    storeA,
    storeB,
    customer1Id,
    customer2Id,
    customer3Id,
    groupId,
    sale1Id,
    sale2Id,
    accounts,
  };
}
