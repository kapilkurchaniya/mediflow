import { getSuppliers, getSuppliersCount } from "@/app/actions/suppliers";
import { Plus, Truck, Phone } from "lucide-react";
import Link from "next/link";
import { PageHeader, SearchForm, EmptyState, Avatar, TableWrapper } from "@/app/components/ui";
import { formatNumber } from "@/lib/format";
import { requirePagePermission, can } from "@/server/rbac";
import { Pagination } from "@/app/components/Pagination";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const ctx = await requirePagePermission("supplier.view");
  const canManage = can(ctx, "supplier.manage");
  const { q, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  const [suppliers, totalCount] = await Promise.all([
    getSuppliers(q, PAGE_SIZE, offset),
    getSuppliersCount(q),
  ]);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Suppliers"
        description="Distributors and stockists you purchase from."
        actions={
          canManage ? (
            <Link href="/dashboard/suppliers/new" className="btn btn-primary">
              <Plus /> Add supplier
            </Link>
          ) : undefined
        }
      />

      <div className="card overflow-hidden">
        <SearchForm defaultValue={q || ""} placeholder="Search by name, phone or GSTIN">
          <span className="text-[12.5px] text-ink-500 num">
            {formatNumber(totalCount)} suppliers
          </span>
        </SearchForm>

        {suppliers.length > 0 ? (
          <>
            <TableWrapper>
              <table className="data-table data-table-sticky min-w-[750px]">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Contact</th>
                    <th>GSTIN</th>
                    <th>Drug licence</th>
                    <th>Address</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={s.name} />
                          <Link
                            href={`/dashboard/suppliers/${s.id}`}
                            className="cell-primary hover:underline"
                          >
                            {s.name}
                          </Link>
                        </div>
                      </td>
                      <td>
                        <div className="text-ink-800">{s.contactPerson || <span className="text-ink-400">—</span>}</div>
                        {s.phone && (
                          <div className="cell-sub inline-flex items-center gap-1 num">
                            <Phone className="h-3 w-3" /> {s.phone}
                          </div>
                        )}
                      </td>
                      <td className="font-mono text-[12px] text-ink-700">{s.gstin || <span className="text-ink-400">—</span>}</td>
                      <td className="font-mono text-[12px] text-ink-700">{s.drugLicenseNo || <span className="text-ink-400">—</span>}</td>
                      <td className="max-w-[220px] truncate text-ink-500" title={s.address || ""}>
                        {s.address || "—"}
                      </td>
                      <td className="text-right">
                        <span className={`badge badge-dot ${s.isActive ? "badge-success" : "badge-neutral"}`}>
                          {s.isActive ? "Active" : "Inactive"}
                        </span>
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
              basePath="/dashboard/suppliers"
              queryParams={{ q }}
              itemLabel="suppliers"
            />
          </>
        ) : (
          <EmptyState
            icon={Truck}
            title={q ? `No suppliers match “${q}”` : "No suppliers yet"}
            description="Add your distributors to post purchase invoices and track payables."
            action={
              !q && canManage ? (
                <Link href="/dashboard/suppliers/new" className="btn btn-primary btn-sm">
                  <Plus /> Add supplier
                </Link>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
