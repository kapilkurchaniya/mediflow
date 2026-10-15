import { schema } from "@/server/db";
import { eq, and, desc, gte, lte, ilike, or, sql } from "drizzle-orm";
import type { Tx, DbOrTx } from "@/server/db";

export type StatutoryRegisterType =
  | "schedule_h"
  | "schedule_h1"
  | "schedule_x"
  | "narcotics";

export interface ScheduleComplianceRule {
  schedule: string;
  isControlled: boolean;
  rxRequired: boolean;
  statutoryRegister: StatutoryRegisterType | null;
  requiresDoctorReg: boolean;
  requiresPatientAddress: boolean;
  requiresDuplicateRx: boolean;
  retentionYears: number;
  label: string;
  badgeColor: string;
  description: string;
}

export const SCHEDULE_RULES: Record<string, ScheduleComplianceRule> = {
  H: {
    schedule: "H",
    isControlled: true,
    rxRequired: true,
    statutoryRegister: "schedule_h",
    requiresDoctorReg: true,
    requiresPatientAddress: false,
    requiresDuplicateRx: false,
    retentionYears: 2,
    label: "Schedule H",
    badgeColor: "amber",
    description: "Prescription-only drug. Dispensing record required with prescriber details (D&C Rules, Rule 65).",
  },
  H1: {
    schedule: "H1",
    isControlled: true,
    rxRequired: true,
    statutoryRegister: "schedule_h1",
    requiresDoctorReg: true,
    requiresPatientAddress: true,
    requiresDuplicateRx: false,
    retentionYears: 3,
    label: "Schedule H1",
    badgeColor: "rose",
    description: "Third-generation cephalosporins, anti-TB, & psychotropics. Mandatory dedicated Schedule H1 register preserved for 3 years.",
  },
  X: {
    schedule: "X",
    isControlled: true,
    rxRequired: true,
    statutoryRegister: "schedule_x",
    requiresDoctorReg: true,
    requiresPatientAddress: true,
    requiresDuplicateRx: true,
    retentionYears: 2,
    label: "Schedule X",
    badgeColor: "purple",
    description: "Habit-forming psychotropics. Requires duplicate prescription, separate register, and verified ID.",
  },
  narcotic: {
    schedule: "narcotic",
    isControlled: true,
    rxRequired: true,
    statutoryRegister: "narcotics",
    requiresDoctorReg: true,
    requiresPatientAddress: true,
    requiresDuplicateRx: true,
    retentionYears: 5,
    label: "Narcotics / NDPS",
    badgeColor: "red",
    description: "NDPS Act regulated. Strict daily opening-closing balance register, doctor license verification, 5-year retention.",
  },
  G: {
    schedule: "G",
    isControlled: false,
    rxRequired: false,
    statutoryRegister: null,
    requiresDoctorReg: false,
    requiresPatientAddress: false,
    requiresDuplicateRx: false,
    retentionYears: 0,
    label: "Schedule G",
    badgeColor: "blue",
    description: "Must be taken under medical supervision. Cautionary warning on label.",
  },
  none: {
    schedule: "none",
    isControlled: false,
    rxRequired: false,
    statutoryRegister: null,
    requiresDoctorReg: false,
    requiresPatientAddress: false,
    requiresDuplicateRx: false,
    retentionYears: 0,
    label: "OTC / General",
    badgeColor: "slate",
    description: "Over-the-counter medicine. No mandatory prescription register required.",
  },
};

export function getScheduleRule(schedule?: string | null): ScheduleComplianceRule {
  if (!schedule) return SCHEDULE_RULES.none;
  const key = schedule.toUpperCase() === "NARCOTIC" ? "narcotic" : schedule.toUpperCase();
  return SCHEDULE_RULES[key] ?? SCHEDULE_RULES.none;
}

export function isScheduledDrug(schedule?: string | null): boolean {
  if (!schedule) return false;
  const rule = getScheduleRule(schedule);
  return rule.isControlled;
}

export interface ComplianceValidationInput {
  items: Array<{
    medicineName: string;
    schedule: string;
    rxRequired?: boolean;
    qty: number;
  }>;
  doctorName?: string | null;
  doctorRegNo?: string | null;
  patientName?: string | null;
  patientAddress?: string | null;
  patientAge?: number | null;
  prescriptionRef?: string | null;
}

export interface ComplianceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  controlledItems: Array<{
    medicineName: string;
    schedule: string;
    rule: ScheduleComplianceRule;
  }>;
}

/**
 * Validates whether the proposed cart satisfies drug compliance requirements
 * before creating an invoice.
 */
export function validateDispensingCompliance(
  input: ComplianceValidationInput
): ComplianceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const controlledItems: ComplianceValidationResult["controlledItems"] = [];

  for (const item of input.items) {
    const rule = getScheduleRule(item.schedule);
    if (rule.isControlled || item.rxRequired) {
      controlledItems.push({
        medicineName: item.medicineName,
        schedule: item.schedule,
        rule,
      });
    }
  }

  if (controlledItems.length === 0) {
    return { valid: true, errors, warnings, controlledItems };
  }

  // If any controlled drug is present, doctor name is legally mandatory
  const hasScheduleHOrHigher = controlledItems.some((ci) => ci.rule.isControlled);
  if (hasScheduleHOrHigher) {
    if (!input.doctorName || input.doctorName.trim().length === 0) {
      errors.push(
        `Doctor Name is required because the bill contains controlled drug(s): ${controlledItems.map((c) => c.medicineName).join(", ")}`
      );
    }
  }

  // Check Schedule H1, X, or Narcotic specific constraints
  const h1Items = controlledItems.filter((ci) => ci.rule.schedule === "H1");
  const xOrNarcoticItems = controlledItems.filter(
    (ci) => ci.rule.schedule === "X" || ci.rule.schedule === "narcotic"
  );

  if (h1Items.length > 0) {
    if (!input.doctorRegNo || input.doctorRegNo.trim().length === 0) {
      warnings.push(
        `Schedule H1 statutory register requires Doctor Registration No. Please provide it for ${h1Items.map((c) => c.medicineName).join(", ")}.`
      );
    }
    if (!input.patientAddress || input.patientAddress.trim().length === 0) {
      warnings.push(
        `Schedule H1 statutory register requires Patient Address under Indian D&C Rules.`
      );
    }
  }

  if (xOrNarcoticItems.length > 0) {
    if (!input.doctorRegNo || input.doctorRegNo.trim().length === 0) {
      errors.push(
        `Doctor Registration Number is strictly mandatory for Schedule X and Narcotic medications.`
      );
    }
    if (!input.patientAddress || input.patientAddress.trim().length === 0) {
      errors.push(
        `Patient Address is mandatory under the NDPS Act / Schedule X rules.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    controlledItems,
  };
}

export interface RecordDispensingLogParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  saleId: string;
  saleItemId: string;
  medicineId: string;
  batchId: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  manufacturerName?: string | null;
  schedule: string;
  patientName: string;
  patientAge?: number | null;
  patientGender?: string | null;
  patientAddress?: string | null;
  patientPhone?: string | null;
  doctorName: string;
  doctorRegNo?: string | null;
  doctorAddress?: string | null;
  prescriptionRef?: string | null;
  prescriptionDate?: string | null;
  quantityDispensed: number;
  pharmacistId?: string | null;
  pharmacistName?: string | null;
  pharmacistRegNo?: string | null;
  notes?: string | null;
}

/**
 * Records an entry into the statutory dispensing register inside an active transaction.
 */
export async function recordDispensingLog(params: RecordDispensingLogParams) {
  const { tx, schedule } = params;
  const rule = getScheduleRule(schedule);

  if (!rule.statutoryRegister) {
    // Not a statutory register schedule (e.g. none, G)
    return null;
  }

  const [inserted] = await tx
    .insert(schema.dispensingLogs)
    .values({
      tenantId: params.tenantId,
      storeId: params.storeId,
      saleId: params.saleId,
      saleItemId: params.saleItemId,
      medicineId: params.medicineId,
      batchId: params.batchId,
      medicineName: params.medicineName,
      batchNo: params.batchNo,
      expiryDate: params.expiryDate,
      manufacturerName: params.manufacturerName ?? null,
      schedule: rule.schedule,
      patientName: params.patientName,
      patientAge: params.patientAge ?? null,
      patientGender: params.patientGender ?? null,
      patientAddress: params.patientAddress ?? null,
      patientPhone: params.patientPhone ?? null,
      doctorName: params.doctorName,
      doctorRegNo: params.doctorRegNo ?? null,
      doctorAddress: params.doctorAddress ?? null,
      prescriptionRef: params.prescriptionRef ?? null,
      prescriptionDate: params.prescriptionDate ?? null,
      quantityDispensed: params.quantityDispensed,
      pharmacistId: params.pharmacistId ?? null,
      pharmacistName: params.pharmacistName ?? null,
      pharmacistRegNo: params.pharmacistRegNo ?? null,
      statutoryRegister: rule.statutoryRegister,
      notes: params.notes ?? null,
    })
    .returning();

  return inserted;
}

/**
 * Fetches compliance register records with filtering and pagination.
 */
export async function queryComplianceRegister(
  dbOrTx: DbOrTx,
  params: {
    tenantId: string;
    storeId: string;
    registerType?: StatutoryRegisterType;
    dateFrom?: string;
    dateTo?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  }
) {
  const conditions = [
    eq(schema.dispensingLogs.tenantId, params.tenantId),
    eq(schema.dispensingLogs.storeId, params.storeId),
  ];

  if (params.registerType) {
    conditions.push(eq(schema.dispensingLogs.statutoryRegister, params.registerType));
  }

  if (params.dateFrom) {
    conditions.push(gte(schema.dispensingLogs.dispensedAt, new Date(params.dateFrom + "T00:00:00")));
  }
  if (params.dateTo) {
    conditions.push(lte(schema.dispensingLogs.dispensedAt, new Date(params.dateTo + "T23:59:59.999")));
  }

  if (params.searchQuery && params.searchQuery.trim().length > 0) {
    const q = `%${params.searchQuery.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(schema.dispensingLogs.medicineName, q),
        ilike(schema.dispensingLogs.patientName, q),
        ilike(schema.dispensingLogs.doctorName, q),
        ilike(schema.dispensingLogs.batchNo, q),
        ilike(schema.dispensingLogs.doctorRegNo, q)
      )!
    );
  }

  const rows = await dbOrTx
    .select({
      log: schema.dispensingLogs,
      sale: {
        invoiceNo: schema.sales.invoiceNo,
        createdAt: schema.sales.createdAt,
      },
    })
    .from(schema.dispensingLogs)
    .innerJoin(schema.sales, eq(schema.dispensingLogs.saleId, schema.sales.id))
    .where(and(...conditions))
    .orderBy(desc(schema.dispensingLogs.dispensedAt))
    .limit(params.limit ?? 100)
    .offset(params.offset ?? 0);

  return rows;
}

/**
 * Calculates aggregate statistics for compliance dashboards.
 */
export async function getComplianceStats(
  dbOrTx: DbOrTx,
  tenantId: string,
  storeId: string
) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const stats = await dbOrTx
    .select({
      register: schema.dispensingLogs.statutoryRegister,
      count: sql<number>`count(*)::int`,
      totalQty: sql<number>`coalesce(sum(${schema.dispensingLogs.quantityDispensed}), 0)::int`,
    })
    .from(schema.dispensingLogs)
    .where(
      and(
        eq(schema.dispensingLogs.tenantId, tenantId),
        eq(schema.dispensingLogs.storeId, storeId),
        gte(schema.dispensingLogs.dispensedAt, thirtyDaysAgo)
      )
    )
    .groupBy(schema.dispensingLogs.statutoryRegister);

  const byRegister = {
    schedule_h: 0,
    schedule_h1: 0,
    schedule_x: 0,
    narcotics: 0,
    totalControlled: 0,
  };

  for (const s of stats) {
    if (s.register in byRegister) {
      byRegister[s.register as keyof typeof byRegister] = s.count;
      byRegister.totalControlled += s.count;
    }
  }

  // Count active prescriptions
  const [prescriptionsCount] = await dbOrTx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.prescriptions)
    .where(
      and(
        eq(schema.prescriptions.tenantId, tenantId),
        eq(schema.prescriptions.storeId, storeId),
        eq(schema.prescriptions.status, "active")
      )
    );

  return {
    last30Days: byRegister,
    activePrescriptions: prescriptionsCount?.count ?? 0,
  };
}
