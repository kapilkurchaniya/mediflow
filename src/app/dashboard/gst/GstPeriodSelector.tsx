"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar } from "lucide-react";

export function GstPeriodSelector({
  month,
  year,
}: {
  month: number;
  year: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const months = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  function handleChange(newMonth: number, newYear: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(newMonth));
    params.set("year", String(newYear));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-ink-200/60 shadow-xs">
      <Calendar className="h-4 w-4 text-ink-500 shrink-0" />
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-500 mr-1">Period:</span>
      <select
        value={month}
        onChange={(e) => handleChange(Number(e.target.value), year)}
        className="text-xs font-semibold text-ink-900 bg-transparent border-0 focus:ring-0 cursor-pointer py-1 pr-6"
        aria-label="GST Filing Month"
      >
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => handleChange(month, Number(e.target.value))}
        className="text-xs font-semibold text-ink-900 bg-transparent border-0 focus:ring-0 cursor-pointer py-1 pr-6"
        aria-label="GST Filing Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
