import { requirePagePermission } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { queryComplianceRegister, type StatutoryRegisterType } from "@/server/domain/compliance";

const REGISTER_CONFIGS: Record<
  string,
  {
    type: StatutoryRegisterType;
    title: string;
    formLabel: string;
    statutoryRule: string;
    retentionNote: string;
  }
> = {
  "schedule-h1": {
    type: "schedule_h1",
    title: "STATUTORY REGISTER OF SCHEDULE H1 DRUGS",
    formLabel: "Form 35 / Schedule H1 Register",
    statutoryRule: "Prescribed under Rule 65(3)(h) of the Drugs and Cosmetics Rules, 1945",
    retentionNote: "Statutory Retention Period: 3 Years from the date of last entry",
  },
  "schedule-h": {
    type: "schedule_h",
    title: "STATUTORY REGISTER OF SCHEDULE H PRESCRIPTION DRUGS",
    formLabel: "Schedule H Register",
    statutoryRule: "Prescribed under Rule 65(9) of the Drugs and Cosmetics Rules, 1945",
    retentionNote: "Statutory Retention Period: 2 Years from the date of last entry",
  },
  "schedule-x": {
    type: "schedule_x",
    title: "STATUTORY REGISTER OF SCHEDULE X PSYCHOTROPIC SUBSTANCES",
    formLabel: "Schedule X Register",
    statutoryRule: "Prescribed under Rule 65(4) of the Drugs and Cosmetics Rules, 1945",
    retentionNote: "Statutory Retention Period: 2 Years from the date of last entry",
  },
  narcotics: {
    type: "narcotics",
    title: "STATUTORY REGISTER OF NARCOTIC DRUGS & CONTROLLED SUBSTANCES",
    formLabel: "NDPS Register",
    statutoryRule: "Prescribed under Narcotic Drugs and Psychotropic Substances Act, 1985",
    retentionNote: "Statutory Retention Period: 5 Years from the date of last entry",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ register: string }>;
}) {
  const { register } = await params;
  const config = REGISTER_CONFIGS[register];
  return {
    title: config ? `Print ${config.formLabel} | MediFlow` : "Print Statutory Register",
  };
}

export default async function PrintRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ register: string }>;
  searchParams: Promise<{ dateFrom?: string; dateTo?: string; month?: string; year?: string }>;
}) {
  const { register } = await params;
  const resolvedQuery = await searchParams;
  const config = REGISTER_CONFIGS[register];

  if (!config) {
    return notFound();
  }

  const session = await requirePagePermission("report.view");
  if (!session.storeId) {
    return notFound();
  }

  // Determine date range: default to current month if unspecified
  const now = new Date();
  let fromDate = resolvedQuery.dateFrom;
  let toDate = resolvedQuery.dateTo;

  if (!fromDate && !toDate) {
    const y = resolvedQuery.year ? parseInt(resolvedQuery.year, 10) : now.getFullYear();
    const m = resolvedQuery.month ? parseInt(resolvedQuery.month, 10) : now.getMonth() + 1;
    fromDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    toDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  // Fetch Store and Pharmacist Details
  const [store] = await db
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, session.storeId), eq(schema.stores.tenantId, session.tenantId)));

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, session.tenantId));

  const [pharmacist] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId));

  // Query dispensing records
  const records = await queryComplianceRegister(db, {
    tenantId: session.tenantId,
    storeId: session.storeId,
    registerType: config.type,
    dateFrom: fromDate,
    dateTo: toDate,
    limit: 1000,
  });

  const totalQuantity = records.reduce((sum, r) => sum + (r.log.quantityDispensed || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-100 py-6 px-4 font-sans text-neutral-900 print:bg-white print:p-0 print:m-0 print:min-h-0">
      {/* Print-specific landscape layout styling */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            @page {
              size: A4 landscape;
              margin: 8mm 8mm 10mm 8mm;
            }
            body {
              background: #fff !important;
              color: #000 !important;
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print\\:hidden {
              display: none !important;
            }
            #register-printable {
              box-shadow: none !important;
              border: none !important;
              padding: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
          }`,
        }}
      />

      {/* Top action bar (hidden on print) */}
      <div className="max-w-6xl mx-auto mb-5 flex flex-wrap gap-3 justify-between items-center print:hidden">
        <Link
          href={`/dashboard/compliance/${register}`}
          className="flex items-center text-sm font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Register
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500 font-mono">
            Period: {fromDate} → {toDate || "Present"} ({records.length} records)
          </span>
          <button
            onClick={undefined}
            // Client trigger via embedded script or standard window.print
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow-sm transition-all cursor-pointer"
            id="print-btn"
          >
            <Printer className="w-4 h-4 mr-1.5" /> Print Register
          </button>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('print-btn')?.addEventListener('click', function() { window.print(); });`,
        }}
      />

      {/* Printable Sheet */}
      <div
        id="register-printable"
        className="max-w-6xl mx-auto bg-white p-8 rounded-xl border border-neutral-200 shadow-sm print:border-none print:shadow-none statutory-landscape"
      >
        {/* Header Block */}
        <div className="border-b-2 border-neutral-900 pb-4 mb-4 text-center">
          <h1 className="text-xl font-bold tracking-tight uppercase text-neutral-950 font-serif">
            {store?.name || tenant?.name || "MediFlow Pharmacy"}
          </h1>
          <p className="text-xs text-neutral-700 mt-1">
            {[store?.address, store?.city, store?.stateCode, store?.pincode ? `PIN: ${store.pincode}` : null]
              .filter(Boolean)
              .join(", ")}
            {store?.phone ? ` | Tel: ${store.phone}` : ""}
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 text-xs font-semibold text-neutral-900 mt-2 font-mono">
            <span>Drug Licence No(s): {store?.drugLicenseNo || "DL-20B/21B-XXXX"}</span>
            <span>GSTIN: {store?.gstin || tenant?.gstin || "Unregistered"}</span>
            <span>State Code: {store?.stateCode || "27"}</span>
          </div>

          <div className="mt-3 pt-2 border-t border-neutral-300">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-900">
              {config.title}
            </h2>
            <p className="text-[11px] text-neutral-600 italic">{config.statutoryRule}</p>
            <p className="text-[10px] text-neutral-500 font-medium mt-0.5">{config.retentionNote}</p>
          </div>

          <div className="flex justify-between items-center text-xs font-medium text-neutral-800 mt-3 px-1">
            <span>
              <strong>Register Period:</strong> {fromDate} to {toDate}
            </span>
            <span>
              <strong>Pharmacist on Duty:</strong> {pharmacist?.name || "Authorized Pharmacist"}
              {pharmacist?.pharmacistRegNo ? ` (Reg No: ${pharmacist.pharmacistRegNo})` : ""}
            </span>
            <span>
              <strong>Generated:</strong> {new Date().toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Register Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-neutral-900 text-[10.5px]">
            <thead>
              <tr className="bg-neutral-100 text-neutral-900 font-bold border-b border-neutral-900 text-center">
                <th className="border border-neutral-900 p-1 w-8">Sl. No.</th>
                <th className="border border-neutral-900 p-1 w-20">Date of Supply</th>
                <th className="border border-neutral-900 p-1">Name & Address of Patient</th>
                <th className="border border-neutral-900 p-1">Prescribing Doctor & Address</th>
                <th className="border border-neutral-900 p-1 w-24">Doctor Reg. No.</th>
                <th className="border border-neutral-900 p-1">Drug Name / Formulation</th>
                <th className="border border-neutral-900 p-1 w-24">Batch No. & Expiry</th>
                <th className="border border-neutral-900 p-1 w-14">Qty Disp.</th>
                <th className="border border-neutral-900 p-1 w-24">Invoice / Cash Memo</th>
                <th className="border border-neutral-900 p-1 w-24">Pharmacist Sign</th>
              </tr>
              <tr className="text-[9px] bg-neutral-50 text-neutral-500 text-center italic border-b border-neutral-900">
                <th className="border border-neutral-900 p-0.5">1</th>
                <th className="border border-neutral-900 p-0.5">2</th>
                <th className="border border-neutral-900 p-0.5">3</th>
                <th className="border border-neutral-900 p-0.5">4</th>
                <th className="border border-neutral-900 p-0.5">5</th>
                <th className="border border-neutral-900 p-0.5">6</th>
                <th className="border border-neutral-900 p-0.5">7</th>
                <th className="border border-neutral-900 p-0.5">8</th>
                <th className="border border-neutral-900 p-0.5">9</th>
                <th className="border border-neutral-900 p-0.5">10</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? (
                records.map((r, idx) => (
                  <tr key={r.log.id} className="border-b border-neutral-400">
                    <td className="border border-neutral-900 p-1 text-center font-mono">{idx + 1}</td>
                    <td className="border border-neutral-900 p-1 text-center font-mono">
                      {r.log.dispensedAt ? new Date(r.log.dispensedAt).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="border border-neutral-900 p-1">
                      <div className="font-semibold text-neutral-950">{r.log.patientName}</div>
                      {r.log.patientAddress && (
                        <div className="text-[9.5px] text-neutral-600 leading-tight">
                          {r.log.patientAddress}
                        </div>
                      )}
                    </td>
                    <td className="border border-neutral-900 p-1">
                      <div className="font-semibold text-neutral-950">{r.log.doctorName}</div>
                      {r.log.doctorAddress && (
                        <div className="text-[9.5px] text-neutral-600 leading-tight">
                          {r.log.doctorAddress}
                        </div>
                      )}
                    </td>
                    <td className="border border-neutral-900 p-1 text-center font-mono font-medium">
                      {r.log.doctorRegNo || "—"}
                    </td>
                    <td className="border border-neutral-900 p-1">
                      <div className="font-semibold text-neutral-950">{r.log.medicineName}</div>
                      {r.log.manufacturerName && (
                        <div className="text-[9px] text-neutral-500 italic">Mfr: {r.log.manufacturerName}</div>
                      )}
                    </td>
                    <td className="border border-neutral-900 p-1 text-center font-mono">
                      <div>{r.log.batchNo}</div>
                      <div className="text-[9px] text-neutral-600">Exp: {r.log.expiryDate}</div>
                    </td>
                    <td className="border border-neutral-900 p-1 text-center font-bold font-mono">
                      {r.log.quantityDispensed}
                    </td>
                    <td className="border border-neutral-900 p-1 text-center font-mono">
                      {r.sale?.invoiceNo || "—"}
                    </td>
                    <td className="border border-neutral-900 p-1 text-center">
                      <div className="text-[9px] text-neutral-700">
                        {r.log.pharmacistName || pharmacist?.name || "Dispensed"}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="border border-neutral-900 p-6 text-center text-neutral-500 italic">
                    No dispensing transactions recorded under {config.formLabel} for the selected period ({fromDate} to {toDate}).
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-100 font-bold border-t-2 border-neutral-900">
                <td colSpan={7} className="border border-neutral-900 p-1.5 text-right uppercase">
                  Total Entries: {records.length} &nbsp;|&nbsp; Cumulative Units Dispensed:
                </td>
                <td className="border border-neutral-900 p-1.5 text-center font-mono text-xs">
                  {totalQuantity}
                </td>
                <td colSpan={2} className="border border-neutral-900 p-1.5 bg-neutral-50"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Inspector & Pharmacist Attestation Section */}
        <div className="mt-8 pt-4 border-t border-neutral-800 text-[10.5px]">
          <p className="italic text-neutral-700 leading-relaxed text-center">
            &ldquo;Certified that the entries in this statutory register are true, correct, and recorded contemporaneously at the time of supply in full accordance with the provisions of the Drugs and Cosmetics Act 1940 and Rules framed thereunder.&rdquo;
          </p>

          <div className="grid grid-cols-3 gap-8 mt-12 pt-6 text-center">
            <div>
              <div className="border-t border-neutral-900 pt-2 font-bold text-neutral-950">
                Signature of Registered Pharmacist
              </div>
              <p className="text-[9.5px] text-neutral-600 mt-0.5">
                Name: {pharmacist?.name || "Authorized Pharmacist"}
              </p>
              <p className="text-[9.5px] text-neutral-600">
                Reg No: {pharmacist?.pharmacistRegNo || "—"}
              </p>
            </div>

            <div>
              <div className="border-t border-neutral-900 pt-2 font-bold text-neutral-950">
                Signature of Licensee / Store In-Charge
              </div>
              <p className="text-[9.5px] text-neutral-600 mt-0.5">For {store?.name || tenant?.name}</p>
              <p className="text-[9.5px] text-neutral-600">Drug Licence No: {store?.drugLicenseNo || "—"}</p>
            </div>

            <div>
              <div className="border-t border-neutral-900 pt-2 font-bold text-neutral-950">
                Drug Inspector Verification
              </div>
              <p className="text-[9.5px] text-neutral-600 mt-0.5">Date of Inspection: _______________</p>
              <p className="text-[9.5px] text-neutral-600">Signature & Official Stamp</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
