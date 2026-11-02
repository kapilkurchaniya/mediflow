"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import clsx from "clsx";

interface SearchInputProps {
  defaultValue?: string;
  placeholder: string;
  paramName?: string;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({
  defaultValue,
  placeholder,
  paramName = "q",
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlParam = searchParams.get(paramName) ?? "";
  const [prevUrlParam, setPrevUrlParam] = useState(urlParam);
  const [query, setQuery] = useState(defaultValue ?? urlParam);
  const [isPending, startTransition] = useTransition();

  // Adjust state during render when URL parameter changes externally (e.g., browser back/forward)
  if (urlParam !== prevUrlParam) {
    setPrevUrlParam(urlParam);
    setQuery(urlParam);
  }

  const applySearch = useCallback(
    (newQuery: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = newQuery.trim();
      if (trimmed) {
        params.set(paramName, trimmed);
      } else {
        params.delete(paramName);
      }
      // Reset pagination when search query changes
      params.delete("page");

      startTransition(() => {
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [paramName, pathname, router, searchParams],
  );

  // Debounced execution
  useEffect(() => {
    if (query === urlParam) return;

    const timer = setTimeout(() => {
      applySearch(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, urlParam, debounceMs, applySearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applySearch(query);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      applySearch("");
    }
  };

  const handleClear = () => {
    setQuery("");
    applySearch("");
  };

  return (
    <div className="relative flex-1 max-w-md">
      {isPending ? (
        <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600 animate-spin" />
      ) : (
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={clsx("input pl-8", query && "pr-8", className)}
        aria-label={placeholder}
        role="searchbox"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 p-0.5 rounded-full hover:bg-ink-100 transition-colors"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
