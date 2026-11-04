import { redirect } from "next/navigation";
import { requirePagePermission } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { and, eq } from "drizzle-orm";

export default async function LedgerDefaultPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const ctx = await requirePagePermission("accounting.view");
  const params = await searchParams;

  // Resolve default Cash on Hand (1010) or first account
  const accounts = await db
    .select({ id: schema.accounts.id, code: schema.accounts.code })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, ctx.tenantId), eq(schema.accounts.isActive, true)))
    .orderBy(schema.accounts.code);

  const defaultAccount = accounts.find((a) => a.code === "1010") ?? accounts[0];

  if (!defaultAccount) {
    throw new Error("No chart of accounts found for tenant.");
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  const queryString = query.toString() ? `?${query.toString()}` : "";
  redirect(`/dashboard/accounting/ledger/${defaultAccount.id}${queryString}`);
}
