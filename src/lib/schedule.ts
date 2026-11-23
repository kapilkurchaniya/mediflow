export type DrugSchedule = "none" | "G" | "H" | "H1" | "X" | "narcotic";

export const SCHEDULE_OPTIONS: Array<{ value: DrugSchedule; label: string }> = [
  { value: "none", label: "None (OTC)" },
  { value: "G", label: "Schedule G" },
  { value: "H", label: "Schedule H" },
  { value: "H1", label: "Schedule H1" },
  { value: "X", label: "Schedule X" },
  { value: "narcotic", label: "Narcotic (NDPS)" },
];

/**
 * Normalizes Indian pharmacy invoice / OCR schedule values into MediFlow's
 * canonical schedule enum (`none | G | H | H1 | X | narcotic`).
 *
 * Examples:
 * - "H" / "SCH H" / "Schedule H" / "G & H" / "G&H" -> "H" (stricter statutory class wins)
 * - "H1" / "SCH H1" / "H-1" / "H & H1" -> "H1"
 * - "X" / "SCH X" -> "X"
 * - "NDPS" / "Narcotic" -> "narcotic"
 * - "G" / "SCH G" -> "G"
 * - "OTC" / "None" / "" -> "none"
 */
export function normalizeDrugSchedule(raw: string | null | undefined): DrugSchedule {
  if (!raw || typeof raw !== "string") return "none";

  const upper = raw
    .trim()
    .toUpperCase()
    .replace(/\bSCHEDULE\b/g, "")
    .replace(/\bSCH\.?\b/g, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!upper || upper === "NONE" || upper === "OTC" || upper === "N/A" || upper === "-" || upper === "NA") {
    return "none";
  }

  // Tokenize combined notations like "G & H", "G/H", "H, H1", "H-1"
  const tokens = upper
    .split(/[\s,&/+]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const joined = tokens.join(" ");

  // Highest regulatory strictness takes precedence
  if (tokens.some((t) => t === "NARCOTIC" || t === "NDPS" || t === "NARCOTICS")) {
    return "narcotic";
  }
  if (tokens.includes("X")) {
    return "X";
  }
  if (tokens.includes("H1") || tokens.includes("H-1") || /\bH\s*1\b/.test(joined)) {
    return "H1";
  }
  if (tokens.includes("H")) {
    return "H";
  }
  if (tokens.includes("G")) {
    return "G";
  }

  return "none";
}

export function scheduleRequiresRx(schedule: DrugSchedule | string | null | undefined): boolean {
  const norm = normalizeDrugSchedule(schedule);
  return norm === "H" || norm === "H1" || norm === "X" || norm === "narcotic";
}
