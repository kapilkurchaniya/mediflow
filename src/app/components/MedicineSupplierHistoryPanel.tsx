"use client";

import { useEffect, useState } from "react";
import { Award, Gift, History, Phone, MessageSquare } from "lucide-react";
import { formatINR } from "@/lib/format";
import { getMedicineSupplierHistoryAction } from "@/app/actions/purchases";
import { buildWhatsAppDeepLink } from "@/lib/comms/whatsapp-link";

type HistoryResult = Awaited<ReturnType<typeof getMedicineSupplierHistoryAction>>;

export function MedicineSupplierHistoryPanel({
  medicineId,
  medicineName,
  onSelectRate,
}: {
  medicineId: string;
  medicineName?: string;
  onSelectRate?: (supplierId: string, rateRupees: number) => void;
}) {
  const [data, setData] = useState<HistoryResult | null>(null);
  const [loadedForId, setLoadedForId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!medicineId) return;
    let active = true;
    getMedicineSupplierHistoryAction(medicineId)
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
          setLoadedForId(medicineId);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load supplier purchase history.");
          setLoadedForId(medicineId);
        }
      });
    return () => {
      active = false;
    };
  }, [medicineId]);

  if (!medicineId) return null;
  const loading = loadedForId !== medicineId;
  const visibleData = loading ? null : data;

  return (
    <div className="card border border-brand-200 bg-brand-50/30 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-brand-700" />
          <h4 className="text-xs font-bold text-ink-900 uppercase tracking-wider">
            Past Supplier Purchases &amp; Scheme Comparison
            {(medicineName || visibleData?.medicineName) && (
              <span className="ml-1.5 font-normal normal-case text-brand-700">
                — {medicineName || visibleData?.medicineName}
              </span>
            )}
          </h4>
        </div>
        {visibleData?.summary.bestRatePaise !== null && visibleData?.summary.bestRatePaise !== undefined && (
          <span className="badge badge-success inline-flex items-center gap-1 text-[11px]">
            <Award className="h-3 w-3" />
            Best: {formatINR(visibleData.summary.bestRatePaise)} ({visibleData.summary.bestSupplierName})
          </span>
        )}
      </div>

      {error && <div className="text-xs text-rose-700">{error}</div>}
      {loading && <div className="text-xs text-ink-500">Loading past supplier rates &amp; schemes...</div>}

      {!loading && !error && visibleData && (
        <>
          {visibleData.activeSchemes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                <Gift className="h-3.5 w-3.5" /> Active Schemes:
              </span>
              {visibleData.activeSchemes.map((s) => (
                <span key={s.id} className="badge badge-warning">
                  {s.name} ({s.buyQty}+{s.freeQty} Free
                  {s.discountBp > 0 ? ` · ${(s.discountBp / 100).toFixed(1)}% off` : ""})
                </span>
              ))}
            </div>
          )}

          {visibleData.rows.length === 0 ? (
            <div className="text-xs text-ink-500 py-1">
              No past posted purchase bills found for this medicine yet.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg border border-ink-150">
              <table className="w-full text-xs">
                <thead className="bg-ink-50 text-[10.5px] uppercase text-ink-500">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Supplier &amp; Contact</th>
                    <th className="p-2 text-right">Qty / Free</th>
                    <th className="p-2 text-left">Scheme / Disc</th>
                    <th className="p-2 text-right">Rate (PTR)</th>
                    <th className="p-2 text-right">Landed Cost</th>
                    {onSelectRate && <th className="p-2 text-right">Apply</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {visibleData.rows.map((r, idx) => {
                    const effectiveCost = r.landedUnitCostPaise > 0 ? r.landedUnitCostPaise : r.ratePaise;
                    const isBest = visibleData.summary.bestRatePaise !== null && effectiveCost === visibleData.summary.bestRatePaise;
                    return (
                      <tr key={`${r.purchaseId}-${idx}`} className={isBest ? "bg-emerald-50/40" : ""}>
                        <td className="p-2 whitespace-nowrap font-mono text-ink-600">{r.invoiceDate}</td>
                        <td className="p-2">
                          <div className="font-medium text-ink-900">{r.supplierName}</div>
                          {r.phone && (
                            <div className="flex items-center gap-2 text-[10.5px] text-ink-500 mt-0.5">
                              <a href={`tel:${r.phone}`} className="inline-flex items-center gap-0.5 hover:text-brand-700">
                                <Phone className="h-2.5 w-2.5" /> {r.phone}
                              </a>
                              <a
                                href={buildWhatsAppDeepLink({
                                  phone: r.phone,
                                  text: `Hi ${r.contactPerson || r.supplierName}, checking latest rate & scheme for ${medicineName || visibleData.medicineName} (last rate ${formatINR(r.ratePaise)} on ${r.invoiceDate}).`,
                                })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-emerald-700 hover:underline"
                              >
                                <MessageSquare className="h-2.5 w-2.5" /> Discuss
                              </a>
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {r.qty}
                          {r.freeQty > 0 && <span className="text-emerald-700 font-semibold"> +{r.freeQty}F</span>}
                        </td>
                        <td className="p-2">
                          {r.schemeType || r.freeQty > 0 || r.discountBp > 0 ? (
                            <span className="badge badge-warning !text-[10px]">
                              {r.schemeType || (r.freeQty > 0 ? `${r.qty}+${r.freeQty}` : "Disc")}{" "}
                              {r.discountBp > 0 ? `(${(r.discountBp / 100).toFixed(1)}%)` : ""}
                            </span>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-ink-900">
                          {formatINR(r.ratePaise)}
                        </td>
                        <td className="p-2 text-right font-mono text-ink-700">
                          {formatINR(effectiveCost)}
                        </td>
                        {onSelectRate && (
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() => onSelectRate(r.supplierId, Number((r.ratePaise / 100).toFixed(2)))}
                              className="btn btn-secondary btn-xs"
                            >
                              Use Rate
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
