"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function HelpError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="help" title="Help Center Interrupted" description="Error loading Help Center guides." error={error} reset={reset} />;
}
