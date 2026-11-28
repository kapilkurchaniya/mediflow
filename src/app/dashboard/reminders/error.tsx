"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function RemindersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="reminders" title="Refill Reminders Interrupted" description="Error loading scheduled customer refill reminders." error={error} reset={reset} />;
}
