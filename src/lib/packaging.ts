/**
 * Shared Indian pharmacy packaging parser and quantity/cost conversion utilities.
 *
 * Canonical invariants across MediFlow:
 * - batches.qtyOnHand is ALWAYS stored in base (loose) units (e.g. tablets/capsules).
 * - batches.mrp and batches.saleRate are stored per whole pack (in paise).
 * - batches.purchaseRate is stored as landed cost per base unit (in paise).
 */

export type PackUnit = "strip" | "bottle" | "pack" | "box" | "vial" | "tube";
export type LooseUnit = "tablet" | "capsule" | "piece" | "ml" | "sachet";
export type QtyMode = "packs" | "loose";

export interface ParsePackagingInput {
  packRaw?: string | null;
  medicineName?: string | null;
  dosageForm?: string | null;
}

export interface ParsedPackaging {
  unitsPerPack: number;
  packUnit: PackUnit;
  looseUnit: LooseUnit;
  packSize: string | null;
  isSolidDoseCandidate: boolean;
  warning: string | null;
}

const NON_SPLITTABLE_PACK_RE =
  /(?:\d+\s*(?:ml|gm|kg|ltr|oz|md)\b|\b\d+\s*g\b|\b(?:syrup|syp|susp|suspension|drops|drop|cream|gel|oint|ointment|lotion|spray|inhaler|respule|respules|vial|amp|ampoule|inj|injection|soap|wash|shampoo|powder|bottle|tube|liniment|solution|soln)\b)/i;

const NON_SPLITTABLE_NAME_RE =
  /\b(?:syrup|syp|susp|suspension|eye\s*drops?|ear\s*drops?|nasal\s*drops?|oral\s*drops?|drops|cream|gel|oint|ointment|lotion|spray|inhaler|respule|respules|vial|amp|ampoule|inj|injection|soap|wash|shampoo|liniment|solution|soln|(?:\d+\s*ml))\b/i;

const SOLID_DOSE_NAME_RE =
  /\b(?:tab|tabs|tablet|tablets|cap|caps|capsule|capsules|sachet|sachets)\b|\b\d+(?:\.\d+)?\s*(?:mg|mcg|iu)\b/i;

function inferNonSplittableUnits(text: string): { packUnit: PackUnit; looseUnit: LooseUnit } {
  const lower = text.toLowerCase();
  if (/\b(?:cream|gel|oint|ointment|tube)\b|\d+\s*gm?\b/.test(lower)) {
    return { packUnit: "tube", looseUnit: "piece" };
  }
  if (/\b(?:vial|amp|ampoule|inj|injection)\b/.test(lower)) {
    return { packUnit: "vial", looseUnit: "piece" };
  }
  if (/\b(?:syrup|syp|susp|suspension|drops?|bottle|lotion|wash|shampoo|solution|soln)\b|\d+\s*(?:ml|ltr)\b/.test(lower)) {
    return { packUnit: "bottle", looseUnit: "piece" };
  }
  return { packUnit: "pack", looseUnit: "piece" };
}

function inferSolidLooseUnit(text: string, dosageForm?: string | null): LooseUnit {
  const form = (dosageForm || "").trim().toLowerCase();
  if (form === "capsule") return "capsule";
  if (form === "sachet") return "sachet";
  if (form === "tablet") return "tablet";

  const lower = text.toLowerCase();
  if (/\b(?:cap|caps|capsule|capsules)\b/.test(lower)) return "capsule";
  if (/\b(?:sachet|sachets)\b/.test(lower)) return "sachet";
  return "tablet";
}

/**
 * Parses Indian pharmacy packaging strings (e.g. "10'S", "1x15", "100ML", "Strip of 10")
 * with guardrails so liquids, creams, and injections always stay at unitsPerPack = 1.
 */
export function parsePackaging(input: ParsePackagingInput): ParsedPackaging {
  const packRaw = (input.packRaw || "").trim();
  const medicineName = (input.medicineName || "").trim();
  const dosageForm = (input.dosageForm || "").trim().toLowerCase();
  const combined = `${packRaw} ${medicineName}`.trim();

  // 1. Guardrail: liquids, topicals, and injectables are never split into loose tablets.
  const isNonSplittableForm =
    dosageForm === "syrup" ||
    dosageForm === "cream" ||
    dosageForm === "injection" ||
    dosageForm === "drops" ||
    dosageForm === "liquid";

  if (
    isNonSplittableForm ||
    (packRaw && NON_SPLITTABLE_PACK_RE.test(packRaw)) ||
    (!packRaw && NON_SPLITTABLE_NAME_RE.test(medicineName))
  ) {
    const { packUnit, looseUnit } = inferNonSplittableUnits(`${dosageForm} ${combined}`);
    return {
      unitsPerPack: 1,
      packUnit,
      looseUnit,
      packSize: packRaw || null,
      isSolidDoseCandidate: false,
      warning: null,
    };
  }

  const looseUnit = inferSolidLooseUnit(combined, dosageForm);

  // 2. Extract strip/pack count when packRaw is present.
  if (packRaw) {
    let candidate = 1;

    // e.g. "1x10", "10x15", "1*10" -> strip size is the second factor
    const multiMatch = packRaw.match(/(\d+)\s*[xX*×]\s*(\d+)/);
    if (multiMatch) {
      candidate = parseInt(multiMatch[2], 10);
    } else {
      // e.g. "Strip of 10", "Pack of 15", "Box of 5"
      const ofMatch = packRaw.match(/\b(?:strip|pack|box|blister)\s*(?:of\s*)?(\d+)\b/i);
      if (ofMatch) {
        candidate = parseInt(ofMatch[1], 10);
      } else {
        // e.g. "10'S", "15S", "10T", "15 TAB", "10 CAP", "10N", "15"
        const unitMatch = packRaw.match(
          /^(\d+)\s*(?:'?s|t|tab|tabs|tablet|tablets|cap|caps|capsule|capsules|n|u|units?|pcs?|sachets?)?$/i
        );
        const leadingMatch = unitMatch || packRaw.match(/(\d+)\s*(?:'?s\b|t\b|tab|cap|n\b|sachets?)/i);
        if (leadingMatch) {
          candidate = parseInt(leadingMatch[1], 10);
        }
      }
    }

    if (Number.isFinite(candidate) && candidate > 1 && candidate <= 1000) {
      return {
        unitsPerPack: candidate,
        packUnit: looseUnit === "sachet" ? "box" : "strip",
        looseUnit,
        packSize: packRaw,
        isSolidDoseCandidate: true,
        warning: null,
      };
    }
  }

  // 3. Fallback when packRaw is missing or "1": flag likely solid-dose tablets/capsules for review.
  const isSolidCandidate =
    dosageForm === "tablet" ||
    dosageForm === "capsule" ||
    dosageForm === "sachet" ||
    SOLID_DOSE_NAME_RE.test(medicineName);

  return {
    unitsPerPack: 1,
    packUnit: isSolidCandidate ? (looseUnit === "sachet" ? "box" : "strip") : "pack",
    looseUnit: isSolidCandidate ? looseUnit : "piece",
    packSize: packRaw || null,
    isSolidDoseCandidate: isSolidCandidate,
    warning: isSolidCandidate
      ? "No pack size specified — set Units/Pack (e.g. 10 or 15) to sell loose tablets"
      : null,
  };
}

export interface ParsedPackAndLooseQty {
  packs: number;
  loose: number;
  baseQty: number;
}

/**
 * Converts imported/scanned quantity fields into canonical base units.
 * - In "packs" mode: multiplies whole packs by unitsPerPack and adds loose units.
 *   Also supports Marg/Busy S.L decimal notation (e.g. "12.4" with upp=10 -> 12 packs + 4 loose = 124).
 * - In "loose" mode: treats rawQty directly as individual loose units.
 */
export function parsePackAndLooseQty(
  rawQty: unknown,
  rawLoose: unknown,
  unitsPerPack: number,
  qtyMode: QtyMode = "packs"
): ParsedPackAndLooseQty {
  const upp = Math.max(1, Math.round(Number.isFinite(unitsPerPack) ? unitsPerPack : 1));

  const cleanQtyStr =
    rawQty === null || rawQty === undefined ? "" : String(rawQty).trim().replace(/,/g, "");
  const cleanLooseStr =
    rawLoose === null || rawLoose === undefined ? "" : String(rawLoose).trim().replace(/,/g, "");

  const parsedLooseCol = cleanLooseStr ? parseInt(cleanLooseStr, 10) : 0;
  const looseFromCol = Number.isFinite(parsedLooseCol) && parsedLooseCol > 0 ? parsedLooseCol : 0;

  const qtyFloat = cleanQtyStr ? parseFloat(cleanQtyStr) : 0;
  const safeQtyFloat = Number.isFinite(qtyFloat) && qtyFloat > 0 ? qtyFloat : 0;

  if (qtyMode === "loose") {
    const baseQty = Math.max(0, Math.round(safeQtyFloat) + looseFromCol);
    return {
      packs: Math.floor(baseQty / upp),
      loose: baseQty % upp,
      baseQty,
    };
  }

  // "packs" mode: check Marg/Busy S.L decimal notation when no separate loose column is given
  if (upp > 1 && looseFromCol === 0 && cleanQtyStr) {
    const decMatch = cleanQtyStr.match(/^(\d+)\.(\d+)$/);
    if (decMatch) {
      const wholePacks = parseInt(decMatch[1], 10);
      const decLoose = parseInt(decMatch[2], 10);
      if (decLoose > 0 && decLoose < upp) {
        const baseQty = wholePacks * upp + decLoose;
        return { packs: wholePacks, loose: decLoose, baseQty };
      }
    }
  }

  const wholePacks = Math.max(0, Math.round(safeQtyFloat));
  const baseQty = wholePacks * upp + looseFromCol;
  return {
    packs: Math.floor(baseQty / upp),
    loose: baseQty % upp,
    baseQty,
  };
}

/**
 * Computes landed purchase cost per canonical base unit (paise),
 * matching createPurchase() in src/server/domain/purchases.ts.
 */
export function computeBaseUnitCost(packPtrPaise: number, unitsPerPack: number): number {
  const upp = Math.max(1, Math.round(Number.isFinite(unitsPerPack) ? unitsPerPack : 1));
  if (!Number.isFinite(packPtrPaise) || packPtrPaise <= 0) return 0;
  return Math.round(packPtrPaise / upp);
}

export interface OcrCatalogPackResolution {
  effectiveUpp: number;
  catalogUpp: number | null;
  packMismatch: boolean;
  suggestCatalogUpdate: boolean;
}

/**
 * Resolves OCR/document unitsPerPack against existing catalog unitsPerPack
 * without silently overwriting extracted strip sizes with catalog default 1.
 */
export function resolveOcrCatalogPackConflict(
  catalogUpp: number | null | undefined,
  ocrUpp: number
): OcrCatalogPackResolution {
  const cleanOcr = Math.max(1, Math.round(Number.isFinite(ocrUpp) ? ocrUpp : 1));
  if (catalogUpp === null || catalogUpp === undefined) {
    return {
      effectiveUpp: cleanOcr,
      catalogUpp: null,
      packMismatch: false,
      suggestCatalogUpdate: false,
    };
  }

  const cleanCat = Math.max(1, Math.round(Number.isFinite(catalogUpp) ? catalogUpp : 1));
  if (cleanCat === 1 && cleanOcr > 1) {
    return {
      effectiveUpp: cleanOcr,
      catalogUpp: cleanCat,
      packMismatch: true,
      suggestCatalogUpdate: true,
    };
  }
  if (cleanCat > 1 && cleanOcr === 1) {
    return {
      effectiveUpp: cleanCat,
      catalogUpp: cleanCat,
      packMismatch: false,
      suggestCatalogUpdate: false,
    };
  }
  if (cleanCat > 1 && cleanOcr > 1 && cleanCat !== cleanOcr) {
    return {
      effectiveUpp: cleanOcr,
      catalogUpp: cleanCat,
      packMismatch: true,
      suggestCatalogUpdate: false,
    };
  }
  return {
    effectiveUpp: cleanCat,
    catalogUpp: cleanCat,
    packMismatch: false,
    suggestCatalogUpdate: false,
  };
}

