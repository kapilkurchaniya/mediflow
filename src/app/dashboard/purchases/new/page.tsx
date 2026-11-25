"use client";

import { useActionState, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createPurchaseInvoice, PurchaseItemInput } from "@/app/actions/purchases";
import { getSuppliers } from "@/app/actions/suppliers";
import { getMedicines } from "@/app/actions/inventory";
import { getPurchaseOrder } from "@/app/actions/purchase-orders";
import {
  Save,
  Plus,
  Trash2,
  FileText,
  Truck,
  AlertCircle,
  AlertTriangle,
  ClipboardList,
  Layers,
  FileSpreadsheet,
  UploadCloud,
  UserPlus,
} from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { computePurchaseTotals } from "@/lib/money";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp, type GstRateBp } from "@/lib/regulatory";
import { buildDraftKey, useFormDraft } from "@/lib/useFormDraft";
import {
  consumePendingPurchaseImportFile,
  isSupportedPurchaseBillFile,
} from "@/lib/pending-purchase-file";
import type { PendingSupplierMeta } from "@/lib/pending-supplier";
import { QuickRegisterSupplierModal } from "@/app/components/QuickRegisterSupplierModal";
import { ImportDistributorBillModal } from "./ImportDistributorBillModal";

function getIstTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function getCurrentIndianFyStartStr(istToday: string): string {
  const [yStr, mStr] = istToday.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-04-01`;
}

function NewPurchaseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poId = searchParams.get("poId");

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [medicines, setMedicines] = useState<{
    id: string;
    name: string;
    gstRateBp: number;
    unitsPerPack: number;
    packUnit: string;
    looseUnit: string;
  }[]>([]);
  const [linkedPo, setLinkedPo] = useState<{ id: string; poNo: string } | null>(null);

  const defaultInvoiceDate = useState(() => getIstTodayStr())[0];
  const {
    value: draft,
    setValue: setDraft,
    hasRestoredDraft,
    clearDraft,
    dismissRestoredNotice,
  } = useFormDraft(
    buildDraftKey("new-grn"),
    {
      supplierId: "",
      supplierInvoiceNo: "",
      invoiceDate: defaultInvoiceDate,
      notes: "",
      items: [] as PurchaseItemInput[],
    },
    {
      isEmpty: (d) =>
        !d.supplierId && !d.supplierInvoiceNo && !d.notes && d.items.length === 0,
    }
  );

  const { supplierId, supplierInvoiceNo, invoiceDate, notes, items } = draft;
  const setSupplierId = (val: string) =>
    setDraft((prev) => ({ ...prev, supplierId: val }));
  const setSupplierInvoiceNo = (val: string) =>
    setDraft((prev) => ({ ...prev, supplierInvoiceNo: val }));
  const setInvoiceDate = (val: string) =>
    setDraft((prev) => ({ ...prev, invoiceDate: val }));
  const setNotes = (val: string | ((prev: string) => string)) =>
    setDraft((prev) => ({
      ...prev,
      notes: typeof val === "function" ? val(prev.notes) : val,
    }));
  const setItems = (updater: PurchaseItemInput[] | ((prev: PurchaseItemInput[]) => PurchaseItemInput[])) =>
    setDraft((prev) => ({
      ...prev,
      items: typeof updater === "function" ? updater(prev.items) : updater,
    }));

  const [historicalDateNotice, setHistoricalDateNotice] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [droppedImportFile, setDroppedImportFile] = useState<File | null>(null);
  const [pendingSupplierMeta, setPendingSupplierMeta] = useState<PendingSupplierMeta | null>(null);
  const [showQuickRegisterSupplier, setShowQuickRegisterSupplier] = useState(false);
  const [showManualAddSupplier, setShowManualAddSupplier] = useState(false);
  const [isDraggingBill, setIsDraggingBill] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const handedOffFile = consumePendingPurchaseImportFile();
    if (handedOffFile) {
      void Promise.resolve().then(() => {
        setDroppedImportFile(handedOffFile);
        setIsImportModalOpen(true);
      });
    }

    getSuppliers().then(setSuppliers);
    getMedicines("", 500).then((data) => {
      setMedicines(
        data.map((m) => ({
          id: m.medicine.id,
          name: m.medicine.name,
          gstRateBp: m.medicine.gstRateBp,
          unitsPerPack: m.medicine.unitsPerPack ?? 1,
          packUnit: m.medicine.packUnit ?? "strip",
          looseUnit: m.medicine.looseUnit ?? "tablet",
        }))
      );
    });

    if (poId) {
      getPurchaseOrder(poId).then((po) => {
        if (po) {
          setLinkedPo({ id: po.id, poNo: po.poNo });
          setSupplierId(po.supplierId);
          if (po.items && po.items.length > 0) {
            setItems(
              po.items.map((i) => ({
                medicineId: i.medicineId,
                batchNo: "",
                expiryDate: "",
                qty: Math.max(1, i.qty - i.receivedQty),
                freeQty: i.freeQty,
                rate: i.rate,
                mrp: Math.round(i.rate * 1.3),
                saleRate: Math.round(i.rate * 1.2),
                discountBp: 0,
                tradeDiscountBp: 0,
                cashDiscountBp: 0,
                unitsPerPack: 1,
                packUnit: "strip",
                looseUnit: "tablet",
                gstRateBp: DEFAULT_GST_RATE_BP,
              }))
            );
          }
        }
      });
    }
  }, [poId]);

  const [state, formAction, isPending] = useActionState(
    async () => {
      if (!supplierId && !pendingSupplierMeta?.name) {
        return { error: "Please select a supplier (or import an invoice)." };
      }
      if (!supplierInvoiceNo.trim()) return { error: "Supplier invoice number is required." };
      if (items.length === 0) return { error: "Please add at least one line item." };

      const res = await createPurchaseInvoice(
        supplierId,
        supplierInvoiceNo.trim(),
        invoiceDate,
        items,
        notes.trim() || undefined,
        linkedPo?.id,
        !supplierId ? pendingSupplierMeta : null
      );
      if (res.success) {
        clearDraft();
        router.push("/dashboard/purchases");
        router.refresh();
      }
      return res;
    },
    null
  );

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        medicineId: "",
        batchNo: "",
        expiryDate: "",
        qty: 1,
        freeQty: 0,
        rate: 0,
        mrp: 0,
        saleRate: 0,
        discountBp: 0,
        tradeDiscountBp: 0,
        cashDiscountBp: 0,
        unitsPerPack: 1,
        packUnit: "strip",
        looseUnit: "tablet",
        gstRateBp: DEFAULT_GST_RATE_BP,
      },
    ]);
  };

  const updateItem = <K extends keyof PurchaseItemInput>(index: number, field: K, value: PurchaseItemInput[K]) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totals = computePurchaseTotals(
    items.map((item) => ({
      qty: item.qty,
      freeQty: item.freeQty || 0,
      rate: item.rate,
      tradeDiscountBp: item.tradeDiscountBp ?? item.discountBp ?? 0,
      cashDiscountBp: item.cashDiscountBp ?? 0,
      unitsPerPack: item.unitsPerPack ?? 1,
      gstRateBp: item.gstRateBp,
    }))
  );

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  return (
    <div
      className="page space-y-6 relative"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDraggingBill(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDraggingBill(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingBill(false);
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        if (!isSupportedPurchaseBillFile(f)) {
          setDropError(`Unsupported file "${f.name}". Drop a PDF, image (.jpg/.png/.webp), or CSV bill.`);
          return;
        }
        setDropError(null);
        setDroppedImportFile(f);
        setIsImportModalOpen(true);
      }}
    >
      <PageHeader
        backHref="/dashboard/purchases"
        eyebrow="Inventory Inward"
        title="Record Purchase Invoice (GRN)"
        description="Drop a supplier PDF, photo, or CSV anywhere on this page to auto-fill header & lines, then verify and post."
      />

      {dropError && (
        <div className="alert alert-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{dropError}</span>
        </div>
      )}

      {linkedPo && (
        <div className="card p-3.5 bg-brand-50 border border-brand-200 text-brand-900 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-brand-600 shrink-0" />
            <span>
              Receiving goods against <strong>Purchase Order {linkedPo.poNo}</strong>. Items and rates pre-filled.
            </span>
          </div>
          <Link
            href={`/dashboard/purchases/orders/${linkedPo.id}`}
            className="text-brand-700 underline font-semibold text-xs hover:text-brand-900"
          >
            View PO Details
          </Link>
        </div>
      )}

      {state?.error && (
        <div className="alert alert-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-6">
        {hasRestoredDraft && !poId && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/70 px-4 py-2.5 text-xs text-brand-900 flex flex-wrap items-center justify-between gap-2">
            <span>
              Restored your unsaved GRN draft ({items.length} item{items.length === 1 ? "" : "s"}).
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  clearDraft({
                    supplierId: "",
                    supplierInvoiceNo: "",
                    invoiceDate: defaultInvoiceDate,
                    notes: "",
                    items: [],
                  })
                }
                className="font-semibold text-rose-700 hover:underline"
              >
                Discard Draft
              </button>
              <button
                type="button"
                onClick={dismissRestoredNotice}
                className="text-brand-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Invoice Info Card */}
        <div className="card p-5 space-y-4">
          <h3 className="card-title text-[14px] border-b border-ink-150 pb-2">Supplier & Bill Info</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="grn-supplier-select" className="label required !mb-0">Supplier</label>
                <button
                  type="button"
                  onClick={() => setShowManualAddSupplier(true)}
                  className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                >
                  + New Supplier
                </button>
              </div>
              <div className="relative">
                <Truck className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
                <select
                  id="grn-supplier-select"
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    if (e.target.value) setPendingSupplierMeta(null);
                  }}
                  className="input pl-9"
                  required={!pendingSupplierMeta}
                >
                  <option value="">
                    {pendingSupplierMeta
                      ? `Pending: ${pendingSupplierMeta.name} (Unregistered)`
                      : "Select Supplier"}
                  </option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="grn-invoice-no-input" className="label required">Supplier Invoice No.</label>
              <div className="relative">
                <FileText className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
                <input
                  id="grn-invoice-no-input"
                  type="text"
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-9842"
                  className="input pl-9 uppercase"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="grn-invoice-date-input" className="label required">Invoice Date</label>
              <input
                id="grn-invoice-date-input"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => {
                    setInvoiceDate(e.target.value);
                    setHistoricalDateNotice(null);
                  }}
                  className="input"
                  required
                />
              </div>
            </div>

          {historicalDateNotice && (
            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>{historicalDateNotice}</span>
            </div>
          )}

          {!supplierId && pendingSupplierMeta && (
            <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    Supplier &ldquo;{pendingSupplierMeta.name}&rdquo; is not registered yet.
                  </span>{" "}
                  You can register them now with pre-filled invoice details, or post stock first (a warning will appear on Purchases &amp; Suppliers until registered).
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickRegisterSupplier(true)}
                className="btn btn-primary btn-xs shrink-0 flex items-center gap-1"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Quick Register (Pre-filled)
              </button>
            </div>
          )}
        </div>

        {/* Batch Line Items Card */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-ink-150 flex items-center justify-between">
            <div>
              <h3 className="card-title text-[14px]">Invoice Items & Batches</h3>
              <p className="card-description">Enter batch details, quantities, cost rates, and GST.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="btn btn-secondary text-xs flex items-center gap-1.5 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 hover:bg-brand-50/50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                Import Bill (CSV / PDF / Photo OCR)
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                className="btn btn-secondary text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Row
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table text-[12px] w-full">
              <thead>
                <tr>
                  <th className="w-56">Medicine & Packaging</th>
                  <th className="w-28">Batch No</th>
                  <th className="w-28">Expiry</th>
                  <th className="w-18 text-center">Billed (Pk)</th>
                  <th className="w-18 text-center">Free (Scheme)</th>
                  <th className="w-24 text-right">Cost/Pk (₹)</th>
                  <th className="w-16 text-center">TD %</th>
                  <th className="w-18 text-center">GST %</th>
                  <th className="w-16 text-center">CD %</th>
                  <th className="w-24 text-right">MRP/Pk (₹)</th>
                  <th className="w-28 text-right">Landed Cost</th>
                  <th className="w-24 text-right">Payable</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-8 text-ink-400">
                      No line items yet. Click &ldquo;Add Row&rdquo; to start recording received batches.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => {
                    const lineRes = totals.lines[index];
                    const upp = Math.max(1, item.unitsPerPack ?? 1);

                    return (
                      <tr key={index} className="hover:bg-ink-50/50">
                        <td>
                          <select
                            value={item.medicineId}
                            onChange={(e) => {
                              const med = medicines.find((m) => m.id === e.target.value);
                              updateItem(index, "medicineId", e.target.value);
                              if (med) {
                                updateItem(index, "gstRateBp", isValidGstRateBp(med.gstRateBp) ? med.gstRateBp : DEFAULT_GST_RATE_BP);
                                updateItem(index, "unitsPerPack", med.unitsPerPack || 1);
                                updateItem(index, "packUnit", med.packUnit || "strip");
                                updateItem(index, "looseUnit", med.looseUnit || "tablet");
                              }
                            }}
                            className="input !h-8.5 text-[12px]"
                            required
                          >
                            <option value="">Select Item</option>
                            {medicines.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          {upp > 1 && (
                            <div className="flex items-center gap-1 mt-1 text-[11px] text-brand-700 font-medium">
                              <Layers className="w-3 h-3" />
                              <span>
                                1 {item.packUnit || "strip"} = {upp} {item.looseUnit || "tablet"}s
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          <input
                            type="text"
                            value={item.batchNo}
                            onChange={(e) => updateItem(index, "batchNo", e.target.value.toUpperCase())}
                            className="input !h-8.5 font-mono uppercase text-[12px]"
                            placeholder="BATCH-12"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => updateItem(index, "expiryDate", e.target.value)}
                            className="input !h-8.5 text-[11px]"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={item.qty || ""}
                            onChange={(e) => updateItem(index, "qty", parseInt(e.target.value, 10) || 0)}
                            className="input !h-8.5 text-center num text-[12.5px]"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={item.freeQty || ""}
                            onChange={(e) => updateItem(index, "freeQty", parseInt(e.target.value, 10) || 0)}
                            className="input !h-8.5 text-center num text-[12.5px]"
                            placeholder="0"
                          />
                          {(item.freeQty || 0) > 0 && (
                            <span className="badge badge-success text-[10px] mt-0.5 font-mono whitespace-nowrap block text-center">
                              {item.qty}+{item.freeQty} Free
                            </span>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.rate ? (item.rate / 100).toFixed(2) : ""}
                            onChange={(e) =>
                              updateItem(index, "rate", Math.round(parseFloat(e.target.value) * 100) || 0)
                            }
                            className="input !h-8.5 text-right num text-[12.5px]"
                            placeholder="0.00"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={item.tradeDiscountBp !== undefined ? item.tradeDiscountBp / 100 : item.discountBp ? item.discountBp / 100 : ""}
                            onChange={(e) => {
                              const bp = Math.round(parseFloat(e.target.value) * 100) || 0;
                              updateItem(index, "tradeDiscountBp", bp);
                              updateItem(index, "discountBp", bp);
                            }}
                            className="input !h-8.5 text-center num text-[12px]"
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <select
                            value={item.gstRateBp}
                            onChange={(e) => updateItem(index, "gstRateBp", parseInt(e.target.value, 10) as GstRateBp)}
                            className="input !h-8.5 text-center num text-[12px]"
                          >
                            <option value={0}>0%</option>
                            <option value={500}>5%</option>
                            <option value={1200}>12%</option>
                            <option value={1800}>18%</option>
                            <option value={2800}>28%</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={item.cashDiscountBp ? item.cashDiscountBp / 100 : ""}
                            onChange={(e) => {
                              const bp = Math.round(parseFloat(e.target.value) * 100) || 0;
                              updateItem(index, "cashDiscountBp", bp);
                            }}
                            className="input !h-8.5 text-center num text-[12px]"
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.mrp ? (item.mrp / 100).toFixed(2) : ""}
                            onChange={(e) =>
                              updateItem(index, "mrp", Math.round(parseFloat(e.target.value) * 100) || 0)
                            }
                            className="input !h-8.5 text-right num text-[12.5px]"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="text-right text-[11.5px] leading-snug">
                          <div className="font-semibold text-ink-900 num">
                            {formatINR(lineRes.landedPackCost)}
                            <span className="text-[10px] text-ink-500 font-normal">/{item.packUnit || "pk"}</span>
                          </div>
                          {upp > 1 && (
                            <div className="text-brand-700 font-medium num text-[10.5px]">
                              {formatINR(lineRes.landedUnitCost)}
                              <span className="text-[9.5px] text-ink-400">/{item.looseUnit || "unit"}</span>
                            </div>
                          )}
                        </td>
                        <td className="text-right font-bold num text-ink-900 text-[13px]">
                          {formatINR(lineRes.total)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-ink-400 hover:text-red-600 transition-colors p-1"
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Card & Save Button */}
        <div className="flex justify-end">
          <div className="card w-full md:w-88 p-5 space-y-3 shadow-xs">
            <h3 className="card-title text-[14px] border-b border-ink-150 pb-2">GRN Invoice Summary</h3>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between text-ink-600">
                <span>Gross Amount</span>
                <span className="num font-medium text-ink-900">{formatINR(totals.gross)}</span>
              </div>
              {totals.tradeDiscount > 0 && (
                <div className="flex justify-between text-brand-700">
                  <span>Trade Discount (TD)</span>
                  <span className="num font-medium">- {formatINR(totals.tradeDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-ink-600 font-medium pt-1 border-t border-ink-150">
                <span>Taxable Amount</span>
                <span className="num font-semibold text-ink-900">{formatINR(totals.taxable)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>Input GST</span>
                <span className="num font-medium text-ink-900">+ {formatINR(totals.tax)}</span>
              </div>
              {totals.cashDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Cash Discount (CD)</span>
                  <span className="num font-medium">- {formatINR(totals.cashDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-ink-900 pt-3 border-t border-ink-200">
                <span>Total Payable</span>
                <span className="text-xl font-black text-brand-700 num">{formatINR(totals.total)}</span>
              </div>
            </div>

            {state?.error && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <span>{state.error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || items.length === 0}
              className="btn btn-primary w-full !py-3 !text-[14px] font-bold shadow-md shadow-brand-600/20 mt-4"
            >
              <Save className="h-4 w-4 mr-2" />
              {isPending ? "Posting GRN & Ledger..." : "Post Purchase Invoice"}
            </button>
          </div>
        </div>
      </form>

      <ImportDistributorBillModal
        isOpen={isImportModalOpen}
        initialFile={droppedImportFile}
        onClose={() => {
          setIsImportModalOpen(false);
          setDroppedImportFile(null);
        }}
        selectedSupplierId={supplierId}
        onSelectSupplier={(id) => {
          setSupplierId(id);
          setPendingSupplierMeta(null);
        }}
        onPendingSupplier={(meta) => setPendingSupplierMeta(meta)}
        onFillHeader={(hdr) => {
          if (hdr.invoiceNo) setSupplierInvoiceNo(hdr.invoiceNo);
          if (hdr.invoiceDate) {
            const todayStr = getIstTodayStr();
            const fyStartStr = getCurrentIndianFyStartStr(todayStr);
            if (hdr.invoiceDate < fyStartStr) {
              setInvoiceDate(todayStr);
              setNotes((prev) =>
                prev.includes(hdr.invoiceDate!)
                  ? prev
                  : [prev, `Original supplier bill date: ${hdr.invoiceDate}`].filter(Boolean).join(" | ")
              );
              setHistoricalDateNotice(
                `Extracted bill date (${hdr.invoiceDate}) belongs to a closed/historical financial year, so the posting date was kept as ${todayStr} (original bill date saved in notes).`
              );
            } else {
              setInvoiceDate(hdr.invoiceDate);
              setHistoricalDateNotice(null);
            }
          }
        }}
        onSuppliersRefresh={async () => {
          const fresh = await getSuppliers();
          setSuppliers(fresh);
        }}
        onCatalogRefresh={async () => {
          const data = await getMedicines("", 500);
          setMedicines(
            data.map((m) => ({
              id: m.medicine.id,
              name: m.medicine.name,
              gstRateBp: m.medicine.gstRateBp,
              unitsPerPack: m.medicine.unitsPerPack ?? 1,
              packUnit: m.medicine.packUnit ?? "strip",
              looseUnit: m.medicine.looseUnit ?? "tablet",
            }))
          );
        }}
        onImport={(importedItems) => {
          setItems(importedItems);
        }}
      />

      {pendingSupplierMeta && (
        <QuickRegisterSupplierModal
          isOpen={showQuickRegisterSupplier}
          onClose={() => setShowQuickRegisterSupplier(false)}
          initialMeta={pendingSupplierMeta}
          onRegistered={async (sup) => {
            const fresh = await getSuppliers();
            setSuppliers(fresh);
            setSupplierId(sup.id);
            setPendingSupplierMeta(null);
          }}
        />
      )}

      <QuickRegisterSupplierModal
        isOpen={showManualAddSupplier}
        onClose={() => setShowManualAddSupplier(false)}
        initialMeta={{ name: "", gstin: null, phone: null, drugLicenseNo: null, address: null }}
        title="Quick Add Supplier"
        subtitle="Add a distributor without losing your GRN bill items."
        onRegistered={async (sup) => {
          const fresh = await getSuppliers();
          setSuppliers(fresh);
          setSupplierId(sup.id);
          setPendingSupplierMeta(null);
        }}
      />

      {isDraggingBill && (
        <div className="fixed inset-0 z-40 bg-brand-950/35 backdrop-blur-xs flex items-center justify-center p-6 pointer-events-none">
          <div className="rounded-3xl border-2 border-dashed border-brand-400 bg-white/95 px-10 py-8 shadow-2xl text-center space-y-2 max-w-md">
            <div className="mx-auto w-14 h-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-ink-900">Drop Supplier Invoice Here</p>
            <p className="text-xs text-ink-500">
              Supports PDF, bill photo (.jpg/.png/.webp), or Pharmarack/Retailio/Marg CSV.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<div className="page p-8 text-center text-xs text-ink-500">Loading purchase form...</div>}>
      <NewPurchaseForm />
    </Suspense>
  );
}
