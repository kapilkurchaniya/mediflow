"use client";

interface ExpenseVendorFieldsProps {
  payeeName: string;
  setPayeeName: (val: string) => void;
  reference: string;
  setReference: (val: string) => void;
  vendorInvoiceNo: string;
  setVendorInvoiceNo: (val: string) => void;
  vendorInvoiceDate: string;
  setVendorInvoiceDate: (val: string) => void;
  vendorGstin: string;
  setVendorGstin: (val: string) => void;
  note: string;
  setNote: (val: string) => void;
}

export function ExpenseVendorFields({
  payeeName,
  setPayeeName,
  reference,
  setReference,
  vendorInvoiceNo,
  setVendorInvoiceNo,
  vendorInvoiceDate,
  setVendorInvoiceDate,
  vendorGstin,
  setVendorGstin,
  note,
  setNote,
}: ExpenseVendorFieldsProps) {
  return (
    <div className="card space-y-4 p-6 bg-white shadow-sm border border-ink-150">
      <h3 className="text-[14px] font-semibold text-ink-900 border-b border-ink-150 pb-2">
        Payee & Invoice Metadata (Optional)
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-[13px] font-medium text-ink-700">Payee Name</label>
          <input
            type="text"
            placeholder="e.g. Landlord, State Electricity Board, Courier"
            value={payeeName}
            onChange={(e) => setPayeeName(e.target.value)}
            className="input mt-1 w-full text-[13px]"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-ink-700">Reference / UTR / Cheque No</label>
          <input
            type="text"
            placeholder="e.g. UTR12345678"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="input mt-1 w-full text-[13px]"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-ink-700">Vendor Bill / Invoice No</label>
          <input
            type="text"
            placeholder="e.g. INV-2026-99"
            value={vendorInvoiceNo}
            onChange={(e) => setVendorInvoiceNo(e.target.value)}
            className="input mt-1 w-full text-[13px]"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-ink-700">Vendor Bill Date</label>
          <input
            type="date"
            value={vendorInvoiceDate}
            onChange={(e) => setVendorInvoiceDate(e.target.value)}
            className="input mt-1 w-full text-[13px]"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-ink-700">Vendor GSTIN</label>
          <input
            type="text"
            maxLength={15}
            placeholder="27AAAAA0000A1Z5"
            value={vendorGstin}
            onChange={(e) => setVendorGstin(e.target.value)}
            className="input mt-1 w-full font-mono text-[13px] uppercase"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-ink-700">Notes / Remarks</label>
          <input
            type="text"
            placeholder="e.g. Monthly maintenance advance"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input mt-1 w-full text-[13px]"
          />
        </div>
      </div>
    </div>
  );
}
