import { db } from "@/server/db";
import { pilotFeedback, type NewPilotFeedback } from "@/server/db/schema";
import { z } from "zod";

export const pilotFeedbackSchema = z.object({
  category: z.enum(["speed", "scanner", "gst_math", "thermal_print", "offline_sync", "ui_ux", "other"]),
  severity: z.enum(["low", "medium", "high", "blocker"]).default("medium"),
  summary: z.string().trim().min(3, "Summary must be at least 3 characters").max(200),
  details: z.string().trim().min(10, "Details must be at least 10 characters").max(2000),
  diagnostics: z
    .object({
      route: z.string().optional(),
      appVersion: z.string().optional(),
      userAgent: z.string().optional(),
      pendingSyncCount: z.number().optional(),
    })
    .optional(),
});

export type PilotFeedbackInput = z.infer<typeof pilotFeedbackSchema>;

export function sanitizeFeedbackPii(text: string): string {
  // Mask 16-digit card numbers
  const cardRegex = /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
  // Mask 12-digit Aadhaar numbers
  const aadhaarRegex = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;

  return text
    .replace(cardRegex, "[REDACTED-CARD]")
    .replace(aadhaarRegex, "[REDACTED-ID]");
}

export async function submitPilotFeedback(
  tenantId: string,
  storeId: string,
  userId: string,
  input: PilotFeedbackInput,
  dbInstance = db,
) {
  const validated = pilotFeedbackSchema.parse(input);

  const cleanSummary = sanitizeFeedbackPii(validated.summary);
  const cleanDetails = sanitizeFeedbackPii(validated.details);

  const newEntry: NewPilotFeedback = {
    tenantId,
    storeId,
    userId,
    category: validated.category,
    severity: validated.severity,
    summary: cleanSummary,
    details: cleanDetails,
    diagnostics: validated.diagnostics ?? {},
    status: "open",
  };

  const [inserted] = await dbInstance.insert(pilotFeedback).values(newEntry).returning();
  return inserted;
}

