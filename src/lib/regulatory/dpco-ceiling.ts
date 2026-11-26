/**
 * NPPA / DPCO Scheduled Formulation Ceiling-Price Guard (B10.5 / B13).
 * Prices are stored in paise per tablet/capsule/unit for common NLEM/DPCO molecules.
 */
export interface DpcoCeilingRule {
  moleculeToken: string;
  maxUnitPricePaise: number;
  notificationRef: string;
}

export const DPCO_CEILING_RULES: DpcoCeilingRule[] = [
  { moleculeToken: "paracetamol 650", maxUnitPricePaise: 240, notificationRef: "NPPA S.O. 2025" },
  { moleculeToken: "paracetamol 500", maxUnitPricePaise: 120, notificationRef: "NPPA S.O. 2025" },
  { moleculeToken: "atorvastatin 10", maxUnitPricePaise: 620, notificationRef: "NPPA S.O. 2025" },
  { moleculeToken: "metformin 500", maxUnitPricePaise: 210, notificationRef: "NPPA S.O. 2025" },
  { moleculeToken: "azithromycin 500", maxUnitPricePaise: 2450, notificationRef: "NPPA S.O. 2025" },
  { moleculeToken: "amoxicillin 500", maxUnitPricePaise: 850, notificationRef: "NPPA S.O. 2025" },
  { moleculeToken: "amlodipine 5", maxUnitPricePaise: 320, notificationRef: "NPPA S.O. 2025" },
  { moleculeToken: "omeprazole 20", maxUnitPricePaise: 360, notificationRef: "NPPA S.O. 2025" },
];

export interface DpcoCheckResult {
  exceedsCeiling: boolean;
  ceilingUnitPaise: number | null;
  effectiveUnitPaise: number;
  notificationRef: string | null;
  message: string | null;
}

export function checkDpcoCeilingPrice(input: {
  medicineName: string;
  genericName?: string | null;
  packRatePaise: number;
  unitsPerPack: number;
}): DpcoCheckResult {
  const haystack = `${input.medicineName} ${input.genericName ?? ""}`.toLowerCase();
  const units = Math.max(1, input.unitsPerPack);
  const effectiveUnitPaise = Math.round(input.packRatePaise / units);

  for (const rule of DPCO_CEILING_RULES) {
    if (haystack.includes(rule.moleculeToken)) {
      if (effectiveUnitPaise > rule.maxUnitPricePaise) {
        return {
          exceedsCeiling: true,
          ceilingUnitPaise: rule.maxUnitPricePaise,
          effectiveUnitPaise,
          notificationRef: rule.notificationRef,
          message: `Exceeds DPCO ceiling ₹${(rule.maxUnitPricePaise / 100).toFixed(2)}/unit (${rule.notificationRef})`,
        };
      }
      return {
        exceedsCeiling: false,
        ceilingUnitPaise: rule.maxUnitPricePaise,
        effectiveUnitPaise,
        notificationRef: rule.notificationRef,
        message: null,
      };
    }
  }

  return {
    exceedsCeiling: false,
    ceilingUnitPaise: null,
    effectiveUnitPaise,
    notificationRef: null,
    message: null,
  };
}
