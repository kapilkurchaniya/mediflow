"use client";

import { useActionState, useEffect, useState } from "react";
import { createMedicine, getCategories, getManufacturers, createCategory, createManufacturer } from "@/app/actions/inventory";
import { getRacks } from "@/app/actions/racks";
import { AlertCircle, Check, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, FormSection, Field } from "@/app/components/ui";

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

  useEffect(() => {
    // Load categories, manufacturers, and racks on mount
    getCategories().then(setCategories);
    getManufacturers().then(setManufacturers);
    getRacks().then((data) => setRacks(data || []));
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

          <FormSection title="Packaging & compliance" description="Unit of sale, barcode and scheduling under the Drugs & Cosmetics Act.">
            <Field label="Unit" htmlFor="unit">
              <select id="unit" name="unit" className="input">
                <option value="strip">Strip</option>
                <option value="bottle">Bottle</option>
                <option value="pack">Pack</option>
                <option value="box">Box</option>
                <option value="vial">Vial</option>
                <option value="tube">Tube</option>
                <option value="piece">Piece</option>
              </select>
            </Field>
            <Field label="Pack size" htmlFor="packSize">
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
              <select id="rackId" name="rackId" className="input">
                <option value="">No rack assigned</option>
                {racks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
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
