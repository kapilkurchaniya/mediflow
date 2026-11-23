"use client";

import { useActionState, useEffect, useState } from "react";
import { addOpeningStock } from "@/app/actions/stock";
import { getMedicines } from "@/app/actions/inventory";
import { AlertCircle, Check, Info } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, FormSection, Field } from "@/app/components/ui";

interface RawMedicine {
  id?: string;
  genericName?: string | null;
  unit?: string | null;
  packSize?: string | null;
  unitsPerPack?: number;
  packUnit?: string | null;
  looseUnit?: string | null;
  purchasePrice?: number | null;
  mrp?: number;
  salePrice?: number | null;
}

export default function NewBatchPage() {
  const [medicines, setMedicines] = useState<{ id: string; name: string; raw: RawMedicine }[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<RawMedicine | null>(null);
  const [packCount, setPackCount] = useState("");
  const [looseCount, setLooseCount] = useState("");

  useEffect(() => {
    getMedicines().then((data) => {
      setMedicines(data.map((m) => ({ id: m.medicine.id, name: m.medicine.name, raw: m.medicine })));
    });
  }, []);

  const [state, formAction, isPending] = useActionState(async (prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
    const res = await addOpeningStock(formData);
    if (res.success) {
      redirect("/dashboard/inventory/batches");
    }
    return res;
  }, null);

  const handleMedicineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const found = medicines.find((m) => m.id === e.target.value);
    setSelectedMedicine(found ? found.raw : null);
  };

  return (
    <div className="page mx-auto max-w-5xl space-y-6">
      <PageHeader
        backHref="/dashboard/inventory/batches"
        title="Opening stock"
        description="Record stock already on your shelves into a batch."
      />

      <form action={formAction} className="card">
        <div className="card-body !p-6 lg:!p-8">
          {state?.error && (
            <div className="alert-error mb-6">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {state.error}
            </div>
          )}

          <FormSection title="Item" description="Choose the item from your item master.">
            <Field label="Item" required className="sm:col-span-2" htmlFor="medicineId">
              <select id="medicineId" name="medicineId" required onChange={handleMedicineChange} className="input">
                <option value="">Select an item…</option>
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            {selectedMedicine && (
              <div className="sm:col-span-2 flex items-start gap-2.5 rounded-lg border border-sky-200/70 bg-sky-50 px-3.5 py-2.5 text-[12.5px] text-sky-800">
                <Info className="h-4 w-4 mt-px shrink-0" />
                <span>
                  {selectedMedicine.genericName || "No composition"} · <span className="capitalize">{selectedMedicine.unit}</span>
                  {selectedMedicine.packSize ? ` · ${selectedMedicine.packSize}` : ""}. Prices below are pre-filled from the item master.
                </span>
              </div>
            )}
          </FormSection>

          <FormSection title="Batch" description="As printed on the strip or carton.">
            <Field label="Batch number" required htmlFor="batchNo">
              <input id="batchNo" name="batchNo" required className="input font-mono uppercase" placeholder="BT-99382" />
            </Field>
            <Field label="Expiry date" required htmlFor="expiryDate">
              <input id="expiryDate" type="date" name="expiryDate" required className="input num" />
            </Field>
            {(selectedMedicine?.unitsPerPack ?? 1) > 1 ? (
              <>
                <input
                  type="hidden"
                  name="qty"
                  value={
                    (parseInt(packCount || "0", 10) || 0) * (selectedMedicine?.unitsPerPack ?? 1) +
                    (parseInt(looseCount || "0", 10) || 0)
                  }
                />
                <Field
                  label={`Quantity (${selectedMedicine?.packUnit || "strip"}s + ${selectedMedicine?.looseUnit || "tablet"}s)`}
                  required
                  htmlFor="packCount"
                  hint={`1 ${selectedMedicine?.packUnit || "strip"} = ${selectedMedicine?.unitsPerPack} ${selectedMedicine?.looseUnit || "tablet"}s`}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      id="packCount"
                      type="number"
                      min="0"
                      value={packCount}
                      onChange={(e) => setPackCount(e.target.value)}
                      className="input num"
                      placeholder={`${selectedMedicine?.packUnit || "Strips"}`}
                    />
                    <input
                      type="number"
                      min="0"
                      value={looseCount}
                      onChange={(e) => setLooseCount(e.target.value)}
                      className="input num"
                      placeholder={`Loose ${selectedMedicine?.looseUnit || "tabs"}`}
                    />
                  </div>
                </Field>
              </>
            ) : (
              <Field label="Quantity (units)" required htmlFor="qty">
                <input id="qty" type="number" name="qty" required min="1" className="input num" placeholder="100" />
              </Field>
            )}
          </FormSection>

          <FormSection title="Pricing (per unit)" description="Used for stock valuation and default billing rate.">
            <Field label="Purchase rate (PTR)" htmlFor="purchaseRate" hint="Defaults to 80% of MRP if left blank.">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">₹</span>
                <input
                  id="purchaseRate"
                  key={`purchase-${selectedMedicine?.id ?? "none"}`}
                  type="number"
                  name="purchaseRate"
                  step="0.01"
                  min="0"
                  defaultValue={
                    selectedMedicine
                      ? selectedMedicine.purchasePrice
                        ? (selectedMedicine.purchasePrice / 100).toFixed(2)
                        : selectedMedicine.mrp
                          ? ((selectedMedicine.mrp * 0.8) / 100).toFixed(2)
                          : ""
                      : ""
                  }
                  className="input pl-7 num"
                  placeholder="0.00"
                />
              </div>
            </Field>
            <Field label="MRP" htmlFor="mrp">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">₹</span>
                <input
                  id="mrp"
                  key={`mrp-${selectedMedicine?.id ?? "none"}`}
                  type="number"
                  name="mrp"
                  step="0.01"
                  min="0"
                  defaultValue={selectedMedicine ? (selectedMedicine.mrp || 0) / 100 : ""}
                  className="input pl-7 num"
                  placeholder="0.00"
                />
              </div>
            </Field>
            <Field label="Sale rate" htmlFor="saleRate" hint="Defaults to MRP if left blank.">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">₹</span>
                <input
                  id="saleRate"
                  key={`sale-${selectedMedicine?.id ?? "none"}`}
                  type="number"
                  name="saleRate"
                  step="0.01"
                  min="0"
                  defaultValue={selectedMedicine && selectedMedicine.salePrice ? selectedMedicine.salePrice / 100 : ""}
                  className="input pl-7 num"
                  placeholder="0.00"
                />
              </div>
            </Field>
          </FormSection>
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-xl border-t border-ink-150 bg-ink-50/60 px-6 py-3.5">
          <Link href="/dashboard/inventory/batches" className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            <Check /> {isPending ? "Recording…" : "Record stock"}
          </button>
        </div>
      </form>
    </div>
  );
}
