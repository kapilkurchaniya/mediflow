export interface StoreGstSnapshot {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  stateCode: string | null;
}

export interface StatutoryLineItem {
  qty: number;
  unitCost: number; // paise
  gstRateBp: number; // basis points (e.g., 500 for 5%, 1200 for 12%, 1800 for 18%)
}

export interface StatutoryRoutingResult {
  docKind: "delivery_challan" | "tax_invoice";
  isSupply: boolean;
  isInterState: boolean;
  placeOfSupply: string | null;
  eWayBillRequired: boolean;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalValuePaise: number;
}

const E_WAY_BILL_THRESHOLD_PAISE = 50_000_00; // ₹50,000 in paise (CGST Rule 138)

function extractStateCode(gstin: string | null, fallbackStateCode: string | null): string | null {
  if (gstin && gstin.trim().length >= 2) {
    const prefix = gstin.trim().slice(0, 2);
    if (/^\d{2}$/.test(prefix)) {
      return prefix;
    }
  }
  return fallbackStateCode ? fallbackStateCode.trim().toUpperCase() : null;
}

/**
 * Computes GST Rule 55 vs Rule 46 statutory routing, taxes, and e-way bill threshold.
 */
export function determineStatutoryRouting(
  sourceStore: StoreGstSnapshot,
  destStore: StoreGstSnapshot,
  items: StatutoryLineItem[],
): StatutoryRoutingResult {
  const sourceGstin = sourceStore.gstin ? sourceStore.gstin.trim().toUpperCase() : null;
  const destGstin = destStore.gstin ? destStore.gstin.trim().toUpperCase() : null;

  const sourceState = extractStateCode(sourceGstin, sourceStore.stateCode);
  const destState = extractStateCode(destGstin, destStore.stateCode);

  // Intra-GSTIN: Both have identical registered GSTIN -> Rule 55 Delivery Challan
  const isSameGstin = Boolean(sourceGstin && destGstin && sourceGstin === destGstin);
  const isSupply = !isSameGstin;
  const docKind = isSupply ? "tax_invoice" : "delivery_challan";

  const isInterState = Boolean(sourceState && destState && sourceState !== destState);
  const placeOfSupply = destState ?? sourceState ?? null;

  let taxableValuePaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  for (const item of items) {
    const lineTaxable = Math.max(0, item.qty * item.unitCost);
    taxableValuePaise += lineTaxable;

    if (isSupply) {
      if (isInterState) {
        // IGST = lineTaxable * (gstRateBp / 10000)
        const lineIgst = Math.round((lineTaxable * item.gstRateBp) / 10000);
        igstPaise += lineIgst;
      } else {
        // Intra-State Deemed Supply (Distinct GSTINs in same state): CGST + SGST (split equally)
        const halfRateBp = Math.floor(item.gstRateBp / 2);
        const lineCgst = Math.round((lineTaxable * halfRateBp) / 10000);
        const lineSgst = Math.round((lineTaxable * (item.gstRateBp - halfRateBp)) / 10000);
        cgstPaise += lineCgst;
        sgstPaise += lineSgst;
      }
    }
  }

  const totalValuePaise = taxableValuePaise + cgstPaise + sgstPaise + igstPaise;
  const eWayBillRequired = totalValuePaise > E_WAY_BILL_THRESHOLD_PAISE;

  return {
    docKind,
    isSupply,
    isInterState,
    placeOfSupply,
    eWayBillRequired,
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalValuePaise,
  };
}
