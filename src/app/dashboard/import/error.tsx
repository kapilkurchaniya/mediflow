"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function ImportError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="import" title="Data Import Interrupted" description="Error loading catalog or Marg ERP migration tools." error={error} reset={reset} />;
}
