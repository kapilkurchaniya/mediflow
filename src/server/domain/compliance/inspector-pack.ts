import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { schema } from "@/server/db";

export interface InspectorPackParams {
  tenantId: string;
  storeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface StatutoryRegisterRow {
  id: string;
  dispensedAt: string;
  patientName: string;
  patientAddress: string;
  doctorName: string;
  doctorRegNo: string;
  doctorAddress: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  quantityDispensed: number;
  pharmacistName: string;
  pharmacistRegNo: string;
  prescriptionRef: string;
  schedule: string;
}

export interface InwardScheduledRow {
  invoiceNumber: string;
  invoiceDate: string;
  supplierName: string;
  supplierGstin: string;
  supplierDrugLicense: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  quantityReceived: number;
  schedule: string;
}

export interface PharmacistRosterRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  pharmacistRegNo: string | null;
  pharmacistCouncilState: string | null;
  role: string;
}

export interface InspectorPackResult {
  store: {
    id: string;
    name: string;
    form20No: string | null;
    form21No: string | null;
    form20bNo: string | null;
    form21bNo: string | null;
  };
  dateRange: { startDate: string; endDate: string };
  scheduleH: StatutoryRegisterRow[];
  scheduleH1: StatutoryRegisterRow[];
  scheduleX: StatutoryRegisterRow[];
  inwardScheduled: InwardScheduledRow[];
  pharmacists: PharmacistRosterRow[];
}

export async function generateInspectorPack(
  db: DbOrTx,
  params: InspectorPackParams,
): Promise<InspectorPackResult> {
  const { tenantId, storeId, startDate, endDate } = params;

  const [store] = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      form20No: schema.stores.form20No,
      form21No: schema.stores.form21No,
      form20bNo: schema.stores.form20bNo,
      form21bNo: schema.stores.form21bNo,
    })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, tenantId)))
    .limit(1);

  if (!store) throw new Error("Store not found");

  const startTimestamp = new Date(`${startDate}T00:00:00.000Z`);
  const endTimestamp = new Date(`${endDate}T23:59:59.999Z`);

  // Query Dispensing Logs for the statutory date window
  const logs = await db
    .select()
    .from(schema.dispensingLogs)
    .where(
      and(
        eq(schema.dispensingLogs.tenantId, tenantId),
        eq(schema.dispensingLogs.storeId, storeId),
        gte(schema.dispensingLogs.dispensedAt, startTimestamp),
        lte(schema.dispensingLogs.dispensedAt, endTimestamp),
      ),
    );

  const formatLog = (row: typeof logs[0]): StatutoryRegisterRow => ({
    id: row.id,
    dispensedAt: row.dispensedAt.toISOString().replace("T", " ").slice(0, 19),
    patientName: row.patientName,
    patientAddress: row.patientAddress || "Local",
    doctorName: row.doctorName,
    doctorRegNo: row.doctorRegNo || "N/A",
    doctorAddress: row.doctorAddress || "Clinic",
    medicineName: row.medicineName,
    batchNo: row.batchNo,
    expiryDate: row.expiryDate,
    quantityDispensed: row.quantityDispensed,
    pharmacistName: row.pharmacistName || "Chief Pharmacist",
    pharmacistRegNo: row.pharmacistRegNo || "N/A",
    prescriptionRef: row.prescriptionRef || row.saleId.slice(0, 8),
    schedule: row.schedule,
  });

  const scheduleH = logs.filter((l) => l.statutoryRegister === "schedule_h").map(formatLog);
  const scheduleH1 = logs.filter((l) => l.statutoryRegister === "schedule_h1").map(formatLog);
  const scheduleX = logs.filter((l) => l.statutoryRegister === "schedule_x" || l.statutoryRegister === "narcotics").map(formatLog);

  // Inward scheduled formulations from purchase orders/invoices
  const inwardRows = await db
    .select({
      invoiceNumber: schema.purchases.supplierInvoiceNo,
      invoiceDate: schema.purchases.invoiceDate,
      supplierName: schema.suppliers.name,
      supplierGstin: schema.suppliers.gstin,
      supplierDrugLicense: schema.suppliers.drugLicenseNo,
      medicineName: schema.medicines.name,
      schedule: schema.medicines.schedule,
      batchNo: schema.purchaseItems.batchNo,
      expiryDate: schema.purchaseItems.expiryDate,
      quantityReceived: schema.purchaseItems.qty,
    })
    .from(schema.purchases)
    .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .innerJoin(schema.purchaseItems, eq(schema.purchases.id, schema.purchaseItems.purchaseId))
    .innerJoin(schema.medicines, eq(schema.purchaseItems.medicineId, schema.medicines.id))
    .where(
      and(
        eq(schema.purchases.tenantId, tenantId),
        eq(schema.purchases.storeId, storeId),
        gte(schema.purchases.invoiceDate, startDate),
        lte(schema.purchases.invoiceDate, endDate),
        inArray(schema.medicines.schedule, ["H", "H1", "X", "narcotic"]),
      ),
    );

  const inwardScheduled: InwardScheduledRow[] = inwardRows.map((r) => ({
    invoiceNumber: r.invoiceNumber,
    invoiceDate: r.invoiceDate,
    supplierName: r.supplierName,
    supplierGstin: r.supplierGstin || "Unregistered",
    supplierDrugLicense: r.supplierDrugLicense || "DL-PENDING",
    medicineName: r.medicineName,
    batchNo: r.batchNo,
    expiryDate: r.expiryDate,
    quantityReceived: r.quantityReceived,
    schedule: r.schedule,
  }));

  // Pharmacist on Duty / Staff Roster
  const staff = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      phone: schema.users.phone,
      pharmacistRegNo: schema.users.pharmacistRegNo,
      pharmacistCouncilState: schema.users.pharmacistCouncilState,
      roleName: schema.roles.name,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.status, "active"),
      ),
    );

  const pharmacists: PharmacistRosterRow[] = staff.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    pharmacistRegNo: s.pharmacistRegNo,
    pharmacistCouncilState: s.pharmacistCouncilState,
    role: s.roleName,
  }));

  return {
    store,
    dateRange: { startDate, endDate },
    scheduleH,
    scheduleH1,
    scheduleX,
    inwardScheduled,
    pharmacists,
  };
}

/** Formats Schedule H1 register into standard D&C Rules 1945 Rule 65(9)(b) CSV format */
export function formatScheduleH1Csv(rows: StatutoryRegisterRow[]): string {
  const headers = [
    "Date & Time",
    "Patient Name",
    "Patient Address",
    "Doctor Name",
    "Doctor Reg No",
    "Doctor Address",
    "Medicine Name",
    "Batch No",
    "Expiry Date",
    "Quantity Supplied",
    "Dispensing Pharmacist",
    "Pharmacist Reg No",
    "Prescription Ref",
  ];

  const escape = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [
        r.dispensedAt,
        r.patientName,
        r.patientAddress,
        r.doctorName,
        r.doctorRegNo,
        r.doctorAddress,
        r.medicineName,
        r.batchNo,
        r.expiryDate,
        r.quantityDispensed,
        r.pharmacistName,
        r.pharmacistRegNo,
        r.prescriptionRef,
      ]
        .map(escape)
        .join(","),
    ),
  ];

  return "\uFEFF" + lines.join("\r\n");
}
