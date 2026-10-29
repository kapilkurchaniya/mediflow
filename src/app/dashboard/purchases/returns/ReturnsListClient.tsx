"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import {
  RotateCcw,
  Plus,
  Search,
  Filter,
  FileText,
  AlertTriangle,
  ArrowRight,
  Truck,
} from "lucide-react";

interface PurchaseReturnRow {
  id: string;
  returnNo: string;
  purchaseId: string;
  purchaseNo: string;
  supplierInvoiceNo: string | null;
  supplierId: string;
  supplierName: string;
  taxableAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  reason: string;
  createdAt: Date;
}

interface ReturnsListClientProps {
  returns: PurchaseReturnRow[];
}

export function ReturnsListClient({ returns }: ReturnsListClientProps) {
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");

  const suppliers = Array.from(
    new Map(returns.map((r) => [r.supplierId, r.supplierName])).entries()
  );

  const filtered = returns.filter((r) => {
    const matchesSearch =
      r.returnNo.toLowerCase().includes(search.toLowerCase()) ||
      r.purchaseNo.toLowerCase().includes(search.toLowerCase()) ||
      r.supplierName.toLowerCase().includes(search.toLowerCase()) ||
      (r.supplierInvoiceNo && r.supplierInvoiceNo.toLowerCase().includes(search.toLowerCase())) ||
      r.reason.toLowerCase().includes(search.toLowerCase());

    const matchesSupplier =
      selectedSupplier === "all" || r.supplierId === selectedSupplier;

    return matchesSearch && matchesSupplier;
  });

  const totalDebitAmount = filtered.reduce((acc, r) => acc + (r.totalAmount ?? 0), 0);
  const totalTaxAmount = filtered.reduce((acc, r) => acc + (r.taxAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Returns & Debit Notes"
        description="Manage returned stock, vendor debit notes, and input tax credit reversals (B2.3)"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/purchases/expiry-returns"
              className="btn btn-secondary inline-flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Expiry Returns
            </Link>
            <Link
              href="/dashboard/purchases/returns/new"
              className="btn btn-primary inline-flex items-center gap-1.5 text-xs"
            >
              <Plus className="h-4 w-4" />
              New Debit Note
            </Link>
          </div>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Debit Notes
          </span>
          <p className="mt-2 text-2xl font-bold num">{filtered.length}</p>
          <span className="text-xs text-muted-foreground mt-1">Processed returns</span>
        </div>

        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Debit Amount
          </span>
          <p className="mt-2 text-2xl font-bold num text-emerald-600 dark:text-emerald-400">
            {formatINR(totalDebitAmount)}
          </p>
          <span className="text-xs text-muted-foreground mt-1">Credited to vendor accounts</span>
        </div>

        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Input Tax Reversed
          </span>
          <p className="mt-2 text-2xl font-bold num text-blue-600 dark:text-blue-400">
            {formatINR(totalTaxAmount)}
          </p>
          <span className="text-xs text-muted-foreground mt-1">GST ITC debit reversed</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by debit note #, GRN #, supplier, invoice, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 w-full text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="input text-xs w-48"
          >
            <option value="all">All Suppliers ({suppliers.length})</option>
            {suppliers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Debit Notes Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Debit Note #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Original GRN</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Taxable</th>
                <th className="px-4 py-3 text-right">Tax</th>
                <th className="px-4 py-3 text-right">Total Debit</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <RotateCcw className="mx-auto h-8 w-8 opacity-40 mb-2" />
                    <p className="font-medium">No purchase returns found</p>
                    <p className="text-xs mt-1">Create a new debit note or adjust search filters.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold num text-foreground">
                      <Link
                        href={`/dashboard/purchases/returns/${r.id}`}
                        className="hover:underline flex items-center gap-1.5 text-primary"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.returnNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[180px]">{r.supplierName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Link
                        href={`/dashboard/purchases/${r.purchaseId}`}
                        className="text-muted-foreground hover:text-foreground hover:underline num"
                      >
                        {r.purchaseNo}
                      </Link>
                      {r.supplierInvoiceNo && (
                        <span className="text-[11px] text-muted-foreground block">
                          Inv: {r.supplierInvoiceNo}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      <span className="inline-block bg-muted px-2 py-0.5 rounded text-[11px] font-medium text-foreground">
                        {r.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right num text-xs">
                      {formatINR(r.taxableAmount ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right num text-xs text-muted-foreground">
                      {formatINR(r.taxAmount ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right num font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatINR(r.totalAmount ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/purchases/returns/${r.id}`}
                        className="btn btn-secondary !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                      >
                        View
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
