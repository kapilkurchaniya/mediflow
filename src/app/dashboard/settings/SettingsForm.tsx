"use client";

import React, { useState, useTransition } from "react";
import { updateStoreSettings } from "@/app/actions/settings";
import { Building2, Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface SettingsFormProps {
  store: {
    name: string;
    code: string;
    address: string | null;
    city: string | null;
    stateCode: string;
    pincode: string | null;
    phone: string | null;
    gstin: string | null;
    drugLicenseNo: string | null;
    invoicePrefix: string;
  };
}

export function SettingsForm({ store }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setStatus(null);

    startTransition(async () => {
      const res = await updateStoreSettings(formData);
      if (res?.error) {
        setStatus({ error: res.error });
      } else {
        setStatus({ success: true });
        setTimeout(() => setStatus(null), 4000);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-5 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-ink-150">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="text-[15px] font-semibold text-ink-900">Pharmacy Profile</h2>
              <p className="text-[12px] text-ink-500">
                Statutory details printed on counter invoices, thermal slips, and GST returns.
              </p>
            </div>
          </div>
          {status?.success && (
            <span className="badge badge-success flex items-center gap-1.5 animate-fade">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved successfully
            </span>
          )}
          {status?.error && (
            <span className="badge badge-danger flex items-center gap-1.5 animate-fade">
              <AlertCircle className="h-3.5 w-3.5" /> {status.error}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">
              Pharmacy / Store Trade Name *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={store.name}
              className="input font-medium"
              placeholder="e.g. Apollo Pharmacy, MedPlus Chemist"
            />
          </div>

          <div>
            <label htmlFor="drugLicenseNo" className="label">
              Drug License No. (Form 20B / 21B)
            </label>
            <input
              id="drugLicenseNo"
              name="drugLicenseNo"
              type="text"
              defaultValue={store.drugLicenseNo ?? ""}
              className="input font-mono uppercase text-[13px]"
              placeholder="e.g. DL-20B-12345, 21B-67890"
            />
            <p className="hint">Retail sale licenses required on drug bills</p>
          </div>

          <div>
            <label htmlFor="gstin" className="label">
              GSTIN Identification Number
            </label>
            <input
              id="gstin"
              name="gstin"
              type="text"
              maxLength={15}
              defaultValue={store.gstin ?? ""}
              className="input font-mono uppercase text-[13px]"
              placeholder="e.g. 27AAAAA0000A1Z5"
            />
            <p className="hint">15-character Goods & Services Tax ID</p>
          </div>

          <div>
            <label htmlFor="phone" className="label">
              Contact Phone / WhatsApp
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={store.phone ?? ""}
              className="input"
              placeholder="e.g. +91 98765 43210"
            />
          </div>

          <div>
            <label htmlFor="invoicePrefix" className="label">
              Bill / Invoice Serial Prefix
            </label>
            <input
              id="invoicePrefix"
              name="invoicePrefix"
              type="text"
              maxLength={6}
              defaultValue={store.invoicePrefix}
              className="input font-mono uppercase"
              placeholder="e.g. INV, MED, BILL"
            />
            <p className="hint">Prepended to counter bills (e.g. INV-00042)</p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="address" className="label">
              Store Physical Address
            </label>
            <textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={store.address ?? ""}
              className="input"
              placeholder="Shop No., Street, Landmark, Area"
            />
          </div>

          <div>
            <label htmlFor="city" className="label">
              City
            </label>
            <input
              id="city"
              name="city"
              type="text"
              defaultValue={store.city ?? ""}
              className="input"
              placeholder="e.g. Mumbai, Pune, Delhi"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="stateCode" className="label">
                State Code
              </label>
              <input
                id="stateCode"
                name="stateCode"
                type="text"
                maxLength={2}
                defaultValue={store.stateCode}
                className="input font-mono"
                placeholder="27"
              />
            </div>
            <div>
              <label htmlFor="pincode" className="label">
                Pincode
              </label>
              <input
                id="pincode"
                name="pincode"
                type="text"
                maxLength={6}
                defaultValue={store.pincode ?? ""}
                className="input font-mono"
                placeholder="400001"
              />
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-ink-150 flex items-center justify-between">
          <p className="text-[12px] text-ink-400">
            Changes reflect immediately in new POS bills and receipts.
          </p>
          <button
            type="submit"
            disabled={isPending}
            className="btn btn-primary"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
