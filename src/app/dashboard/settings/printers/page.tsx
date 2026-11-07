"use client";

import { useState } from "react";
import { PageHeader } from "@/app/components/ui";
import {
  Printer,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  BookOpen,
  DollarSign,
} from "lucide-react";

export default function PrintersSettingsPage() {
  const [format, setFormat] = useState<"80mm" | "58mm" | "a4">("80mm");
  const [cutPaper, setCutPaper] = useState(true);
  const [drawerStatus, setDrawerStatus] = useState<string | null>(null);

  const handlePrintTest = () => {
    window.print();
  };

  const handleTestCashDrawer = () => {
    setDrawerStatus(
      "Signal simulated: In standard web browsers, drawer kicks are triggered automatically via printer driver settings ('Open before/after printing') or an ESC/POS desktop bridge."
    );
    setTimeout(() => setDrawerStatus(null), 8000);
  };

  return (
    <div className="page space-y-6">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Hardware Setup"
          title="Thermal Printer & Receipt Configuration"
          description="Configure 80mm POS receipt layout, test silent kiosk printing, and verify cash drawer triggers."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block">
        {/* Left Column: Hardware Settings & Actions */}
        <div className="lg:col-span-2 space-y-6 print:hidden">
          {/* Format selection */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Printer className="h-4 w-4 text-brand-600" />
              Receipt Paper Format
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <button
                type="button"
                onClick={() => setFormat("80mm")}
                className={`p-3.5 rounded-xl border text-left transition ${
                  format === "80mm"
                    ? "border-brand-500 bg-brand-50/50 text-brand-950 font-semibold ring-1 ring-brand-500"
                    : "border-ink-150 bg-white hover:bg-ink-50/50 text-ink-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-ink-900">80mm Continuous</span>
                  {format === "80mm" && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                </div>
                <p className="text-[11px] text-ink-500">Standard Indian retail pharmacy roll (3-inch / 48 columns).</p>
              </button>

              <button
                type="button"
                onClick={() => setFormat("58mm")}
                className={`p-3.5 rounded-xl border text-left transition ${
                  format === "58mm"
                    ? "border-brand-500 bg-brand-50/50 text-brand-950 font-semibold ring-1 ring-brand-500"
                    : "border-ink-150 bg-white hover:bg-ink-50/50 text-ink-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-ink-900">58mm Mini Roll</span>
                  {format === "58mm" && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                </div>
                <p className="text-[11px] text-ink-500">Compact handheld Bluetooth & desktop thermal slips (2-inch).</p>
              </button>

              <button
                type="button"
                onClick={() => setFormat("a4")}
                className={`p-3.5 rounded-xl border text-left transition ${
                  format === "a4"
                    ? "border-brand-500 bg-brand-50/50 text-brand-950 font-semibold ring-1 ring-brand-500"
                    : "border-ink-150 bg-white hover:bg-ink-50/50 text-ink-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-ink-900">A4 GST Full Sheet</span>
                  {format === "a4" && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                </div>
                <p className="text-[11px] text-ink-500">Full-sheet invoice with complete HSN summary & bank details.</p>
              </button>
            </div>

            <div className="pt-2 border-t border-ink-100 flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-ink-800">
                <input
                  type="checkbox"
                  checked={cutPaper}
                  onChange={(e) => setCutPaper(e.target.checked)}
                  className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                Auto-cut paper at the end of print job (ESC/POS GS V 66 0)
              </label>
            </div>
          </div>

          {/* Action Triggers */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink-900">Interactive Diagnostic Tests</h2>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePrintTest}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs rounded-xl shadow-sm transition active:scale-[0.98]"
              >
                <Printer className="h-4 w-4" />
                Print 80mm Test Receipt
              </button>
              <button
                type="button"
                onClick={handleTestCashDrawer}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink-100 hover:bg-ink-200 text-ink-800 font-medium text-xs rounded-xl transition"
              >
                <DollarSign className="h-4 w-4 text-ink-600" />
                Test RJ-11 Cash Drawer Pulse
              </button>
            </div>

            {drawerStatus && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 animate-enter">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Browser Hardware Boundary</span>
                  {drawerStatus}
                </div>
              </div>
            )}
          </div>

          {/* Runbook link */}
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-sky-700 shrink-0" />
              <div>
                <span className="font-semibold text-sky-950 block">80mm Driver & Kiosk Printing Guide</span>
                Complete step-by-step instructions for Epson, TVS RP-3200, Posiflex, and silent Chrome kiosk flags.
              </div>
            </div>
            <a
              href="/docs/runbooks/printer-setup.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg shrink-0 transition"
            >
              Runbook <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Right Column: 80mm Receipt Live Preview */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-ink-600 uppercase tracking-wider print:hidden">
            80mm Thermal Receipt Preview
          </div>

          <div
            id="thermal-receipt"
            className="w-full max-w-[340px] mx-auto bg-white border border-ink-200 shadow-md p-4 font-mono text-[11px] leading-tight text-ink-900 select-none print:border-none print:shadow-none print:p-0 print:m-0 print:w-[72mm]"
          >
            {/* Header */}
            <div className="text-center pb-2 border-b border-dashed border-ink-300">
              <div className="font-bold text-sm tracking-tight text-ink-950">MEDIFLOW PHARMACY</div>
              <div className="text-[10px] text-ink-600">Main Market Branch, MG Road</div>
              <div className="text-[10px] text-ink-600">DL: 20B/12345/2024 · 21B/12346/2024</div>
              <div className="text-[10px] text-ink-600 font-bold mt-0.5">GSTIN: 27AABCM1234F1Z5</div>
              <div className="text-[10px] text-ink-600">Ph: +91 98765 43210</div>
            </div>

            {/* Bill Meta */}
            <div className="py-2 border-b border-dashed border-ink-300 text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span>INVOICE: #TEST-80MM-001</span>
                <span>CASH COUNTER</span>
              </div>
              <div className="flex justify-between">
                <span>DATE: {new Date().toLocaleDateString("en-IN")}</span>
                <span>TIME: {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="flex justify-between">
                <span>CUST: WALK-IN PHARMACY</span>
                <span>DR: SELF</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-2 border-b border-dashed border-ink-300">
              <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-ink-200">
                <span className="w-1/2">ITEM / BATCH</span>
                <span className="w-1/6 text-right">QTY</span>
                <span className="w-1/6 text-right">MRP</span>
                <span className="w-1/6 text-right">NET</span>
              </div>

              <div className="py-1 space-y-1">
                <div>
                  <div className="font-semibold">PARACETAMOL 650MG TAB</div>
                  <div className="flex justify-between text-[9px] text-ink-600">
                    <span>B: PCM24 · E: 12/26</span>
                    <span className="text-right">10 Tab</span>
                    <span className="text-right">₹30.00</span>
                    <span className="text-right font-semibold">₹27.00</span>
                  </div>
                </div>

                <div>
                  <div className="font-semibold">AZITHROMYCIN 500MG</div>
                  <div className="flex justify-between text-[9px] text-ink-600">
                    <span>B: AZI99 · E: 08/27</span>
                    <span className="text-right">1 Strip</span>
                    <span className="text-right">₹120.00</span>
                    <span className="text-right font-semibold">₹105.00</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="py-2 border-b border-dashed border-ink-300 space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span>SUBTOTAL (2 ITEMS):</span>
                <span>₹132.00</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>TOTAL SAVINGS:</span>
                <span>-₹18.00 (12%)</span>
              </div>
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-ink-200">
                <span>NET PAYABLE:</span>
                <span>₹132.00</span>
              </div>
              <div className="flex justify-between text-[9px] text-ink-500">
                <span>TENDER: CASH</span>
                <span>PAID: ₹132.00</span>
              </div>
            </div>

            {/* GST Summary */}
            <div className="py-2 border-b border-dashed border-ink-300 text-[9px] text-ink-600">
              <div className="flex justify-between font-semibold pb-0.5">
                <span>TAX SLAB</span>
                <span>TAXABLE</span>
                <span>CGST</span>
                <span>SGST</span>
              </div>
              <div className="flex justify-between">
                <span>GST 12%</span>
                <span>₹117.86</span>
                <span>₹7.07</span>
                <span>₹7.07</span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 text-center text-[9px] text-ink-600 space-y-1">
              <div className="font-semibold">** THANK YOU & GET WELL SOON **</div>
              <div>Prescription required for Schedule H/H1 medicines</div>
              <div className="text-[8px] text-ink-400">Powered by Mediflow Pharmacy ERP</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
