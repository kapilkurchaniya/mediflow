"use server";

import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import {
  formatTbRegisterCsv,
  getTbRegisterReport,
  type TbRegisterRow,
} from "@/server/domain/reports/tb-register";
import {
  getPatientDoctorSalesReport,
  type PatientDoctorReportResult,
} from "@/server/domain/reports/patient-doctor";

export async function getTbRegisterAction(input: {
  from: string;
  to: string;
  storeId?: string;
}): Promise<{ success: boolean; rows?: TbRegisterRow[]; csv?: string; error?: string }> {
  try {
    const ctx = await requirePermission("report.view");
    const storeId = input.storeId || ctx.storeId;
    const rows = await getTbRegisterReport(db, {
      tenantId: ctx.tenantId,
      storeId,
      from: input.from,
      to: input.to,
    });
    return { success: true, rows, csv: formatTbRegisterCsv(rows) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load TB register" };
  }
}

export async function getPatientDoctorSalesAction(input: {
  from: string;
  to: string;
  storeId?: string;
}): Promise<{ success: boolean; data?: PatientDoctorReportResult; error?: string }> {
  try {
    const ctx = await requirePermission("report.view");
    const storeId = input.storeId || ctx.storeId;
    const data = await getPatientDoctorSalesReport(db, {
      tenantId: ctx.tenantId,
      storeId,
      from: input.from,
      to: input.to,
    });
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load patient/doctor report" };
  }
}
