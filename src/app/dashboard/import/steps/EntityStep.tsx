"use client";

import React from "react";
import { Pill, Boxes, Users, Truck, Check } from "lucide-react";
import { ImportEntity } from "@/server/domain/import/types";

interface EntityStepProps {
  selectedEntity: ImportEntity;
  onSelectEntity: (entity: ImportEntity) => void;
  selectedStoreId: string;
  onSelectStore: (storeId: string) => void;
  stores: { id: string; name: string; code: string }[];
  onNext: () => void;
}

export function EntityStep({
  selectedEntity,
  onSelectEntity,
  selectedStoreId,
  onSelectStore,
  stores,
  onNext,
}: EntityStepProps) {
  const ENTITY_OPTIONS: {
    id: ImportEntity;
    title: string;
    description: string;
    icon: React.ElementType;
    badge: string;
  }[] = [
    {
      id: "medicines",
      title: "Medicines Master",
      description: "Drug names, packaging, HSN codes, GST rates, schedules (H/H1/X), MRP, and purchase rates.",
      icon: Pill,
      badge: "Catalog Master",
    },
    {
      id: "batches",
      title: "Opening Stock & Batches",
      description: "Batch numbers, expiry dates, closing quantities, purchase costs, and store inventory ledger opening entries.",
      icon: Boxes,
      badge: "Store Inventory",
    },
    {
      id: "customers",
      title: "Customers / Patients",
      description: "Patient phone numbers, names, addresses, GSTINs, credit limits, and opening credit balances.",
      icon: Users,
      badge: "CRM Master",
    },
    {
      id: "suppliers",
      title: "Suppliers / Distributors",
      description: "Distributor trade names, contact persons, mobile numbers, drug licenses, and opening payables.",
      icon: Truck,
      badge: "Accounts Payable",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
        <h2 className="text-xl font-bold text-ink-900 tracking-tight">Select Migration Entity</h2>
        <p className="text-sm text-ink-500 mt-1">
          Choose the data type you want to import from your legacy software (Marg ERP, GoFrugal, etc.).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ENTITY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selectedEntity === opt.id;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectEntity(opt.id)}
              className={`relative flex flex-col items-start p-5 rounded-2xl border text-left transition-all ${
                isSelected
                  ? "border-brand-600 bg-brand-50/40 ring-2 ring-brand-500/20 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-3">
                <div
                  className={`h-11 w-11 rounded-xl flex items-center justify-center ${
                    isSelected ? "bg-brand-600 text-white shadow-md shadow-brand-500/20" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                    isSelected ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {opt.badge}
                </span>
              </div>

              <h3 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                {opt.title}
                {isSelected && <Check className="h-4 w-4 text-brand-600" />}
              </h3>
              <p className="text-xs text-ink-500 mt-1.5 leading-relaxed">{opt.description}</p>
            </button>
          );
        })}
      </div>

      {selectedEntity === "batches" && (
        <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
            <Boxes className="h-4 w-4 text-amber-600" />
            <span>Target Store / Branch for Opening Stock</span>
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            Opening stock batches are created strictly within the selected store and will generate opening inventory ledger movements.
          </p>
          <div className="max-w-md">
            <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-1.5">
              Select Branch
            </label>
            <select
              value={selectedStoreId}
              onChange={(e) => onSelectStore(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onNext}
          className="btn btn-primary px-6 py-2.5 rounded-xl font-medium shadow-sm hover:shadow transition-all"
        >
          Next: Upload File →
        </button>
      </div>
    </div>
  );
}

