"use client";

import React, { useState } from "react";
import { X, Send, AlertTriangle, Sparkles, CheckCircle2, MessageSquarePlus } from "lucide-react";
import { submitPilotFeedbackAction } from "@/app/actions/pilot";
import { type PilotFeedbackInput } from "@/server/domain/pilot/feedback";

export function PilotFeedbackModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<PilotFeedbackInput>({
    category: "speed",
    severity: "medium",
    summary: "",
    details: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const diagnostics = {
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      userAgent: typeof window !== "undefined" ? window.navigator.userAgent : undefined,
      appVersion: "1.0.0-pilot",
    };

    const res = await submitPilotFeedbackAction({
      ...form,
      diagnostics,
    });

    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error ?? "Failed to submit feedback.");
      return;
    }

    setSuccessId(res.feedbackId ?? "SUCCESS");
    setForm({ category: "speed", severity: "medium", summary: "", details: "" });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setSuccessId(null);
          setError(null);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50/70 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors shadow-2xs"
      >
        <MessageSquarePlus className="h-3.5 w-3.5 text-primary-600" />
        Report Pilot Feedback
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-xs animate-fade"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-ink-150 bg-white shadow-2xl animate-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink-150 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary-100 text-primary-700">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink-900 leading-none">
                    Pilot Counter Feedback & Bug Reporter
                  </h3>
                  <p className="mt-1 text-[11px] text-ink-500">
                    Direct feedback pipeline for pharmacy pilot staff. Triage in GitHub.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {successId ? (
              <div className="p-6 text-center space-y-4">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-ink-900">Feedback Submitted Successfully</h4>
                  <p className="text-xs text-ink-500">
                    Logged with Reference ID: <code className="font-mono text-ink-700">{successId}</code>
                  </p>
                  <p className="text-[11px] text-ink-400 mt-2">
                    Our engineering team reviews pilot logs daily to optimize counter performance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-ink-700 mb-1">
                      Issue Category
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as PilotFeedbackInput["category"] })}
                      className="w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-900"
                    >
                      <option value="speed">Counter Speed / Latency</option>
                      <option value="scanner">Barcode Scanner Buffer</option>
                      <option value="thermal_print">80mm Thermal Receipt</option>
                      <option value="gst_math">GST Tax Calculation</option>
                      <option value="offline_sync">Offline Continuity / Sync</option>
                      <option value="ui_ux">UI / Navigation Friction</option>
                      <option value="other">Other Inquiry</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-700 mb-1">
                      Severity Level
                    </label>
                    <select
                      value={form.severity}
                      onChange={(e) => setForm({ ...form, severity: e.target.value as PilotFeedbackInput["severity"] })}
                      className="w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-900"
                    >
                      <option value="low">Low (Cosmetic / Suggestion)</option>
                      <option value="medium">Medium (Annoying friction)</option>
                      <option value="high">High (Slows down billing)</option>
                      <option value="blocker">Blocker (Cannot complete bill)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">
                    Short Summary
                  </label>
                  <input
                    type="text"
                    required
                    value={form.summary}
                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    placeholder="e.g. Scanner buffer drops last digit of strip EAN"
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-900 placeholder:text-ink-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">
                    Details & Expected Behavior
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={form.details}
                    onChange={(e) => setForm({ ...form, details: e.target.value })}
                    placeholder="Describe exactly what happened and what medicine/bill was being handled..."
                    className="w-full rounded-lg border border-ink-200 bg-white p-3 text-xs text-ink-900 placeholder:text-ink-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-ink-150">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="btn btn-ghost btn-sm text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
                  >
                    <Send className="h-3 w-3" />
                    <span>{isSubmitting ? "Submitting..." : "Submit to Engineering"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

