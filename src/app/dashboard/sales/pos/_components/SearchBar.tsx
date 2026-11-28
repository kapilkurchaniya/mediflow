"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type FormEvent } from "react";
import { Search, Sparkles, BookmarkCheck, Layers, AlertCircle } from "lucide-react";
import { formatINR } from "@/lib/format";
import { parsePackBarcode } from "@/lib/barcode/gs1-parser";
import { getMedicineSegmentLabel, normalizeMedicineSegment } from "@/lib/inventory/medicine-segments";
import {
  lookupInstantPosSearchCache,
  type PosDataSource,
  type SearchResult,
  type SearchResultBatch,
  type SearchResultMedicine,
} from "../_data/posData";

interface SearchBarProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  dataSource: PosDataSource;
  onSelectBatch: (medicine: SearchResultMedicine, batch: SearchResultBatch, allBatches: SearchResultBatch[]) => void;
  onOpenSubstitutes: (genericName: string) => void;
  onOpenPromiseOrder: (medicine: { id: string; name: string }) => void;
  playSound: (type: "beep" | "chime") => void;
  onEnterCart?: () => void;
}

export function SearchBar({
  inputRef,
  dataSource,
  onSelectBatch,
  onOpenSubstitutes,
  onOpenPromiseOrder,
  playSound,
  onEnterCart,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    const onBarcodeMiss = (ev: Event) => {
      const barcode = (ev as CustomEvent<string>).detail;
      if (barcode) {
        setQuery(barcode);
        setUnavailableNotice(null);
      }
    };
    window.addEventListener("pos-barcode-miss", onBarcodeMiss);
    return () => window.removeEventListener("pos-barcode-miss", onBarcodeMiss);
  }, []);

  // Flattened selectable batches for keyboard navigation
  const flatSelectable = useMemo(() => {
    const list: Array<{ medicine: SearchResultMedicine; batch: SearchResultBatch; allBatches: SearchResultBatch[] }> = [];
    for (const res of results) {
      for (const b of res.batches) {
        list.push({ medicine: res.medicine, batch: b, allBatches: res.batches });
      }
    }
    return list;
  }, [results]);

  const performSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      abortControllerRef.current?.abort();
      const seq = ++searchSeqRef.current;

      if (trimmed.length < 2) {
        setResults([]);
        setHighlightedIndex(0);
        setIsSearching(false);
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const instantCached = lookupInstantPosSearchCache(trimmed);
      if (instantCached === null) {
        setIsSearching(true);
      }

      try {
        const parsedPack = parsePackBarcode(trimmed);
        const searchTerm =
          parsedPack.format !== "plain" ? (parsedPack.gtin || parsedPack.batchNo || trimmed) : trimmed;
        const items = await dataSource.searchItems(searchTerm, controller.signal);
        if (controller.signal.aborted || seq !== searchSeqRef.current) return;

        setResults(items);
        setHighlightedIndex(0);

        // Auto-add on exact barcode match or GS1/H2 pack QR match
        const isBarcode = /^\d{8,14}$/.test(trimmed) || parsedPack.format !== "plain";
        if (isBarcode && items.length === 1 && items[0].batches.length > 0) {
          const matchedBatch = parsedPack.batchNo
            ? (items[0].batches.find(
                (b) => b.batchNo.toLowerCase() === parsedPack.batchNo?.toLowerCase(),
              ) ?? items[0].batches[0])
            : items[0].batches[0];
          onSelectBatch(items[0].medicine, matchedBatch, items[0].batches);
          playSound("beep");
          setQuery("");
          setResults([]);
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        console.error("POS Search error:", err);
      } finally {
        if (seq === searchSeqRef.current) {
          setIsSearching(false);
        }
      }
    },
    [dataSource, onSelectBatch, playSound]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void performSearch(query);
  };

  // Fast debounced auto-search (0ms on cache/prefix hit, 90ms on network query)
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      abortControllerRef.current?.abort();
      searchSeqRef.current++;
      return;
    }

    const delay = lookupInstantPosSearchCache(trimmed) !== null ? 0 : 90;
    const timer = setTimeout(() => {
      void performSearch(query);
    }, delay);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSelect = (medicine: SearchResultMedicine, batch: SearchResultBatch, allBatches: SearchResultBatch[]) => {
    onSelectBatch(medicine, batch, allBatches);
    playSound("beep");
    setQuery("");
    setResults([]);
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatSelectable.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % flatSelectable.length);
      } else if (onEnterCart) {
        onEnterCart();
      }
    } else if (e.key === "ArrowUp") {
      if (flatSelectable.length > 0) {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev <= 0 ? flatSelectable.length - 1 : prev - 1));
      }
    } else if (e.key === "Enter") {
      if (flatSelectable.length > 0 && flatSelectable[highlightedIndex]) {
        e.preventDefault();
        setUnavailableNotice(null);
        const sel = flatSelectable[highlightedIndex];
        handleSelect(sel.medicine, sel.batch, sel.allBatches);
      } else if (query.trim().length >= 2 && !isSearching) {
        e.preventDefault();
        const oosMatch = results.find((r) => r.batches.length === 0);
        setUnavailableNotice(
          oosMatch
            ? `"${oosMatch.medicine.name}" is currently out of stock (0 available). Use Substitutes or Promise Order below.`
            : `No in-stock medicine found matching "${query.trim()}".`
        );
      }
    } else if (e.key === "*") {
      const oosMatch = results.find((r) => r.batches.length === 0) ?? results[0];
      if (oosMatch) {
        e.preventDefault();
        onOpenPromiseOrder({ id: oosMatch.medicine.id, name: oosMatch.medicine.name });
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setResults([]);
      setUnavailableNotice(null);
    }
  };

  return (
    <div className="card p-3 relative shadow-xs">
      <form onSubmit={handleSubmit} className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-ink-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            const nextVal = e.target.value;
            setQuery(nextVal);
            if (nextVal.trim().length < 2) {
              setResults([]);
              setHighlightedIndex(0);
              setIsSearching(false);
            }
            if (unavailableNotice) setUnavailableNotice(null);
          }}
          onKeyDown={handleInputKeyDown}
          className="input pl-10 pr-24 py-2.5 text-[15px] font-medium"
          placeholder="Insert / F3 / : Search medicine, generic composition or scan barcode..."
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="absolute inset-y-1.5 right-1.5 btn btn-secondary btn-sm"
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </form>

      {unavailableNotice && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>{unavailableNotice}</span>
        </div>
      )}

      {/* Results Dropdown */}
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 card shadow-pop overflow-hidden max-h-[380px] overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0 bg-ink-50">
              <tr>
                <th>Medicine & Generic</th>
                <th>Batch / Expiry</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((res) => {
                const hasStock = res.batches.length > 0;

                if (!hasStock) {
                  return (
                    <tr key={res.medicine.id} className="bg-amber-50/40">
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-ink-700">{res.medicine.name}</span>
                          <span className="badge badge-warning !text-[10px]">Out of Stock</span>
                          {res.medicine.rackCode && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-ink-100 text-ink-700">
                              <Layers className="h-2.5 w-2.5 inline" /> Rack: {res.medicine.rackCode}
                            </span>
                          )}
                          {normalizeMedicineSegment(res.medicine.targetSegment) !== "general" && (
                            <span className="badge badge-neutral !text-[10px]">
                              {getMedicineSegmentLabel(res.medicine.targetSegment)}
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-ink-500 font-mono">
                          {res.medicine.genericName || "—"}
                        </div>
                      </td>
                      <td colSpan={3} className="text-ink-400 text-[12px] italic">
                        0 units on shelf
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {res.medicine.genericName && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenSubstitutes(res.medicine.genericName!);
                                setResults([]);
                              }}
                              className="btn btn-secondary btn-sm !text-brand-700 !border-brand-200 hover:!bg-brand-50"
                            >
                              <Sparkles className="h-3 w-3 mr-1" /> Substitutes
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              onOpenPromiseOrder(res.medicine);
                              setResults([]);
                            }}
                            className="btn btn-secondary btn-sm !text-amber-800 !border-amber-300 hover:!bg-amber-100"
                            title="Record patient demand for out-of-stock item"
                          >
                            <BookmarkCheck className="h-3 w-3 mr-1" /> Promise Order
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return res.batches.map((batch, bIdx) => (
                  <tr
                    key={batch.id}
                    className={`cursor-pointer transition-colors ${
                      batch.id === flatSelectable[highlightedIndex]?.batch.id
                        ? "bg-brand-50/90 ring-1 ring-inset ring-brand-400"
                        : "hover:bg-brand-50/50"
                    }`}
                    onClick={() => handleSelect(res.medicine, batch, res.batches)}
                  >
                    <td>
                      {bIdx === 0 ? (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-ink-900">{res.medicine.name}</span>
                            {res.medicine.schedule && (
                              <span className="badge badge-neutral !text-[10px] font-mono">
                                Sched {res.medicine.schedule}
                              </span>
                            )}
                            {res.medicine.rackCode && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-ink-100 text-ink-700">
                                <Layers className="h-2.5 w-2.5 inline" /> {res.medicine.rackCode}
                              </span>
                            )}
                            {normalizeMedicineSegment(res.medicine.targetSegment) !== "general" && (
                              <span className="badge badge-neutral !text-[10px]">
                                {getMedicineSegmentLabel(res.medicine.targetSegment)}
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] text-ink-500 font-mono">
                            {res.medicine.genericName || "—"}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-ink-400 pl-4 italic">↳ Alternative batch</div>
                      )}
                    </td>
                    <td>
                      <div className="font-mono text-xs font-semibold text-ink-800">{batch.batchNo}</div>
                      <div className="text-[11px] text-ink-500">Exp: {batch.expiryDate}</div>
                    </td>
                    <td className="text-right">
                      <span className="font-mono font-bold text-ink-900 text-xs">
                        {batch.qtyOnHand}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="font-mono font-bold text-emerald-700 text-xs">
                        {formatINR(batch.saleRate ?? batch.mrp)}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(res.medicine, batch, res.batches);
                        }}
                        className="btn btn-secondary btn-sm !text-xs font-semibold hover:!bg-brand-600 hover:!text-white"
                      >
                        + Add
                      </button>
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
