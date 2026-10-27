 import { getSuppliers } from "@/app/actions/suppliers";
import { Plus, Truck, Phone } from "lucide-react";
import Link from "next/link";
import { PageHeader, SearchForm, EmptyState, Avatar } from "@/app/components/ui";
import { formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/rbac";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePagePermission("supplier.view");
  const { q } = await searchParams;
  const suppliers = await getSuppliers(q);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Suppliers"
        description="Distributors and stockists you purchase from."
        actions={
          <Link href="/dashboard/suppliers/new" className="btn btn-primary">
            <Plus /> Add supplier
          </Link>
        }
      />

      <div className="card overflow-hidden">
        <SearchForm defaultValue={q || ""} placeholder="Search by name, phone or GSTIN">
          <span className="text-[12.5px] text-ink-500 num">{formatNumber(suppliers.length)} suppliers</span>
        </SearchForm>

        {suppliers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table">
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
                        <span className="cell-primary">{s.name}</span>
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
          </div>
        ) : (
          <EmptyState
            icon={Truck}
            title={q ? `No suppliers match “${q}”` : "No suppliers yet"}
            description="Add your distributors to post purchase invoices and track payables."
            action={
              !q && (
                <Link href="/dashboard/suppliers/new" className="btn btn-primary btn-sm">
                  <Plus /> Add supplier
                </Link>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
