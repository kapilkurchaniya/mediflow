"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, X, AlertCircle, Check, Loader2 } from "lucide-react";
import { quickCreateSupplierAction } from "@/app/actions/suppliers";
import type { PendingSupplierMeta } from "@/lib/pending-supplier";

function QuickRegisterSupplierModalContent({
  onClose,
  initialMeta,
  linkPurchaseId,
  onRegistered,
  submitLabel,
  title,
  subtitle,
}: {
  onClose: () => void;
  initialMeta: PendingSupplierMeta;
  linkPurchaseId?: string | null;
  onRegistered?: (supplier: { id: string; name: string }) => Promise<void> | void;
  submitLabel?: string;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialMeta.name || "");
  const [gstin, setGstin] = useState(initialMeta.gstin || "");
  const [phone, setPhone] = useState(initialMeta.phone || "");
  const [drugLicenseNo, setDrugLicenseNo] = useState(initialMeta.drugLicenseNo || "");
  const [address, setAddress] = useState(initialMeta.address || "");
  const [contactPerson, setContactPerson] = useState("");
  const [creditDays, setCreditDays] = useState("30");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await quickCreateSupplierAction({
        name: name.trim(),
        contactPerson: contactPerson.trim() || null,
        phone: phone.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        drugLicenseNo: drugLicenseNo.trim().toUpperCase() || null,
        address: address.trim() || null,
        creditDays: parseInt(creditDays, 10) || 30,
        linkPurchaseId: linkPurchaseId || null,
      });

      if (!res.success || !res.supplier) {
        setError(res.error || "Failed to register supplier.");
        return;
      }

      await onRegistered?.(res.supplier);
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register supplier.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-ink-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-ink-900 text-sm">
                {title || "Register Supplier from Invoice"}
              </h3>
              <p className="text-[11.5px] text-ink-500">
                {subtitle || "Pre-filled from your scanned bill — verify and save in one click."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="label required">Supplier / Agency Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">GSTIN</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                className="input font-mono uppercase"
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="input num"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Drug Licence No.</label>
              <input
                type="text"
                value={drugLicenseNo}
                onChange={(e) => setDrugLicenseNo(e.target.value.toUpperCase())}
                placeholder="MH-MZ-123456"
                className="input font-mono uppercase"
              />
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Sales rep / owner"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Wholesale market / city"
                className="input"
              />
            </div>
            <div>
              <label className="label">Credit Days</label>
              <input
                type="number"
                min={0}
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
                className="input num"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-ink-150 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="btn btn-primary btn-sm flex items-center gap-1.5">
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {isSaving ? "Saving…" : submitLabel || (linkPurchaseId ? "Register & Link Invoice" : "Save Supplier")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function QuickRegisterSupplierModal({
  isOpen,
  onClose,
  initialMeta,
  linkPurchaseId,
  onRegistered,
  submitLabel,
  title,
  subtitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialMeta: PendingSupplierMeta;
  linkPurchaseId?: string | null;
  onRegistered?: (supplier: { id: string; name: string }) => Promise<void> | void;
  submitLabel?: string;
  title?: string;
  subtitle?: string;
}) {
  if (!isOpen) return null;
  const key = `${initialMeta.name}|${initialMeta.gstin || ""}|${linkPurchaseId || ""}`;
  return (
    <QuickRegisterSupplierModalContent
      key={key}
      onClose={onClose}
      initialMeta={initialMeta}
      linkPurchaseId={linkPurchaseId}
      onRegistered={onRegistered}
      submitLabel={submitLabel}
      title={title}
      subtitle={subtitle}
    />
  );
}

export function RegisterPendingSupplierButton({
  meta,
  purchaseId,
  label = "Register Supplier",
  size = "xs",
}: {
  meta: PendingSupplierMeta;
  purchaseId: string;
  label?: string;
  size?: "xs" | "sm";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn btn-primary ${size === "xs" ? "btn-xs" : "btn-sm"} whitespace-nowrap`}
      >
        {label}
      </button>
      <QuickRegisterSupplierModal
        isOpen={open}
        onClose={() => setOpen(false)}
        initialMeta={meta}
        linkPurchaseId={purchaseId}
      />
    </>
  );
}
