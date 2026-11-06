/**
 * Generators for high-cardinality medicines, batches, and stock movements.
 */

import { randomUUID } from "node:crypto";
import { type PRNG } from "./prng";
import { BRAND_STEMS, DOSAGE_FORMS, HSN_CODES, MOLECULES, SCHEDULES, STRENGTHS } from "./pharma-dictionary";

export interface GeneratedMedicine {
  id: string;
  tenantId: string;
  name: string;
  genericName: string;
  composition: string;
  strength: string;
  dosageForm: string;
  packSize: string;
  unit: string;
  unitsPerPack: number;
  packUnit: string;
  looseUnit: string;
  barcode: string | null;
  hsn: string;
  gstRateBp: number;
  mrp: number;
  salePrice: number;
  purchasePrice: number;
  schedule: string;
  isActive: boolean;
}

export interface GeneratedBatch {
  id: string;
  tenantId: string;
  storeId: string;
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  mfgDate: string;
  purchaseRate: number;
  mrp: number;
  saleRate: number;
  qtyOnHand: number;
  status: string;
}

export interface GeneratedMovement {
  tenantId: string;
  storeId: string;
  batchId: string;
  medicineId: string;
  type: string;
  qtyChange: number;
  balanceAfter: number;
  unitCost: number;
  effectiveAt: Date;
  createdAt: Date;
}

export function generateMedicine(idx: number, tenantId: string, prng: PRNG): GeneratedMedicine {
  const molecule = prng.choice(MOLECULES);
  const stem = prng.choice(BRAND_STEMS);
  const strength = prng.choice(STRENGTHS);
  const dosage = prng.choice(DOSAGE_FORMS);
  const schedule = prng.choice(SCHEDULES);
  const hsn = prng.choice(HSN_CODES);

  const name = `${stem}-${idx + 1} ${strength} ${dosage.form}`;
  const mrp = prng.nextInt(40, 450) * 100; // in paise
  const purchasePrice = Math.round(mrp * 0.7);
  const salePrice = mrp;

  // 90% have unique EAN barcode
  const barcode = prng.next() < 0.9 ? `890${String(prng.nextInt(100000000, 999999999))}` : null;

  return {
    id: randomUUID(),
    tenantId,
    name,
    genericName: molecule,
    composition: `${molecule} ${strength}`,
    strength,
    dosageForm: dosage.form,
    packSize: `${dosage.unitsPerPack} ${dosage.looseUnit}s`,
    unit: dosage.packUnit,
    unitsPerPack: dosage.unitsPerPack,
    packUnit: dosage.packUnit,
    looseUnit: dosage.looseUnit,
    barcode,
    hsn,
    gstRateBp: 500,
    mrp,
    salePrice,
    purchasePrice,
    schedule,
    isActive: true,
  };
}

export function generateBatch(
  idx: number,
  tenantId: string,
  storeId: string,
  medicine: GeneratedMedicine,
  prng: PRNG,
): GeneratedBatch {
  const batchNo = `B${idx + 1}-${String(prng.nextInt(1000, 9999))}`;
  const roll = prng.next();

  let expiryDate: string;
  let qtyOnHand: number;

  if (roll < 0.15) {
    // 15% depleted batches (qty = 0)
    qtyOnHand = 0;
    expiryDate = "2027-06-30";
  } else if (roll < 0.25) {
    // 10% expired batches
    qtyOnHand = prng.nextInt(5, 50);
    expiryDate = "2025-12-31";
  } else if (roll < 0.35) {
    // 10% near-expiry (30-90 days)
    qtyOnHand = prng.nextInt(10, 100);
    expiryDate = "2026-12-15";
  } else {
    // 65% active in-stock
    qtyOnHand = prng.nextInt(20, 400);
    const yr = prng.nextInt(2027, 2029);
    const mo = String(prng.nextInt(1, 12)).padStart(2, "0");
    expiryDate = `${yr}-${mo}-28`;
  }

  return {
    id: randomUUID(),
    tenantId,
    storeId,
    medicineId: medicine.id,
    batchNo,
    expiryDate,
    mfgDate: "2024-01-15",
    purchaseRate: medicine.purchasePrice ?? 7000,
    mrp: medicine.mrp ?? 10000,
    saleRate: medicine.salePrice ?? 10000,
    qtyOnHand,
    status: "active",
  };
}

export function generateMovement(
  tenantId: string,
  storeId: string,
  batch: GeneratedBatch,
  prng: PRNG,
): GeneratedMovement {
  const types = ["purchase", "sale", "sale", "sale", "adjustment", "transfer_in"] as const;
  const type = prng.choice(types);

  const qtyChange = type === "sale" ? -prng.nextInt(1, 10) : prng.nextInt(10, 100);
  const now = Date.now();
  const pastOffsetMs = prng.nextInt(1, 180) * 86400 * 1000;
  const effectiveAt = new Date(now - pastOffsetMs);

  return {
    tenantId: tenantId ?? batch.tenantId,
    storeId: storeId ?? batch.storeId,
    batchId: batch.id,
    medicineId: batch.medicineId,
    type,
    qtyChange,
    balanceAfter: Math.max(0, (batch.qtyOnHand ?? 0) + qtyChange),
    unitCost: batch.purchaseRate ?? 5000,
    effectiveAt,
    createdAt: effectiveAt,
  };
}
