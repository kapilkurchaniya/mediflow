import { getMedicines } from "@/app/actions/inventory";
import { getRacks } from "@/app/actions/racks";
import { Plus, Pill, Upload } from "lucide-react";
import Link from "next/link";
import { PageHeader, SearchForm, EmptyState } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/rbac";
import { BranchSettingsButton } from "./_components/BranchSettingsButton";

export const metadata = { title: "Item master" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePagePermission("medicine.view");
  const { q } = await searchParams;
  const [items, racks] = await Promise.all([getMedicines(q), getRacks()]);
  const rxCount = items.filter((i) => i.medicine.rxRequired).length;

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Item master"
        description="Your catalogue of medicines with pricing, HSN and GST configuration."
        actions={
          <>
            <Link href="/dashboard/inventory/import" className="btn btn-secondary">
              <Upload /> Import
            </Link>
            <Link href="/dashboard/inventory/new" className="btn btn-primary">
              <Plus /> Add item
            </Link>
          </>
        }
      />

      <div className="card overflow-hidden">
        <SearchForm defaultValue={q || ""} placeholder="Search by name, composition or barcode">
          <span className="text-[12.5px] text-ink-500 num">
            {formatNumber(items.length)} items · {formatNumber(rxCount)} Rx
          </span>
        </SearchForm>

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Rack</th>
                  <th>Pack</th>
                  <th>HSN / GST</th>
                  <th className="text-right">MRP</th>
                  <th className="text-right">Sale price</th>
                  <th className="text-right">Status</th>
                  <th className="w-10 text-right">Branch</th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ medicine, manufacturer, category, rack, branchSettings }) => (
                  <tr key={medicine.id}>
                    <td className="max-w-[320px]">
                      <div className="flex items-center gap-2">
                        <span className="cell-primary truncate">{medicine.name}</span>
                        {medicine.rxRequired && <span className="badge badge-danger !h-[18px] !px-1.5 !text-[10.5px]">Rx</span>}
                      </div>
                      <div className="cell-sub truncate" title={medicine.genericName || ""}>
                        {medicine.genericName || "—"}
                        {manufacturer?.name && <span className="text-ink-400"> · {manufacturer.name}</span>}
                      </div>
                    </td>
                    <td className="text-ink-600">{category?.name || <span className="text-ink-400">Uncategorised</span>}</td>
                    <td>
                      {rack?.code ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded border border-brand-200">
                          {rack.code}
                        </span>
                      ) : (
                        <span className="text-ink-400 text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <span className="capitalize text-ink-800">{medicine.unit}</span>
                      {medicine.packSize && <div className="cell-sub">{medicine.packSize}</div>}
                    </td>
                    <td>
                      <span className="font-mono text-[12px] text-ink-700">{medicine.hsn || "—"}</span>
                      <div className="cell-sub num">{(medicine.gstRateBp ?? 0) / 100}% GST</div>
                    </td>
                    <td className="text-right num text-ink-900 font-medium">{formatINR(medicine.mrp)}</td>
                    <td className="text-right num text-ink-600">
                      {branchSettings?.salePriceOverride ? (
                        <div>
                          <span className="font-medium text-ink-900">{formatINR(branchSettings.salePriceOverride)}</span>
                          <span className="block text-[10px] text-amber-700 font-medium">Branch override</span>
                        </div>
                      ) : medicine.salePrice && medicine.salePrice !== medicine.mrp ? (
                        formatINR(medicine.salePrice)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right">
                      <span className={`badge badge-dot ${medicine.isActive ? "badge-success" : "badge-neutral"}`}>
                        {medicine.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="text-right">
                      <BranchSettingsButton
                        medicine={medicine}
                        branchSettings={branchSettings}
                        racks={racks}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Pill}
            title={q ? `No items match “${q}”` : "Your item master is empty"}
            description={
              q
                ? "Try a different spelling, the generic composition, or scan the barcode."
                : "Add medicines one by one, or import your existing catalogue from Marg, Vyapar or Excel."
            }
            action={
              !q && (
                <div className="flex gap-2">
                  <Link href="/dashboard/inventory/import" className="btn btn-secondary btn-sm">
                    <Upload /> Import CSV
                  </Link>
                  <Link href="/dashboard/inventory/new" className="btn btn-primary btn-sm">
                    <Plus /> Add item
                  </Link>
                </div>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
