export interface ApplicableSchemeRule {
  id: string;
  name: string;
  schemeType: string; // free_qty | discount_pct | flat_discount
  minQty: number;
  freeQty: number;
  discountBp: number;
  flatDiscount: number;
}

export interface PricingResolverInput {
  mrpPaise: number;
  batchSaleRatePaise: number;
  qty: number;
  manualDiscountBp?: number;
  customerDiscountBp?: number;
  customerRateOverridePaise?: number | null;
  scheme?: ApplicableSchemeRule | null;
}

export interface PricingResolverResult {
  effectiveRatePaise: number;
  effectiveDiscountBp: number;
  freeQty: number;
  schemeId: string | null;
  schemeName: string | null;
  schemeDiscountPaise: number;
}

/**
 * Resolves final line rate, party/manual discount, and scheme benefit (e.g. 10+1 freeQty).
 * Legal Metrology guard: effective rate is always capped at MRP.
 */
export function resolveLinePricing(input: PricingResolverInput): PricingResolverResult {
  const baseRate =
    input.customerRateOverridePaise && input.customerRateOverridePaise > 0
      ? input.customerRateOverridePaise
      : input.batchSaleRatePaise > 0
        ? input.batchSaleRatePaise
        : input.mrpPaise;

  const effectiveRatePaise = input.mrpPaise > 0 ? Math.min(baseRate, input.mrpPaise) : baseRate;

  let effectiveDiscountBp = Math.max(input.manualDiscountBp ?? 0, input.customerDiscountBp ?? 0);
  let freeQty = 0;
  let schemeId: string | null = null;
  let schemeName: string | null = null;
  let schemeDiscountPaise = 0;

  if (input.scheme && input.qty >= input.scheme.minQty && input.scheme.minQty > 0) {
    schemeId = input.scheme.id;
    schemeName = input.scheme.name;
    const multiples = Math.floor(input.qty / input.scheme.minQty);

    if (input.scheme.schemeType === "free_qty" && input.scheme.freeQty > 0) {
      freeQty = multiples * input.scheme.freeQty;
    } else if (input.scheme.schemeType === "discount_pct" && input.scheme.discountBp > 0) {
      effectiveDiscountBp = Math.max(effectiveDiscountBp, input.scheme.discountBp);
    } else if (input.scheme.schemeType === "flat_discount" && input.scheme.flatDiscount > 0) {
      schemeDiscountPaise = multiples * input.scheme.flatDiscount;
    }
  }

  return {
    effectiveRatePaise,
    effectiveDiscountBp: Math.min(10000, Math.max(0, effectiveDiscountBp)),
    freeQty,
    schemeId,
    schemeName,
    schemeDiscountPaise,
  };
}
