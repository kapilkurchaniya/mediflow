import { getCustomers, getCustomersCount } from "@/app/actions/customers";
import { Plus, Users, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader, SearchForm, EmptyState, Avatar, TableWrapper } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { requirePagePermission, can } from "@/server/rbac";
import { Pagination } from "@/app/components/Pagination";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const ctx = await requirePagePermission("customer.view");
  const canManage = can(ctx, "customer.manage");
  const { q, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  const [customers, totalCount] = await Promise.all([
    getCustomers(q, PAGE_SIZE, offset),
    getCustomersCount(q),
  ]);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Customers"
        description="Patients and accounts with contact details and credit limits."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/customers/groups" className="btn btn-secondary">
              <Users className="h-4 w-4" /> Family Groups
            </Link>
            {canManage && (
              <Link href="/dashboard/customers/new" className="btn btn-primary">
                <Plus /> Add customer
              </Link>
            )}
          </div>
        }
      />

      <div className="card overflow-hidden">
        <SearchForm defaultValue={q || ""} placeholder="Search by name, phone or email">
          <span className="text-[12.5px] text-ink-500 num">
            {formatNumber(totalCount)} customers
          </span>
        </SearchForm>

        {customers.length > 0 ? (
          <>
            <TableWrapper>
              <table className="data-table data-table-sticky min-w-[750px]">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Loyalty Points</th>
                    <th className="text-right">Credit limit</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={c.name} />
                          <span className="cell-primary">{c.name}</span>
                        </div>
                      </td>
                      <td className="text-ink-600 num">
                        {c.phone ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-ink-400" /> {c.phone}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/dashboard/customers/${c.id}/loyalty`}
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                          title="View points ledger"
                        >
                          {c.loyaltyPoints || 0} pts
                        </Link>
                      </td>
                      <td className="text-right num text-ink-900">
                        {c.creditLimit > 0 ? formatINR(c.creditLimit) : <span className="text-ink-400">No credit</span>}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/customers/${c.id}/privacy`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-600 hover:text-ink-900 border border-ink-200 dark:border-ink-800 px-2 py-0.5 rounded hover:bg-ink-50 dark:hover:bg-ink-900"
                            title="Manage DPDP consent & privacy"
                          >
                            <ShieldCheck className="h-3 w-3 text-sky-600" />
                            Privacy
                          </Link>
                          <span className={`badge badge-dot ${c.isActive ? "badge-success" : "badge-neutral"}`}>
                            {c.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
            <Pagination
              currentPage={page}
              pageSize={PAGE_SIZE}
              totalCount={totalCount}
              basePath="/dashboard/customers"
              queryParams={{ q }}
              itemLabel="customers"
            />
          </>
        ) : (
          <EmptyState
            icon={Users}
            title={q ? `No customers match “${q}”` : "No customers yet"}
            description="Create customer profiles to track purchase history, refills and credit."
            action={
              !q && canManage ? (
                <Link href="/dashboard/customers/new" className="btn btn-primary btn-sm">
                  <Plus /> Add customer
                </Link>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
