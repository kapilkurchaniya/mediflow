import {
  getMedicines,
  getMedicinesCounts,
  getCategories,
  getManufacturers,
  getStoreStockTotalsByMedicine,
  type MedicinePackFilter,
  type MedicineStatusFilter,
} from "@/app/actions/inventory";
import { getRacks } from "@/app/actions/racks";
import { Plus, Pill, Upload, Boxes } from "lucide-react";
import Link from "next/link";
import { PageHeader, SearchForm, EmptyState, TableWrapper } from "@/app/components/ui";
import { formatINR, formatNumber } from "@/lib/format";
import { requirePagePermission, can } from "@/server/rbac";
import { BranchSettingsButton } from "./_components/BranchSettingsButton";
import { EditMedicineButton } from "./_components/EditMedicineButton";
import { BulkPackUpdaterModal } from "./_components/BulkPackUpdaterModal";
import { MedicineCatalogFilterBar } from "./_components/MedicineCatalogFilterBar";
import { getMedicineSegmentLabel, type MedicineSegmentFilter } from "@/lib/inventory/medicine-segments";
import { Pagination } from "@/app/components/Pagination";

export const metadata = { title: "Item master" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    pack?: string;
    status?: string;
    segment?: string;
    molecule?: string;
    categoryId?: string;
    rackId?: string;
  }>;
}) {
  const ctx = await requirePagePermission("medicine.view");
  const canManage = can(ctx, "medicine.manage");
  const canAdjust = can(ctx, "inventory.adjust");
  const { q, page: pageStr, pack, status, segment, molecule, categoryId, rackId } = await searchParams;
  const packFilter: MedicinePackFilter = pack === "single" ? "single" : "all";
  const statusFilter: MedicineStatusFilter =
    status === "archived" ? "archived" : status === "all" ? "all" : "active";
  const segmentFilter: MedicineSegmentFilter =
    segment === "male" || segment === "female" || segment === "kids" || segment === "senior" || segment === "general"
      ? segment
      : "all";
  const filterOpts = {
    segment: segmentFilter,
    molecule: molecule || undefined,
    categoryId: categoryId || undefined,
    rackId: rackId || undefined,
  };
  const page = Math.max(1, parseInt(pageStr || "1", 10));
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  const [items, counts, racks, categories, manufacturers] =
    await Promise.all([
      getMedicines(q, PAGE_SIZE, offset, packFilter, statusFilter, filterOpts),
      getMedicinesCounts(q, packFilter, statusFilter, filterOpts),
      getRacks(),
      getCategories(),
      canManage ? getManufacturers() : Promise.resolve([]),
    ]);

  const {
    filteredCount: totalCount,
    activeCount: activeItemsCount,
    archivedCount: archivedItemsCount,
    singleUnitActiveCount: singleUnitCount,
  } = counts;

  const stockTotals =
    canManage && items.length > 0
      ? await getStoreStockTotalsByMedicine(items.map((i) => i.medicine.id))
      : {};
  const rxCount = items.filter((i) => i.medicine.rxRequired).length;

  const bulkItems = items.map((i) => ({
    id: i.medicine.id,
    name: i.medicine.name,
    genericName: i.medicine.genericName,
    unitsPerPack: i.medicine.unitsPerPack,
    packUnit: i.medicine.packUnit,
    looseUnit: i.medicine.looseUnit,
    packSize: i.medicine.packSize,
    stockUnits: stockTotals[i.medicine.id] ?? 0,
  }));

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Item master"
        description="Your catalogue of medicines with pricing, HSN and GST configuration."
        actions={
          (canAdjust || canManage) ? (
            <>
              {canManage && items.length > 0 && (
                <BulkPackUpdaterModal items={bulkItems} canAdjustStock={canAdjust} />
              )}
              {canAdjust && (
                <Link href="/dashboard/import?tab=quick" className="btn btn-secondary">
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
          {packFilter === "single" && <input type="hidden" name="pack" value="single" />}
          {statusFilter !== "active" && <input type="hidden" name="status" value={statusFilter} />}
          {segmentFilter !== "all" && <input type="hidden" name="segment" value={segmentFilter} />}
          {molecule && <input type="hidden" name="molecule" value={molecule} />}
          {categoryId && <input type="hidden" name="categoryId" value={categoryId} />}
          {rackId && <input type="hidden" name="rackId" value={rackId} />}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/inventory${q ? `?q=${encodeURIComponent(q)}` : ""}`}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                packFilter === "all" && statusFilter === "active"
                  ? "bg-brand-50 text-brand-700 border-brand-200"
                  : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50"
              }`}
            >
              Active ({formatNumber(activeItemsCount)})
            </Link>
            <Link
              href={`/dashboard/inventory?pack=single${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                packFilter === "single"
                  ? "bg-amber-50 text-amber-800 border-amber-300"
                  : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50"
              }`}
            >
              Single-unit / Unconfigured Pack ({formatNumber(singleUnitCount)})
            </Link>
            {archivedItemsCount > 0 && (
              <Link
                href={`/dashboard/inventory?status=archived${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  statusFilter === "archived"
                    ? "bg-rose-50 text-rose-800 border-rose-300"
                    : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50"
                }`}
              >
                Banned / Archived ({formatNumber(archivedItemsCount)})
              </Link>
            )}
            <span className="text-[12.5px] text-ink-500 num ml-1">
              {formatNumber(rxCount)} Rx on page
            </span>
          </div>
        </SearchForm>

        <MedicineCatalogFilterBar
          basePath="/dashboard/inventory"
          segment={segmentFilter}
          molecule={molecule || ""}
          categoryId={categoryId || ""}
          rackId={rackId || ""}
          categories={categories}
          racks={racks}
          preservedParams={{
            q: q || undefined,
            pack: packFilter === "single" ? "single" : undefined,
            status: statusFilter !== "active" ? statusFilter : undefined,
          }}
        />

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
                    <th className="w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ medicine, manufacturer, category, rack, branchSettings }) => (
                    <tr key={medicine.id}>
                      <td className="max-w-[320px]">
                        <div className="flex items-center gap-1.5">
                          <span className="cell-primary truncate">{medicine.name}</span>
                          {medicine.schedule && medicine.schedule !== "none" && (
                            <span className="badge badge-warning !h-[18px] !px-1.5 !text-[10px] font-mono">
                              Sch {medicine.schedule === "narcotic" ? "NDPS" : medicine.schedule}
                            </span>
                          )}
                          {medicine.rxRequired && <span className="badge badge-danger !h-[18px] !px-1.5 !text-[10.5px]">Rx</span>}
                        </div>
                        <div className="cell-sub truncate" title={medicine.genericName || ""}>
                          {medicine.genericName || "—"}
                          {manufacturer?.name && <span className="text-ink-400"> · {manufacturer.name}</span>}
                        </div>
                      </td>
                      <td className="text-ink-600">
                        <div>{category?.name || <span className="text-ink-400">Uncategorised</span>}</div>
                        {medicine.targetSegment && medicine.targetSegment !== "general" && (
                          <span className="badge badge-neutral !text-[10px] !px-1.5 mt-0.5 capitalize">
                            {getMedicineSegmentLabel(medicine.targetSegment)}
                          </span>
                        )}
                      </td>
                      <td>
                        {rack ? (
                          <span className="font-mono text-ink-700">{rack.code}</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="font-mono text-ink-600 text-xs">
                        {medicine.unitsPerPack === 1 ? (
                          <span
                            className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
                            data-tooltip="Units / Pack is 1 — click Edit or Bulk Set Pack Sizes to enable loose tablet selling"
                          >
                            1 / {medicine.packUnit}
                          </span>
                        ) : (
                          medicine.packSize || `${medicine.unitsPerPack} ${medicine.looseUnit}s / ${medicine.packUnit}`
                        )}
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
                        <div className="inline-flex items-center justify-end gap-1">
                          <Link
                            href={`/dashboard/inventory/batches?medicineId=${medicine.id}`}
                            className="p-1.5 rounded text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            data-tooltip-title="View & Edit Stock"
                            data-tooltip={`Inspect and adjust batch stock for ${medicine.name}`}
                            aria-label={`View stock batches for ${medicine.name}`}
                          >
                            <Boxes className="w-4 h-4" />
                          </Link>
                          {canManage && (
                            <EditMedicineButton
                              medicine={medicine}
                              categories={categories}
                              manufacturers={manufacturers}
                              racks={racks}
                              currentRackId={branchSettings?.rackId ?? null}
                              canAdjustStock={canAdjust}
                            />
                          )}
                          {canManage && (
                            <BranchSettingsButton
                              medicine={medicine}
                              branchSettings={branchSettings}
                              racks={racks}
                            />
                          )}
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
              basePath="/dashboard/inventory"
              queryParams={{
                q,
                ...(packFilter === "single" ? { pack: "single" } : {}),
                ...(statusFilter !== "active" ? { status: statusFilter } : {}),
                ...(segmentFilter !== "all" ? { segment: segmentFilter } : {}),
                ...(molecule ? { molecule } : {}),
                ...(categoryId ? { categoryId } : {}),
                ...(rackId ? { rackId } : {}),
              }}
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
                    <Link href="/dashboard/import?tab=quick" className="btn btn-secondary btn-sm">
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
