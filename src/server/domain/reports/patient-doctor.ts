import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { schema } from "@/server/db";

export interface PatientWiseSaleRow {
  patientKey: string;
  patientName: string;
  patientPhone: string;
  billCount: number;
  totalQty: number;
  totalAmountPaise: number;
  creditAmountPaise: number;
  lastVisitDate: string;
}

export interface DoctorWiseSaleRow {
  doctorName: string;
  doctorRegNo: string;
  rxCount: number;
  uniquePatients: number;
  totalQty: number;
  totalAmountPaise: number;
}

export interface DoctorCompanySaleRow {
  doctorName: string;
  manufacturer: string;
  rxLineCount: number;
  totalQty: number;
  totalAmountPaise: number;
}

export interface PatientDoctorReportResult {
  patients: PatientWiseSaleRow[];
  doctors: DoctorWiseSaleRow[];
  doctorCompanies: DoctorCompanySaleRow[];
}

export interface RawPatientDoctorLine {
  saleId: string;
  completedAt: Date | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  doctorName: string | null;
  doctorRegNo: string | null;
  saleTotal: number;
  saleCredit: number;
  qty: number;
  lineTotal: number;
  manufacturer: string | null;
}

export function aggregatePatientDoctorSales(rows: RawPatientDoctorLine[]): PatientDoctorReportResult {
  const patientMap = new Map<
    string,
    {
      patientKey: string;
      patientName: string;
      patientPhone: string;
      saleIds: Set<string>;
      saleTotals: Map<string, { total: number; credit: number }>;
      totalQty: number;
      lastVisitDate: string;
    }
  >();

  const doctorMap = new Map<
    string,
    {
      doctorName: string;
      doctorRegNo: string;
      saleIds: Set<string>;
      patientKeys: Set<string>;
      totalQty: number;
      totalAmountPaise: number;
    }
  >();

  const docCompanyMap = new Map<string, DoctorCompanySaleRow>();

  for (const r of rows) {
    const dateStr = r.completedAt ? r.completedAt.toISOString().slice(0, 10) : "";
    const pName = (r.customerName || "Walk-in Customer").trim();
    const pPhone = (r.customerPhone || "").trim();
    const pKey = r.customerId || `${pName.toLowerCase()}::${pPhone}`;

    let pEntry = patientMap.get(pKey);
    if (!pEntry) {
      pEntry = {
        patientKey: pKey,
        patientName: pName,
        patientPhone: pPhone,
        saleIds: new Set(),
        saleTotals: new Map(),
        totalQty: 0,
        lastVisitDate: dateStr,
      };
      patientMap.set(pKey, pEntry);
    }
    pEntry.saleIds.add(r.saleId);
    pEntry.saleTotals.set(r.saleId, { total: r.saleTotal, credit: r.saleCredit });
    pEntry.totalQty += r.qty;
    if (dateStr > pEntry.lastVisitDate) {
      pEntry.lastVisitDate = dateStr;
    }

    const dName = (r.doctorName || "").trim();
    if (dName) {
      const dKey = dName.toLowerCase();
      let dEntry = doctorMap.get(dKey);
      if (!dEntry) {
        dEntry = {
          doctorName: dName,
          doctorRegNo: (r.doctorRegNo || "").trim(),
          saleIds: new Set(),
          patientKeys: new Set(),
          totalQty: 0,
          totalAmountPaise: 0,
        };
        doctorMap.set(dKey, dEntry);
      }
      if (!dEntry.doctorRegNo && r.doctorRegNo) {
        dEntry.doctorRegNo = r.doctorRegNo.trim();
      }
      dEntry.saleIds.add(r.saleId);
      dEntry.patientKeys.add(pKey);
      dEntry.totalQty += r.qty;
      dEntry.totalAmountPaise += r.lineTotal;

      const mfg = (r.manufacturer || "Unspecified").trim();
      const dcKey = `${dKey}::${mfg.toLowerCase()}`;
      const existingDc = docCompanyMap.get(dcKey);
      if (existingDc) {
        existingDc.rxLineCount += 1;
        existingDc.totalQty += r.qty;
        existingDc.totalAmountPaise += r.lineTotal;
      } else {
        docCompanyMap.set(dcKey, {
          doctorName: dName,
          manufacturer: mfg,
          rxLineCount: 1,
          totalQty: r.qty,
          totalAmountPaise: r.lineTotal,
        });
      }
    }
  }

  const patients: PatientWiseSaleRow[] = Array.from(patientMap.values())
    .map((p) => {
      let totalAmountPaise = 0;
      let creditAmountPaise = 0;
      for (const s of p.saleTotals.values()) {
        totalAmountPaise += s.total;
        creditAmountPaise += s.credit;
      }
      return {
        patientKey: p.patientKey,
        patientName: p.patientName,
        patientPhone: p.patientPhone,
        billCount: p.saleIds.size,
        totalQty: p.totalQty,
        totalAmountPaise,
        creditAmountPaise,
        lastVisitDate: p.lastVisitDate,
      };
    })
    .sort((a, b) => b.totalAmountPaise - a.totalAmountPaise);

  const doctors: DoctorWiseSaleRow[] = Array.from(doctorMap.values())
    .map((d) => ({
      doctorName: d.doctorName,
      doctorRegNo: d.doctorRegNo,
      rxCount: d.saleIds.size,
      uniquePatients: d.patientKeys.size,
      totalQty: d.totalQty,
      totalAmountPaise: d.totalAmountPaise,
    }))
    .sort((a, b) => b.totalAmountPaise - a.totalAmountPaise);

  const doctorCompanies: DoctorCompanySaleRow[] = Array.from(docCompanyMap.values()).sort(
    (a, b) => b.totalAmountPaise - a.totalAmountPaise,
  );

  return { patients, doctors, doctorCompanies };
}

export async function getPatientDoctorSalesReport(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId: string;
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
  },
): Promise<PatientDoctorReportResult> {
  const fromDate = new Date(`${params.from}T00:00:00.000Z`);
  const toDate = new Date(`${params.to}T23:59:59.999Z`);

  const rows = await db
    .select({
      saleId: schema.sales.id,
      completedAt: schema.sales.completedAt,
      customerId: schema.sales.customerId,
      customerName: schema.sales.customerName,
      customerPhone: schema.sales.customerPhone,
      doctorName: schema.sales.doctorName,
      doctorRegNo: schema.sales.doctorRegNo,
      saleTotal: schema.sales.totalAmount,
      saleCredit: schema.sales.creditAmount,
      qty: schema.saleItems.qty,
      lineTotal: schema.saleItems.totalAmount,
      manufacturer: schema.manufacturers.name,
    })
    .from(schema.saleItems)
    .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
    .innerJoin(schema.medicines, eq(schema.saleItems.medicineId, schema.medicines.id))
    .leftJoin(schema.manufacturers, eq(schema.medicines.manufacturerId, schema.manufacturers.id))
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

  return aggregatePatientDoctorSales(rows);
}
