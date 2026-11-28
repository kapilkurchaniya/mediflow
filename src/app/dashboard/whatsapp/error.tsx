"use client";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
export default function WhatsAppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionErrorBoundary section="whatsapp" title="WhatsApp Module Interrupted" description="Error loading WhatsApp inbox or templates." error={error} reset={reset} />;
}
