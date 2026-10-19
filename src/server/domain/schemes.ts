import { schema } from "@/server/db";
import { eq, and, or, isNull, gte, lte, desc, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";

export interface SchemeApplicationResult {
  schemeId: string;
  schemeName: string;
  schemeType: string;
  freeQty: number;
  discountAmount: number; // in paise
  benefitPaise: number; // monetary value of the benefit (free goods + discount)
  effectiveRate: number; // effective rate per unit including free units
  description: string;
}

/**
 * Fetches all active, valid schemes matching the product/supplier and minimum quantity criteria.
 */
export async function getApplicableSchemes(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId?: string | null;
    medicineId: string;
    categoryId?: string | null;
    supplierId?: string | null;
    qty: number;
    date?: string; // YYYY-MM-DD
  }
) {
  const checkDate = params.date || new Date().toISOString().slice(0, 10);

  const conditions = [
    eq(schema.schemes.tenantId, params.tenantId),
    eq(schema.schemes.isActive, true),
    lte(schema.schemes.minQty, params.qty),
    // Validity date range
    or(isNull(schema.schemes.validFrom), lte(schema.schemes.validFrom, checkDate)),
    or(isNull(schema.schemes.validTo), gte(schema.schemes.validTo, checkDate)),
  ];

  if (params.storeId) {
    conditions.push(
      or(isNull(schema.schemes.storeId), eq(schema.schemes.storeId, params.storeId))!
    );
  }

  // Medicine / category match: specific to medicine, category, or store-wide
  const itemMatchConditions = [
    eq(schema.schemes.medicineId, params.medicineId),
    and(isNull(schema.schemes.medicineId), isNull(schema.schemes.categoryId))!,
  ];
  if (params.categoryId) {
    itemMatchConditions.push(eq(schema.schemes.categoryId, params.categoryId));
  }
  conditions.push(or(...itemMatchConditions)!);

  // Supplier match: if supplierId given, match supplier-specific or general
  if (params.supplierId) {
    conditions.push(
      or(isNull(schema.schemes.supplierId), eq(schema.schemes.supplierId, params.supplierId))!
    );
  }

  const matched = await db
    .select()
    .from(schema.schemes)
    .where(and(...conditions))
    .orderBy(desc(schema.schemes.createdAt));

  return matched;
}

/**
 * Calculates the exact benefit (free qty / cash discount) of a specific scheme.
 */
export function evaluateSchemeBenefit(
  scheme: schema.Scheme,
  qty: number,
  unitPricePaise: number
): SchemeApplicationResult {
  let freeQty = 0;
  let discountAmount = 0;
  let description = scheme.name;

  if (scheme.schemeType === "free_qty") {
    if (scheme.buyQty > 0 && scheme.freeQty > 0) {
      const times = Math.floor(qty / scheme.buyQty);
      freeQty = times * scheme.freeQty;
      description = `Buy ${scheme.buyQty} Get ${scheme.freeQty} Free (${freeQty} bonus units)`;
    }
  } else if (scheme.schemeType === "percentage") {
    if (scheme.discountBp > 0) {
      const gross = qty * unitPricePaise;
      discountAmount = Math.round((gross * scheme.discountBp) / 10000);
      description = `${(scheme.discountBp / 100).toFixed(1)}% Scheme Discount`;
    }
  } else if (scheme.schemeType === "flat") {
    if (scheme.flatDiscount && scheme.flatDiscount > 0) {
      discountAmount = scheme.flatDiscount;
      description = `Flat ₹${(scheme.flatDiscount / 100).toFixed(2)} Scheme Off`;
    }
  } else if (scheme.schemeType === "tiered") {
    // Tiered calculation: base percentage plus free qty if buyQty reached
    if (scheme.buyQty > 0 && qty >= scheme.buyQty && scheme.freeQty > 0) {
      const times = Math.floor(qty / scheme.buyQty);
      freeQty = times * scheme.freeQty;
    }
    if (scheme.discountBp > 0) {
      const gross = qty * unitPricePaise;
      discountAmount = Math.round((gross * scheme.discountBp) / 10000);
    }
    description = `Tiered Scheme: ${freeQty} free + ${(scheme.discountBp / 100).toFixed(1)}% off`;
  }

  const freeGoodsValue = freeQty * unitPricePaise;
  const benefitPaise = freeGoodsValue + discountAmount;
  const totalReceivedQty = qty + freeQty;
  const netPaidAmount = Math.max(0, qty * unitPricePaise - discountAmount);
  const effectiveRate = totalReceivedQty > 0 ? Math.round(netPaidAmount / totalReceivedQty) : unitPricePaise;

  return {
    schemeId: scheme.id,
    schemeName: scheme.name,
    schemeType: scheme.schemeType,
    freeQty,
    discountAmount,
    benefitPaise,
    effectiveRate,
    description,
  };
}

/**
 * Evaluates all applicable schemes and selects the optimal one (highest financial benefit).
 */
export async function calculateBestScheme(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId?: string | null;
    medicineId: string;
    categoryId?: string | null;
    supplierId?: string | null;
    qty: number;
    unitPricePaise: number;
    date?: string;
  }
): Promise<SchemeApplicationResult | null> {
  const schemes = await getApplicableSchemes(db, params);
  if (schemes.length === 0) return null;

  let bestResult: SchemeApplicationResult | null = null;

  for (const scheme of schemes) {
    const result = evaluateSchemeBenefit(scheme, params.qty, params.unitPricePaise);
    if (!bestResult || result.benefitPaise > bestResult.benefitPaise) {
      bestResult = result;
    }
  }

  return bestResult;
}
