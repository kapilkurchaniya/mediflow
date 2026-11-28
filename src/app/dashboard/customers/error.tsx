"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function CustomersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="customers" title="Customer Directory Interrupted" description="Error loading customers, family groups, or udhaar ledgers." error={error} reset={reset} />;
}
