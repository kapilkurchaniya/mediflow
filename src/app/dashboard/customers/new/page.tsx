"use client";

import { useActionState } from "react";
import { createCustomer } from "@/app/actions/customers";
import { AlertCircle, Check } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, FormSection, Field } from "@/app/components/ui";

export default function NewCustomerPage() {
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
            <Field label="GSTIN" htmlFor="gstin">
              <input id="gstin" name="gstin" className="input font-mono uppercase" placeholder="22AAAAA0000A1Z5" />
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
