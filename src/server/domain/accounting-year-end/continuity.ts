import { sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { DomainError } from "@/server/errors";

export interface YearEndContinuityValidationParams {
  tenantId: string;
  storeId: string;
  asOfDate: string; // 'YYYY-MM-DD'
  totalPaise: number;
  sourceYearEndSnapshotId: string;
}

/**
 * Validates and locks the source year-end snapshot within the opening inventory ingestion transaction.
 * Enforces:
 * 1. FOR SHARE lock held throughout the ingestion transaction.
 * 2. Source snapshot is finalized.
 * 3. Tenant and store match exactly.
 * 4. Adjacent fiscal year continuity (e.g. source 2024-2025 -> opening 2025-04-01).
 * 5. Exact valuation matching.
 */
export async function validateAndLockYearEndSource(
  tx: Tx,
  params: YearEndContinuityValidationParams,
) {
  const { tenantId, storeId, asOfDate, totalPaise, sourceYearEndSnapshotId } = params;

  // 1. Lock source snapshot FOR SHARE to prevent concurrent revision/overwrites
  const res = await tx.execute(sql`
    SELECT id, tenant_id, store_id, fiscal_year, status, final_valuation_paise, total_units
    FROM public.year_end_stock_snapshots
    WHERE id = ${sourceYearEndSnapshotId}::uuid AND tenant_id = ${tenantId}::uuid AND store_id = ${storeId}::uuid
    FOR SHARE
  `);

  const srcSnap = res.rows[0] as {
    id: string;
    tenant_id: string;
    store_id: string;
    fiscal_year: string;
    status: string;
    final_valuation_paise: number | string;
    total_units: number | string;
  } | undefined;

  if (!srcSnap) {
    throw new DomainError(
      "YEAR_END_SOURCE_NOT_FOUND",
      `Source year-end snapshot ${sourceYearEndSnapshotId} not found or tenant/store mismatch.`,
    );
  }

  // 2. Status must be finalized
  if (srcSnap.status !== "finalized") {
    throw new DomainError(
      "YEAR_END_SOURCE_NOT_FINALIZED",
      `Source year-end snapshot ${sourceYearEndSnapshotId} must be finalized (current: ${srcSnap.status}).`,
    );
  }

  // 3. Adjacent fiscal year validation
  const asOfYear = parseInt(asOfDate.slice(0, 4), 10);
  const expectedSourceFy = `${asOfYear - 1}-${asOfYear}`;
  if (srcSnap.fiscal_year !== expectedSourceFy) {
    throw new DomainError(
      "YEAR_END_NON_ADJACENT_FY",
      `Source snapshot FY ${srcSnap.fiscal_year} is not adjacent to opening date ${asOfDate} (expected: ${expectedSourceFy}).`,
    );
  }

  // 4. Exact valuation continuity
  const expectedValuation = Number(srcSnap.final_valuation_paise);
  if (totalPaise !== expectedValuation) {
    throw new DomainError(
      "YEAR_END_VALUATION_MISMATCH",
      `Opening inventory valuation (${totalPaise} paise) does not match source snapshot valuation (${expectedValuation} paise).`,
    );
  }

  return srcSnap;
}
