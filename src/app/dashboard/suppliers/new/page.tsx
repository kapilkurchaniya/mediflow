"use client";

import { useActionState, Suspense } from "react";
import { createSupplier } from "@/app/actions/suppliers";
import { AlertCircle, Check } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, FormSection, Field } from "@/app/components/ui";

function getSafeReturnTo(raw: string | null): string {
  if (!raw) return "/dashboard/suppliers";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/dashboard") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return "/dashboard/suppliers";
  }
  return trimmed;
}

function NewSupplierForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
  const prefillName = searchParams.get("name") || "";
  const prefillPhone = searchParams.get("phone") || "";
  const prefillGstin = searchParams.get("gstin") || "";
  const prefillDrugLicense = searchParams.get("drugLicenseNo") || "";
  const prefillAddress = searchParams.get("address") || "";
  const linkPurchaseId = searchParams.get("linkPurchaseId") || "";

  const [state, formAction, isPending] = useActionState(async (_prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
    const res = await createSupplier(formData);
    if (res.success) {
      if (returnTo !== "/dashboard/suppliers" && res.supplierId) {
        const sep = returnTo.includes("?") ? "&" : "?";
        router.push(`${returnTo}${sep}supplierId=${encodeURIComponent(res.supplierId)}`);
      } else {
        router.push("/dashboard/suppliers");
      }
    }
    return res;
  }, null);

  return (
    <div className="page mx-auto max-w-5xl space-y-6">
      <PageHeader backHref={returnTo} title="New supplier" description="Add a distributor or stockist you purchase from." />

      <form action={formAction} className="card">
        {linkPurchaseId && <input type="hidden" name="linkPurchaseId" value={linkPurchaseId} />}
        <div className="card-body !p-6 lg:!p-8">
          {state?.error && (
            <div className="alert-error mb-6">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {state.error}
            </div>
          )}

          <FormSection title="Basic information" description="Trade name and primary contact.">
            <Field label="Supplier / agency name" required className="sm:col-span-2" htmlFor="name">
              <input id="name" name="name" defaultValue={prefillName} required className="input" placeholder="M/s Pharma Distributors" autoFocus />
            </Field>
            <Field label="Contact person" htmlFor="contactPerson">
              <input id="contactPerson" name="contactPerson" className="input" placeholder="Mr. Suresh" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <input id="phone" type="tel" name="phone" defaultValue={prefillPhone} className="input num" placeholder="98765 43210" />
            </Field>
          </FormSection>

          <FormSection title="Statutory" description="Needed for GST input credit and Drug Controller compliance.">
            <Field label="GSTIN" htmlFor="gstin">
              <input id="gstin" name="gstin" defaultValue={prefillGstin} className="input font-mono uppercase" placeholder="22AAAAA0000A1Z5" />
            </Field>
            <Field label="Drug licence no." htmlFor="drugLicenseNo">
              <input id="drugLicenseNo" name="drugLicenseNo" defaultValue={prefillDrugLicense} className="input font-mono uppercase" placeholder="MH-MZ-123456" />
            </Field>
            <Field label="Address" className="sm:col-span-2" htmlFor="address">
              <textarea id="address" name="address" rows={2} defaultValue={prefillAddress} className="input" placeholder="Shop no., wholesale market, city" />
            </Field>
          </FormSection>

          <FormSection title="Trade terms" description="Defaults applied to new purchase invoices.">
            <Field label="Credit days" htmlFor="creditDays">
              <input id="creditDays" type="number" name="creditDays" defaultValue={30} className="input num" />
            </Field>
            <Field label="Opening balance" htmlFor="openingBalance" hint="Amount you currently owe this supplier.">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">₹</span>
                <input id="openingBalance" type="number" name="openingBalance" step="0.01" defaultValue={0} className="input pl-7 num" />
              </div>
            </Field>
          </FormSection>
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-xl border-t border-ink-150 bg-ink-50/60 px-6 py-3.5">
          <Link href={returnTo} className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            <Check /> {isPending ? "Saving…" : "Save supplier"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewSupplierPage() {
  return (
    <Suspense fallback={<div className="page p-8 text-center text-xs text-ink-500">Loading supplier form...</div>}>
      <NewSupplierForm />
    </Suspense>
  );
}
