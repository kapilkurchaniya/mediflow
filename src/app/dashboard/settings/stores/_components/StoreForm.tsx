"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createStoreAction, updateStoreAction } from "@/app/actions/stores";
import { validateInvoiceSeriesConfig } from "@/server/domain/stores/policies";
import type { StoreKind, StoreSettings } from "@/server/domain/stores/types";
import { StoreIdentitySection } from "./StoreIdentitySection";
import { StoreComplianceSection } from "./StoreComplianceSection";
import { StoreInvoiceSection } from "./StoreInvoiceSection";
import { StoreSettingsSection } from "./StoreSettingsSection";

interface StoreData {
  id?: string;
  name?: string;
  code?: string;
  kind?: StoreKind;
  address?: string | null;
  city?: string | null;
  stateCode?: string;
  pincode?: string | null;
  phone?: string | null;
  gstin?: string | null;
  drugLicenseNo?: string | null;
  drugLicenseExpiry?: string | null;
  fssaiNo?: string | null;
  invoicePrefix?: string;
  settings?: StoreSettings;
}

export function StoreForm({ initialData }: { initialData?: StoreData }) {
  const router = useRouter();
  const isEdit = Boolean(initialData?.id);

  const [name, setName] = useState(initialData?.name ?? "");
  const [code, setCode] = useState(initialData?.code ?? "");
  const [kind, setKind] = useState<StoreKind>(initialData?.kind ?? "retail");
  const [address, setAddress] = useState(initialData?.address ?? "");
  const [city, setCity] = useState(initialData?.city ?? "");
  const [stateCode, setStateCode] = useState(initialData?.stateCode ?? "27");
  const [pincode, setPincode] = useState(initialData?.pincode ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [gstin, setGstin] = useState(initialData?.gstin ?? "");
  const [drugLicenseNo, setDrugLicenseNo] = useState(initialData?.drugLicenseNo ?? "");
  const [drugLicenseExpiry, setDrugLicenseExpiry] = useState(initialData?.drugLicenseExpiry ?? "");
  const [fssaiNo, setFssaiNo] = useState(initialData?.fssaiNo ?? "");
  const [invoicePrefix, setInvoicePrefix] = useState(initialData?.invoicePrefix ?? "INV");

  const [requireShift, setRequireShift] = useState(initialData?.settings?.requireShift ?? false);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(
    initialData?.settings?.maxDiscountBp !== undefined
      ? (initialData.settings.maxDiscountBp / 100).toString()
      : "",
  );
  const [printFormat, setPrintFormat] = useState(initialData?.settings?.printFormat ?? "thermal_80mm");
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState(
    initialData?.settings?.defaultPaymentMethod ?? "cash",
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanPrefix = invoicePrefix.trim().toUpperCase() || "INV";
  const sampleInvoiceNo = `${cleanPrefix}/26-27/000001`;
  const invoiceVal = validateInvoiceSeriesConfig({ prefix: cleanPrefix });

  const handleGstinChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setGstin(upper);
    if (upper.length >= 2 && /^\d{2}$/.test(upper.slice(0, 2))) {
      setStateCode(upper.slice(0, 2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const discountBp = maxDiscountPercent.trim() !== "" ? Math.round(Number(maxDiscountPercent) * 100) : undefined;
      const settingsPayload = {
        requireShift,
        maxDiscountBp: discountBp,
        printFormat: printFormat as "thermal_80mm" | "thermal_58mm" | "a4",
        defaultPaymentMethod: defaultPaymentMethod as "cash" | "upi" | "card" | "credit",
      };

      const payload = {
        name,
        code: code.trim().toUpperCase(),
        kind,
        address: address || null,
        city: city || null,
        stateCode,
        pincode: pincode || null,
        phone: phone || null,
        gstin: gstin || null,
        drugLicenseNo: drugLicenseNo || null,
        drugLicenseExpiry: drugLicenseExpiry || null,
        fssaiNo: fssaiNo || null,
        invoicePrefix: cleanPrefix,
        settings: settingsPayload,
      };

      if (isEdit && initialData?.id) {
        const res = await updateStoreAction({ storeId: initialData.id, data: payload });
        if (res?.serverError) throw new Error(res.serverError);
      } else {
        const res = await createStoreAction(payload);
        if (res?.serverError) throw new Error(res.serverError);
      }

      router.push("/dashboard/settings/stores");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save store configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <StoreIdentitySection
        name={name}
        setName={setName}
        code={code}
        setCode={setCode}
        kind={kind}
        setKind={setKind}
      />

      <StoreComplianceSection
        gstin={gstin}
        handleGstinChange={handleGstinChange}
        stateCode={stateCode}
        setStateCode={setStateCode}
        drugLicenseNo={drugLicenseNo}
        setDrugLicenseNo={setDrugLicenseNo}
        drugLicenseExpiry={drugLicenseExpiry}
        setDrugLicenseExpiry={setDrugLicenseExpiry}
        fssaiNo={fssaiNo}
        setFssaiNo={setFssaiNo}
        address={address}
        setAddress={setAddress}
        city={city}
        setCity={setCity}
        pincode={pincode}
        setPincode={setPincode}
        phone={phone}
        setPhone={setPhone}
      />

      <StoreInvoiceSection
        invoicePrefix={invoicePrefix}
        setInvoicePrefix={setInvoicePrefix}
        sampleInvoiceNo={sampleInvoiceNo}
        invoiceVal={invoiceVal}
      />

      <StoreSettingsSection
        requireShift={requireShift}
        setRequireShift={setRequireShift}
        maxDiscountPercent={maxDiscountPercent}
        setMaxDiscountPercent={setMaxDiscountPercent}
        printFormat={printFormat}
        setPrintFormat={setPrintFormat}
        defaultPaymentMethod={defaultPaymentMethod}
        setDefaultPaymentMethod={setDefaultPaymentMethod}
      />

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn btn-secondary"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !invoiceVal.valid}
        >
          {loading ? "Saving..." : isEdit ? "Update Store" : "Create Store"}
        </button>
      </div>
    </form>
  );
}
