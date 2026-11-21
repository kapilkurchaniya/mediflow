import { getSuppliers, getSuppliersCount } from "@/app/actions/suppliers";
import { getPendingSupplierPurchases } from "@/app/actions/purchases";
import { Plus, Truck, Phone, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, SearchForm, EmptyState, Avatar, TableWrapper } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { requirePagePermission, can } from "@/server/rbac";
import { Pagination } from "@/app/components/Pagination";
import { RegisterPendingSupplierButton } from "@/app/components/QuickRegisterSupplierModal";

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

  const [suppliers, totalCount, pendingPurchases] = await Promise.all([
    getSuppliers(q, PAGE_SIZE, offset),
    getSuppliersCount(q),
    getPendingSupplierPurchases(false).catch(() => []),
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

      {pendingPurchases.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <p className="text-sm font-bold">
                Action Required: {pendingPurchases.length} Purchase GRN invoice{pendingPurchases.length > 1 ? "s" : ""} imported without a registered supplier
              </p>
              <p className="text-xs text-amber-900">
                Register each supplier below (pre-filled from their invoice) to link payables, ledger balances, and GST ITC.
              </p>
            </div>
          </div>
          <div className="space-y-1.5 pl-7">
            {pendingPurchases.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 border border-amber-200 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-ink-900">{p.pendingSupplierMeta!.name}</span>
                  {p.pendingSupplierMeta!.gstin && (
                    <span className="ml-1.5 font-mono text-ink-500">
                      ({p.pendingSupplierMeta!.gstin})
                    </span>
                  )}{" "}
                  · Invoice{" "}
                  <Link
                    href={`/dashboard/purchases/${p.id}`}
                    className="font-mono font-bold text-brand-700 hover:underline"
                  >
                    {p.supplierInvoiceNo}
                  </Link>{" "}
                  <span className="text-ink-500">
                    ({p.purchaseNo} · {format(new Date(p.invoiceDate), "d MMM yyyy")} · {formatINR(p.totalAmount)})
                  </span>
                </div>
                {canManage && (
                  <RegisterPendingSupplierButton
                    meta={p.pendingSupplierMeta!}
                    purchaseId={p.id}
                    label="Register Supplier (Pre-filled)"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
