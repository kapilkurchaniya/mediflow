"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function SuppliersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="suppliers" title="Suppliers Directory Interrupted" description="Error loading distributors or supplier payment records." error={error} reset={reset} />;
}
