/**
 * Anti-TB (Tuberculosis) molecule matching for CDSCO Schedule H1 / Ni-kshay TB register reporting.
 */
export const ANTI_TB_MOLECULES = [
  "rifampicin",
  "rifampin",
  "isoniazid",
  "pyrazinamide",
  "ethambutol",
  "streptomycin",
  "bedaquiline",
  "delamanid",
  "pretomanid",
  "cycloserine",
  "ethionamide",
  "prothionamide",
  "clofazimine",
  "para-aminosalicylic",
  "pas sodium",
  "rifabutin",
  "rifapentine",
  "linezolid",
  "kanamycin",
  "capreomycin",
] as const;

const ANTI_TB_COMBO_TOKENS = ["akt-4", "akt 4", "akt-3", "akt 3", "akt-2", "akt 2", "rifater", "rifinah", "forecox", "mycocox"];

export function isAntiTbDrug(input: { medicineName?: string | null; genericName?: string | null }): boolean {
  const haystack = `${input.medicineName ?? ""} ${input.genericName ?? ""}`.toLowerCase();
  if (!haystack.trim()) return false;

  for (const mol of ANTI_TB_MOLECULES) {
    if (haystack.includes(mol)) return true;
  }
  for (const combo of ANTI_TB_COMBO_TOKENS) {
    if (haystack.includes(combo)) return true;
  }
  return false;
}
