import React from "react";

export function DashboardLoadingSkeleton() {
  return (
    <div className="page space-y-6 animate-pulse" aria-busy="true" aria-label="Loading page">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-ink-150" />
          <div className="h-7 w-64 rounded bg-ink-200" />
          <div className="h-4 w-96 max-w-full rounded bg-ink-150" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-lg bg-ink-150" />
          <div className="h-9 w-32 rounded-lg bg-ink-200" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="h-3.5 w-24 rounded bg-ink-150" />
            <div className="h-7 w-32 rounded bg-ink-200" />
            <div className="h-3 w-36 rounded bg-ink-100" />
          </div>
        ))}
      </div>

      <div className="card p-4 space-y-3">
        <div className="h-9 w-full rounded-lg bg-ink-100" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full rounded bg-ink-100/70" />
        ))}
      </div>
    </div>
  );
}

export default DashboardLoadingSkeleton;

