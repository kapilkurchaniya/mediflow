"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

interface ReturnSaleButtonProps {
  saleId: string;
}

export function ReturnSaleButton({ saleId }: ReturnSaleButtonProps) {
  const router = useRouter();

  // Listen for Alt + R keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        router.push(`/dashboard/sales/${saleId}/return`);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, saleId]);

  return (
    <Link
      href={`/dashboard/sales/${saleId}/return`}
      className="btn btn-secondary text-ink-900 font-medium"
      title="Return items from this bill and issue GST Credit Note (Alt+R)"
    >
      <RotateCcw className="h-4 w-4 mr-1.5 text-amber-600" />
      Return Items
      <kbd className="ml-1.5 rounded bg-ink-200/60 px-1 py-0.5 text-[10px] font-mono text-ink-600">
        Alt+R
      </kbd>
    </Link>
  );
}
