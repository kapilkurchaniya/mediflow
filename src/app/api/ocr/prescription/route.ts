import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getAuthCtx, can } from "@/server/rbac";
import { checkAiRateLimit } from "@/server/ai/rate-limiter";
import { readAndValidateOcrFile, runStructuredOcr } from "@/server/ai/ocr";

export const maxDuration = 60;

const PrescriptionOcrSchema = z.object({
  patientName: z.string().nullable().optional(),
  patientAge: z.number().int().min(0).max(130).nullable().optional(),
  patientGender: z.enum(["male", "female", "other"]).nullable().optional(),
  patientPhone: z.string().nullable().optional(),
  patientAddress: z.string().nullable().optional(),
  doctorName: z.string().nullable().optional(),
  doctorRegNo: z.string().nullable().optional(),
  doctorQualification: z.string().nullable().optional(),
  doctorSpecialization: z.string().nullable().optional(),
  doctorHospital: z.string().nullable().optional(),
  doctorPhone: z.string().nullable().optional(),
  doctorAddress: z.string().nullable().optional(),
  rxNumber: z.string().nullable().optional(),
  prescriptionDate: z.string().nullable().optional(),
  diagnosis: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(
    z.object({
      medicineName: z.string(),
      dosage: z.string().nullable().optional(),
      frequency: z.string().nullable().optional(),
      durationDays: z.number().int().min(1).max(365).nullable().optional(),
      quantityPrescribed: z.number().int().min(1).default(1),
      instructions: z.string().nullable().optional(),
    })
  ).default([]),
});

function normalizeRxDate(raw?: string | null): string {
  const s = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function normalizeRegKey(raw?: string | null): string {
  return (raw || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export async function POST(req: Request) {
  const ctx = await getAuthCtx().catch(() => null);
  if (!ctx || !ctx.tenantId || !ctx.storeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(ctx, "prescription.approve")) {
    return NextResponse.json(
      { error: "Forbidden: prescription.approve permission required." },
      { status: 403 }
    );
  }

  const rl = checkAiRateLimit(ctx.tenantId, ctx.userId);
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.reason || "Rate limit exceeded." }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const { bytes, mimeType } = await readAndValidateOcrFile(formData);

    const prompt = `Extract all structured medical prescription (Rx) details from this Indian doctor's prescription photo, scan, or PDF (handwritten or printed).
Rules:
- patientName, patientAge (integer), patientGender ("male" | "female" | "other"), patientPhone, patientAddress if visible.
- doctorName: Doctor's full name (clean, without duplicating "Dr." if already present, e.g. "Dr. A. K. Sharma").
- doctorRegNo: NMC / MCI / State Medical Council registration number or ABDM HPR ID if printed on letterhead/stamp.
- doctorQualification: e.g. "MBBS, MD (Medicine)" if printed.
- doctorSpecialization: e.g. "Cardiologist", "General Physician" if printed.
- doctorHospital: Clinic / hospital name on letterhead.
- doctorPhone, doctorAddress: Doctor/clinic contact details if printed.
- rxNumber: OPD / Rx / Slip number if visible.
- prescriptionDate: YYYY-MM-DD if visible.
- diagnosis: Chief complaint or diagnosis if written.
- items: Every prescribed medicine with medicineName (brand or generic + strength e.g. "Augmentin 625 Duo"), dosage (e.g. "1 tab"), frequency (e.g. "1-0-1", "OD", "BD", "TDS"), durationDays (integer), quantityPrescribed (estimated total units/tablets/bottles to dispense, minimum 1), and instructions (e.g. "After food").`;

    const extracted = await runStructuredOcr({
      bytes,
      mimeType,
      prompt,
      schema: PrescriptionOcrSchema,
    });

    // Match against existing Doctor Master
    const existingDoctors = await db
      .select({
        id: schema.doctors.id,
        name: schema.doctors.name,
        regNo: schema.doctors.regNo,
        qualification: schema.doctors.qualification,
        specialization: schema.doctors.specialization,
        hospital: schema.doctors.hospital,
        phone: schema.doctors.phone,
        address: schema.doctors.address,
      })
      .from(schema.doctors)
      .where(and(eq(schema.doctors.tenantId, ctx.tenantId), eq(schema.doctors.isActive, true)));

    const cleanReg = normalizeRegKey(extracted.doctorRegNo);
    const cleanDocName = (extracted.doctorName || "")
      .replace(/^dr\.?\s+/i, "")
      .trim()
      .toLowerCase();

    const matchedDoctor =
      (cleanReg
        ? existingDoctors.find((d) => normalizeRegKey(d.regNo) === cleanReg)
        : undefined) ||
      (cleanDocName
        ? existingDoctors.find(
            (d) =>
              d.name
                .replace(/^dr\.?\s+/i, "")
                .trim()
                .toLowerCase() === cleanDocName
          )
        : undefined) ||
      null;

    return NextResponse.json({
      extracted: {
        patientName: extracted.patientName?.trim() || "",
        patientAge: extracted.patientAge ?? null,
        patientGender: extracted.patientGender || "male",
        patientPhone: extracted.patientPhone?.trim() || "",
        patientAddress: extracted.patientAddress?.trim() || "",
        doctorName: extracted.doctorName?.trim() || "",
        doctorRegNo: extracted.doctorRegNo?.trim() || "",
        doctorQualification: extracted.doctorQualification?.trim() || "",
        doctorSpecialization: extracted.doctorSpecialization?.trim() || "",
        doctorHospital: extracted.doctorHospital?.trim() || "",
        doctorPhone: extracted.doctorPhone?.trim() || "",
        doctorAddress: extracted.doctorAddress?.trim() || "",
        rxNumber: extracted.rxNumber?.trim() || "",
        prescriptionDate: normalizeRxDate(extracted.prescriptionDate),
        diagnosis: extracted.diagnosis?.trim() || "",
        notes: extracted.notes?.trim() || "",
        items: (extracted.items || [])
          .filter((i) => i.medicineName?.trim())
          .map((i) => ({
            medicineName: i.medicineName.trim(),
            dosage: i.dosage?.trim() || "1 tab",
            frequency: i.frequency?.trim() || "1-0-1",
            durationDays: i.durationDays ?? 5,
            quantityPrescribed: Math.max(1, i.quantityPrescribed || 1),
            instructions: i.instructions?.trim() || "",
          })),
      },
      matchedDoctor,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to scan prescription.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
