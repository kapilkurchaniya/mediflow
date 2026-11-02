import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";
import clsx from "clsx";

export interface PaginationProps {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  basePath: string;
  queryParams?: Record<string, string | number | undefined | null>;
  className?: string;
  itemLabel?: string;
}

export function getPaginationRange(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

export function buildPageHref(
  basePath: string,
  page: number,
  queryParams?: Record<string, string | number | undefined | null>
): string {
  const sp = new URLSearchParams();

  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      if (k !== "page" && v !== undefined && v !== null && v !== "") {
        sp.set(k, String(v));
      }
    }
  }

  if (page > 1) {
    sp.set("page", String(page));
  }

  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  currentPage,
  pageSize,
  totalCount,
  basePath,
  queryParams,
  className,
  itemLabel = "items",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalCount);

  if (totalCount <= pageSize && safeCurrentPage === 1) {
    return (
      <div
        className={clsx(
          "flex items-center justify-between px-4 py-3 border-t border-ink-150 text-[12.5px] text-ink-500",
          className
        )}
      >
        <span>
          Showing all <strong className="font-semibold text-ink-800 num">{formatNumber(totalCount)}</strong> {itemLabel}
        </span>
      </div>
    );
  }

  const range = getPaginationRange(safeCurrentPage, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={clsx(
        "flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-ink-150 bg-white text-[12.5px]",
        className
      )}
    >
      {/* Summary count */}
      <div className="text-ink-500 text-center sm:text-left">
        Showing{" "}
        <strong className="font-semibold text-ink-800 num">
          {formatNumber(startItem)}–{formatNumber(endItem)}
        </strong>{" "}
        of <strong className="font-semibold text-ink-800 num">{formatNumber(totalCount)}</strong> {itemLabel}
      </div>

      {/* Page controls */}
      <div className="flex items-center gap-1">
        {/* Previous page link */}
        {safeCurrentPage > 1 ? (
          <Link
            href={buildPageHref(basePath, safeCurrentPage - 1, queryParams)}
            className="btn btn-secondary !h-8 !px-2.5 !text-xs flex items-center gap-1"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="btn btn-secondary !h-8 !px-2.5 !text-xs flex items-center gap-1 opacity-40 cursor-not-allowed select-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </span>
        )}

        {/* Page pills */}
        <div className="flex items-center gap-1">
          {range.map((p, idx) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="w-8 h-8 flex items-center justify-center text-ink-400 select-none font-mono"
                >
                  …
                </span>
              );
            }

            const isCurrent = p === safeCurrentPage;
            return (
              <Link
                key={p}
                href={buildPageHref(basePath, p, queryParams)}
                aria-current={isCurrent ? "page" : undefined}
                className={clsx(
                  "min-w-8 h-8 px-2 rounded-md font-semibold text-xs flex items-center justify-center transition-colors num",
                  isCurrent
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900 border border-transparent hover:border-ink-200"
                )}
              >
                {p}
              </Link>
            );
          })}
        </div>

        {/* Next page link */}
        {safeCurrentPage < totalPages ? (
          <Link
            href={buildPageHref(basePath, safeCurrentPage + 1, queryParams)}
            className="btn btn-secondary !h-8 !px-2.5 !text-xs flex items-center gap-1"
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="btn btn-secondary !h-8 !px-2.5 !text-xs flex items-center gap-1 opacity-40 cursor-not-allowed select-none"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </nav>
  );
}

