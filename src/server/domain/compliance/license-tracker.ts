/**
 * Regulatory Compliance & Drug License Renewal Tracker
 * Statutory basis:
 * - Drugs and Cosmetics Act 1940 & Rules 1945 (Rules 59, 61, 65; Forms 20, 21, 20B, 21B)
 * - Food Safety and Standards Act 2006 (FSSAI)
 * - Pharmacy Act 1948 (State Pharmacy Council Registration)
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";

export type LicenseType =
  | "form_20"
  | "form_21"
  | "form_20b"
  | "form_21b"
  | "fssai"
  | "pharmacist_council"
  | "general_drug_license";

export type LicenseAlertUrgency = "critical" | "urgent" | "warning" | "healthy" | "not_configured";

export type LicenseStatus =
  | "expired"
  | "expiring_critical"
  | "expiring_urgent"
  | "expiring_warning"
  | "active"
  | "missing";

export interface LicenseEvaluation {
  type: LicenseType;
  title: string;
  licenseNumber: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  urgency: LicenseAlertUrgency;
  status: LicenseStatus;
  statutoryRule: string;
  recommendation: string;
}

export interface StoreLicenseReport {
  storeId: string;
  storeName: string;
  storeCode: string;
  kind: "retail" | "warehouse";
  stateCode: string;
  chiefPharmacist: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    regNo: string | null;
    councilState: string | null;
    councilExpiry: string | null;
    daysRemaining: number | null;
    urgency: LicenseAlertUrgency;
  } | null;
  licenses: LicenseEvaluation[];
  overallUrgency: LicenseAlertUrgency;
  isCompliant: boolean;
}

export interface LicenseAlertItem {
  id: string;
  storeId: string;
  storeName: string;
  licenseType: LicenseType;
  licenseTitle: string;
  licenseNumber: string | null;
  validTo: string;
  daysRemaining: number;
  urgency: "critical" | "urgent" | "warning";
  recommendation: string;
  statutoryReference: string;
}

export interface PharmacistAlertItem {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  regNo: string | null;
  councilState: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  urgency: LicenseAlertUrgency;
  assignedStoreNames: string[];
}

const STATUTORY_RULES: Record<LicenseType, string> = {
  form_20: "D&C Rules 1945 Rule 61(1) - Retail Allopathic License",
  form_21: "D&C Rules 1945 Rule 61(2) - Retail Biologicals License (Sch C/C1)",
  form_20b: "D&C Rules 1945 Rule 61(1) - Wholesale Allopathic License",
  form_21b: "D&C Rules 1945 Rule 61(2) - Wholesale Biologicals License",
  fssai: "Food Safety and Standards Act 2006 Sec 31 - FBO Registration",
  pharmacist_council: "Pharmacy Act 1948 Sec 32 & D&C Rule 65 - Council Registration",
  general_drug_license: "D&C Rules 1945 Form 20/21 Combined License",
};

const LICENSE_TITLES: Record<LicenseType, string> = {
  form_20: "Form 20 (Retail Allopathic)",
  form_21: "Form 21 (Retail Schedule C/C1)",
  form_20b: "Form 20B (Wholesale Allopathic)",
  form_21b: "Form 21B (Wholesale Schedule C/C1)",
  fssai: "FSSAI License",
  pharmacist_council: "State Pharmacy Council Registration",
  general_drug_license: "Retail Drug License",
};

/**
 * Pure evaluation function calculating urgency and days remaining for any statutory license.
 */
export function calculateLicenseStatus(
  validTo: Date | string | null | undefined,
  type: LicenseType,
  licenseNumber?: string | null,
  referenceDate: Date = new Date()
): LicenseEvaluation {
  const title = LICENSE_TITLES[type] || "License";
  const statutoryRule = STATUTORY_RULES[type] || "Statutory Rule";
  const num = licenseNumber?.trim() || null;

  if (!validTo) {
    return {
      type,
      title,
      licenseNumber: num,
      validTo: null,
      daysRemaining: null,
      urgency: num ? "warning" : "not_configured",
      status: "missing",
      statutoryRule,
      recommendation: num
        ? "License number recorded but expiry date missing. Update validity to track renewals."
        : "License not configured for this facility.",
    };
  }

  const target = new Date(validTo);
  if (Number.isNaN(target.getTime())) {
    return {
      type,
      title,
      licenseNumber: num,
      validTo: null,
      daysRemaining: null,
      urgency: "warning",
      status: "missing",
      statutoryRule,
      recommendation: "Invalid date value recorded. Please verify and re-save.",
    };
  }

  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - ref.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const validToIso = target.toISOString().split("T")[0];

  if (daysRemaining < 0) {
    return {
      type,
      title,
      licenseNumber: num,
      validTo: validToIso,
      daysRemaining,
      urgency: "critical",
      status: "expired",
      statutoryRule,
      recommendation: `EXPIRED ${Math.abs(daysRemaining)} days ago. D&C Act Section 18(c) violation. Suspend operations or file urgent compounding/renewal.`,
    };
  }

  if (daysRemaining <= 7) {
    return {
      type,
      title,
      licenseNumber: num,
      validTo: validToIso,
      daysRemaining,
      urgency: "critical",
      status: "expiring_critical",
      statutoryRule,
      recommendation: `CRITICAL: Expires in ${daysRemaining} day(s). Immediate submission of Form 19/challan required to prevent inspection closure.`,
    };
  }

  if (daysRemaining <= 30) {
    return {
      type,
      title,
      licenseNumber: num,
      validTo: validToIso,
      daysRemaining,
      urgency: "urgent",
      status: "expiring_urgent",
      statutoryRule,
      recommendation: `URGENT: Expires in ${daysRemaining} day(s). Submit renewal dossier and retention fee on state FDA portal.`,
    };
  }

  if (daysRemaining <= 60) {
    return {
      type,
      title,
      licenseNumber: num,
      validTo: validToIso,
      daysRemaining,
      urgency: "warning",
      status: "expiring_warning",
      statutoryRule,
      recommendation: `WARNING: Expires in ${daysRemaining} day(s). Procure pharmacist renewal receipt and lease declarations for renewal.`,
    };
  }

  return {
    type,
    title,
    licenseNumber: num,
    validTo: validToIso,
    daysRemaining,
    urgency: "healthy",
    status: "active",
    statutoryRule,
    recommendation: "License is active and in good regulatory standing.",
  };
}

function resolveWorstUrgency(urgencies: LicenseAlertUrgency[]): LicenseAlertUrgency {
  if (urgencies.includes("critical")) return "critical";
  if (urgencies.includes("urgent")) return "urgent";
  if (urgencies.includes("warning")) return "warning";
  if (urgencies.includes("healthy")) return "healthy";
  return "not_configured";
}

/**
 * Compiles a comprehensive compliance summary for all stores (or a single store) under a tenant.
 */
export async function getStoreLicenseSummary(
  tenantId: string,
  storeId?: string,
  referenceDate: Date = new Date()
): Promise<StoreLicenseReport[]> {
  const storeFilter = storeId
    ? and(eq(schema.stores.tenantId, tenantId), eq(schema.stores.id, storeId))
    : eq(schema.stores.tenantId, tenantId);

  const storeRows = await db
    .select()
    .from(schema.stores)
    .where(storeFilter)
    .orderBy(schema.stores.name);

  if (storeRows.length === 0) return [];

  // Fetch Chief Pharmacist user rows
  const pharmacistIds = storeRows
    .map((s) => s.chiefPharmacistId)
    .filter((id): id is string => Boolean(id));

  const pharmacistMap = new Map<string, typeof schema.users.$inferSelect>();
  if (pharmacistIds.length > 0) {
    const userRows = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, pharmacistIds));
    for (const u of userRows) {
      pharmacistMap.set(u.id, u);
    }
  }

  const reports: StoreLicenseReport[] = [];

  for (const store of storeRows) {
    const licenses: LicenseEvaluation[] = [];

    // Form 20 (Retail Allopathic) - fallback to general drug license if form20 not explicitly set
    licenses.push(
      calculateLicenseStatus(
        store.form20Expiry || store.drugLicenseExpiry,
        "form_20",
        store.form20No || store.drugLicenseNo,
        referenceDate
      )
    );

    // Form 21 (Retail Biologicals)
    licenses.push(
      calculateLicenseStatus(
        store.form21Expiry,
        "form_21",
        store.form21No,
        referenceDate
      )
    );

    // Form 20B (Wholesale Allopathic) - required for warehouses
    if (store.kind === "warehouse" || store.form20bNo || store.form20bExpiry) {
      licenses.push(
        calculateLicenseStatus(
          store.form20bExpiry,
          "form_20b",
          store.form20bNo,
          referenceDate
        )
      );
    }

    // Form 21B (Wholesale Biologicals) - required for warehouses
    if (store.kind === "warehouse" || store.form21bNo || store.form21bExpiry) {
      licenses.push(
        calculateLicenseStatus(
          store.form21bExpiry,
          "form_21b",
          store.form21bNo,
          referenceDate
        )
      );
    }

    // FSSAI
    licenses.push(
      calculateLicenseStatus(
        store.fssaiExpiry,
        "fssai",
        store.fssaiNo,
        referenceDate
      )
    );

    // Chief Pharmacist evaluation
    let chiefPharmacist: StoreLicenseReport["chiefPharmacist"] = null;
    const pharmacistUser = store.chiefPharmacistId
      ? pharmacistMap.get(store.chiefPharmacistId)
      : null;

    if (pharmacistUser) {
      const pharmEval = calculateLicenseStatus(
        pharmacistUser.pharmacistRegExpiry,
        "pharmacist_council",
        pharmacistUser.pharmacistRegNo,
        referenceDate
      );
      chiefPharmacist = {
        id: pharmacistUser.id,
        name: pharmacistUser.name,
        email: pharmacistUser.email,
        phone: pharmacistUser.phone,
        regNo: pharmacistUser.pharmacistRegNo,
        councilState: pharmacistUser.pharmacistCouncilState,
        councilExpiry: pharmEval.validTo,
        daysRemaining: pharmEval.daysRemaining,
        urgency: pharmEval.urgency,
      };
    }

    const allUrgencies = licenses.map((l) => l.urgency);
    if (chiefPharmacist) {
      allUrgencies.push(chiefPharmacist.urgency);
    } else if (store.kind === "retail") {
      // Retail store missing chief pharmacist is a warning
      allUrgencies.push("warning");
    }

    const overallUrgency = resolveWorstUrgency(allUrgencies);
    const isCompliant = overallUrgency === "healthy" || overallUrgency === "not_configured";

    reports.push({
      storeId: store.id,
      storeName: store.name,
      storeCode: store.code,
      kind: store.kind,
      stateCode: store.stateCode,
      chiefPharmacist,
      licenses,
      overallUrgency,
      isCompliant,
    });
  }

  return reports;
}

/**
 * Returns prioritized alert items across all stores for notification badges and Topbar callouts.
 */
export async function getAllStoreLicenseAlerts(
  tenantId: string,
  referenceDate: Date = new Date()
): Promise<LicenseAlertItem[]> {
  const summaries = await getStoreLicenseSummary(tenantId, undefined, referenceDate);
  const alerts: LicenseAlertItem[] = [];

  for (const s of summaries) {
    for (const l of s.licenses) {
      if (
        (l.urgency === "critical" || l.urgency === "urgent" || l.urgency === "warning") &&
        l.validTo &&
        l.daysRemaining !== null
      ) {
        alerts.push({
          id: `${s.storeId}-${l.type}`,
          storeId: s.storeId,
          storeName: s.storeName,
          licenseType: l.type,
          licenseTitle: l.title,
          licenseNumber: l.licenseNumber,
          validTo: l.validTo,
          daysRemaining: l.daysRemaining,
          urgency: l.urgency,
          recommendation: l.recommendation,
          statutoryReference: l.statutoryRule,
        });
      }
    }
  }

  // Sort: smallest daysRemaining first (most urgent/expired at the top)
  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return alerts;
}

/**
 * Aggregates pharmacist council renewal alerts across all users in the tenant.
 */
export async function getPharmacistRegistrationAlerts(
  tenantId: string,
  referenceDate: Date = new Date()
): Promise<PharmacistAlertItem[]> {
  // Find members of this tenant
  const members = await db
    .select({
      user: schema.users,
      storeIds: schema.memberships.storeIds,
      allStores: schema.memberships.allStores,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.tenantId, tenantId));

  const allStores = await db
    .select({ id: schema.stores.id, name: schema.stores.name })
    .from(schema.stores)
    .where(eq(schema.stores.tenantId, tenantId));

  const storeMap = new Map(allStores.map((s) => [s.id, s.name]));

  const results: PharmacistAlertItem[] = [];
  const seenUserIds = new Set<string>();

  for (const m of members) {
    if (seenUserIds.has(m.user.id)) continue;
    seenUserIds.add(m.user.id);

    if (!m.user.pharmacistRegNo && !m.user.pharmacistRegExpiry) continue;

    const evaluation = calculateLicenseStatus(
      m.user.pharmacistRegExpiry,
      "pharmacist_council",
      m.user.pharmacistRegNo,
      referenceDate
    );

    let assignedStoreNames: string[] = [];
    if (m.allStores) {
      assignedStoreNames = ["All branches"];
    } else if (m.storeIds && m.storeIds.length > 0) {
      assignedStoreNames = m.storeIds
        .map((id) => storeMap.get(id))
        .filter((n): n is string => Boolean(n));
    }

    results.push({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      regNo: m.user.pharmacistRegNo,
      councilState: m.user.pharmacistCouncilState,
      validTo: evaluation.validTo,
      daysRemaining: evaluation.daysRemaining,
      urgency: evaluation.urgency,
      assignedStoreNames,
    });
  }

  results.sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999));
  return results;
}

