import { db, schema, type DbOrTx } from "@/server/db";
import { getOrSeedAccounts } from "@/server/domain/accounting";

export interface AccountingReportsFixture {
  tenantId: string;
  storeA: string;
  storeB: string;
  customerId: string;
  supplierId: string;
  accounts: Record<string, string>;
}

export async function setupAccountingReportsFixture(
  d: DbOrTx = db,
): Promise<AccountingReportsFixture> {
  const [t] = await d
    .insert(schema.tenants)
    .values({ name: `Test Tenant A5.2 ${Date.now()}` })
    .returning({ id: schema.tenants.id });
  const tenantId = t.id;

  const [sA] = await d
    .insert(schema.stores)
    .values({ tenantId, name: "Store Alpha", code: `SA${Date.now().toString().slice(-4)}`, stateCode: "27" })
    .returning({ id: schema.stores.id });
  const storeA = sA.id;

  const [sB] = await d
    .insert(schema.stores)
    .values({ tenantId, name: "Store Beta", code: `SB${Date.now().toString().slice(-4)}`, stateCode: "27" })
    .returning({ id: schema.stores.id });
  const storeB = sB.id;

  const accounts = await getOrSeedAccounts(d, tenantId);

  const [cust] = await d
    .insert(schema.customers)
    .values({ tenantId, name: "Ramesh Pharma", phone: `98765${Date.now().toString().slice(-5)}` })
    .returning({ id: schema.customers.id });
  const customerId = cust.id;

  const [supp] = await d
    .insert(schema.suppliers)
    .values({ tenantId, name: "Cipla Ltd", phone: `91234${Date.now().toString().slice(-5)}` })
    .returning({ id: schema.suppliers.id });
  const supplierId = supp.id;

  await d.transaction(async (tx) => {
    // Entry 1: Store A, 2026-11-01 - Simple 2-line cash sale: Dr Cash 1010 (10,000), Cr Sales 3010 (10,000)
    const [e1] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId: storeA,
        entryNo: "JV-001",
        entryDate: "2026-11-01",
        narration: "Cash sale to counter walk-in",
        refType: "sale",
      })
      .returning({ id: schema.journalEntries.id });

    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: e1.id, accountId: accounts.cash, debit: 1000000, credit: 0 },
      { tenantId, entryId: e1.id, accountId: accounts.sales, debit: 0, credit: 1000000 },
    ]);

    // Entry 2: Store A, 2026-11-02 - Compound credit sale to customer
    const [e2] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId: storeA,
        entryNo: "JV-002",
        entryDate: "2026-11-02",
        narration: "B2B Credit Sale to Ramesh Pharma",
        refType: "sale",
      })
      .returning({ id: schema.journalEntries.id });

    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: e2.id, accountId: accounts.debtors, debit: 1180000, credit: 0, partyType: "customer", partyId: customerId },
      { tenantId, entryId: e2.id, accountId: accounts.sales, debit: 0, credit: 1000000 },
      { tenantId, entryId: e2.id, accountId: accounts.cgst_output, debit: 0, credit: 90000 },
      { tenantId, entryId: e2.id, accountId: accounts.sgst_output, debit: 0, credit: 90000 },
    ]);

    // Entry 3: Store A, 2026-11-03 - Unattributed entry on Debtors account (partyId is null)
    const [e3] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId: storeA,
        entryNo: "JV-003",
        entryDate: "2026-11-03",
        narration: "Legacy unlinked customer invoice adjustment",
        refType: "sale",
      })
      .returning({ id: schema.journalEntries.id });

    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: e3.id, accountId: accounts.debtors, debit: 500000, credit: 0 },
      { tenantId, entryId: e3.id, accountId: accounts.sales, debit: 0, credit: 500000 },
    ]);

    // Entry 4: Store B, 2026-11-03 - Store B Operating Expense: Dr Rent 4110 (15,000), Cr Cash 1010 (15,000)
    const [e4] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId: storeB,
        entryNo: "JV-004",
        entryDate: "2026-11-03",
        narration: "Store B monthly rent payout",
        refType: "expense",
      })
      .returning({ id: schema.journalEntries.id });

    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: e4.id, accountId: accounts.expense_rent, debit: 1500000, credit: 0 },
      { tenantId, entryId: e4.id, accountId: accounts.cash, debit: 0, credit: 1500000 },
    ]);

    // Entry 5: Tenant-wide (storeId: null), 2026-11-04 - Owner capital contribution
    const [e5] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId: null,
        entryNo: "JV-005",
        entryDate: "2026-11-04",
        narration: "Owner central capital contribution",
        refType: "journal",
      })
      .returning({ id: schema.journalEntries.id });

    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: e5.id, accountId: accounts.bank, debit: 10000000, credit: 0 },
      { tenantId, entryId: e5.id, accountId: accounts.roundoff, debit: 0, credit: 10000000 },
    ]);

    // Entry 6: Store A, 2026-11-04 - Sale Return: Dr Sales 3010 (2,000), Cr Cash 1010 (2,000)
    const [e6] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId: storeA,
        entryNo: "JV-006",
        entryDate: "2026-11-04",
        narration: "Counter sale refund",
        refType: "sale_return",
      })
      .returning({ id: schema.journalEntries.id });

    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: e6.id, accountId: accounts.sales, debit: 200000, credit: 0 },
      { tenantId, entryId: e6.id, accountId: accounts.cash, debit: 0, credit: 200000 },
    ]);
  });

  return { tenantId, storeA, storeB, customerId, supplierId, accounts };
}
