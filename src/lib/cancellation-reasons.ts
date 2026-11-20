export const CANCELLATION_REASON_PRESETS = [
  "Accidental purchase",
  "Wrong dosage / strength selected",
  "Wrong medicine dispensed",
  "Duplicate bill created",
  "Customer changed mind",
  "Doctor changed prescription",
  "Damaged or near-expiry strip",
  "Pricing / discount correction",
  "Other (specify)",
] as const;

export type CancellationReasonPreset = (typeof CANCELLATION_REASON_PRESETS)[number];

