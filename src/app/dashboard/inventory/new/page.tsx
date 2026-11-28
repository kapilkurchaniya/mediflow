"use client";

import { useActionState, useEffect, useState } from "react";
import { createMedicine, getCategories, getManufacturers, createCategory, createManufacturer } from "@/app/actions/inventory";
import { getRacks } from "@/app/actions/racks";
import { AlertCircle, Check, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, FormSection, Field } from "@/app/components/ui";
import { RackSelectorField } from "../_components/RackSelectorField";
import { MEDICINE_SEGMENTS } from "@/lib/inventory/medicine-segments";

function InlineCreate({
  value,
  onChange,
  onAdd,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd();
          }
        }}
        placeholder={placeholder}
        className="input input-sm flex-1"
      />
      <button type="button" onClick={onAdd} disabled={!value} className="btn btn-secondary btn-sm">
        <Plus /> Add
      </button>
    </div>
  );
}

export default function NewMedicinePage() {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [manufacturers, setManufacturers] = useState<{ id: string; name: string }[]>([]);
  const [racks, setRacks] = useState<{ id: string; code: string; name: string }[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newMfgName, setNewMfgName] = useState("");
  const [packUnit, setPackUnit] = useState("strip");
  const [unitsPerPack, setUnitsPerPack] = useState("10");
  const [looseUnit, setLooseUnit] = useState("tablet");
  const [selectedRackId, setSelectedRackId] = useState("");

  useEffect(() => {
    // Load categories, manufacturers, and racks on mount
    getCategories().then(setCategories).catch(() => {});
    getManufacturers().then(setManufacturers).catch(() => {});
    getRacks().then((data) => setRacks(data || [])).catch(() => {});
  }, []);

  const [state, formAction, isPending] = useActionState(async (prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
    const res = await createMedicine(formData);
    if (res.success) {
      redirect("/dashboard/inventory");
    }
    return res;
  }, null);

  const handleAddCategory = async () => {
    if (!newCatName) return;
    const res = await createCategory(newCatName);
    if (res.success && res.category) {
      setCategories([...categories, res.category]);
      setNewCatName("");
    }
  };

  const handleAddManufacturer = async () => {
    if (!newMfgName) return;
    const res = await createManufacturer(newMfgName);
    if (res.success && res.manufacturer) {
      setManufacturers([...manufacturers, res.manufacturer]);
      setNewMfgName("");
    }
  };

  return (
    <div className="page mx-auto max-w-5xl space-y-6">
      <PageHeader backHref="/dashboard/inventory" title="New item" description="Add a medicine or product to your item master." />

      <form action={formAction} className="card">
        <div className="card-body !p-6 lg:!p-8">
          {state?.error && (
            <div className="alert-error mb-6">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {state.error}
            </div>
          )}

          <FormSection title="Identification" description="Brand name and salt composition used for search and substitution.">
            <Field label="Item name" required className="sm:col-span-2" htmlFor="name">
              <input id="name" name="name" required className="input" placeholder="Dolo 650 Tablet" autoFocus />
            </Field>
            <Field label="Generic composition" className="sm:col-span-2" htmlFor="genericName">
              <input id="genericName" name="genericName" className="input" placeholder="Paracetamol 650 mg" />
            </Field>
            <Field label="Category" htmlFor="categoryId">
              <select id="categoryId" name="categoryId" className="input">
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <InlineCreate value={newCatName} onChange={setNewCatName} onAdd={handleAddCategory} placeholder="New category" />
            </Field>
            <Field label="Target segment (Male / Female / Kids)" htmlFor="targetSegment">
              <select id="targetSegment" name="targetSegment" defaultValue="general" className="input">
                {MEDICINE_SEGMENTS.map((seg) => (
                  <option key={seg.value} value={seg.value}>
                    {seg.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Manufacturer" htmlFor="manufacturerId">
              <select id="manufacturerId" name="manufacturerId" className="input">
                <option value="">Select manufacturer</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <InlineCreate value={newMfgName} onChange={setNewMfgName} onAdd={handleAddManufacturer} placeholder="New manufacturer" />
            </Field>
          </FormSection>

          <FormSection title="Pricing & tax" description="Default prices. Batch-level MRP from purchases overrides these.">
            <Field label="MRP" htmlFor="mrp">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">₹</span>
                <input id="mrp" type="number" name="mrp" step="0.01" min="0" className="input pl-7 num" placeholder="0.00" />
              </div>
            </Field>
            <Field label="Selling price" htmlFor="salePrice" hint="Defaults to MRP if left blank.">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">₹</span>
                <input id="salePrice" type="number" name="salePrice" step="0.01" min="0" className="input pl-7 num" placeholder="0.00" />
              </div>
            </Field>
            <Field label="GST rate" htmlFor="gstRateBp">
              <select id="gstRateBp" name="gstRateBp" className="input" defaultValue="5">
                <option value="0">0% — Exempt</option>
                <option value="5">5% — Most medicines (GST 2.0)</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </Field>
            <Field label="HSN code" htmlFor="hsn">
              <input id="hsn" name="hsn" className="input font-mono" placeholder="30049099" />
            </Field>
          </FormSection>

          <FormSection title="Packaging & compliance" description="Unit of sale, conversion factor for loose tablet cutting, and drug schedules.">
            <Field label="Pack unit" htmlFor="packUnit" hint="Whole selling package unit.">
              <select
                id="packUnit"
                name="packUnit"
                className="input"
                value={packUnit}
                onChange={(e) => {
                  const val = e.target.value;
                  setPackUnit(val);
                  if (val === "strip") {
                    setLooseUnit("tablet");
                    if (unitsPerPack === "1") setUnitsPerPack("10");
                  } else if (val === "bottle" || val === "vial" || val === "tube") {
                    setLooseUnit("piece");
                    setUnitsPerPack("1");
                  }
                }}
              >
                <option value="strip">Strip</option>
                <option value="bottle">Bottle</option>
                <option value="pack">Pack</option>
                <option value="box">Box</option>
                <option value="vial">Vial</option>
                <option value="tube">Tube</option>
                <option value="piece">Piece</option>
              </select>
            </Field>

            <Field label="Units per pack" htmlFor="unitsPerPack" hint="Number of loose items per pack (e.g. 10 tablets).">
              <input
                id="unitsPerPack"
                name="unitsPerPack"
                type="number"
                min="1"
                step="1"
                className="input font-mono font-bold"
                value={unitsPerPack}
                onChange={(e) => setUnitsPerPack(e.target.value)}
                placeholder="10"
              />
            </Field>

            <Field label="Loose unit" htmlFor="looseUnit" hint="Individual cutting/dispensing unit.">
              <input
                id="looseUnit"
                name="looseUnit"
                className="input"
                value={looseUnit}
                onChange={(e) => setLooseUnit(e.target.value)}
                placeholder="tablet"
              />
            </Field>

            {parseInt(unitsPerPack, 10) > 1 && (
              <div className="sm:col-span-2 rounded-lg bg-brand-50 border border-brand-200 p-3 text-xs text-brand-900 flex items-center justify-between">
                <span className="font-semibold">Strip Cutting Conversion:</span>
                <span className="font-mono font-bold text-brand-800">
                  1 {packUnit.charAt(0).toUpperCase() + packUnit.slice(1)} = {unitsPerPack} {looseUnit.charAt(0).toUpperCase() + looseUnit.slice(1)}s
                </span>
              </div>
            )}

            <Field label="Pack size label" htmlFor="packSize" hint="e.g. 15 tablets, 100 ml">
              <input id="packSize" name="packSize" className="input" placeholder="15 tablets, 100 ml" />
            </Field>
            <Field label="Barcode (EAN / UPC)" htmlFor="barcode">
              <input id="barcode" name="barcode" className="input font-mono" placeholder="Scan or type" />
            </Field>
            <Field label="Schedule" htmlFor="schedule">
              <select id="schedule" name="schedule" className="input">
                <option value="none">None (OTC)</option>
                <option value="H">Schedule H</option>
                <option value="H1">Schedule H1</option>
                <option value="X">Schedule X</option>
                <option value="narcotic">Narcotic</option>
              </select>
            </Field>
            <Field label="Min alert qty (Reorder level)" htmlFor="reorderLevel" hint="Alerts in Notifications & Reorder Suggestions when stock drops to or below this qty.">
              <input id="reorderLevel" name="reorderLevel" type="number" min="0" defaultValue="10" className="input font-mono" />
            </Field>
            <Field label="Max stock target" htmlFor="maxStock" hint="Upper stock cap used by Reorder Suggestions.">
              <input id="maxStock" name="maxStock" type="number" min="0" defaultValue="100" className="input font-mono" />
            </Field>
            <label
              htmlFor="rxRequired"
              className="sm:col-span-2 flex items-start gap-3 rounded-lg border border-ink-150 bg-ink-50/50 p-3.5 transition-colors hover:border-ink-300"
            >
              <input type="checkbox" id="rxRequired" name="rxRequired" className="checkbox mt-0.5" />
              <span>
                <span className="block text-[13px] font-medium text-ink-900">Prescription required (Rx)</span>
                <span className="block text-[12.5px] text-ink-500">
                  The POS will prompt for doctor details before billing this item.
                </span>
              </span>
            </label>
          </FormSection>

          <FormSection title="Storage location" description="Physical shelf or rack where this item is kept in the store.">
            <Field label="Rack / Shelf" htmlFor="rackId" hint="Shown on POS search results so billing staff can locate items instantly." className="sm:col-span-2">
              <RackSelectorField
                id="rackId"
                name="rackId"
                value={selectedRackId}
                onChange={setSelectedRackId}
                racks={racks}
                onRackCreated={(r) => setRacks((prev) => [...prev, r])}
              />
            </Field>
          </FormSection>
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-xl border-t border-ink-150 bg-ink-50/60 px-6 py-3.5">
          <Link href="/dashboard/inventory" className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            <Check /> {isPending ? "Saving…" : "Save item"}
          </button>
        </div>
      </form>
    </div>
  );
}
