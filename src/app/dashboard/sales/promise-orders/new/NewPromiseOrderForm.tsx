"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkCheck, Loader2 } from "lucide-react";
import { createPromiseOrder } from "@/app/actions/promise-orders";

export function NewPromiseOrderForm({
  medicines,
  customers,
}: {
  medicines: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string; phone: string | null }>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [medicineId, setMedicineId] = useState("");
  const [qtyRequested, setQtyRequested] = useState(1);
  const [promisedDate, setPromisedDate] = useState("");
  const [notes, setNotes] = useState("");

  function handleSelectCustomer(id: string) {
    setCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone || "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const selectedMed = medicines.find((m) => m.id === medicineId);
      const res = await createPromiseOrder({
        customerId: customerId || undefined,
        customerName,
        customerPhone,
        medicineId,
        medicineName: selectedMed?.name,
        qtyRequested,
        promisedDate: promisedDate || undefined,
        notes: notes || undefined,
      });

      if (res.error) {
        setError(res.error);
      } else {
        router.push("/dashboard/sales/promise-orders");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-xl p-6 space-y-4">
      {error && (
        <div className="p-3 text-xs bg-red-50 text-red-800 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Select existing customer or enter new */}
      <div>
        <label className="label">Existing Customer (Optional Autocomplete)</label>
        <select
          value={customerId}
          onChange={(e) => handleSelectCustomer(e.target.value)}
          className="input text-xs"
        >
          <option value="">-- Or enter new customer below --</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.phone ? `(${c.phone})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Customer Full Name *</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Ramesh Sharma"
            className="input text-xs"
            required
          />
        </div>
        <div>
          <label className="label">Mobile Number *</label>
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="e.g. 9876543210"
            className="input text-xs font-mono"
            required
          />
        </div>
      </div>

      <div>
        <label className="label">Medicine Demanded *</label>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Quantity Needed *</label>
          <input
            type="number"
            min="1"
            value={qtyRequested}
            onChange={(e) => setQtyRequested(Number(e.target.value))}
            className="input text-xs font-mono"
            required
          />
        </div>
        <div>
          <label className="label">Promised Arrival Date (Optional)</label>
          <input
            type="date"
            value={promisedDate}
            onChange={(e) => setPromisedDate(e.target.value)}
            className="input text-xs"
          />
        </div>
      </div>

      <div>
        <label className="label">Notes / Instructions (Optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Call immediately when stock arrives, patient needs for surgery"
          rows={2}
          className="input text-xs"
        />
      </div>

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
          Record Promise Order
        </button>
      </div>
    </form>
  );
}
