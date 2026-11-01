"use client";

interface Props {
  gstin: string;
  handleGstinChange: (v: string) => void;
  stateCode: string;
  setStateCode: (v: string) => void;
  drugLicenseNo: string;
  setDrugLicenseNo: (v: string) => void;
  drugLicenseExpiry: string;
  setDrugLicenseExpiry: (v: string) => void;
  fssaiNo: string;
  setFssaiNo: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  pincode: string;
  setPincode: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
}

export function StoreComplianceSection({
  gstin,
  handleGstinChange,
  stateCode,
  setStateCode,
  drugLicenseNo,
  setDrugLicenseNo,
  drugLicenseExpiry,
  setDrugLicenseExpiry,
  fssaiNo,
  setFssaiNo,
  address,
  setAddress,
  city,
  setCity,
  pincode,
  setPincode,
  phone,
  setPhone,
}: Props) {
  return (
    <div className="card p-6 space-y-5">
      <h2 className="text-base font-semibold text-ink-900 border-b border-ink-100 pb-3">
        Statutory Compliance & Address
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-ink-700">GSTIN (15 Characters)</span>
          <input
            type="text"
            maxLength={15}
            value={gstin}
            onChange={(e) => handleGstinChange(e.target.value)}
            placeholder="e.g. 27GSPTE0985F1Z5"
            className="mt-1 block w-full input font-mono uppercase"
          />
          <span className="text-[11px] text-ink-400 mt-1 block">
            Branches in the same state can share the same state GST registration.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">State Code (2 Digits) *</span>
          <input
            type="text"
            required
            maxLength={2}
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            placeholder="27"
            className="mt-1 block w-full input font-mono"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-ink-700">Drug Licence Number</span>
          <input
            type="text"
            value={drugLicenseNo}
            onChange={(e) => setDrugLicenseNo(e.target.value)}
            placeholder="e.g. MH-MZ2-123456 (Form 20/21 or 20B/21B)"
            className="mt-1 block w-full input font-mono"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">Licence Expiry Date</span>
          <input
            type="date"
            value={drugLicenseExpiry}
            onChange={(e) => setDrugLicenseExpiry(e.target.value)}
            className="mt-1 block w-full input"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-ink-700">Address / Street</span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Shop No. 4, Main Market"
            className="mt-1 block w-full input"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">City / District</span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Mumbai"
            className="mt-1 block w-full input"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">Pincode (6 Digits)</span>
          <input
            type="text"
            maxLength={6}
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            placeholder="400058"
            className="mt-1 block w-full input font-mono"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">Phone Number</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="mt-1 block w-full input font-mono"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-700">FSSAI Number (Optional)</span>
          <input
            type="text"
            value={fssaiNo}
            onChange={(e) => setFssaiNo(e.target.value)}
            placeholder="e.g. 10020022001234"
            className="mt-1 block w-full input font-mono"
          />
        </label>
      </div>
    </div>
  );
}
