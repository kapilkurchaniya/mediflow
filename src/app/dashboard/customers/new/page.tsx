"use client";

import { useActionState, useState } from "react";
import { createCustomer } from "@/app/actions/customers";
import { AlertCircle, Check } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, FormSection, Field } from "@/app/components/ui";
import { GST_STATE_CODES } from "@/lib/regulatory";

export default function NewCustomerPage() {
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");

  const handleGstinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setGstin(val);
    if (val.length >= 2) {
      const code = val.slice(0, 2);
      if (GST_STATE_CODES[code]) {
        setStateCode(code);
      }
    }
  };

  const [state, formAction, isPending] = useActionState(async (prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
    const res = await createCustomer(formData);
    if (res.success) {
      redirect("/dashboard/customers");
    }
    return res;
  }, null);

  return (
    <div className="page mx-auto max-w-5xl space-y-6">
      <PageHeader backHref="/dashboard/customers" title="New customer" description="Create a patient or account profile." />

      <form action={formAction} className="card">
        <div className="card-body !p-6 lg:!p-8">
          {state?.error && (
            <div className="alert-error mb-6">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {state.error}
            </div>
          )}

          <FormSection title="Contact" description="How you identify and reach this customer.">
            <Field label="Full name" required className="sm:col-span-2" htmlFor="name">
              <input id="name" name="name" required className="input" placeholder="Rahul Sharma" autoFocus />
            </Field>
            <Field label="Phone" htmlFor="phone" hint="Used for WhatsApp invoices & refill reminders.">
              <input id="phone" type="tel" name="phone" className="input num" placeholder="98765 43210" />
            </Field>
            <Field label="Email" htmlFor="email">
              <input id="email" type="email" name="email" className="input" placeholder="rahul@example.com" />
            </Field>
          </FormSection>

          <FormSection title="Billing & credit" description="Optional. Required only for B2B or credit customers.">
            <Field label="GSTIN" htmlFor="gstin" hint="15-character GSTIN for B2B supplies.">
              <input
                id="gstin"
                name="gstin"
                value={gstin}
                onChange={handleGstinChange}
                maxLength={15}
                className="input font-mono uppercase"
                placeholder="27AAAAA0000A1Z5"
              />
            </Field>
            <Field label="State / Place of supply" htmlFor="stateCode" hint="Auto-filled from GSTIN, or select manually.">
              <select
                id="stateCode"
                name="stateCode"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="input"
              >
                <option value="">Select state / UT</option>
                {Object.entries(GST_STATE_CODES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} - {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Credit limit" htmlFor="creditLimit" hint="Leave blank for cash-only customers.">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">₹</span>
                <input id="creditLimit" type="number" name="creditLimit" step="0.01" min="0" className="input pl-7 num" placeholder="0.00" />
              </div>
            </Field>
            <Field label="Billing address" className="sm:col-span-2" htmlFor="address">
              <textarea id="address" name="address" rows={3} className="input" placeholder="House no., street, city, PIN" />
            </Field>
          </FormSection>

          <FormSection title="Notes" description="Visible only to your staff.">
            <Field label="Internal notes" className="sm:col-span-2" htmlFor="notes">
              <textarea id="notes" name="notes" rows={2} className="input" placeholder="Prefers generics, diabetic — monthly refill…" />
            </Field>
          </FormSection>

          <FormSection
            title="Data Privacy & Consent (DPDP Act 2023)"
            description="Manage patient consent for automated reminders and communications."
          >
            <div className="sm:col-span-2 space-y-2">
              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-ink-150 bg-ink-50/50 cursor-pointer hover:border-ink-300">
                <input
                  type="checkbox"
                  name="consentReminders"
                  defaultChecked
                  className="checkbox"
                />
                <div>
                  <span className="text-xs font-semibold text-ink-900 block">
                    Prescription Refill &amp; Health Reminders
                  </span>
                  <span className="text-[11px] text-ink-500 block">
                    Patient consents to WhatsApp and SMS alerts for due prescription refills and medication schedules.
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-ink-150 bg-ink-50/50 cursor-pointer hover:border-ink-300">
                <input
                  type="checkbox"
                  name="consentMarketing"
                  className="checkbox"
                />
                <div>
                  <span className="text-xs font-semibold text-ink-900 block">
                    Pharmacy Offers &amp; Health Updates
                  </span>
                  <span className="text-[11px] text-ink-500 block">
                    Patient consents to seasonal healthcare notices, discounts, and wellness promotions.
                  </span>
                </div>
              </label>
            </div>
          </FormSection>
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-xl border-t border-ink-150 bg-ink-50/60 px-6 py-3.5">
          <Link href="/dashboard/customers" className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            <Check /> {isPending ? "Saving…" : "Save customer"}
          </button>
        </div>
      </form>
    </div>
  );
}
