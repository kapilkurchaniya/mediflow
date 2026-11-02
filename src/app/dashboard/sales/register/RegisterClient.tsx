"use client";

import { useState, useEffect, useRef, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Calculator,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Lock,
  Plus,
  Printer,
  RotateCcw,
  ShieldAlert,
  Unlock,
  User,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import {
  openShiftAction,
  closeShiftAction,
  type OpenShiftInput,
  type CloseShiftInput,
} from "@/app/actions/cash-sessions";
import {
  INDIAN_CURRENCY_DENOMINATIONS,
  calculateDenominationTotalPaise,
} from "@/lib/cash-register";
import type { CurrentShiftStats } from "@/server/domain/cash-sessions";

interface ShiftHistoryRow {
  id: string;
  status: string;
  openingCash: number | null;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
  openedAt: Date;
  closedAt: Date | null;
  notes: string | null;
  openedByName: string;
  closedByName: string | null;
}

interface RegisterClientProps {
  initialShift: CurrentShiftStats | null;
  initialHistory: ShiftHistoryRow[];
  storeName: string;
  requireShiftSetting: boolean;
}

export function RegisterClient({
  initialShift,
  initialHistory,
  storeName,
  requireShiftSetting,
}: RegisterClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active shift state
  const [shiftData, setShiftData] = useState<CurrentShiftStats | null>(initialShift);
  const [prevInitialShift, setPrevInitialShift] = useState(initialShift);
  if (initialShift !== prevInitialShift) {
    setPrevInitialShift(initialShift);
    setShiftData(initialShift);
  }

  const [history, setHistory] = useState<ShiftHistoryRow[]>(initialHistory);
  const [prevInitialHistory, setPrevInitialHistory] = useState(initialHistory);
  if (initialHistory !== prevInitialHistory) {
    setPrevInitialHistory(initialHistory);
    setHistory(initialHistory);
  }

  // Modals
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form states - Open Shift
  const [openManualPaise, setOpenManualPaise] = useState<number>(100000); // default ₹1,000
  const [openDenoms, setOpenDenoms] = useState<Record<string, number>>({
    "500": 2,
  });
  const [openNotes, setOpenNotes] = useState("");
  const [openUseDenomTally, setOpenUseDenomTally] = useState(true);

  // Form states - Close Shift
  const [closeManualPaise, setCloseManualPaise] = useState<number>(0);
  const [closeDenoms, setCloseDenoms] = useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = useState("");
  const [closeUseDenomTally, setCloseUseDenomTally] = useState(true);
  const [supervisorPin, setSupervisorPin] = useState("");

  // Shift duration elapsed live ticker
  const [durationString, setDurationString] = useState("");

  const firstInputRef = useRef<HTMLInputElement>(null);

  // Compute live elapsed duration in callback
  useEffect(() => {
    if (!shiftData?.session.openedAt) {
      return;
    }
    const updateDuration = () => {
      const openedAt = new Date(shiftData.session.openedAt).getTime();
      const diffSecs = Math.max(0, Math.floor((Date.now() - openedAt) / 1000));
      const hours = Math.floor(diffSecs / 3600);
      const mins = Math.floor((diffSecs % 3600) / 60);
      setDurationString(hours > 0 ? `${hours}h ${mins}m` : `${mins}m`);
    };

    const timer = setTimeout(updateDuration, 0);
    const interval = setInterval(updateDuration, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [shiftData?.session.openedAt]);

  // Keyboard accelerators (MARG / POS standard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger if inside another modal or input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") {
          setIsOpenModalOpen(false);
          setIsCloseModalOpen(false);
        }
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        if (!shiftData) {
          setIsOpenModalOpen(true);
        }
      } else if (e.key === "F8") {
        e.preventDefault();
        if (shiftData) {
          setIsCloseModalOpen(true);
        }
      } else if (e.key === "p" && (e.ctrlKey || e.altKey)) {
        e.preventDefault();
        if (shiftData) {
          router.push("/dashboard/sales/register/x-report/print");
        }
      } else if (e.key === "Escape") {
        setIsOpenModalOpen(false);
        setIsCloseModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shiftData, router]);

  // Auto focus first input when modal opens
  useEffect(() => {
    if (isOpenModalOpen || isCloseModalOpen) {
      setTimeout(() => {
        firstInputRef.current?.focus();
        firstInputRef.current?.select();
      }, 50);
    }
  }, [isOpenModalOpen, isCloseModalOpen]);

  // Denomination totals
  const openDenomTotalPaise = useMemo(
    () => calculateDenominationTotalPaise(openDenoms),
    [openDenoms],
  );

  const effectiveOpenPaise = openUseDenomTally ? openDenomTotalPaise : openManualPaise;

  const closeDenomTotalPaise = useMemo(
    () => calculateDenominationTotalPaise(closeDenoms),
    [closeDenoms],
  );

  const effectiveClosePaise = closeUseDenomTally ? closeDenomTotalPaise : closeManualPaise;

  // Expected vs Counted Cash Discrepancy
  const expectedCashPaise = shiftData?.stats.expectedCash ?? 0;
  const closeDifferencePaise = effectiveClosePaise - expectedCashPaise;

  // Handlers for Opening Shift
  const handleOpenShift = async () => {
    setActionError(null);
    startTransition(async () => {
      const payload: OpenShiftInput = {
        openingCash: effectiveOpenPaise,
        notes: openNotes.trim() || undefined,
        denominations: openUseDenomTally ? openDenoms : undefined,
      };
      const res = await openShiftAction(payload);
      if (!res.ok) {
        setActionError(res.error);
      } else {
        setIsOpenModalOpen(false);
        router.refresh();
      }
    });
  };

  // Handlers for Closing Shift
  const handleCloseShift = async () => {
    if (!shiftData) return;
    setActionError(null);
    startTransition(async () => {
      const payload: CloseShiftInput = {
        sessionId: shiftData.session.id,
        actualCash: effectiveClosePaise,
        notes: closeNotes.trim() || undefined,
        denominations: closeUseDenomTally ? closeDenoms : undefined,
        supervisorPin: supervisorPin.trim() || undefined,
      };
      const res = await closeShiftAction(payload);
      if (!res.ok) {
        setActionError(res.error);
      } else {
        setIsCloseModalOpen(false);
        setSupervisorPin("");
        router.push(`/dashboard/sales/register/z-report/${res.session.id}/print`);
      }
    });
  };

  const handleDenomChange = (
    denom: number,
    valStr: string,
    setMap: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  ) => {
    const count = parseInt(valStr, 10);
    setMap((prev) => {
      const next = { ...prev };
      if (isNaN(count) || count <= 0) {
        delete next[String(denom)];
      } else {
        next[String(denom)] = count;
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Status Overview */}
      <div className="bg-white rounded-2xl border border-ink-100 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl shadow-inner ${
                shiftData
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-amber-50 text-amber-600 border border-amber-200"
              }`}
            >
              {shiftData ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-ink-900">
                  {shiftData ? "Active Cash Register Shift" : "Register is Closed"}
                </h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    shiftData
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {shiftData ? "● OPEN" : "○ CLOSED"}
                </span>
                {requireShiftSetting && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    Shift Required for Billing
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-500 mt-0.5">
                {shiftData ? (
                  <>
                    Opened by <strong className="text-ink-800">{shiftData.openedByName}</strong> at{" "}
                    {new Date(shiftData.session.openedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    {durationString && (
                      <span className="text-ink-400 font-mono text-xs">({durationString} ago)</span>
                    )}
                  </>
                ) : (
                  "Open a register shift with an initial cash float to begin recording drawer cash flow."
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            {shiftData ? (
              <>
                <Link
                  href="/dashboard/sales/register/x-report/print"
                  className="btn btn-secondary flex items-center gap-2 text-xs md:text-sm py-2 px-3 flex-1 md:flex-initial justify-center"
                  title="Mid-Shift Snapshot (Ctrl+P)"
                >
                  <Printer className="w-4 h-4 text-ink-600" />
                  <span>X-Report</span>
                  <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-ink-100 text-ink-700 rounded border border-ink-200">
                    Alt+P
                  </kbd>
                </Link>
                <button
                  onClick={() => {
                    setActionError(null);
                    // Pre-fill close counted cash with expected cash or denomination
                    setCloseManualPaise(shiftData.stats.expectedCash);
                    setIsCloseModalOpen(true);
                  }}
                  className="btn btn-primary bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 text-xs md:text-sm py-2 px-3 flex-1 md:flex-initial justify-center"
                  title="Close Register Shift (F8)"
                >
                  <Lock className="w-4 h-4" />
                  <span>Close Register</span>
                  <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-rose-750 text-white/90 rounded border border-rose-500">
                    F8
                  </kbd>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setActionError(null);
                  setIsOpenModalOpen(true);
                }}
                className="btn btn-primary bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-2 text-xs md:text-sm py-2 px-4 w-full md:w-auto justify-center"
                title="Open Register Shift (F4)"
              >
                <Unlock className="w-4 h-4" />
                <span>Open Register</span>
                <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-brand-750 text-white/90 rounded border border-brand-500">
                  F4
                </kbd>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* When Shift is Open: KPI Cards and Real-Time Summary */}
      {shiftData && (
        <div className="space-y-6">
          {/* KPI Drawer Balance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Opening Float */}
            <div className="bg-white rounded-xl border border-ink-100 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-ink-500 font-medium uppercase tracking-wider">
                <span>Opening Float</span>
                <Banknote className="w-4 h-4 text-ink-400" />
              </div>
              <div className="text-2xl font-bold text-ink-900 mt-2 font-mono">
                {formatINR(shiftData.stats.openingCash)}
              </div>
              <div className="text-xs text-ink-400 mt-1">Starting cash in drawer</div>
            </div>

            {/* Cash In (Sales + Receipts) */}
            <div className="bg-white rounded-xl border border-ink-100 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-emerald-600 font-medium uppercase tracking-wider">
                <span>Cash In</span>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-2 font-mono">
                +{formatINR(shiftData.stats.cashSales + shiftData.stats.cashReceipts)}
              </div>
              <div className="text-xs text-ink-500 mt-1 flex justify-between">
                <span>Sales: {formatINR(shiftData.stats.cashSales)}</span>
                {shiftData.stats.cashReceipts > 0 && (
                  <span>Rcpts: {formatINR(shiftData.stats.cashReceipts)}</span>
                )}
              </div>
            </div>

            {/* Cash Out (Refunds + Cancels + Payouts) */}
            <div className="bg-white rounded-xl border border-ink-100 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-rose-600 font-medium uppercase tracking-wider">
                <span>Cash Out</span>
                <TrendingDown className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-bold text-rose-700 mt-2 font-mono">
                -
                {formatINR(
                  shiftData.stats.cashRefunds +
                    shiftData.stats.cashCancels +
                    shiftData.stats.cashPayouts,
                )}
              </div>
              <div className="text-xs text-ink-500 mt-1 flex gap-2 overflow-x-auto">
                <span>Refunds: {formatINR(shiftData.stats.cashRefunds)}</span>
                {shiftData.stats.cashCancels > 0 && (
                  <span>Cancels: {formatINR(shiftData.stats.cashCancels)}</span>
                )}
              </div>
            </div>

            {/* Expected Cash in Drawer */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold uppercase tracking-wider">
                <span>Expected Drawer Cash</span>
                <Calculator className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-900 mt-2 font-mono">
                {formatINR(shiftData.stats.expectedCash)}
              </div>
              <div className="text-xs text-emerald-700 font-medium mt-1">
                Calculated physical cash to count
              </div>
            </div>
          </div>

          {/* Tender Breakdown & Transaction Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tender Splits Card */}
            <div className="bg-white rounded-2xl border border-ink-100 p-5 shadow-sm lg:col-span-2">
              <h3 className="text-base font-bold text-ink-900 mb-4 flex items-center justify-between">
                <span>Sales by Payment Method (Tender Breakdown)</span>
                <span className="text-xs font-normal text-ink-500">
                  Total Billed:{" "}
                  <strong className="text-ink-800 font-mono">
                    {formatINR(shiftData.stats.tenders.total)}
                  </strong>
                </span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs font-semibold text-ink-400 uppercase tracking-wider">
                      <th className="pb-2">Payment Method</th>
                      <th className="pb-2 text-right">Amount Billed</th>
                      <th className="pb-2 text-right">% of Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50 font-medium">
                    <tr>
                      <td className="py-2.5 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-ink-800">Cash</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-ink-900">
                        {formatINR(shiftData.stats.tenders.cash)}
                      </td>
                      <td className="py-2.5 text-right text-xs text-ink-500 font-mono">
                        {shiftData.stats.tenders.total > 0
                          ? `${((shiftData.stats.tenders.cash / shiftData.stats.tenders.total) * 100).toFixed(1)}%`
                          : "0.0%"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                        <span className="text-ink-800">UPI / QR Code</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-ink-900">
                        {formatINR(shiftData.stats.tenders.upi)}
                      </td>
                      <td className="py-2.5 text-right text-xs text-ink-500 font-mono">
                        {shiftData.stats.tenders.total > 0
                          ? `${((shiftData.stats.tenders.upi / shiftData.stats.tenders.total) * 100).toFixed(1)}%`
                          : "0.0%"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <span className="text-ink-800">Card (Debit/Credit)</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-ink-900">
                        {formatINR(shiftData.stats.tenders.card)}
                      </td>
                      <td className="py-2.5 text-right text-xs text-ink-500 font-mono">
                        {shiftData.stats.tenders.total > 0
                          ? `${((shiftData.stats.tenders.card / shiftData.stats.tenders.total) * 100).toFixed(1)}%`
                          : "0.0%"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                        <span className="text-ink-800">Bank Transfer / NEFT</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-ink-900">
                        {formatINR(shiftData.stats.tenders.bank)}
                      </td>
                      <td className="py-2.5 text-right text-xs text-ink-500 font-mono">
                        {shiftData.stats.tenders.total > 0
                          ? `${((shiftData.stats.tenders.bank / shiftData.stats.tenders.total) * 100).toFixed(1)}%`
                          : "0.0%"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <span className="text-ink-800">Customer Credit (Khata)</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-ink-900">
                        {formatINR(shiftData.stats.tenders.credit)}
                      </td>
                      <td className="py-2.5 text-right text-xs text-ink-500 font-mono">
                        {shiftData.stats.tenders.total > 0
                          ? `${((shiftData.stats.tenders.credit / shiftData.stats.tenders.total) * 100).toFixed(1)}%`
                          : "0.0%"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shift Details & Operations Counter */}
            <div className="bg-white rounded-2xl border border-ink-100 p-5 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-ink-900">Shift Operations Counter</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b border-ink-50">
                  <span className="text-ink-500">Completed Sales Bills</span>
                  <span className="font-bold text-ink-900">
                    {shiftData.stats.transactionCounts.sales} bills
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-ink-50">
                  <span className="text-ink-500">Customer Returns (CN)</span>
                  <span className="font-bold text-amber-700">
                    {shiftData.stats.transactionCounts.returns} returns
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-ink-50">
                  <span className="text-ink-500">Cancelled Sales</span>
                  <span className="font-bold text-rose-700">
                    {shiftData.stats.transactionCounts.cancels} bills
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-ink-50">
                  <span className="text-ink-500">Cash Payouts (Expense/Supplier)</span>
                  <span className="font-bold text-ink-900">
                    {shiftData.stats.transactionCounts.payouts} vouchers
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-ink-500">Cash Receipts (Customer Khata)</span>
                  <span className="font-bold text-ink-900">
                    {shiftData.stats.transactionCounts.receipts} vouchers
                  </span>
                </div>
              </div>

              {shiftData.session.notes && (
                <div className="mt-4 p-3 bg-zinc-50 rounded-xl text-xs text-ink-600 border border-ink-100">
                  <strong className="block text-ink-800 font-semibold mb-1">Shift Notes:</strong>
                  <pre className="whitespace-pre-wrap font-sans">{shiftData.session.notes}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shift History Table */}
      <div className="bg-white rounded-2xl border border-ink-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-ink-900">Register Shift History</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Auditable records of past cashier drawers and variance tracking.
            </p>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-ink-400 text-sm">
            No shift records found for this store.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 text-xs font-semibold text-ink-500 uppercase tracking-wider border-b border-ink-100">
                <tr>
                  <th className="px-6 py-3">Shift Date & Time</th>
                  <th className="px-6 py-3">Cashier</th>
                  <th className="px-6 py-3 text-right">Opening Float</th>
                  <th className="px-6 py-3 text-right">Expected</th>
                  <th className="px-6 py-3 text-right">Counted Actual</th>
                  <th className="px-6 py-3 text-center">Variance</th>
                  <th className="px-6 py-3 text-right">Audit Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {history.map((row) => {
                  const diff = row.difference ?? 0;
                  const isClosed = row.status === "closed";
                  return (
                    <tr key={row.id} className="hover:bg-ink-50/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-ink-900">
                          {new Date(row.openedAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-ink-500">
                          {new Date(row.openedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          →{" "}
                          {row.closedAt
                            ? new Date(row.closedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Ongoing"}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs">
                        <div className="font-medium text-ink-800">
                          <User className="inline-block w-3.5 h-3.5 mr-1 text-ink-400" />
                          {row.openedByName}
                        </div>
                        {row.closedByName && row.closedByName !== row.openedByName && (
                          <div className="text-ink-400">Closed by: {row.closedByName}</div>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right font-mono text-ink-800 text-xs">
                        {formatINR(row.openingCash ?? 0)}
                      </td>

                      <td className="px-6 py-4 text-right font-mono text-ink-800 text-xs">
                        {isClosed ? formatINR(row.expectedCash ?? 0) : "—"}
                      </td>

                      <td className="px-6 py-4 text-right font-mono text-ink-900 font-semibold text-xs">
                        {isClosed ? formatINR(row.actualCash ?? 0) : "—"}
                      </td>

                      <td className="px-6 py-4 text-center">
                        {!isClosed ? (
                          <span className="inline-flex px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                            Active
                          </span>
                        ) : diff === 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Balanced
                          </span>
                        ) : diff < 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
                            {formatINR(diff)} Short
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                            +{formatINR(diff)} Over
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {isClosed ? (
                          <Link
                            href={`/dashboard/sales/register/z-report/${row.id}/print`}
                            className="btn btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
                          >
                            <FileText className="w-3.5 h-3.5 text-ink-500" />
                            <span>Z-Report</span>
                          </Link>
                        ) : (
                          <Link
                            href="/dashboard/sales/register/x-report/print"
                            className="btn btn-ghost text-xs py-1.5 px-3 inline-flex items-center gap-1.5 text-brand-600"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>X-Report</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: OPEN REGISTER SHIFT                                              */}
      {/* ========================================================================= */}
      {isOpenModalOpen && (
        <div className="fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-ink-100 shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink-900">Open Register Shift</h3>
                  <p className="text-xs text-ink-500">Record initial opening cash float for drawer.</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpenModalOpen(false)}
                className="text-ink-400 hover:text-ink-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {actionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Mode Toggle: Denomination Tally vs Direct Amount */}
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
                  Cash Float Counting Mode
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenUseDenomTally(true)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                      openUseDenomTally
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                    }`}
                  >
                    Denomination Tally
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenUseDenomTally(false)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                      !openUseDenomTally
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                    }`}
                  >
                    Direct Lump Sum
                  </button>
                </div>
              </div>

              {openUseDenomTally ? (
                /* Denomination Tally Counter Grid */
                <div className="space-y-3">
                  <div className="text-xs text-ink-500">
                    Enter the count of each banknote/coin denomination. Press{" "}
                    <kbd className="px-1 bg-ink-100 rounded border border-ink-200">Enter</kbd> to move to next row.
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {INDIAN_CURRENCY_DENOMINATIONS.map((denom, idx) => {
                      const count = openDenoms[String(denom)] ?? "";
                      const rowTotalPaise = (openDenoms[String(denom)] ?? 0) * denom * 100;
                      return (
                        <div
                          key={denom}
                          className="flex items-center justify-between p-2 rounded-xl border border-ink-100 bg-ink-50/40"
                        >
                          <span className="font-semibold text-ink-800 w-12 font-mono">₹{denom}</span>
                          <span className="text-ink-400 text-xs">×</span>
                          <input
                            ref={idx === 0 ? firstInputRef : undefined}
                            type="number"
                            min="0"
                            placeholder="0"
                            value={count}
                            onChange={(e) => handleDenomChange(denom, e.target.value, setOpenDenoms)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const inputs = Array.from(
                                  document.querySelectorAll<HTMLInputElement>(".open-denom-input"),
                                );
                                const nextInput = inputs[idx + 1];
                                if (nextInput) nextInput.focus();
                              }
                            }}
                            className="open-denom-input w-16 text-center font-mono py-1 px-1 rounded-lg border border-ink-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs"
                          />
                          <span className="text-xs font-mono text-ink-600 w-16 text-right">
                            {formatINR(rowTotalPaise)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Direct Amount Input */
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider">
                    Opening Float Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 font-bold">
                      ₹
                    </span>
                    <input
                      ref={firstInputRef}
                      type="number"
                      min="0"
                      step="1"
                      value={openManualPaise / 100}
                      onChange={(e) => setOpenManualPaise(Math.round((parseFloat(e.target.value) || 0) * 100))}
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-ink-200 text-lg font-bold font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex gap-2">
                    {[500, 1000, 2000, 5000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setOpenManualPaise(preset * 100)}
                        className="px-3 py-1 rounded-lg border border-ink-200 text-xs font-mono font-medium hover:bg-ink-100 transition-colors"
                      >
                        ₹{preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Total Summary Callout */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                  Calculated Opening Float:
                </span>
                <span className="text-xl font-bold font-mono text-emerald-900">
                  {formatINR(effectiveOpenPaise)}
                </span>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-1">
                  Shift Notes / Cashier Handover (Optional)
                </label>
                <textarea
                  rows={2}
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  placeholder="e.g. Morning shift drawer float handed over by Ramesh."
                  className="w-full p-2.5 rounded-xl border border-ink-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-ink-100 flex items-center justify-end gap-3 bg-zinc-50/50">
              <button
                type="button"
                onClick={() => setIsOpenModalOpen(false)}
                className="btn btn-secondary text-xs py-2 px-4"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleOpenShift}
                className="btn btn-primary bg-brand-600 hover:bg-brand-700 text-white text-xs py-2 px-5 flex items-center gap-2"
              >
                {isPending ? "Opening..." : "Confirm & Open Register"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CLOSE REGISTER SHIFT (WITH RECONCILIATION AUDIT)                  */}
      {/* ========================================================================= */}
      {isCloseModalOpen && shiftData && (
        <div className="fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-ink-100 shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink-900">Close Register & Tally Drawer</h3>
                  <p className="text-xs text-ink-500">Count physical drawer cash and record audit variance.</p>
                </div>
              </div>
              <button
                onClick={() => setIsCloseModalOpen(false)}
                className="text-ink-400 hover:text-ink-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {actionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Expected Cash Reminder */}
              <div className="p-3.5 bg-ink-50 rounded-xl border border-ink-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
                    Expected Drawer Cash
                  </div>
                  <div className="text-xs text-ink-400">
                    Opening Float + Cash Sales - Refunds - Cancels
                  </div>
                </div>
                <div className="text-xl font-bold font-mono text-ink-900">
                  {formatINR(expectedCashPaise)}
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
                  Drawer Counting Mode
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCloseUseDenomTally(true)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                      closeUseDenomTally
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                    }`}
                  >
                    Denomination Tally
                  </button>
                  <button
                    type="button"
                    onClick={() => setCloseUseDenomTally(false)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                      !closeUseDenomTally
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                    }`}
                  >
                    Direct Lump Sum
                  </button>
                </div>
              </div>

              {closeUseDenomTally ? (
                /* Denomination Tally Counter Grid */
                <div className="space-y-3">
                  <div className="text-xs text-ink-500">
                    Enter physical notes and coins counted in drawer at shift closing.
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {INDIAN_CURRENCY_DENOMINATIONS.map((denom, idx) => {
                      const count = closeDenoms[String(denom)] ?? "";
                      const rowTotalPaise = (closeDenoms[String(denom)] ?? 0) * denom * 100;
                      return (
                        <div
                          key={denom}
                          className="flex items-center justify-between p-2 rounded-xl border border-ink-100 bg-ink-50/40"
                        >
                          <span className="font-semibold text-ink-800 w-12 font-mono">₹{denom}</span>
                          <span className="text-ink-400 text-xs">×</span>
                          <input
                            ref={idx === 0 ? firstInputRef : undefined}
                            type="number"
                            min="0"
                            placeholder="0"
                            value={count}
                            onChange={(e) => handleDenomChange(denom, e.target.value, setCloseDenoms)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const inputs = Array.from(
                                  document.querySelectorAll<HTMLInputElement>(".close-denom-input"),
                                );
                                const nextInput = inputs[idx + 1];
                                if (nextInput) nextInput.focus();
                              }
                            }}
                            className="close-denom-input w-16 text-center font-mono py-1 px-1 rounded-lg border border-ink-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs"
                          />
                          <span className="text-xs font-mono text-ink-600 w-16 text-right">
                            {formatINR(rowTotalPaise)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Direct Amount Input */
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider">
                    Actual Counted Cash in Drawer (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 font-bold">
                      ₹
                    </span>
                    <input
                      ref={firstInputRef}
                      type="number"
                      min="0"
                      step="1"
                      value={closeManualPaise / 100}
                      onChange={(e) =>
                        setCloseManualPaise(Math.round((parseFloat(e.target.value) || 0) * 100))
                      }
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-ink-200 text-lg font-bold font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCloseManualPaise(expectedCashPaise)}
                    className="text-xs text-brand-600 hover:text-brand-800 underline font-medium"
                  >
                    Match Expected ({formatINR(expectedCashPaise)})
                  </button>
                </div>
              )}

              {/* Reconciliation Variance Summary Badge */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  closeDifferencePaise === 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : closeDifferencePaise < 0
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider">
                    Counted Actual Cash:{" "}
                    <strong className="font-mono text-sm">{formatINR(effectiveClosePaise)}</strong>
                  </div>
                  <div className="text-xs mt-0.5">
                    {closeDifferencePaise === 0
                      ? "✓ Drawer is perfectly balanced"
                      : closeDifferencePaise < 0
                      ? `⚠️ Shortage: Cash missing by ${formatINR(Math.abs(closeDifferencePaise))}`
                      : `ℹ️ Overage: Excess cash by ${formatINR(closeDifferencePaise)}`}
                  </div>
                </div>
                <div className="text-base font-bold font-mono">
                  {closeDifferencePaise === 0
                    ? "₹0.00"
                    : `${closeDifferencePaise > 0 ? "+" : ""}${formatINR(closeDifferencePaise)}`}
                </div>
              </div>

              {/* Supervisor Authorization Guard for Discrepancy > ₹500 */}
              {Math.abs(closeDifferencePaise) > 50000 && (
                <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50/80 text-amber-950 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Supervisor Authorization Required (Variance &gt; ₹500)</span>
                  </div>
                  <p className="text-[11.5px] text-amber-800 leading-relaxed">
                    Drawer variance is {formatINR(Math.abs(closeDifferencePaise))} ({closeDifferencePaise < 0 ? "shortage" : "overage"}). A manager or supervisor PIN is required to authorize and close this shift.
                  </p>
                  <div className="pt-1">
                    <label className="block text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-1">
                      Supervisor / Manager PIN
                    </label>
                    <input
                      type="password"
                      maxLength={8}
                      value={supervisorPin}
                      onChange={(e) => setSupervisorPin(e.target.value)}
                      placeholder="Enter 4-digit supervisor PIN"
                      className="w-full px-3 py-2 text-sm font-mono tracking-widest rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-1">
                  Closing Notes / Discrepancy Reason
                </label>
                <textarea
                  rows={2}
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="e.g. ₹50 difference due to loose change shortage, approved by supervisor."
                  className="w-full p-2.5 rounded-xl border border-ink-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-ink-100 flex items-center justify-end gap-3 bg-zinc-50/50">
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(false)}
                className="btn btn-secondary text-xs py-2 px-4"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || (Math.abs(closeDifferencePaise) > 50000 && supervisorPin.trim().length < 4)}
                onClick={handleCloseShift}
                className="btn btn-primary bg-rose-600 hover:bg-rose-700 text-white text-xs py-2 px-5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending
                  ? "Closing..."
                  : Math.abs(closeDifferencePaise) > 50000 && supervisorPin.trim().length < 4
                  ? "Supervisor PIN Required"
                  : "Confirm & Lock Shift (Z-Report)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
