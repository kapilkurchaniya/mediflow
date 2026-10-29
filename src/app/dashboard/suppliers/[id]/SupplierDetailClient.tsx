"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import {
  Truck,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  FileText,
  RotateCcw,
  ArrowLeft,
  Calendar,
  DollarSign,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import type { SupplierLedgerSummary } from "@/server/domain/suppliers";

interface SupplierDetailClientProps {
  summary: SupplierLedgerSummary;
}

export function SupplierDetailClient({ summary }: SupplierDetailClientProps) {
  const [activeTab, setActiveTab] = useState<"ledger" | "purchases" | "returns" | "payments">("ledger");

  const { supplier, entries, openingBalance, totalPurchases, totalReturns, totalPayments, closingBalance } = summary;

  const purchases = entries.filter((e) => e.type === "purchase");
  const returns = entries.filter((e) => e.type === "purchase_return");
  const payments = entries.filter((e) => e.type === "payment");

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description={
          supplier.contactPerson
            ? `Contact: ${supplier.contactPerson} • Credit Terms: ${supplier.creditDays} days`
            : `Credit Terms: ${supplier.creditDays} days`
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/suppliers"
              className="btn btn-secondary inline-flex items-center gap-1.5 text-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              All Suppliers
            </Link>
            <Link
              href={`/dashboard/purchases/new`}
              className="btn btn-secondary inline-flex items-center gap-1.5 text-xs"
            >
              <Plus className="h-4 w-4" />
              New Purchase
            </Link>
            <Link
              href={`/dashboard/suppliers/${supplier.id}/pay`}
              className="btn btn-primary inline-flex items-center gap-1.5 text-xs"
            >
              <CreditCard className="h-4 w-4" />
              Record Payment
            </Link>
          </div>
        }
      />

      {/* Profile & KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Supplier Profile Mini-Card */}
        <div className="card p-4 space-y-2 md:col-span-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block border-b pb-1.5">
            Vendor Profile
          </span>
          <div className="text-xs space-y-1.5 pt-1">
            {supplier.gstin && (
              <p>
                <span className="text-muted-foreground">GSTIN:</span>{" "}
                <span className="font-mono font-semibold text-foreground">{supplier.gstin}</span>
              </p>
            )}
            {supplier.drugLicenseNo && (
              <p>
                <span className="text-muted-foreground">D.L.:</span>{" "}
                <span className="font-mono text-foreground">{supplier.drugLicenseNo}</span>
              </p>
            )}
            {supplier.phone && (
              <p className="flex items-center gap-1 text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                <span className="text-foreground num">{supplier.phone}</span>
              </p>
            )}
            {supplier.email && (
              <p className="flex items-center gap-1 text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="text-foreground truncate">{supplier.email}</span>
              </p>
            )}
            {supplier.address && (
              <p className="flex items-start gap-1 text-muted-foreground pt-1 border-t text-[11.5px]">
                <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                <span className="text-foreground line-clamp-2">{supplier.address}</span>
              </p>
            )}
          </div>
        </div>

        {/* Current Net Payable */}
        <div className="card p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Outstanding Payable
          </span>
          <div>
            <p
              className={`text-2xl font-bold num mt-2 ${
                closingBalance > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : closingBalance < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground"
              }`}
            >
              {formatINR(Math.abs(closingBalance))}
            </p>
            <span className="text-xs text-muted-foreground mt-1 block">
              {closingBalance > 0
                ? "Net amount owed to vendor"
                : closingBalance < 0
                ? "Vendor advance / credit balance"
                : "Account fully settled"}
            </span>
          </div>
          <Link
            href={`/dashboard/suppliers/${supplier.id}/pay`}
            className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1 mt-3"
          >
            Clear balance <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Total Purchases */}
        <div className="card p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Purchases (GRN)
          </span>
          <div>
            <p className="text-2xl font-bold num mt-2 text-foreground">
              {formatINR(totalPurchases)}
            </p>
            <span className="text-xs text-muted-foreground mt-1 block">
              {purchases.length} invoices posted
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">Credited to ledger</span>
        </div>

        {/* Payments & Debit Notes */}
        <div className="card p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Settled (Paid + Returns)
          </span>
          <div>
            <p className="text-2xl font-bold num mt-2 text-emerald-600 dark:text-emerald-400">
              {formatINR(totalPayments + totalReturns)}
            </p>
            <span className="text-xs text-muted-foreground mt-1 block">
              Paid: {formatINR(totalPayments)} • Ret: {formatINR(totalReturns)}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">Debited from ledger</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-4 text-sm font-medium">
        <button
          onClick={() => setActiveTab("ledger")}
          className={`pb-2.5 px-1 border-b-2 transition-colors ${
            activeTab === "ledger"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Running Ledger ({entries.length})
        </button>
        <button
          onClick={() => setActiveTab("purchases")}
          className={`pb-2.5 px-1 border-b-2 transition-colors ${
            activeTab === "purchases"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Purchases ({purchases.length})
        </button>
        <button
          onClick={() => setActiveTab("returns")}
          className={`pb-2.5 px-1 border-b-2 transition-colors ${
            activeTab === "returns"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Debit Notes ({returns.length})
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`pb-2.5 px-1 border-b-2 transition-colors ${
            activeTab === "payments"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Payments Made ({payments.length})
        </button>
      </div>

      {/* Tab 1: Running Ledger Statement */}
      {activeTab === "ledger" && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Account Statement & Chronological Journal Ledger (B2.4)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Credits increase payable balance; debits decrease payable balance.
              </p>
            </div>
            <span className="text-xs num font-semibold text-foreground">
              Opening: {formatINR(openingBalance)} • Closing: {formatINR(closingBalance)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Voucher #</th>
                  <th className="px-4 py-3">Reference / Bill #</th>
                  <th className="px-4 py-3">Narration / Particulars</th>
                  <th className="px-4 py-3 text-right">Debit (₹)</th>
                  <th className="px-4 py-3 text-right">Credit (₹)</th>
                  <th className="px-4 py-3 text-right">Running Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      No financial transactions recorded for this supplier.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => {
                    const isDebit = entry.debit > 0;
                    const isCredit = entry.credit > 0;

                    return (
                      <tr key={entry.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 text-xs whitespace-nowrap num text-muted-foreground">
                          {entry.date}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {entry.type === "purchase" && (
                            <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 font-medium text-[11px]">
                              Purchase GRN
                            </span>
                          )}
                          {entry.type === "purchase_return" && (
                            <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 font-medium text-[11px]">
                              Debit Note
                            </span>
                          )}
                          {entry.type === "payment" && (
                            <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium text-[11px]">
                              Payment Out
                            </span>
                          )}
                          {entry.type === "opening" && (
                            <span className="badge bg-muted text-muted-foreground font-medium text-[11px]">
                              Opening
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold num text-xs">
                          {entry.type === "purchase" ? (
                            <Link
                              href={`/dashboard/purchases/${entry.id}`}
                              className="text-primary hover:underline"
                            >
                              {entry.voucherNo}
                            </Link>
                          ) : entry.type === "purchase_return" ? (
                            <Link
                              href={`/dashboard/purchases/returns/${entry.id}`}
                              className="text-primary hover:underline"
                            >
                              {entry.voucherNo}
                            </Link>
                          ) : (
                            <span className="text-foreground">{entry.voucherNo}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground num">
                          {entry.referenceNo || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground max-w-xs truncate">
                          {entry.description}
                        </td>
                        <td className="px-4 py-3 text-right num text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {isDebit ? formatINR(entry.debit) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right num text-xs font-semibold text-rose-600 dark:text-rose-400">
                          {isCredit ? formatINR(entry.credit) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right num text-xs font-bold text-foreground">
                          {formatINR(entry.balance)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Purchases */}
      {activeTab === "purchases" && (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">GRN #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier Invoice #</th>
                <th className="px-4 py-3 text-right">Invoice Amount</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No purchase invoices from this supplier.
                  </td>
                </tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-semibold num text-primary">
                      <Link href={`/dashboard/purchases/${p.id}`} className="hover:underline">
                        {p.voucherNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.date}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.referenceNo || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold num text-foreground">
                      {formatINR(p.credit)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/purchases/${p.id}`}
                        className="btn btn-secondary !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                      >
                        View GRN
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Debit Notes */}
      {activeTab === "returns" && (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Debit Note #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Debit Amount</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No debit notes issued to this supplier.
                  </td>
                </tr>
              ) : (
                returns.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-semibold num text-primary">
                      <Link href={`/dashboard/purchases/returns/${r.id}`} className="hover:underline">
                        {r.voucherNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.date}</td>
                    <td className="px-4 py-3 text-xs text-foreground">{r.description}</td>
                    <td className="px-4 py-3 text-right font-semibold num text-emerald-600 dark:text-emerald-400">
                      {formatINR(r.debit)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/purchases/returns/${r.id}`}
                        className="btn btn-secondary !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                      >
                        View Return
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Payments Made */}
      {activeTab === "payments" && (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Payment #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Method & Details</th>
                <th className="px-4 py-3 text-right">Amount Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No payment vouchers recorded for this supplier.
                  </td>
                </tr>
              ) : (
                payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-semibold num text-foreground">{pay.voucherNo}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{pay.date}</td>
                    <td className="px-4 py-3 text-xs text-foreground">{pay.description}</td>
                    <td className="px-4 py-3 text-right font-semibold num text-emerald-600 dark:text-emerald-400">
                      {formatINR(pay.debit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

