"use client";

import { useState } from "react";
import { Plus, LayoutTemplate, CheckCircle2, Clock, Check, AlertCircle } from "lucide-react";
import { createWhatsAppTemplate } from "@/app/actions/whatsapp";

interface Template {
  id: string;
  name: string;
  category: string;
  languageCode: string;
  header: string | null;
  body: string;
  footer: string | null;
  status: string;
}

export function TemplatesClient({ initialTemplates }: { initialTemplates: Template[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !body || isPending) return;

    setIsPending(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("category", category);
    formData.append("header", header);
    formData.append("body", body);
    formData.append("footer", footer);

    const res = await createWhatsAppTemplate(formData);

    if (res.error) {
      setError(res.error);
    } else if (res.template) {
      setTemplates([res.template, ...templates]);
      setShowModal(false);
      setName("");
      setHeader("");
      setBody("");
      setFooter("");
    }
    setIsPending(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-500">
          Standardized notification templates verified for Meta WhatsApp Business API compliance.
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="btn btn-primary btn-sm"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t) => (
          <div key={t.id} className="card p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-ink-100 text-ink-800">
                  {t.name}
                </span>
                <span
                  className={`badge ${
                    t.category === "MARKETING"
                      ? "badge-info"
                      : t.category === "AUTHENTICATION"
                      ? "badge-warning"
                      : "badge-neutral"
                  }`}
                >
                  {t.category}
                </span>
              </div>

              {t.header && <h4 className="text-xs font-semibold text-ink-700">{t.header}</h4>}
              <p className="text-xs text-ink-600 whitespace-pre-wrap leading-relaxed line-clamp-4 bg-ink-50/50 p-2.5 rounded-lg border border-ink-100">
                {t.body}
              </p>
              {t.footer && <p className="text-[11px] text-ink-400 italic">{t.footer}</p>}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-ink-100 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approved
              </span>
              <span className="text-ink-400">Language: {t.languageCode.toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-xl border border-ink-150 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">Create WhatsApp Template</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-ink-400 hover:text-ink-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="alert-error text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Template Name (e.g. invoice_receipt)</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="refill_reminder_v1"
                  className="input input-sm w-full font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input input-sm w-full"
                >
                  <option value="UTILITY">UTILITY (Transactional / Invoices / Reminders)</option>
                  <option value="MARKETING">MARKETING (Health checkup offers / Discounts)</option>
                  <option value="AUTHENTICATION">AUTHENTICATION (OTP / Verification)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Header (Optional)</label>
                <input
                  type="text"
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  placeholder="MediFlow Pharmacy"
                  className="input input-sm w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Body Text *</label>
                <textarea
                  required
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Dear Valued Customer, your medicine refill for {{1}} is due. Reply YES to confirm delivery."
                  className="input input-sm w-full py-2"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Footer (Optional)</label>
                <input
                  type="text"
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  placeholder="Thank you for choosing MediFlow."
                  className="input input-sm w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-150">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !name || !body}
                  className="btn btn-primary btn-sm"
                >
                  <Check className="h-4 w-4" /> {isPending ? "Creating…" : "Save Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
