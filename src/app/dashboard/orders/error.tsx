"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function OrdersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="orders" title="Orders View Interrupted" description="Error loading omnichannel orders." error={error} reset={reset} />;
}
