"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Percent, Coins, Layers, ArrowLeft, Loader2 } from "lucide-react";
import { createScheme } from "@/app/actions/schemes";

export function NewSchemeForm({
  medicines,
  suppliers,
  categories,
}: {
  medicines: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [schemeType, setSchemeType] = useState<"free_qty" | "percentage" | "flat" | "tiered">("free_qty");
  const [scope, setScope] = useState<"medicine" | "category" | "supplier" | "store">("medicine");
  const [medicineId, setMedicineId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");

  const [buyQty, setBuyQty] = useState(10);
  const [freeQty, setFreeQty] = useState(1);
  const [discountPercent, setDiscountPercent] = useState(5.0);
  const [flatDiscountRs, setFlatDiscountRs] = useState(50);
  const [minQty, setMinQty] = useState(10);

  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await createScheme({
        name,
        schemeType,
        medicineId: scope === "medicine" ? medicineId : undefined,
        categoryId: scope === "category" ? categoryId : undefined,
        supplierId: scope === "supplier" ? supplierId : undefined,
        buyQty: schemeType === "free_qty" || schemeType === "tiered" ? buyQty : 0,
        freeQty: schemeType === "free_qty" || schemeType === "tiered" ? freeQty : 0,
        discountBp:
          schemeType === "percentage" || schemeType === "tiered"
            ? Math.round(discountPercent * 100)
            : 0,
        flatDiscount: schemeType === "flat" ? Math.round(flatDiscountRs * 100) : 0,
        minQty,
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
      });

      if (res.error) {
        setError(res.error);
      } else {
        router.push("/dashboard/settings/schemes");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl p-6 space-y-6">
      {error && (
        <div className="p-3 text-xs bg-red-50 text-red-800 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Scheme Name */}
      <div>
        <label className="label">Scheme / Promotion Title *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Paracetamol Monsoon Buy 10 Get 1 Free Deal"
          className="input text-xs"
          required
        />
      </div>

      {/* Scheme Type Selector */}
      <div>
        <label className="label mb-2 block">Scheme Promotion Type *</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => {
              setSchemeType("free_qty");
              setMinQty(buyQty);
            }}
            className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
              schemeType === "free_qty"
                ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600"
                : "border-ink-200 hover:bg-ink-50/50"
            }`}
          >
            <Gift className={`h-4 w-4 ${schemeType === "free_qty" ? "text-brand-600" : "text-ink-400"}`} />
            <div className="mt-2">
              <span className="text-xs font-bold text-ink-900 block">Buy X Get Y</span>
              <span className="text-[11px] text-ink-500">Free bonus units</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSchemeType("percentage")}
            className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
              schemeType === "percentage"
                ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600"
                : "border-ink-200 hover:bg-ink-50/50"
            }`}
          >
            <Percent className={`h-4 w-4 ${schemeType === "percentage" ? "text-brand-600" : "text-ink-400"}`} />
            <div className="mt-2">
              <span className="text-xs font-bold text-ink-900 block">Percentage</span>
              <span className="text-[11px] text-ink-500">Volume discount %</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSchemeType("flat")}
            className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
              schemeType === "flat"
                ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600"
                : "border-ink-200 hover:bg-ink-50/50"
            }`}
          >
            <Coins className={`h-4 w-4 ${schemeType === "flat" ? "text-brand-600" : "text-ink-400"}`} />
            <div className="mt-2">
              <span className="text-xs font-bold text-ink-900 block">Flat Amount</span>
              <span className="text-[11px] text-ink-500">Direct cash reduction</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSchemeType("tiered")}
            className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
              schemeType === "tiered"
                ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600"
                : "border-ink-200 hover:bg-ink-50/50"
            }`}
          >
            <Layers className={`h-4 w-4 ${schemeType === "tiered" ? "text-brand-600" : "text-ink-400"}`} />
            <div className="mt-2">
              <span className="text-xs font-bold text-ink-900 block">Tiered Combo</span>
              <span className="text-[11px] text-ink-500">Free goods + % off</span>
            </div>
          </button>
        </div>
      </div>

      {/* Scope Selector */}
      <div className="space-y-3">
        <label className="label block">Applicable Target Scope *</label>
        <div className="flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer bg-ink-50 px-3 py-1.5 rounded-lg border border-ink-200">
            <input
              type="radio"
              name="scope"
              checked={scope === "medicine"}
              onChange={() => setScope("medicine")}
            />
            Specific Medicine
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer bg-ink-50 px-3 py-1.5 rounded-lg border border-ink-200">
            <input
              type="radio"
              name="scope"
              checked={scope === "category"}
              onChange={() => setScope("category")}
            />
            Product Category
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer bg-ink-50 px-3 py-1.5 rounded-lg border border-ink-200">
            <input
              type="radio"
              name="scope"
              checked={scope === "supplier"}
              onChange={() => setScope("supplier")}
            />
            Distributor / Supplier Deal
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer bg-ink-50 px-3 py-1.5 rounded-lg border border-ink-200">
            <input
              type="radio"
              name="scope"
              checked={scope === "store"}
              onChange={() => setScope("store")}
            />
            Store-wide (All Products)
          </label>
        </div>

        {scope === "medicine" && (
          <div>
            <label className="label">Select Medicine *</label>
            <select
              value={medicineId}
              onChange={(e) => setMedicineId(e.target.value)}
              className="input text-xs"
              required
            >
              <option value="">-- Choose Medicine --</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {scope === "category" && (
          <div>
            <label className="label">Select Category *</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input text-xs"
              required
            >
              <option value="">-- Choose Category --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {scope === "supplier" && (
          <div>
            <label className="label">Select Supplier *</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="input text-xs"
              required
            >
              <option value="">-- Choose Supplier --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Terms Values */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-ink-50/60 border border-ink-150">
        {(schemeType === "free_qty" || schemeType === "tiered") && (
          <>
            <div>
              <label className="label">Buy Quantity (Trigger Threshold)</label>
              <input
                type="number"
                min="1"
                value={buyQty}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setBuyQty(val);
                  setMinQty(val);
                }}
                className="input text-xs"
                required
              />
            </div>
            <div>
              <label className="label">Free Bonus Quantity</label>
              <input
                type="number"
                min="1"
                value={freeQty}
                onChange={(e) => setFreeQty(Number(e.target.value))}
                className="input text-xs"
                required
              />
            </div>
          </>
        )}

        {(schemeType === "percentage" || schemeType === "tiered") && (
          <div>
            <label className="label">Discount Percentage (%)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              className="input text-xs"
              required
            />
          </div>
        )}

        {schemeType === "flat" && (
          <div>
            <label className="label">Flat Discount Amount (₹)</label>
            <input
              type="number"
              min="1"
              value={flatDiscountRs}
              onChange={(e) => setFlatDiscountRs(Number(e.target.value))}
              className="input text-xs"
              required
            />
          </div>
        )}

        <div>
          <label className="label">Minimum Purchase Quantity</label>
          <input
            type="number"
            min="1"
            value={minQty}
            onChange={(e) => setMinQty(Number(e.target.value))}
            className="input text-xs"
            required
          />
        </div>
      </div>

      {/* Validity Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Valid From (Optional)</label>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="input text-xs"
          />
        </div>
        <div>
          <label className="label">Valid To (Optional)</label>
          <input
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            className="input text-xs"
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="pt-4 border-t border-ink-150 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn btn-secondary text-xs"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary text-xs"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          Save Scheme
        </button>
      </div>
    </form>
  );
}
