"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function GstError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="gst" title="GST & Tax Module Interrupted" description="Error loading GST returns, e-Invoice, e-Way Bill, or TDS workbench." error={error} reset={reset} />;
}
