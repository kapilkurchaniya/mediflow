"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import {
  Printer,
  CheckCircle2,
  AlertCircle,
  Code2,
  Camera,
  Upload,
  Trash2,
  Sparkles,
  Loader2,
  FileCode2,
  Eye,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import {
  BILLING_TEMPLATE_PLACEHOLDERS,
  getSampleBillingContext,
  renderBillingTemplate,
} from "@/server/domain/sales/template-engine";
import {
  saveBillingTemplateAction,
  setActiveBillingTemplateAction,
  deleteBillingTemplateAction,
  saveStorePrintFormatAction,
  getBillingTemplatesAction,
} from "@/app/actions/billing-templates";

interface TemplateRow {
  id: string;
  storeId: string;
  format: "a4" | "thermal_80mm";
  name: string;
  htmlContent: string;
  isActive: boolean;
  sourceType: "manual" | "ocr";
}

interface StoreOption {
  id: string;
  name: string;
  code: string;
  printFormat: "thermal_80mm" | "thermal_58mm" | "a4";
}

const DEFAULT_A4_HTML = `<style>
  #custom-bill-root { font-family: Arial, sans-serif; color: #111827; padding: 20px; max-width: 210mm; margin: 0 auto; }
  #custom-bill-root .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
  #custom-bill-root h1 { margin: 0; font-size: 20px; text-transform: uppercase; }
  #custom-bill-root table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
  #custom-bill-root th, #custom-bill-root td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
  #custom-bill-root th { background: #f3f4f6; font-weight: 700; }
  #custom-bill-root .num { text-align: right; }
  #custom-bill-root .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
  #custom-bill-root .totals table { width: 280px; }
</style>
<div id="custom-bill-root">
  <div class="hdr">
    <div>
      <h1>{{store.name}}</h1>
      <div style="font-size:12px;">{{store.address}}, {{store.city}} - {{store.pincode}}</div>
      <div style="font-size:12px;">GSTIN: {{store.gstin}} | DL: {{store.drugLicenseNo}} | Ph: {{store.phone}}</div>
    </div>
    <div style="text-align:right;font-size:12px;">
      <div style="font-weight:700;font-size:14px;">TAX INVOICE</div>
      <div>No: <strong>{{sale.invoiceNo}}</strong></div>
      <div>Date: {{sale.invoiceDate}}</div>
    </div>
  </div>
  <div style="font-size:12px;margin-bottom:8px;">
    <strong>Patient / Customer:</strong> {{sale.customerName}} ({{sale.customerPhone}}) &nbsp;|&nbsp;
    <strong>Doctor:</strong> {{sale.doctorName}}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Item Name</th><th>HSN</th><th>Batch</th><th>Exp</th><th>Qty</th>
        <th class="num">MRP</th><th class="num">Rate</th><th class="num">GST</th><th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{this.sno}}</td><td>{{this.name}}</td><td>{{this.hsn}}</td><td>{{this.batchNo}}</td>
        <td>{{this.expiry}}</td><td>{{this.qtyFormatted}}</td><td class="num">{{this.mrp}}</td>
        <td class="num">{{this.rate}}</td><td class="num">{{this.gstPct}}</td><td class="num">{{this.amount}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td class="num">{{totals.subtotal}}</td></tr>
      <tr><td>CGST + SGST</td><td class="num">{{totals.cgst}} + {{totals.sgst}}</td></tr>
      <tr><td><strong>Grand Total</strong></td><td class="num"><strong>{{totals.grandTotal}}</strong></td></tr>
    </table>
  </div>
  <div style="margin-top:16px;font-size:11px;display:flex;justify-content:space-between;border-top:1px dashed #9ca3af;padding-top:8px;">
    <span>Payment: {{sale.paymentSummary}}</span>
    <span>Thank you — Get Well Soon!</span>
  </div>
</div>`;

const DEFAULT_THERMAL_HTML = `<style>
  #custom-bill-root { font-family: monospace; color: #000; width: 72mm; margin: 0 auto; font-size: 11px; line-height: 1.3; }
  #custom-bill-root .center { text-align: center; }
  #custom-bill-root .line { border-top: 1px dashed #000; margin: 6px 0; }
  #custom-bill-root table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  #custom-bill-root .num { text-align: right; }
</style>
<div id="custom-bill-root">
  <div class="center">
    <strong style="font-size:13px;">{{store.name}}</strong><br/>
    <span>{{store.address}}, {{store.city}}</span><br/>
    <span>GSTIN: {{store.gstin}} | DL: {{store.drugLicenseNo}}</span>
  </div>
  <div class="line"></div>
  <div>Inv: {{sale.invoiceNo}} &nbsp; {{sale.invoiceDate}}</div>
  <div>Cust: {{sale.customerName}}</div>
  <div class="line"></div>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amt</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{this.name}}<br/><small>{{this.batchNo}} ({{this.expiry}})</small></td>
        <td class="num">{{this.qtyFormatted}}</td>
        <td class="num">{{this.amount}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div class="line"></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;">
    <span>TOTAL</span><span>{{totals.grandTotal}}</span>
  </div>
  <div style="font-size:10px;">Payment: {{sale.paymentSummary}}</div>
  <div class="line"></div>
  <div class="center" style="font-size:10px;">Thank you for visiting!</div>
</div>`;

export function PrintersAndTemplatesClient({
  stores,
  initialStoreId,
  initialTemplates,
}: {
  stores: StoreOption[];
  initialStoreId: string;
  initialTemplates: TemplateRow[];
}) {
  const [activeTab, setActiveTab] = useState<"templates" | "printers">("templates");
  const [selectedStoreId, setSelectedStoreId] = useState(initialStoreId);
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [templateFormat, setTemplateFormat] = useState<"a4" | "thermal_80mm">("a4");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("Custom A4 GST Invoice");
  const [htmlContent, setHtmlContent] = useState(DEFAULT_A4_HTML);
  const [sourceType, setSourceType] = useState<"manual" | "ocr">("manual");
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentStore = stores.find((s) => s.id === selectedStoreId) ?? stores[0];
  const [printFormat, setPrintFormat] = useState<"thermal_80mm" | "thermal_58mm" | "a4">(
    currentStore?.printFormat ?? "thermal_80mm"
  );
  const [drawerStatus, setDrawerStatus] = useState<string | null>(null);

  const ocrInputRef = useRef<HTMLInputElement>(null);
  const htmlUploadRef = useRef<HTMLInputElement>(null);

  const filteredTemplates = useMemo(
    () => templates.filter((t) => t.storeId === selectedStoreId && t.format === templateFormat),
    [templates, selectedStoreId, templateFormat]
  );

  const renderedPreviewHtml = useMemo(
    () => renderBillingTemplate(htmlContent, getSampleBillingContext()),
    [htmlContent]
  );

  const handleStoreChange = (nextStoreId: string) => {
    setSelectedStoreId(nextStoreId);
    const st = stores.find((s) => s.id === nextStoreId);
    if (st) setPrintFormat(st.printFormat);
    setEditingId(null);
    startTransition(async () => {
      try {
        const list = await getBillingTemplatesAction(nextStoreId);
        setTemplates(list as TemplateRow[]);
      } catch {
        // ignore
      }
    });
  };

  const handleFormatSwitch = (fmt: "a4" | "thermal_80mm") => {
    setTemplateFormat(fmt);
    setEditingId(null);
    setSourceType("manual");
    setTemplateName(fmt === "a4" ? "Custom A4 GST Invoice" : "Custom 80mm Thermal Slip");
    setHtmlContent(fmt === "a4" ? DEFAULT_A4_HTML : DEFAULT_THERMAL_HTML);
  };

  const handleBillPhotoOcr = async (file: File) => {
    setIsOcrRunning(true);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("format", templateFormat);
      const res = await fetch("/api/ocr/bill-template", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ type: "error", text: data.error || "Failed to extract template from bill photo." });
      } else {
        setEditingId(null);
        setSourceType("ocr");
        setTemplateName(`OCR ${templateFormat === "a4" ? "A4" : "80mm"} (${file.name.replace(/\.[^.]+$/, "")})`);
        setHtmlContent(data.html);
        setNotice({
          type: "success",
          text: "HTML template generated from physical bill photo! Review the live preview and click Save.",
        });
      }
    } catch (err: unknown) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "OCR request failed." });
    } finally {
      setIsOcrRunning(false);
    }
  };

  const handleHtmlFileUpload = async (file: File) => {
    const text = await file.text();
    setEditingId(null);
    setSourceType("manual");
    setTemplateName(file.name.replace(/\.[^.]+$/, "") || "Uploaded HTML Template");
    setHtmlContent(text);
    setNotice({ type: "success", text: `Loaded HTML from "${file.name}". Review preview and Save.` });
  };

  const handleSaveTemplate = (activate: boolean) => {
    setNotice(null);
    startTransition(async () => {
      const res = await saveBillingTemplateAction({
        id: editingId ?? undefined,
        storeId: selectedStoreId,
        format: templateFormat,
        name: templateName,
        htmlContent,
        sourceType,
        activate,
      });
      if (res?.data) {
        const list = await getBillingTemplatesAction(selectedStoreId);
        setTemplates(list as TemplateRow[]);
        setEditingId(res.data.id);
        setNotice({
          type: "success",
          text: activate
            ? `Saved & activated "${res.data.name}" for ${templateFormat.toUpperCase()} billing.`
            : `Saved draft template "${res.data.name}".`,
        });
      } else {
        setNotice({ type: "error", text: res?.serverError || "Failed to save template." });
      }
    });
  };

  const handleSetActive = (templateId: string | null) => {
    setNotice(null);
    startTransition(async () => {
      await setActiveBillingTemplateAction({
        storeId: selectedStoreId,
        format: templateFormat,
        templateId,
      });
      const list = await getBillingTemplatesAction(selectedStoreId);
      setTemplates(list as TemplateRow[]);
      setNotice({
        type: "success",
        text: templateId ? "Custom HTML template activated for this branch." : "Reverted to MediFlow built-in default template.",
      });
    });
  };

  const handleDeleteTemplate = (id: string) => {
    startTransition(async () => {
      await deleteBillingTemplateAction({ id, storeId: selectedStoreId });
      const list = await getBillingTemplatesAction(selectedStoreId);
      setTemplates(list as TemplateRow[]);
      if (editingId === id) setEditingId(null);
    });
  };

  const handleSavePrintFormat = () => {
    setNotice(null);
    startTransition(async () => {
      const res = await saveStorePrintFormatAction({
        storeId: selectedStoreId,
        printFormat,
      });
      if (res?.data) {
        setNotice({ type: "success", text: `Default print format saved as ${res.data.printFormat}.` });
      } else {
        setNotice({ type: "error", text: res?.serverError || "Failed to save printer format." });
      }
    });
  };

  return (
    <div className="page space-y-6">
      <div className="print:hidden space-y-4">
        <PageHeader
          eyebrow="Hardware & Receipt Design"
          title="Billing Templates & Printer Settings"
          description="Create custom HTML billing templates (manually or by scanning a physical bill photo via OCR) and configure branch printer defaults."
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-150 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("templates")}
              data-tooltip="Create, upload, or scan a physical bill photo (OCR) into a custom HTML A4 or 80mm invoice template"
              className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                activeTab === "templates"
                  ? "bg-brand-600 text-white shadow-xs"
                  : "bg-white text-ink-700 border border-ink-200 hover:bg-ink-50"
              }`}
            >
              <FileCode2 className="h-4 w-4" /> Custom HTML Templates (OCR &amp; Editor)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("printers")}
              data-tooltip="Choose whether this branch prints 80mm thermal, 58mm thermal, or A4 invoices by default"
              className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                activeTab === "printers"
                  ? "bg-brand-600 text-white shadow-xs"
                  : "bg-white text-ink-700 border border-ink-200 hover:bg-ink-50"
              }`}
            >
              <Printer className="h-4 w-4" /> Branch Printer Defaults
            </button>
          </div>

          {stores.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="tpl-store" className="text-xs font-semibold text-ink-600">Branch:</label>
              <select
                id="tpl-store"
                value={selectedStoreId}
                onChange={(e) => handleStoreChange(e.target.value)}
                className="select select-sm text-xs"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {notice && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              notice.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {notice.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}
      </div>

      {activeTab === "templates" ? (
        <div className="space-y-6">
          {/* Format + Saved Templates Bar */}
          <div className="card p-4 space-y-4 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleFormatSwitch("a4")}
                  className={`btn btn-sm ${templateFormat === "a4" ? "btn-primary" : "btn-secondary"}`}
                >
                  A4 GST Invoice
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatSwitch("thermal_80mm")}
                  className={`btn btn-sm ${templateFormat === "thermal_80mm" ? "btn-primary" : "btn-secondary"}`}
                >
                  80mm Thermal Slip
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={ocrInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleBillPhotoOcr(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => ocrInputRef.current?.click()}
                  disabled={isOcrRunning}
                  className="btn btn-sm bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 inline-flex items-center gap-1.5"
                >
                  {isOcrRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  {isOcrRunning ? "Generating HTML from Bill…" : "Scan Physical Bill Photo (OCR)"}
                </button>

                <input
                  ref={htmlUploadRef}
                  type="file"
                  accept=".html,.htm,text/html"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleHtmlFileUpload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => htmlUploadRef.current?.click()}
                  className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload .html File
                </button>

                <button
                  type="button"
                  onClick={() => handleSetActive(null)}
                  disabled={isPending}
                  className="btn btn-ghost btn-sm text-xs inline-flex items-center gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Use Built-in Default
                </button>
              </div>
            </div>

            {filteredTemplates.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-ink-100">
                {filteredTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                      tpl.isActive
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-ink-200 bg-white text-ink-700"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(tpl.id);
                        setTemplateName(tpl.name);
                        setHtmlContent(tpl.htmlContent);
                        setSourceType(tpl.sourceType);
                      }}
                      className="font-semibold hover:underline"
                    >
                      {tpl.name}
                    </button>
                    {tpl.sourceType === "ocr" && (
                      <span className="badge badge-neutral !text-[10px]">OCR</span>
                    )}
                    {tpl.isActive ? (
                      <span className="badge badge-success !text-[10px]">Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetActive(tpl.id)}
                        className="text-[11px] font-semibold text-brand-600 hover:underline"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="text-ink-400 hover:text-rose-600"
                      aria-label="Delete template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Editor + Live Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* HTML Editor */}
            <div className="card p-4 space-y-3 print:hidden">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
                  <Code2 className="h-4 w-4 text-brand-600" /> HTML Template Editor
                </h3>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn btn-secondary btn-xs inline-flex items-center gap-1"
                >
                  <Printer className="h-3 w-3" /> Test Print
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-600 block mb-1">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="input input-sm w-full"
                  placeholder="e.g., Apollo Custom A4 Bill"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-600 block mb-1">
                  HTML &amp; Scoped CSS
                </label>
                <textarea
                  rows={16}
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 p-3 font-mono text-[11.5px] leading-relaxed focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  spellCheck={false}
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-ink-500">
                  Available Placeholders (click to append):
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {BILLING_TEMPLATE_PLACEHOLDERS.slice(0, -1).map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => setHtmlContent((prev) => `${prev}\n${ph}`)}
                      className="rounded bg-ink-100 hover:bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-700"
                    >
                      {ph}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleSaveTemplate(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleSaveTemplate(true)}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Save &amp; Activate
                </button>
              </div>
            </div>

            {/* Live Preview */}
            <div className="card p-4 space-y-3 bg-ink-50/40">
              <div className="flex items-center justify-between print:hidden">
                <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
                  <Eye className="h-4 w-4 text-brand-600" /> Live Sample Preview ({templateFormat === "a4" ? "A4" : "80mm"})
                </h3>
                <span className="text-[11px] text-ink-500">Sanitized &amp; rendered with sample data</span>
              </div>
              <div
                id="invoice-printable"
                className="bg-white rounded-xl border border-ink-200 p-4 overflow-auto max-h-[600px] shadow-xs print:border-none print:shadow-none print:max-h-none"
                dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-6 max-w-2xl space-y-5 print:hidden">
          <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
            <Printer className="h-4 w-4 text-brand-600" />
            Default Receipt Paper Format for {currentStore?.name}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {[
              { id: "thermal_80mm" as const, title: "80mm Continuous", desc: "Standard 3-inch retail thermal roll." },
              { id: "thermal_58mm" as const, title: "58mm Mini Roll", desc: "Compact 2-inch Bluetooth thermal slip." },
              { id: "a4" as const, title: "A4 GST Tax Invoice", desc: "Full-page laser/inkjet GST invoice." },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPrintFormat(opt.id)}
                className={`p-3.5 rounded-xl border text-left transition ${
                  printFormat === opt.id
                    ? "border-brand-500 bg-brand-50/50 text-brand-950 font-semibold ring-1 ring-brand-500"
                    : "border-ink-150 bg-white hover:bg-ink-50/50 text-ink-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-ink-900">{opt.title}</span>
                  {printFormat === opt.id && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                </div>
                <p className="text-[11px] text-ink-500">{opt.desc}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSavePrintFormat}
              className="btn btn-primary btn-sm"
            >
              {isPending ? "Saving..." : "Save Default Format"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawerStatus(
                  "Pulse Simulated (Diagnostic): Direct USB RJ-11 cash drawer kicks run via driver settings or the Tauri desktop bridge."
                );
                setTimeout(() => setDrawerStatus(null), 8000);
              }}
              className="btn btn-secondary btn-sm"
            >
              Test Cash Drawer Kick
            </button>
          </div>

          {drawerStatus && (
            <div className="p-3 rounded-xl bg-ink-50 border border-ink-200 text-xs text-ink-700">
              {drawerStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

