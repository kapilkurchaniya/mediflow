import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { schema } from "@/server/db";
import { isAntiTbDrug } from "@/lib/regulatory/anti-tb";

export interface TbRegisterRow {
  saleId: string;
  invoiceNo: string;
  dispensedAt: string;
  patientName: string;
  patientPhone: string;
  patientAddress: string;
  doctorName: string;
  doctorRegNo: string;
  medicineName: string;
  genericName: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
  schedule: string;
}

export async function getTbRegisterReport(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId: string;
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
  },
): Promise<TbRegisterRow[]> {
  const fromDate = new Date(`${params.from}T00:00:00.000Z`);
  const toDate = new Date(`${params.to}T23:59:59.999Z`);

  const rows = await db
    .select({
      saleId: schema.sales.id,
      invoiceNo: schema.sales.invoiceNo,
      completedAt: schema.sales.completedAt,
      customerName: schema.sales.customerName,
      customerPhone: schema.sales.customerPhone,
      patientAddress: schema.sales.patientAddress,
      doctorName: schema.sales.doctorName,
      doctorRegNo: schema.sales.doctorRegNo,
      medicineName: schema.saleItems.medicineName,
      genericName: schema.medicines.genericName,
      batchNo: schema.saleItems.batchNo,
      expiryDate: schema.saleItems.expiryDate,
      qty: schema.saleItems.qty,
      schedule: schema.medicines.schedule,
    })
    .from(schema.saleItems)
    .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
    .innerJoin(schema.medicines, eq(schema.saleItems.medicineId, schema.medicines.id))
    .where(
      and(
        eq(schema.sales.tenantId, params.tenantId),
        eq(schema.sales.storeId, params.storeId),
        eq(schema.sales.status, "completed"),
        gte(schema.sales.completedAt, fromDate),
        lte(schema.sales.completedAt, toDate),
      ),
    )
    .orderBy(desc(schema.sales.completedAt));

  return rows
    .filter((r) => isAntiTbDrug({ medicineName: r.medicineName, genericName: r.genericName }))
    .map((r) => ({
      saleId: r.saleId,
      invoiceNo: r.invoiceNo ?? "",
      dispensedAt: r.completedAt ? r.completedAt.toISOString().slice(0, 10) : "",
      patientName: r.customerName || "Walk-in Patient",
      patientPhone: r.customerPhone || "",
      patientAddress: r.patientAddress || "",
      doctorName: r.doctorName || "",
      doctorRegNo: r.doctorRegNo || "",
      medicineName: r.medicineName,
      genericName: r.genericName || "",
      batchNo: r.batchNo,
      expiryDate: String(r.expiryDate),
      qty: r.qty,
      schedule: r.schedule,
    }));
}

export function formatTbRegisterCsv(rows: TbRegisterRow[]): string {
  const header = [
    "Date",
    "Invoice No",
    "Patient Name",
    "Patient Phone",
    "Patient Address",
    "Prescriber Name",
    "Prescriber Reg No",
    "Medicine",
    "Composition",
    "Batch No",
    "Expiry",
    "Qty Dispensed",
    "Schedule",
  ].join(",");

  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const lines = rows.map((r) =>
    [
      esc(r.dispensedAt),
      esc(r.invoiceNo),
      esc(r.patientName),
      esc(r.patientPhone),
      esc(r.patientAddress),
      esc(r.doctorName),
      esc(r.doctorRegNo),
      esc(r.medicineName),
      esc(r.genericName),
      esc(r.batchNo),
      esc(r.expiryDate),
      r.qty,
      esc(r.schedule),
    ].join(","),
  );

  return [header, ...lines].join("\n");
}
