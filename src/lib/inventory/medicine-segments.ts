export const MEDICINE_SEGMENTS = [
  { value: "general", label: "General / All Ages" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "kids", label: "Kids / Pediatric" },
  { value: "senior", label: "Senior" },
] as const;

export type MedicineSegment = (typeof MEDICINE_SEGMENTS)[number]["value"];
export type MedicineSegmentFilter = "all" | MedicineSegment;

export function normalizeMedicineSegment(value?: string | null): MedicineSegment {
  const v = value?.trim().toLowerCase();
  if (v === "male" || v === "female" || v === "kids" || v === "senior") return v;
  return "general";
}

export function getMedicineSegmentLabel(value?: string | null): string {
  const seg = normalizeMedicineSegment(value);
  return MEDICINE_SEGMENTS.find((s) => s.value === seg)?.label ?? "General / All Ages";
}
