"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function WholesaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="wholesale" title="Wholesale Challans Interrupted" description="Error loading B2B wholesale challan and dispatch workspace." error={error} reset={reset} />;
}
