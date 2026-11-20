import React from "react";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getPrintCountSheetAction } from "@/app/actions/stocktake";
import { PrintControls } from "./PrintControls";
import { PrintWatermark } from "@/app/components/PrintWatermark";
import { formatINR } from "@/lib/format";

export const metadata = {
  title: "Print Physical Count Sheet | MediFlow",
  description: "Printable physical stock count sheet by rack.",
};

export default async function PrintCountSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const mode = search.mode === "manager" ? "manager" : "blind";

  const data = await getPrintCountSheetAction(id, mode);
  if (!data) notFound();

  const formattedDate = format(new Date(data.session.createdAt), "dd MMM yyyy, HH:mm");

  return (
    <div className="min-h-screen bg-ink-50/50 py-6 px-4 print:bg-white print:p-0">
      <PrintWatermark />
      <div className="mx-auto max-w-5xl">
        <PrintControls sessionId={id} currentMode={mode} />

        <div className="rounded-xl border border-ink-200 bg-white p-8 shadow-sm print:border-none print:p-0 print:shadow-none">
          {/* Header */}
          <div className="border-b-2 border-ink-900 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-ink-900">
                  {data.session.storeName} ({data.session.storeCode})
                </h1>
                <p className="text-xs text-ink-600 mt-0.5 font-mono">
                  Session #{data.session.sessionNo} · Generated on {formattedDate}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block rounded-md border border-ink-300 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-ink-800">
                  {mode === "blind" ? "Blind Count Sheet" : "Manager Review Sheet"}
                </span>
                <p className="text-[11px] text-ink-500 mt-1 capitalize">
                  Scope: {data.session.scope === "full_store" ? "Entire Store" : "Selected Racks"}
                </p>
              </div>
            </div>
          </div>

          {/* Rack Groups */}
          <div className="mt-6 space-y-6">
            {data.rackGroups.map((group) => (
              <div key={group.rackCode} className="break-inside-avoid">
                <div className="flex items-center justify-between bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-900 border-l-4 border-brand-600">
                  <span>Rack: {group.rackCode} — {group.rackName}</span>
                  <span className="text-[11px] font-normal text-ink-600">
                    {group.items.length} {group.items.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <table className="w-full text-left text-xs border border-ink-200 mt-1">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50/80 text-[11px] font-semibold text-ink-700">
                      <th className="py-2 px-2 w-8 text-center">#</th>
                      <th className="py-2 px-3">Medicine & Generic</th>
                      <th className="py-2 px-2 w-28">Batch No</th>
                      <th className="py-2 px-2 w-24">Expiry</th>
                      <th className="py-2 px-2 w-20">Packing</th>
                      {mode === "manager" ? (
                        <>
                          <th className="py-2 px-2 w-20 text-right">Sys Qty</th>
                          <th className="py-2 px-2 w-20 text-right">Count</th>
                          <th className="py-2 px-2 w-20 text-right">Variance</th>
                          <th className="py-2 px-2 w-24 text-right">Cost</th>
                        </>
                      ) : (
                        <>
                          <th className="py-2 px-2 w-28 text-center border-l border-ink-200 bg-amber-50/30">
                            Count (Units)
                          </th>
                          <th className="py-2 px-2 w-32 border-l border-ink-200">Remarks</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-150 font-mono text-[11.5px]">
                    {group.items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-ink-50/50">
                        <td className="py-2 px-2 text-center text-ink-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-sans font-medium text-ink-900">
                          <div>{item.medicineName}</div>
                          {item.genericName && (
                            <div className="text-[10px] text-ink-500 font-normal">{item.genericName}</div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-ink-700 font-semibold">{item.batchNo}</td>
                        <td className="py-2 px-2 text-ink-600">{item.expiryDate}</td>
                        <td className="py-2 px-2 text-ink-500 font-sans text-[11px] capitalize">
                          {item.looseUnit}/{item.packUnit}
                        </td>
                        {mode === "manager" ? (
                          <>
                            <td className="py-2 px-2 text-right font-medium text-ink-700">
                              {item.systemQty ?? "—"}
                            </td>
                            <td className="py-2 px-2 text-right font-semibold text-ink-900">
                              {item.countedQty ?? "Pending"}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-bold ${
                                (item.varianceQty || 0) < 0
                                  ? "text-rose-600"
                                  : (item.varianceQty || 0) > 0
                                  ? "text-emerald-600"
                                  : "text-ink-500"
                              }`}
                            >
                              {item.varianceQty !== null
                                ? (item.varianceQty > 0 ? `+${item.varianceQty}` : item.varianceQty)
                                : "—"}
                            </td>
                            <td className="py-2 px-2 text-right text-ink-700">
                              {formatINR(item.varianceCostPaise)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 px-2 border-l border-ink-200 bg-amber-50/10">
                              <div className="h-6 w-full border border-dashed border-ink-300 rounded bg-white" />
                            </td>
                            <td className="py-2 px-2 border-l border-ink-200 text-ink-400">
                              <div className="h-6 w-full border-b border-dotted border-ink-200" />
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Footer Signatures */}
          <div className="mt-12 pt-8 border-t border-ink-200 break-inside-avoid">
            <div className="grid grid-cols-2 gap-12 text-xs">
              <div>
                <p className="font-semibold text-ink-800">Count Conducted By:</p>
                <div className="mt-8 border-b border-ink-400 w-3/4" />
                <p className="text-[11px] text-ink-500 mt-1">Staff Signature & Date</p>
              </div>
              <div>
                <p className="font-semibold text-ink-800">Audit Verified & Approved By:</p>
                <div className="mt-8 border-b border-ink-400 w-3/4" />
                <p className="text-[11px] text-ink-500 mt-1">Pharmacist / Supervisor Signature & Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
