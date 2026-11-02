"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { createDraftTransferAction, getTransferBatchesAction } from "@/app/actions/transfers";
import { SelectedLinesTable, type SelectedLine } from "./_components/SelectedLinesTable";
import { BatchSearchPicker, type BatchSearchResult } from "./_components/BatchSearchPicker";

interface StoreOption {
  id: string;
  name: string;
}

interface NewTransferClientProps {
  stores: StoreOption[];
  activeStoreId: string;
}

export function NewTransferClient({ stores, activeStoreId }: NewTransferClientProps) {
  const router = useRouter();
  const [fromStoreId, setFromStoreId] = useState(activeStoreId || (stores[0]?.id ?? ""));
  const [toStoreId, setToStoreId] = useState(
    stores.find((s) => s.id !== (activeStoreId || stores[0]?.id))?.id ?? "",
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SelectedLine[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BatchSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSearch = async (term: string) => {
    setSearchQuery(term);
    if (!term.trim() || !fromStoreId) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const res = await getTransferBatchesAction(fromStoreId, term);
    setIsSearching(false);
    if (res.success && res.batches) {
      setSearchResults(res.batches);
    }
  };

  const addBatchToTransfer = (batch: BatchSearchResult) => {
    if (lines.some((l) => l.fromBatchId === batch.id)) return;
    setLines((prev) => [
      ...prev,
      {
        medicineId: batch.medicineId,
        medicineName: batch.medicineName,
        fromBatchId: batch.id,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        qtyOnHand: batch.qtyOnHand,
        qty: 1,
        unitCost: batch.unitCost ?? 0,
        mrp: batch.mrp ?? 0,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeLine = (batchId: string) => {
    setLines((prev) => prev.filter((l) => l.fromBatchId !== batchId));
  };

  const updateLineQty = (batchId: string, newQty: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.fromBatchId !== batchId) return l;
        const bounded = Math.max(1, Math.min(l.qtyOnHand, newQty));
        return { ...l, qty: bounded };
      }),
    );
  };

  const totalTransferValuePaise = lines.reduce(
    (acc, l) => acc + l.qty * l.unitCost,
    0,
  );

  const handleSaveDraft = async () => {
    setErrorMessage(null);
    if (!fromStoreId || !toStoreId) {
      setErrorMessage("Please select both source and destination stores.");
      return;
    }
    if (fromStoreId === toStoreId) {
      setErrorMessage("Source and destination store cannot be the same.");
      return;
    }
    if (lines.length === 0) {
      setErrorMessage("Please select at least one batch item to transfer.");
      return;
    }

    setIsSaving(true);
    const res = await createDraftTransferAction({
      fromStoreId,
      toStoreId,
      notes: notes.trim() || null,
      items: lines.map((l) => ({
        medicineId: l.medicineId,
        fromBatchId: l.fromBatchId,
        qty: l.qty,
      })),
    });
    setIsSaving(false);

    if (res.success) {
      router.push(`/dashboard/inventory/transfers/${res.transferId}`);
    } else {
      setErrorMessage(res.error ?? "Failed to create transfer draft.");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/inventory/transfers"
          className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">New Stock Transfer</h1>
          <p className="text-sm text-ink-500">Create a transfer draft and select batches from source inventory.</p>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {errorMessage}
        </div>
      )}

      {/* Store Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-xs">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">
            Source Branch (Dispatch From)
          </label>
          <select
            value={fromStoreId}
            onChange={(e) => {
              setFromStoreId(e.target.value);
              setLines([]);
            }}
            className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm font-medium text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-ink-400 mt-1">Batches are deducted from this branch upon dispatch.</p>
        </div>

        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-xs">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">
            Destination Branch (Ship To)
          </label>
          <select
            value={toStoreId}
            onChange={(e) => setToStoreId(e.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm font-medium text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {stores.filter((s) => s.id !== fromStoreId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-ink-400 mt-1">Stock movements are accepted at this branch upon receipt.</p>
        </div>
      </div>

      {/* Batch Picker */}
      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">Select Batches to Transfer</h2>
          <span className="text-xs text-ink-500">{lines.length} items added</span>
        </div>

        <BatchSearchPicker
          searchQuery={searchQuery}
          onSearchChange={handleSearch}
          isSearching={isSearching}
          searchResults={searchResults}
          lines={lines}
          onSelectBatch={addBatchToTransfer}
        />

        <SelectedLinesTable
          lines={lines}
          onUpdateQty={updateLineQty}
          onRemoveLine={removeLine}
          totalValuePaise={totalTransferValuePaise}
        />

        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1">Transfer Notes (Optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add internal instructions or shipment references..."
            className="w-full rounded-lg border border-ink-200 p-2.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/dashboard/inventory/transfers"
          className="rounded-lg border border-ink-200 px-4 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isSaving || lines.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Save Draft & Review
        </button>
      </div>
    </div>
  );
}
