import { getMedicines, getMedicinesCount } from "@/app/actions/inventory";
import { getRacks } from "@/app/actions/racks";
import { Plus, Pill, Upload } from "lucide-react";
import Link from "next/link";
import { PageHeader, SearchForm, EmptyState, TableWrapper } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { requirePagePermission, can } from "@/server/rbac";
import { BranchSettingsButton } from "./_components/BranchSettingsButton";
import { Pagination } from "@/app/components/Pagination";

export const metadata = { title: "Item master" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const ctx = await requirePagePermission("medicine.view");
  const canManage = can(ctx, "medicine.manage");
  const canAdjust = can(ctx, "inventory.adjust");
  const { q, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  const [items, totalCount, racks] = await Promise.all([
    getMedicines(q, PAGE_SIZE, offset),
    getMedicinesCount(q),
    getRacks(),
  ]);
  const rxCount = items.filter((i) => i.medicine.rxRequired).length;

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Item master"
        description="Your catalogue of medicines with pricing, HSN and GST configuration."
        actions={
          (canAdjust || canManage) ? (
            <>
              {canAdjust && (
                <Link href="/dashboard/inventory/import" className="btn btn-secondary">
                  <Upload /> Import
                </Link>
              )}
              {canManage && (
                <Link href="/dashboard/inventory/new" className="btn btn-primary">
                  <Plus /> Add item
                </Link>
              )}
            </>
          ) : undefined
        }
      />

      <div className="card overflow-hidden">
        <SearchForm defaultValue={q || ""} placeholder="Search by name, composition or barcode">
          <span className="text-[12.5px] text-ink-500 num">
            {formatNumber(totalCount)} items · {formatNumber(rxCount)} on this page
          </span>
        </SearchForm>

        {items.length > 0 ? (
          <>
            <TableWrapper>
              <table className="data-table data-table-sticky min-w-[850px]">
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
                        {rack ? (
                          <span className="font-mono text-ink-700">{rack.code}</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="font-mono text-ink-600 text-xs">
                        {medicine.packSize || `${medicine.unitsPerPack} / pack`}
                      </td>
                      <td>
                        <span className="font-mono text-xs">{medicine.hsn || "—"}</span>
                        <div className="cell-sub font-mono">{(medicine.gstRateBp / 100).toFixed(1)}%</div>
                      </td>
                      <td className="text-right font-mono font-medium">{formatINR(medicine.mrp)}</td>
                      <td className="text-right font-mono">{formatINR(medicine.salePrice)}</td>
                      <td className="text-right">
                        <span
                          className={`badge ${
                            medicine.isActive ? "badge-success" : "badge-neutral"
                          }`}
                        >
                          {medicine.isActive ? "Active" : "Archived"}
                        </span>
                      </td>
                      <td className="text-right">
                        {canManage && (
                          <BranchSettingsButton
                            medicine={medicine}
                            branchSettings={branchSettings}
                            racks={racks}
                          />
                        )}
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
              basePath="/dashboard/inventory"
              queryParams={{ q }}
              itemLabel="medicines"
            />
          </>
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
              !q && (canAdjust || canManage) ? (
                <div className="flex gap-2">
                  {canAdjust && (
                    <Link href="/dashboard/inventory/import" className="btn btn-secondary btn-sm">
                      <Upload /> Import CSV
                    </Link>
                  )}
                  {canManage && (
                    <Link href="/dashboard/inventory/new" className="btn btn-primary btn-sm">
                      <Plus /> Add item
                    </Link>
                  )}
                </div>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
