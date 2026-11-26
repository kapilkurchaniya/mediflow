export interface BannedFdcRule {
  id: string;
  label: string;
  requiredIngredients: string[];
  notificationRef: string;
}

/**
 * Curated CDSCO banned single-drug and Fixed-Dose Combination (FDC) rules
 * (MoHFW Gazette Notifications S.O. 1852(E) / Aug 2024 156-FDC ban & legacy bans).
 */
export const BANNED_FDC_RULES: BannedFdcRule[] = [
  {
    id: "fdc-nimesulide-paracetamol-pediatric",
    label: "Nimesulide + Paracetamol (Oral Suspension / Pediatric)",
    requiredIngredients: ["nimesulide", "paracetamol"],
    notificationRef: "MoHFW Gazette Aug 2024 (156 FDCs)",
  },
  {
    id: "fdc-amoxicillin-dicloxacillin",
    label: "Amoxicillin + Dicloxacillin",
    requiredIngredients: ["amoxicillin", "dicloxacillin"],
    notificationRef: "MoHFW Gazette S.O. 2018 / 2024",
  },
  {
    id: "fdc-aceclofenac-paracetamol-rabeprazole",
    label: "Aceclofenac + Paracetamol + Rabeprazole",
    requiredIngredients: ["aceclofenac", "paracetamol", "rabeprazole"],
    notificationRef: "MoHFW Gazette Aug 2024",
  },
  {
    id: "fdc-mefenamic-paracetamol-dicyclomine",
    label: "Mefenamic Acid + Paracetamol + Dicyclomine",
    requiredIngredients: ["mefenamic", "paracetamol", "dicyclomine"],
    notificationRef: "MoHFW Gazette Aug 2024",
  },
  {
    id: "fdc-cpm-phenylephrine-paracetamol-caffeine",
    label: "Chlorpheniramine + Phenylephrine + Paracetamol + Caffeine",
    requiredIngredients: ["chlorpheniramine", "phenylephrine", "paracetamol", "caffeine"],
    notificationRef: "MoHFW Gazette Aug 2024",
  },
  {
    id: "single-sibutramine",
    label: "Sibutramine",
    requiredIngredients: ["sibutramine"],
    notificationRef: "CDSCO Prohibited Drug",
  },
  {
    id: "single-rimonabant",
    label: "Rimonabant",
    requiredIngredients: ["rimonabant"],
    notificationRef: "CDSCO Prohibited Drug",
  },
  {
    id: "single-cisapride",
    label: "Cisapride",
    requiredIngredients: ["cisapride"],
    notificationRef: "CDSCO Prohibited Drug",
  },
  {
    id: "single-rofecoxib",
    label: "Rofecoxib",
    requiredIngredients: ["rofecoxib"],
    notificationRef: "CDSCO Prohibited Drug",
  },
  {
    id: "single-valdecoxib",
    label: "Valdecoxib",
    requiredIngredients: ["valdecoxib"],
    notificationRef: "CDSCO Prohibited Drug",
  },
  {
    id: "single-phenylpropanolamine",
    label: "Phenylpropanolamine",
    requiredIngredients: ["phenylpropanolamine"],
    notificationRef: "CDSCO Prohibited Drug",
  },
];

export interface BannedFdcCheckResult {
  banned: boolean;
  rule?: BannedFdcRule;
  reason?: string;
}

export function checkCdscoBannedFdc(input: {
  name?: string | null;
  genericName?: string | null;
}): BannedFdcCheckResult {
  const haystack = `${input.name ?? ""} ${input.genericName ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9+/\s-]/g, " ");

  if (!haystack.trim()) {
    return { banned: false };
  }

  for (const rule of BANNED_FDC_RULES) {
    const matchesAll = rule.requiredIngredients.every((ing) => haystack.includes(ing));
    if (matchesAll) {
      return {
        banned: true,
        rule,
        reason: `Blocked by CDSCO ban (${rule.notificationRef}): ${rule.label}.`,
      };
    }
  }

  return { banned: false };
}
