"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Printer, Receipt, FileCode2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import {
  saveStorePrintFormatAction,
  setActiveBillingTemplateAction,
} from "@/app/actions/billing-templates";

export interface QuickTemplateItem {
  id: string;
  format: "a4" | "thermal_80mm";
  name: string;
  isActive: boolean;
  sourceType: "manual" | "ocr";
}

interface BillingTemplateQuickCardProps {
  storeId: string;
  initialPrintFormat: "thermal_80mm" | "thermal_58mm" | "a4";
  initialTemplates: QuickTemplateItem[];
}

export function BillingTemplateQuickCard({
  storeId,
  initialPrintFormat,
  initialTemplates,
}: BillingTemplateQuickCardProps) {
  const [printFormat, setPrintFormat] = useState<"thermal_80mm" | "thermal_58mm" | "a4">(initialPrintFormat);
  const [templates, setTemplates] = useState<QuickTemplateItem[]>(initialTemplates);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const thermalTemplates = templates.filter((t) => t.format === "thermal_80mm");
  const a4Templates = templates.filter((t) => t.format === "a4");
  const activeThermalId = thermalTemplates.find((t) => t.isActive)?.id ?? "";
  const activeA4Id = a4Templates.find((t) => t.isActive)?.id ?? "";

  const handlePrintFormatChange = (nextFormat: "thermal_80mm" | "thermal_58mm" | "a4") => {
    setPrintFormat(nextFormat);
    setNotice(null);
    startTransition(async () => {
      const res = await saveStorePrintFormatAction({ storeId, printFormat: nextFormat });
      if (res?.data) {
        setNotice({ type: "success", text: "Default counter print format updated." });
      } else {
        setNotice({ type: "error", text: res?.serverError || "Failed to update print format." });
      }
    });
  };

  const handleTemplateSelect = (format: "a4" | "thermal_80mm", templateId: string) => {
    setNotice(null);
    const nextId = templateId || null;
    setTemplates((prev) =>
      prev.map((t) =>
        t.format === format ? { ...t, isActive: nextId !== null && t.id === nextId } : t
      )
    );
    startTransition(async () => {
      const res = await setActiveBillingTemplateAction({
        storeId,
        format,
        templateId: nextId,
      });
      if (res?.data?.ok) {
        const label = nextId
          ? templates.find((t) => t.id === nextId)?.name ?? "Custom template"
          : "MediFlow Built-in Default";
        setNotice({
          type: "success",
          text: `${format === "a4" ? "A4 GST Invoice" : "Thermal Slip"} switched to ${label}.`,
        });
      } else {
        setNotice({ type: "error", text: res?.serverError || "Failed to switch template." });
      }
    });
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink-150">
        <div className="flex items-center gap-2.5">
          <Printer className="h-5 w-5 text-sky-600" />
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Billing Templates &amp; Printing
            </h2>
            <p className="text-[12px] text-ink-500">
              Choose your default receipt paper size and switch between Built-in Default or Custom HTML templates.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/settings/printers"
          className="btn btn-secondary btn-sm inline-flex items-center gap-1.5 text-brand-700 border-brand-200 hover:bg-brand-50"
        >
          <FileCode2 className="w-3.5 h-3.5" /> Add / Manage Custom Templates
        </Link>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            notice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Default Receipt Format Selector */}
      <div className="space-y-2">
        <span className="text-[11.5px] font-semibold text-ink-600 uppercase tracking-wider block">
          Default Counter Print Format
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[12.5px]">
          {[
            { id: "thermal_80mm" as const, title: "Thermal 80mm", desc: "Standard 3-inch counter roll", icon: Receipt },
            { id: "thermal_58mm" as const, title: "Thermal 58mm", desc: "Compact 2-inch thermal slip", icon: Receipt },
            { id: "a4" as const, title: "A4 GST Invoice", desc: "Full-page GST tax invoice", icon: Sparkles },
          ].map((opt) => {
            const Icon = opt.icon;
            const selected = printFormat === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={isPending}
                onClick={() => handlePrintFormatChange(opt.id)}
                className={`p-3 rounded-lg border text-left transition-colors flex items-start gap-2.5 ${
                  selected
                    ? "border-brand-400 bg-brand-50/40 ring-1 ring-brand-400"
                    : "border-ink-150 bg-white hover:bg-ink-50/60"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${selected ? "text-brand-600" : "text-ink-400"}`} />
                <div className="min-w-0">
                  <div className="font-semibold text-ink-900 flex items-center gap-1.5">
                    <span>{opt.title}</span>
                    {selected && <CheckCircle2 className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5">{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Default vs Custom Template Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-ink-100">
        <div className="space-y-1.5">
          <label htmlFor="settings-thermal-tpl" className="text-xs font-semibold text-ink-700 block">
            Thermal Slip Template
          </label>
          <select
            id="settings-thermal-tpl"
            value={activeThermalId}
            disabled={isPending}
            onChange={(e) => handleTemplateSelect("thermal_80mm", e.target.value)}
            className="select select-sm w-full text-xs"
          >
            <option value="">MediFlow Built-in Default (80mm Thermal)</option>
            {thermalTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                Custom: {tpl.name} {tpl.sourceType === "ocr" ? "(OCR)" : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-400">
            {thermalTemplates.length === 0
              ? "No custom thermal templates yet. Add one via HTML, .html upload, or Bill Photo OCR."
              : `${thermalTemplates.length} custom thermal template(s) saved.`}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="settings-a4-tpl" className="text-xs font-semibold text-ink-700 block">
            A4 GST Invoice Template
          </label>
          <select
            id="settings-a4-tpl"
            value={activeA4Id}
            disabled={isPending}
            onChange={(e) => handleTemplateSelect("a4", e.target.value)}
            className="select select-sm w-full text-xs"
          >
            <option value="">MediFlow Built-in Default (A4 GST)</option>
            {a4Templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                Custom: {tpl.name} {tpl.sourceType === "ocr" ? "(OCR)" : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-400">
            {a4Templates.length === 0
              ? "No custom A4 templates yet. Add one via HTML, .html upload, or Bill Photo OCR."
              : `${a4Templates.length} custom A4 template(s) saved.`}
          </p>
        </div>
      </div>
    </div>
  );
}

