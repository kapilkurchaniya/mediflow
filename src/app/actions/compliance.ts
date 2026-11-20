"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, gte, lte, ilike, or, sql } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/server/audit";
import {
  queryComplianceRegister,
  getComplianceStats,
  type StatutoryRegisterType,
  getScheduleRule,
} from "@/server/domain/compliance";

export async function getComplianceOverview() {
  const ctx = await requirePermission("report.view");
  const stats = await getComplianceStats(db, ctx.tenantId, ctx.storeId);
  return stats;
}

export async function getDispensingLogs(params: {
  registerType?: StatutoryRegisterType;
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
  page?: number;
  limit?: number;
}) {
  const ctx = await requirePermission("report.view");
  const limit = params.limit ?? 50;
  const page = params.page ?? 1;
  const offset = (page - 1) * limit;

  const logs = await queryComplianceRegister(db, {
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    registerType: params.registerType,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    searchQuery: params.searchQuery,
    limit,
    offset,
  });

  return logs;
}

export async function getDoctors(searchQuery?: string) {
  const ctx = await requirePermission("report.view");
  const conditions = [
    eq(schema.doctors.tenantId, ctx.tenantId),
    eq(schema.doctors.isActive, true),
  ];

  if (searchQuery && searchQuery.trim().length > 0) {
    const q = `%${searchQuery.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(schema.doctors.name, q),
        ilike(schema.doctors.regNo, q),
        ilike(schema.doctors.hospital, q),
        ilike(schema.doctors.specialization, q)
      )!
    );
  }

  const doctorsList = await db
    .select()
    .from(schema.doctors)
    .where(and(...conditions))
    .orderBy(desc(schema.doctors.createdAt))
    .limit(50);

  return doctorsList;
}

export async function upsertDoctor(data: {
  id?: string;
  name: string;
  regNo: string;
  qualification?: string | null;
  specialization?: string | null;
  hospital?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}) {
  const ctx = await requirePermission("prescription.approve");

  if (!data.name.trim()) return { error: "Doctor name is required" };
  if (!data.regNo.trim()) return { error: "Medical Council Registration Number is required" };

  try {
    if (data.id) {
      await db
        .update(schema.doctors)
        .set({
          name: data.name.trim(),
          regNo: data.regNo.trim(),
          qualification: data.qualification?.trim() || null,
          specialization: data.specialization?.trim() || null,
          hospital: data.hospital?.trim() || null,
          phone: data.phone?.trim() || null,
          email: data.email?.trim() || null,
          address: data.address?.trim() || null,
        })
        .where(
          and(
            eq(schema.doctors.id, data.id),
            eq(schema.doctors.tenantId, ctx.tenantId)
          )
        );
      revalidatePath("/dashboard/compliance");
      revalidatePath("/dashboard/compliance/doctors");
      return { success: true, doctorId: data.id };
    }

    const [inserted] = await db
      .insert(schema.doctors)
      .values({
        tenantId: ctx.tenantId,
        name: data.name.trim(),
        regNo: data.regNo.trim(),
        qualification: data.qualification?.trim() || null,
        specialization: data.specialization?.trim() || null,
        hospital: data.hospital?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
      })
      .returning({ id: schema.doctors.id });

    revalidatePath("/dashboard/compliance");
    revalidatePath("/dashboard/compliance/doctors");
    return { success: true, doctorId: inserted.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("doctors_tenant_reg_uq")) {
      return { error: "A doctor with this registration number already exists in your registry." };
    }
    return { error: msg || "Failed to save doctor" };
  }
}

export async function getPrescriptions(params: {
  status?: string;
  searchQuery?: string;
  page?: number;
  limit?: number;
}) {
  const ctx = await requirePermission("prescription.approve");
  const limit = params.limit ?? 30;
  const page = params.page ?? 1;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(schema.prescriptions.tenantId, ctx.tenantId),
    eq(schema.prescriptions.storeId, ctx.storeId),
  ];

  if (params.status && params.status !== "all") {
    conditions.push(eq(schema.prescriptions.status, params.status));
  }

  if (params.searchQuery && params.searchQuery.trim().length > 0) {
    const q = `%${params.searchQuery.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(schema.prescriptions.patientName, q),
        ilike(schema.prescriptions.doctorName, q),
        ilike(schema.prescriptions.doctorRegNo, q),
        ilike(schema.prescriptions.rxNumber, q)
      )!
    );
  }

  const list = await db
    .select({
      rx: schema.prescriptions,
      doctor: schema.doctors,
      customer: schema.customers,
    })
    .from(schema.prescriptions)
    .leftJoin(schema.doctors, eq(schema.prescriptions.doctorId, schema.doctors.id))
    .leftJoin(schema.customers, eq(schema.prescriptions.customerId, schema.customers.id))
    .where(and(...conditions))
    .orderBy(desc(schema.prescriptions.prescriptionDate), desc(schema.prescriptions.createdAt))
    .limit(limit)
    .offset(offset);

  return list;
}

export async function getPrescriptionDetails(prescriptionId: string) {
  const ctx = await requirePermission("prescription.approve");

  const [rx] = await db
    .select({
      prescription: schema.prescriptions,
      doctor: schema.doctors,
      customer: schema.customers,
    })
    .from(schema.prescriptions)
    .leftJoin(schema.doctors, eq(schema.prescriptions.doctorId, schema.doctors.id))
    .leftJoin(schema.customers, eq(schema.prescriptions.customerId, schema.customers.id))
    .where(
      and(
        eq(schema.prescriptions.id, prescriptionId),
        eq(schema.prescriptions.tenantId, ctx.tenantId)
      )
    );

  if (!rx) return null;

  const items = await db
    .select()
    .from(schema.prescriptionItems)
    .where(eq(schema.prescriptionItems.prescriptionId, prescriptionId));

  return { ...rx, items };
}

export async function createPrescription(data: {
  customerId?: string | null;
  patientName: string;
  patientAge?: number | null;
  patientGender?: string | null;
  patientPhone?: string | null;
  patientAddress?: string | null;
  doctorId?: string | null;
  doctorName: string;
  doctorRegNo?: string | null;
  doctorAddress?: string | null;
  rxNumber?: string | null;
  prescriptionDate: string;
  diagnosis?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
  validUntil?: string | null;
  items: Array<{
    medicineId?: string | null;
    medicineName: string;
    dosage?: string | null;
    frequency?: string | null;
    durationDays?: number | null;
    quantityPrescribed: number;
    instructions?: string | null;
  }>;
}) {
  const ctx = await requirePermission("prescription.approve");

  if (!data.patientName.trim()) return { error: "Patient name is required" };
  if (!data.doctorName.trim()) return { error: "Doctor name is required" };
  if (!data.prescriptionDate) return { error: "Prescription date is required" };
  if (!data.items || data.items.length === 0) {
    return { error: "At least one prescribed medicine item is required" };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (data.validUntil && data.validUntil < todayStr) {
    return { error: `Prescription validity date (${data.validUntil}) cannot be in the past` };
  }

  try {
    const insertedRx = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schema.prescriptions)
        .values({
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          customerId: data.customerId || null,
          patientName: data.patientName.trim(),
          patientAge: data.patientAge ?? null,
          patientGender: data.patientGender ?? null,
          patientPhone: data.patientPhone?.trim() || null,
          patientAddress: data.patientAddress?.trim() || null,
          doctorId: data.doctorId || null,
          doctorName: data.doctorName.trim(),
          doctorRegNo: data.doctorRegNo?.trim() || null,
          doctorAddress: data.doctorAddress?.trim() || null,
          rxNumber: data.rxNumber?.trim() || null,
          prescriptionDate: data.prescriptionDate,
          diagnosis: data.diagnosis?.trim() || null,
          notes: data.notes?.trim() || null,
          imageUrl: data.imageUrl?.trim() || null,
          validUntil: data.validUntil || null,
          status: "active",
        })
        .returning();

      const itemsToInsert = data.items.map((item) => ({
        tenantId: ctx.tenantId,
        prescriptionId: inserted.id,
        medicineId: item.medicineId || null,
        medicineName: item.medicineName.trim(),
        dosage: item.dosage?.trim() || null,
        frequency: item.frequency?.trim() || null,
        durationDays: item.durationDays ?? null,
        quantityPrescribed: item.quantityPrescribed,
        instructions: item.instructions?.trim() || null,
      }));

      await tx.insert(schema.prescriptionItems).values(itemsToInsert);

      await writeAudit(tx, ctx, {
        action: "create",
        entityType: "prescription",
        entityId: inserted.id,
        newValue: { patientName: data.patientName, doctorName: data.doctorName, itemsCount: data.items.length },
      });

      return inserted;
    });

    revalidatePath("/dashboard/compliance");
    revalidatePath("/dashboard/compliance/prescriptions");
    return { success: true, prescriptionId: insertedRx.id, prescription: insertedRx };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function exportRegisterCsvData(params: {
  registerType: StatutoryRegisterType;
  dateFrom?: string;
  dateTo?: string;
}) {
  const ctx = await requirePermission("report.export");

  const logs = await queryComplianceRegister(db, {
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    registerType: params.registerType,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    limit: 1000,
  });

  // Statutory headers per Drugs and Cosmetics Rules (Form 35 / Schedule H1 register format)
  const headers = [
    "Sl No",
    "Date of Supply",
    "Invoice No",
    "Name of Patient",
    "Address of Patient",
    "Prescriber Name",
    "Doctor Reg No",
    "Prescriber Address",
    "Drug Name",
    "Schedule",
    "Batch No",
    "Expiry Date",
    "Manufacturer",
    "Qty Dispensed",
    "Pharmacist Name",
    "Pharmacist Reg No",
  ];

  const escapeCsv = (str: string | number | null | undefined) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = logs.map((row, idx) => [
    idx + 1,
    row.log.dispensedAt ? new Date(row.log.dispensedAt).toLocaleDateString("en-IN") : "",
    row.sale.invoiceNo ?? "",
    row.log.patientName ?? "",
    row.log.patientAddress ?? "",
    row.log.doctorName ?? "",
    row.log.doctorRegNo ?? "",
    row.log.doctorAddress ?? "",
    row.log.medicineName ?? "",
    row.log.schedule ?? "",
    row.log.batchNo ?? "",
    row.log.expiryDate ?? "",
    row.log.manufacturerName ?? "",
    row.log.quantityDispensed,
    row.log.pharmacistName ?? "",
    row.log.pharmacistRegNo ?? "",
  ]);

  const csvContent = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ].join("\r\n");

  return { success: true, csvContent };
}

export interface SearchMedicineOption {
  id: string;
  name: string;
  genericName: string | null;
  dosageForm: string | null;
  strength: string | null;
  schedule: string;
  rxRequired: boolean;
}

/**
 * Fast search for medicines for prescription drafting.
 */
export async function searchMedicinesForPrescription(
  query: string,
  limit = 20
): Promise<SearchMedicineOption[]> {
  const ctx = await requirePermission("prescription.approve");
  const trimmed = query?.trim() ?? "";
  if (!trimmed) {
    const list = await db
      .select({
        id: schema.medicines.id,
        name: schema.medicines.name,
        genericName: schema.medicines.genericName,
        dosageForm: schema.medicines.dosageForm,
        strength: schema.medicines.strength,
        schedule: schema.medicines.schedule,
        rxRequired: schema.medicines.rxRequired,
      })
      .from(schema.medicines)
      .where(and(eq(schema.medicines.tenantId, ctx.tenantId), eq(schema.medicines.isActive, true)))
      .orderBy(schema.medicines.name)
      .limit(limit);
    return list;
  }

  const q = `%${trimmed.toLowerCase()}%`;
  const list = await db
    .select({
      id: schema.medicines.id,
      name: schema.medicines.name,
      genericName: schema.medicines.genericName,
      dosageForm: schema.medicines.dosageForm,
      strength: schema.medicines.strength,
      schedule: schema.medicines.schedule,
      rxRequired: schema.medicines.rxRequired,
    })
    .from(schema.medicines)
    .where(
      and(
        eq(schema.medicines.tenantId, ctx.tenantId),
        eq(schema.medicines.isActive, true),
        or(
          ilike(schema.medicines.name, q),
          ilike(schema.medicines.genericName, q),
          ilike(schema.medicines.composition, q),
          ilike(schema.medicines.barcode, q)
        )!
      )
    )
    .orderBy(schema.medicines.name)
    .limit(limit);

  return list;
}

/**
 * Cancels a prescription without deletion (B1.4 statutory audit trail preservation).
 */
export async function cancelPrescription(prescriptionId: string, reason?: string) {
  const ctx = await requirePermission("prescription.approve");

  const [rx] = await db
    .select()
    .from(schema.prescriptions)
    .where(
      and(
        eq(schema.prescriptions.id, prescriptionId),
        eq(schema.prescriptions.tenantId, ctx.tenantId)
      )
    );

  if (!rx) return { error: "Prescription not found" };
  if (rx.status === "cancelled") return { error: "Prescription is already cancelled" };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.prescriptions)
      .set({
        status: "cancelled",
        notes: reason
          ? `${rx.notes ? rx.notes + " | " : ""}Cancelled: ${reason.trim()}`
          : rx.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.prescriptions.id, prescriptionId));

    await writeAudit(tx, ctx, {
      action: "cancel",
      entityType: "prescription",
      entityId: prescriptionId,
      oldValue: { status: rx.status },
      newValue: { status: "cancelled" },
      reason: reason?.trim() || "Prescription cancelled",
    });
  });

  revalidatePath("/dashboard/compliance/prescriptions");
  return { success: true };
}
