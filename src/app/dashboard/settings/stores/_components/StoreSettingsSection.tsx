"use client";

interface Props {
  requireShift: boolean;
  setRequireShift: (v: boolean) => void;
  maxDiscountPercent: string;
  setMaxDiscountPercent: (v: string) => void;
  printFormat: string;
  setPrintFormat: (v: "thermal_80mm" | "thermal_58mm" | "a4") => void;
  defaultPaymentMethod: string;
  setDefaultPaymentMethod: (v: "cash" | "upi" | "card" | "credit") => void;
}

export function StoreSettingsSection({
  requireShift,
  setRequireShift,
  maxDiscountPercent,
  setMaxDiscountPercent,
  printFormat,
  setPrintFormat,
  defaultPaymentMethod,
  setDefaultPaymentMethod,
}: Props) {
  return (
    <div className="card p-6 space-y-4">
      <h2 className="text-base font-semibold text-ink-900 border-b border-ink-100 pb-3">
        Operational & POS Controls
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex items-center gap-3 p-3.5 rounded-lg border border-ink-200 cursor-pointer hover:bg-ink-50 sm:col-span-2">
          <input
            type="checkbox"
            checked={requireShift}
            onChange={(e) => setRequireShift(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <div className="text-sm font-medium text-ink-900">Enforce Cash Register Shift (requireShift)</div>
            <div className="text-xs text-ink-500">Cashier must open a register session with opening float before billing.</div>
          </div>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">Max Cashier Discount % (Blank = No Limit)</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={maxDiscountPercent}
            onChange={(e) => setMaxDiscountPercent(e.target.value)}
            placeholder="e.g. 10 for 10%"
            className="mt-1 block w-full input"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">Default Payment Tender</span>
          <select
            value={defaultPaymentMethod}
            onChange={(e) => setDefaultPaymentMethod(e.target.value as "cash" | "upi" | "card" | "credit")}
            className="mt-1 block w-full input"
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI / QR</option>
            <option value="card">Card (POS Terminal)</option>
            <option value="credit">Customer Credit / Ledger</option>
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-ink-700">Default Receipt Print Format</span>
          <select
            value={printFormat}
            onChange={(e) => setPrintFormat(e.target.value as "thermal_80mm" | "thermal_58mm" | "a4")}
            className="mt-1 block w-full input"
          >
            <option value="thermal_80mm">Thermal 80mm Roll (Recommended)</option>
            <option value="thermal_58mm">Thermal 58mm Roll</option>
            <option value="a4">Standard A4 Tax Invoice</option>
          </select>
        </label>
      </div>
    </div>
  );
}
