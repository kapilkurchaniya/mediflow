"use client";

import { Layers } from "lucide-react";
import type { ParsedStockRow } from "@/lib/stock-csv-validator";
import { parsePackAndLooseQty, type QtyMode } from "@/lib/packaging";
import { enrichMedicineDetails } from "@/app/actions/ai-enrichment";

export function updateRowUnitsPerPack(row: ParsedStockRow, rawUpp: number): ParsedStockRow {
  const upp = Math.max(1, Math.min(1000, Math.round(Number.isFinite(rawUpp) ? rawUpp : 1)));
  const warnings =
    upp > 1
      ? row.warnings.filter((w) => !w.startsWith("No pack size specified"))
      : row.warnings;

  return {
    ...row,
    warnings,
    mapped: {
      ...row.mapped,
      unitsPerPack: upp,
      ...(upp > 1 && !row.mapped.packSize ? { packSize: `${upp}'s` } : {}),
    },
  };
}

export function applyBulkUnitsPerPack(rows: ParsedStockRow[], upp: number): ParsedStockRow[] {
  return rows.map((row) =>
    row.isSolidDoseCandidate && (row.mapped.unitsPerPack ?? 1) === 1
      ? updateRowUnitsPerPack(row, upp)
      : row
  );
}

export function getRowBaseQtyPreview(row: ParsedStockRow, qtyMode: QtyMode): {
  upp: number;
  baseQty: number;
} {
  const upp = Math.max(1, row.mapped.unitsPerPack ?? 1);
  const { baseQty } = parsePackAndLooseQty(
    row.mapped.rawQtyText ?? row.mapped.qty ?? 0,
    row.mapped.looseQty,
    upp,
    qtyMode
  );
  return { upp, baseQty };
}

export function rowNeedsAiEnrichment(row: ParsedStockRow): boolean {
  if (!row.mapped.medicineName) return false;
  const missingMeta =
    row.mapped.mrp === 0 ||
    !row.mapped.mrp ||
    !row.mapped.manufacturer ||
    row.mapped.manufacturer === "Unknown";
  const missingSolidPack = Boolean(row.isSolidDoseCandidate && (row.mapped.unitsPerPack ?? 1) === 1);
  return missingMeta || missingSolidPack;
}

export async function enrichStockRows(
  rows: ParsedStockRow[],
  onProgress: (enriched: number, total: number) => void
): Promise<ParsedStockRow[]> {
  const nextRows = rows.map((r) => ({
    ...r,
    mapped: { ...r.mapped },
    warnings: [...r.warnings],
  }));
  const targets = nextRows.filter(rowNeedsAiEnrichment);
  onProgress(0, targets.length);
  if (targets.length === 0) return nextRows;

  let enrichedCount = 0;
  for (let i = 0; i < nextRows.length; i++) {
    const row = nextRows[i];
    if (!rowNeedsAiEnrichment(row) || !row.mapped.medicineName) continue;

    try {
      const enriched = await enrichMedicineDetails({ medicineName: row.mapped.medicineName });
      if (enriched) {
        if (!row.mapped.manufacturer || row.mapped.manufacturer === "Unknown") {
          row.mapped.manufacturer = enriched.manufacturer;
        }
        if (!row.mapped.category) {
          row.mapped.category = enriched.category;
        }
        if ((row.mapped.mrp === 0 || !row.mapped.mrp) && enriched.mrp > 0) {
          row.mapped.mrp = enriched.mrp;
          row.mapped.saleRate = enriched.mrp;
          if (!row.mapped.purchaseRate || row.mapped.purchaseRate === 0) {
            row.mapped.purchaseRate = Math.round(enriched.mrp * 0.8);
          }
          row.warnings = row.warnings.filter((w) => w !== "MRP is 0");
        }
        if (
          (row.mapped.unitsPerPack ?? 1) === 1 &&
          enriched.unitsPerPack &&
          enriched.unitsPerPack > 1
        ) {
          row.mapped.unitsPerPack = enriched.unitsPerPack;
          row.mapped.packUnit = enriched.packUnit ?? row.mapped.packUnit ?? "strip";
          row.mapped.looseUnit = enriched.looseUnit ?? row.mapped.looseUnit ?? "tablet";
          row.mapped.packSize = `${enriched.unitsPerPack}'s`;
          row.warnings = row.warnings.filter((w) => !w.startsWith("No pack size specified"));
        }
        enrichedCount++;
        onProgress(enrichedCount, targets.length);
      }
    } catch (e) {
      console.error("Enrichment failed for row", i, e);
    }
  }

  return nextRows;
}

interface StockCsvToolbarProps {
  qtyMode: QtyMode;
  onQtyModeChange: (mode: QtyMode) => void;
  updateExistingPackSizes: boolean;
  onUpdateExistingPackSizesChange: (val: boolean) => void;
  unconfiguredSolidCount: number;
  onBulkSetUpp: (upp: number) => void;
}

export function StockCsvToolbar({
  qtyMode,
  onQtyModeChange,
  updateExistingPackSizes,
  onUpdateExistingPackSizesChange,
  unconfiguredSolidCount,
  onBulkSetUpp,
}: StockCsvToolbarProps) {
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink-700 inline-flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-brand-600" />
          CSV Qty is in:
        </span>
        <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => onQtyModeChange("packs")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              qtyMode === "packs"
                ? "bg-brand-600 text-white"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            Packs / Strips (Qty × Units/Pack)
          </button>
          <button
            type="button"
            onClick={() => onQtyModeChange("loose")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              qtyMode === "loose"
                ? "bg-brand-600 text-white"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            Loose Units (individual tablets)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {unconfiguredSolidCount > 0 && (
          <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-2.5 py-1">
            <span>{unconfiguredSolidCount} tablet rows at 1/pack — set all:</span>
            <button
              type="button"
              onClick={() => onBulkSetUpp(10)}
              className="px-1.5 py-0.5 rounded bg-white border border-amber-300 font-mono font-bold hover:bg-amber-100"
            >
              10
            </button>
            <button
              type="button"
              onClick={() => onBulkSetUpp(15)}
              className="px-1.5 py-0.5 rounded bg-white border border-amber-300 font-mono font-bold hover:bg-amber-100"
            >
              15
            </button>
          </div>
        )}

        <label className="inline-flex items-center gap-1.5 text-ink-700 cursor-pointer">
          <input
            type="checkbox"
            checked={updateExistingPackSizes}
            onChange={(e) => onUpdateExistingPackSizesChange(e.target.checked)}
          />
          <span>Update catalog Units/Pack if currently 1</span>
        </label>
      </div>
    </div>
  );
}

