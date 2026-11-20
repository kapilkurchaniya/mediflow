import React from "react";

export function DashboardLoadingSkeleton() {
  return (
    <div
      className="page space-y-6 animate-pulse"
      role="status"
      aria-label="Loading page content"
      aria-busy="true"
    >
      {/* Top Page Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5 flex-1">
          <div className="h-3 w-28 rounded bg-ink-200/70" />
          <div className="h-7 w-64 rounded-md bg-ink-200" />
          <div className="h-4 w-96 max-w-full rounded bg-ink-150" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-9 w-28 rounded-md bg-ink-150" />
          <div className="h-9 w-32 rounded-md bg-brand-200/60" />
        </div>
      </div>

      {/* KPI Stat Cards Row Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-28 rounded bg-ink-150" />
              <div className="h-7 w-7 rounded-md bg-ink-100" />
            </div>
            <div className="h-7 w-24 rounded bg-ink-200" />
            <div className="h-3 w-36 rounded bg-ink-100" />
          </div>
        ))}
      </div>

      {/* Main Content Card / Table Skeleton */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-150 px-4 py-3.5">
          <div className="h-8 w-64 max-w-full rounded-md bg-ink-100" />
          <div className="h-4 w-24 rounded bg-ink-100 hidden sm:block" />
        </div>
        <div className="divide-y divide-ink-100">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-8 w-8 rounded-md bg-ink-100 shrink-0" />
                <div className="space-y-1.5 flex-1 max-w-xs">
                  <div className="h-3.5 w-3/4 rounded bg-ink-200/80" />
                  <div className="h-2.5 w-1/2 rounded bg-ink-100" />
                </div>
              </div>
              <div className="hidden md:flex items-center gap-6">
                <div className="h-3.5 w-20 rounded bg-ink-100" />
                <div className="h-3.5 w-16 rounded bg-ink-100" />
              </div>
              <div className="h-6 w-20 rounded-full bg-ink-100 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardLoadingSkeleton;
