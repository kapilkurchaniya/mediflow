"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { searchMedicinesForPrescription, type SearchMedicineOption } from "@/app/actions/compliance";

interface MedicineAutocompleteInputProps {
  value: string;
  onChangeName: (name: string) => void;
  onSelectOption?: (option: SearchMedicineOption) => void;
  placeholder?: string;
}

export function MedicineAutocompleteInput({
  value,
  onChangeName,
  onSelectOption,
  placeholder = "Search medicine (e.g. Paracetamol 650mg)",
}: MedicineAutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<SearchMedicineOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOptions = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const results = await searchMedicinesForPrescription(query, 12);
      setOptions(results);
    } catch (err) {
      console.error("[MedicineAutocompleteInput] search failed:", err);
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChangeName(val);
    setIsOpen(true);
    setHighlightedIndex(-1);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchOptions(val);
    }, 200);
  };

  const handleFocus = () => {
    setIsOpen(true);
    if (options.length === 0) {
      fetchOptions(value);
    }
  };

  const handleSelect = (opt: SearchMedicineOption) => {
    onChangeName(opt.name);
    if (onSelectOption) {
      onSelectOption(opt);
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || options.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < options.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : options.length - 1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        e.preventDefault();
        handleSelect(options[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <input
          type="text"
          required
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className="input text-xs bg-white py-1 pl-2 pr-7 h-7 w-full border border-ink-200 focus:border-brand-500 rounded-md"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-ink-400">
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3 w-3" />}
        </div>
      </div>

      {isOpen && options.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full min-w-[280px] overflow-auto rounded-lg border border-ink-150 bg-white shadow-lg py-1 text-xs">
          {options.map((opt, idx) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 border-b border-ink-50 last:border-b-0 transition-colors ${
                highlightedIndex === idx ? "bg-brand-50 text-brand-900" : "hover:bg-ink-50 text-ink-800"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{opt.name}</div>
                {opt.genericName && (
                  <div className="text-[10px] text-ink-500 truncate">{opt.genericName}</div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {opt.strength && (
                  <span className="text-[10px] bg-ink-100 text-ink-700 rounded px-1 py-0.2 font-mono">
                    {opt.strength}
                  </span>
                )}
                {opt.schedule && opt.schedule !== "NONE" && (
                  <span className="text-[9.5px] bg-rose-50 border border-rose-200 text-rose-700 rounded px-1 font-semibold uppercase">
                    {opt.schedule}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

