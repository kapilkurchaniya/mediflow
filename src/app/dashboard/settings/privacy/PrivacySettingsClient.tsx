"use client";

import { useState } from "react";
import { savePrivacyNoticeAction } from "@/app/actions/privacy";
import { Check, AlertCircle, ShieldCheck } from "lucide-react";
import { FormSection, Field } from "@/app/components/ui";

interface PrivacyNoticeData {
  id?: string | null;
  title: string;
  noticeText: string;
  dpoName: string | null;
  dpoContact: string | null;
  retentionPolicySummary: string | null;
}

export function PrivacySettingsClient({
  initialNotice,
}: {
  initialNotice: PrivacyNoticeData;
}) {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setSuccess(false);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const res = await savePrivacyNoticeAction(formData);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setIsPending(false);
  };

  return (
    <div className="space-y-6">
      {/* Statutory Banner */}
      <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-950/30 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-semibold text-sky-900 dark:text-sky-200 block">
            Data Fiduciary Transparency Obligation (DPDP Act 2023 Section 5)
          </span>
          <p className="text-sky-700 dark:text-sky-300 leading-relaxed">
            Every pharmacy operating as a Data Fiduciary must give Data Principals (patients) an itemised notice stating the personal data sought to be collected, the specified purpose for which it will be processed, how the Data Principal may exercise their rights to correction and erasure, and how they may complain to the Data Protection Board.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        <div className="card-body p-6 space-y-6">
          {error && (
            <div className="alert-error text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="alert-success text-xs flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              Privacy notice settings saved successfully.
            </div>
          )}

          <FormSection
            title="Privacy Notice Content"
            description="Published notice presented to patients across public links and digital receipts."
          >
            <Field label="Notice Title" htmlFor="title" required className="sm:col-span-2">
              <input
                id="title"
                name="title"
                defaultValue={initialNotice.title}
                className="input text-xs"
                required
              />
            </Field>

            <Field label="Privacy Notice Statement" htmlFor="noticeText" required className="sm:col-span-2">
              <textarea
                id="noticeText"
                name="noticeText"
                rows={5}
                defaultValue={initialNotice.noticeText}
                className="input text-xs leading-relaxed"
                required
              />
            </Field>

            <Field
              label="Statutory Retention Policy Rationale"
              htmlFor="retentionPolicySummary"
              hint="Statutory explanation of CGST 6-year and D&C 3-year record retention"
              className="sm:col-span-2"
            >
              <textarea
                id="retentionPolicySummary"
                name="retentionPolicySummary"
                rows={3}
                defaultValue={initialNotice.retentionPolicySummary || ""}
                className="input text-xs leading-relaxed"
              />
            </Field>
          </FormSection>

          <FormSection
            title="Grievance Redressal & DPO"
            description="Contact details for the Data Protection Officer or Grievance Officer."
          >
            <Field label="Officer Name / Role" htmlFor="dpoName">
              <input
                id="dpoName"
                name="dpoName"
                defaultValue={initialNotice.dpoName || ""}
                placeholder="Chief Pharmacist / Grievance Officer"
                className="input text-xs"
              />
            </Field>

            <Field label="Email or Phone for Grievances" htmlFor="dpoContact">
              <input
                id="dpoContact"
                name="dpoContact"
                defaultValue={initialNotice.dpoContact || ""}
                placeholder="privacy@pharmacy.in"
                className="input text-xs font-mono"
              />
            </Field>
          </FormSection>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-150 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-900/60 px-6 py-3.5">
          <button type="submit" disabled={isPending} className="btn btn-primary text-xs">
            <Check className="h-4 w-4" />
            {isPending ? "Saving…" : "Save Privacy Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

