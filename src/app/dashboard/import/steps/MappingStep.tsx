"use client";

import React, { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { ImportEntity } from "@/server/domain/import/types";
import { saveJobMappingAction } from "@/app/actions/import";

interface MappingStepProps {
  jobId: string;
  entity: ImportEntity;
  headers: string[];
  sampleRows: Record<string, string>[];
  initialMapping: Record<string, string>;
  onMappingSaved: () => void;
  onBack: () => void;
}

const ENTITY_TARGET_FIELDS: Record<
  ImportEntity,
  { key: string; label: string; required: boolean; hint?: string }[]
> = {
  medicines: [
    { key: "name", label: "Medicine / Item Name", required: true, hint: "Brand name, e.g. DOLO 650" },
    { key: "packaging", label: "Packaging / Pack Size", required: false, hint: "e.g. 15 TAB, 100 ML" },
    { key: "mrp", label: "MRP (Maximum Retail Price)", required: true, hint: "e.g. 34.00" },
    { key: "saleRate", label: "Sale Rate / Billing Price", required: false, hint: "Selling rate without discount" },
    { key: "purchaseCost", label: "Purchase Cost / Rate", required: false, hint: "Distributor net rate" },
    { key: "gstRate", label: "GST % Rate", required: false, hint: "e.g. 5%, 12%" },
    { key: "hsn", label: "HSN Code", required: false, hint: "e.g. 300490" },
    { key: "schedule", label: "Drug Schedule", required: false, hint: "H, H1, X, or Regular" },
    { key: "composition", label: "Salt Composition / Generic", required: false, hint: "e.g. Paracetamol 650mg" },
    { key: "manufacturerName", label: "Company / Manufacturer", required: false, hint: "e.g. Micro Labs" },
    { key: "categoryName", label: "Category / Group", required: false, hint: "e.g. Analgesics" },
    { key: "barcode", label: "Barcode / EAN", required: false },
    { key: "code", label: "Legacy Item Code", required: false },
  ],
  batches: [
    { key: "medicineCodeOrName", label: "Medicine Name or Code", required: true, hint: "Matches existing catalog" },
    { key: "batchNo", label: "Batch Number", required: true, hint: "e.g. D2401" },
    { key: "expiryDate", label: "Expiry Date", required: true, hint: "MM/YY, MM/YYYY, or DD/MM/YYYY" },
    { key: "closingQty", label: "Closing / On-Hand Quantity", required: true, hint: "Physical stock on shelf" },
    { key: "purchaseRate", label: "Purchase Cost (per unit)", required: true, hint: "Cost per strip/unit" },
    { key: "mrp", label: "MRP", required: true, hint: "Maximum retail price" },
    { key: "saleRate", label: "Sale Rate", required: false },
    { key: "barcode", label: "Batch Barcode", required: false },
  ],
  customers: [
    { key: "name", label: "Customer / Patient Name", required: true },
    { key: "phone", label: "Phone / Mobile Number", required: false, hint: "10-digit mobile" },
    { key: "mobile", label: "Secondary Mobile", required: false },
    { key: "address", label: "Address", required: false },
    { key: "city", label: "City", required: false },
    { key: "gstin", label: "GSTIN (for B2B Customers)", required: false },
    { key: "creditLimit", label: "Credit Limit (₹)", required: false },
    { key: "openingBalance", label: "Opening Balance (₹)", required: false },
    { key: "code", label: "Legacy Customer Code", required: false },
  ],
  suppliers: [
    { key: "name", label: "Distributor / Supplier Name", required: true },
    { key: "contactPerson", label: "Contact Person / Rep", required: false },
    { key: "phone", label: "Phone / Mobile", required: false },
    { key: "address", label: "Address", required: false },
    { key: "city", label: "City", required: false },
    { key: "gstin", label: "GSTIN", required: false },
    { key: "dlNo", label: "Drug License Number", required: false },
    { key: "creditDays", label: "Credit Payment Days", required: false, hint: "e.g. 21, 30" },
    { key: "openingBalance", label: "Opening Payable Balance (₹)", required: false },
    { key: "code", label: "Legacy Supplier Code", required: false },
  ],
  doctors: [
    { key: "name", label: "Doctor Name", required: true },
    { key: "regNo", label: "Medical Registration Number", required: false },
    { key: "specialization", label: "Specialization", required: false },
  ],
};

export function MappingStep({
  jobId,
  entity,
  headers,
  sampleRows,
  initialMapping,
  onMappingSaved,
  onBack,
}: MappingStepProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const targetFields = ENTITY_TARGET_FIELDS[entity] || [];
  const requiredFields = targetFields.filter((f) => f.required);

  const mappedTargetValues = Object.values(mapping).filter(Boolean);
  const missingRequired = requiredFields.filter((rf) => !mappedTargetValues.includes(rf.key));

  const handleFieldChange = (csvHeader: string, targetKey: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (!targetKey) {
        delete next[csvHeader];
      } else {
        // Prevent assigning the same target to two different columns
        for (const [k, v] of Object.entries(next)) {
          if (v === targetKey && k !== csvHeader) {
            delete next[k];
          }
        }
        next[csvHeader] = targetKey;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (missingRequired.length > 0) {
      setErrorMessage(
        `Please map all required fields: ${missingRequired.map((f) => f.label).join(", ")}.`
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const res = await saveJobMappingAction({ jobId, mapping });
      if (!res.success) throw new Error("Failed to save column mapping.");
      onMappingSaved();
    } catch (err: unknown) {
      console.error("Save mapping error:", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-xl font-bold text-ink-900 tracking-tight">Review & Map Columns</h2>
        <p className="text-sm text-ink-500 mt-1">
          Verify how source columns map into MediFlow fields. Preset synonyms have been auto-matched.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {errorMessage}
        </div>
      )}

      {missingRequired.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-center justify-between">
          <span>
            Required fields yet to be mapped:{" "}
            <strong>{missingRequired.map((f) => f.label).join(", ")}</strong>
          </span>
          <span className="font-semibold px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-800">
            {missingRequired.length} missing
          </span>
        </div>
      )}

      {/* Mapping Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs divide-y divide-slate-200">
          <thead className="bg-slate-50 text-ink-700 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3 w-1/3">Source Column (CSV)</th>
              <th className="px-5 py-3 w-1/4">Sample Value</th>
              <th className="px-5 py-3 w-5/12">MediFlow Target Field</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {headers.map((header) => {
              const currentTarget = mapping[header] || "";
              const sampleVal = sampleRows[0]?.[header] || sampleRows[1]?.[header] || "";

              return (
                <tr key={header} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-ink-900 text-sm">{header}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-1 rounded-md bg-slate-100 text-ink-600 font-mono text-[11px] truncate max-w-[200px] inline-block">
                      {sampleVal ? String(sampleVal) : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={currentTarget}
                      onChange={(e) => handleFieldChange(header, e.target.value)}
                      className={`w-full h-9 px-3 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 transition-all ${
                        currentTarget
                          ? "border-emerald-300 bg-emerald-50/20 text-ink-900 focus:ring-emerald-500/20 focus:border-emerald-500"
                          : "border-slate-300 bg-white text-ink-500 focus:ring-brand-500/20 focus:border-brand-500"
                      }`}
                    >
                      <option value="">— Do not import (Skip) —</option>
                      {targetFields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} {f.required ? "*(Required)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          disabled={isSaving}
          onClick={onBack}
          className="btn btn-secondary px-5 py-2.5 rounded-xl font-medium flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="btn btn-primary px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Validating...
            </>
          ) : (
            <>
              Next: Validate & Review <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
