export interface SupplierCandidate {
  id: string;
  name: string;
  gstin?: string | null;
  phone?: string | null;
  drugLicenseNo?: string | null;
}

export interface ExtractedSupplierInfo {
  name?: string | null;
  gstin?: string | null;
  phone?: string | null;
  drugLicenseNo?: string | null;
  address?: string | null;
}

export type SupplierCheckStatus =
  | "matched"
  | "mismatch"
  | "auto_matched"
  | "unknown_supplier"
  | "unreadable";

export interface SupplierCheckResult {
  status: SupplierCheckStatus;
  reason: string;
  selectedSupplier: SupplierCandidate | null;
  matchedSupplier: SupplierCandidate | null;
  extracted: ExtractedSupplierInfo;
}

function normalizeGstin(raw?: string | null): string {
  return (raw || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function normalizePhone(raw?: string | null): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeLicense(raw?: string | null): string {
  return (raw || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function normalizeSupplierName(raw?: string | null): string {
  return (raw || "")
    .toLowerCase()
    .replace(/\b(m\/s|ms|pvt|private|ltd|limited|llp|inc|corp|co|company|and|&)\b/g, " ")
    .replace(/\b(pharma|pharmaceuticals|distributors|distributor|enterprises|agencies|agency|traders|medical|healthcare|health|drug|drugs)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarity(aRaw?: string | null, bRaw?: string | null): number {
  const a = normalizeSupplierName(aRaw);
  const b = normalizeSupplierName(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const tokensA = new Set(a.split(" ").filter((t) => t.length >= 2));
  const tokensB = new Set(b.split(" ").filter((t) => t.length >= 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? overlap / union : 0;
}

function scoreSupplierMatch(sup: SupplierCandidate, extracted: ExtractedSupplierInfo): number {
  const extGstin = normalizeGstin(extracted.gstin);
  const supGstin = normalizeGstin(sup.gstin);
  if (extGstin.length === 15 && supGstin.length === 15) {
    if (extGstin === supGstin) return 1.0;
    // Different valid 15-char GSTINs are definitely different legal entities
    return 0;
  }

  const extPhone = normalizePhone(extracted.phone);
  const supPhone = normalizePhone(sup.phone);
  if (extPhone.length === 10 && supPhone.length === 10 && extPhone === supPhone) {
    return 0.95;
  }

  const extDl = normalizeLicense(extracted.drugLicenseNo);
  const supDl = normalizeLicense(sup.drugLicenseNo);
  if (extDl.length >= 6 && supDl.length >= 6 && extDl === supDl) {
    return 0.95;
  }

  return nameSimilarity(sup.name, extracted.name);
}

export function evaluateGrnSupplierMatch(params: {
  selectedSupplierId?: string | null;
  suppliers: SupplierCandidate[];
  extracted: ExtractedSupplierInfo;
}): SupplierCheckResult {
  const selected = params.selectedSupplierId
    ? params.suppliers.find((s) => s.id === params.selectedSupplierId) ?? null
    : null;

  const hasExtractedSignal = Boolean(
    normalizeGstin(params.extracted.gstin) ||
      normalizePhone(params.extracted.phone) ||
      normalizeSupplierName(params.extracted.name) ||
      (params.extracted.name || "").trim()
  );

  if (!hasExtractedSignal) {
    return {
      status: "unreadable",
      reason: "Could not read supplier name or GSTIN from the scanned bill header. Please verify manually.",
      selectedSupplier: selected,
      matchedSupplier: null,
      extracted: params.extracted,
    };
  }

  // Find best matching supplier in DB
  let bestSupplier: SupplierCandidate | null = null;
  let bestScore = 0;
  for (const sup of params.suppliers) {
    const score = scoreSupplierMatch(sup, params.extracted);
    if (score > bestScore) {
      bestScore = score;
      bestSupplier = sup;
    }
  }
  const confidentMatch = bestScore >= 0.6 ? bestSupplier : null;

  if (selected) {
    const selectedScore = scoreSupplierMatch(selected, params.extracted);
    const extGstin = normalizeGstin(params.extracted.gstin);
    const selGstin = normalizeGstin(selected.gstin);

    // Explicit GSTIN conflict
    if (extGstin.length === 15 && selGstin.length === 15 && extGstin !== selGstin) {
      return {
        status: "mismatch",
        reason: `GSTIN mismatch: you selected "${selected.name}" (${selGstin}), but the scanned bill shows GSTIN ${extGstin}${params.extracted.name ? ` (${params.extracted.name})` : ""}.`,
        selectedSupplier: selected,
        matchedSupplier: confidentMatch && confidentMatch.id !== selected.id ? confidentMatch : null,
        extracted: params.extracted,
      };
    }

    if (selectedScore >= 0.55) {
      return {
        status: "matched",
        reason: `Scanned bill verified for ${selected.name}.`,
        selectedSupplier: selected,
        matchedSupplier: selected,
        extracted: params.extracted,
      };
    }

    // Selected supplier does not match scanned bill
    return {
      status: "mismatch",
      reason: confidentMatch
        ? `Supplier mismatch: you selected "${selected.name}", but this bill appears to belong to "${confidentMatch.name}".`
        : `Supplier mismatch: you selected "${selected.name}", but the scanned bill header reads "${params.extracted.name || params.extracted.gstin || "another supplier"}".`,
      selectedSupplier: selected,
      matchedSupplier: confidentMatch && confidentMatch.id !== selected.id ? confidentMatch : null,
      extracted: params.extracted,
    };
  }

  // No supplier was pre-selected
  if (confidentMatch) {
    return {
      status: "auto_matched",
      reason: `Detected supplier "${confidentMatch.name}" from the scanned bill.`,
      selectedSupplier: null,
      matchedSupplier: confidentMatch,
      extracted: params.extracted,
    };
  }

  return {
    status: "unknown_supplier",
    reason: `Scanned bill supplier "${params.extracted.name || params.extracted.gstin}" is not in your supplier directory yet.`,
    selectedSupplier: null,
    matchedSupplier: null,
    extracted: params.extracted,
  };
}

