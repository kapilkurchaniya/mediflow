import { and, eq, ilike, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";

export interface MatchCandidate {
  id: string;
  name: string;
  packSize?: string | null;
  barcode?: string | null;
  manufacturerName?: string | null;
}

export interface MatchResult {
  matchedId: string | null;
  matchType: "exact_barcode" | "exact_name_pack" | "fuzzy_name" | "none";
  confidence: number; // 0 to 1
  candidate?: MatchCandidate;
}

/**
 * Calculates Dice coefficient similarity between two strings.
 * Returns a score between 0.0 and 1.0.
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const s2 = str2.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);

  let intersection = 0;
  for (const [key, count1] of b1.entries()) {
    const count2 = b2.get(key);
    if (count2) {
      intersection += Math.min(count1, count2);
    }
  }

  const total = (s1.length - 1) + (s2.length - 1);
  return total > 0 ? (2.0 * intersection) / total : 0.0;
}

/**
 * Matches an imported medicine record against the tenant's existing catalogue.
 */
export async function matchMedicine(
  db: DbOrTx,
  tenantId: string,
  input: {
    barcode?: string | null;
    name: string;
    packaging?: string | null;
    manufacturerName?: string | null;
  }
): Promise<MatchResult> {
  // 1. Stage 1: Exact barcode match
  if (input.barcode && input.barcode.trim()) {
    const cleanBarcode = input.barcode.trim();
    const [barcodeMatch] = await db
      .select({
        id: schema.medicines.id,
        name: schema.medicines.name,
        packSize: schema.medicines.packSize,
        barcode: schema.medicines.barcode,
      })
      .from(schema.medicines)
      .where(and(eq(schema.medicines.tenantId, tenantId), eq(schema.medicines.barcode, cleanBarcode)))
      .limit(1);

    if (barcodeMatch) {
      return {
        matchedId: barcodeMatch.id,
        matchType: "exact_barcode",
        confidence: 1.0,
        candidate: barcodeMatch,
      };
    }
  }

  // 2. Stage 2: Exact Name match (case-insensitive)
  const trimmedName = input.name.trim();
  const candidates = await db
    .select({
      id: schema.medicines.id,
      name: schema.medicines.name,
      packSize: schema.medicines.packSize,
      barcode: schema.medicines.barcode,
    })
    .from(schema.medicines)
    .where(and(eq(schema.medicines.tenantId, tenantId), ilike(schema.medicines.name, trimmedName)))
    .limit(10);

  if (candidates.length > 0) {
    // If packaging also matches
    if (input.packaging && input.packaging.trim()) {
      const cleanPack = input.packaging.trim().toUpperCase();
      const exactPackMatch = candidates.find(
        (c) => c.packSize && c.packSize.trim().toUpperCase() === cleanPack
      );
      if (exactPackMatch) {
        return {
          matchedId: exactPackMatch.id,
          matchType: "exact_name_pack",
          confidence: 0.98,
          candidate: exactPackMatch,
        };
      }
    }

    return {
      matchedId: candidates[0].id,
      matchType: "exact_name_pack",
      confidence: 0.90,
      candidate: candidates[0],
    };
  }

  // 3. Stage 3: Fuzzy similarity matching over active medicines
  // Load candidate names for tenant
  const prefix = trimmedName.slice(0, 4);
  const prefixCandidates = await db
    .select({
      id: schema.medicines.id,
      name: schema.medicines.name,
      packSize: schema.medicines.packSize,
      barcode: schema.medicines.barcode,
    })
    .from(schema.medicines)
    .where(and(eq(schema.medicines.tenantId, tenantId), ilike(schema.medicines.name, `${prefix}%`)))
    .limit(50);

  let bestCandidate: MatchCandidate | undefined;
  let bestScore = 0;

  for (const c of prefixCandidates) {
    const score = stringSimilarity(trimmedName, c.name);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = c;
    }
  }

  if (bestCandidate && bestScore >= 0.60) {
    return {
      matchedId: bestCandidate.id,
      matchType: "fuzzy_name",
      confidence: Number(bestScore.toFixed(2)),
      candidate: bestCandidate,
    };
  }

  return {
    matchedId: null,
    matchType: "none",
    confidence: 0,
  };
}
