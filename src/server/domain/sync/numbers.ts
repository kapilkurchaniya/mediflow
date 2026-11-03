import { and, eq, gte, lte, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { MAX_INVOICE_NO_LENGTH } from "@/lib/regulatory";
import type { DeviceAuthCtx } from "@/server/domain/devices/types";
import type {
  ReserveNumbersRequest,
  ReserveNumbersResponse,
} from "./types";

/**
 * Formats a canonical offline device invoice number.
 * Conforms strictly to GST Rule 46(b) (max 16 characters).
 *
 * Structure: `${storeCode}${deviceCode}-${fy4}-${seq6}`
 * Example: `AP01-2526-000001` (4 + 1 + 4 + 1 + 6 = 16 characters).
 */
export function formatDeviceInvoiceNo(params: {
  storeCode: string;
  deviceCode: string;
  fiscalYear: string;
  sequence: number;
}): string {
  const { storeCode, deviceCode, fiscalYear, sequence } = params;

  // Derive 4-character short FY from "YYYY-YYYY" (e.g. "2025-2026" -> "2526")
  const parts = fiscalYear.split("-");
  const fy4 =
    parts.length === 2 && parts[0].length === 4 && parts[1].length === 4
      ? `${parts[0].slice(2, 4)}${parts[1].slice(2, 4)}`
      : fiscalYear.replace(/[^0-9A-Z]/gi, "").slice(-4);

  const cleanStore = storeCode.replace(/[^0-9A-Z]/gi, "").slice(0, 2).toUpperCase() || "ST";
  const cleanDevice = deviceCode.replace(/[^0-9A-Z]/gi, "").slice(0, 2).toUpperCase() || "01";
  const seqStr = sequence.toString().padStart(6, "0");

  const docNo = `${cleanStore}${cleanDevice}-${fy4}-${seqStr}`;

  if (docNo.length > MAX_INVOICE_NO_LENGTH) {
    throw new DomainError(
      "INVOICE_NO_TOO_LONG",
      `Invoice number "${docNo}" is longer than ${MAX_INVOICE_NO_LENGTH} characters.`,
    );
  }

  return docNo;
}

/**
 * Computes the Indian financial year string for a given date (e.g. "2025-2026").
 */
export function getFiscalYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/**
 * Reserves a contiguous block of invoice numbers for a device.
 * Idempotent: repeated requests with the same clientReservationId return the existing range.
 */
export async function reserveDeviceInvoiceNumbers(
  db: DbOrTx,
  deviceCtx: DeviceAuthCtx,
  request: ReserveNumbersRequest,
  now: Date = new Date(),
): Promise<ReserveNumbersResponse> {
  const { clientReservationId, count } = request;

  if (count <= 0 || count > 500) {
    throw new DomainError("INVALID_COUNT", "Reservation count must be between 1 and 500.");
  }

  // 1. Idempotency check: return existing range if clientReservationId was already fulfilled
  const [existing] = await db
    .select()
    .from(schema.deviceInvoiceReservations)
    .where(
      and(
        eq(schema.deviceInvoiceReservations.deviceId, deviceCtx.deviceId),
        eq(schema.deviceInvoiceReservations.clientReservationId, clientReservationId),
      ),
    );

  const [store] = await db
    .select({ code: schema.stores.code })
    .from(schema.stores)
    .where(eq(schema.stores.id, deviceCtx.storeId));

  const storeCode = (store?.code ?? "ST").slice(0, 2).toUpperCase();

  if (existing) {
    const sampleStart = formatDeviceInvoiceNo({
      storeCode,
      deviceCode: deviceCtx.code,
      fiscalYear: existing.fiscalYear,
      sequence: existing.startSeq,
    });
    const sampleEnd = formatDeviceInvoiceNo({
      storeCode,
      deviceCode: deviceCtx.code,
      fiscalYear: existing.fiscalYear,
      sequence: existing.endSeq,
    });

    return {
      reservationId: existing.id,
      fiscalYear: existing.fiscalYear,
      storeCode,
      deviceCode: deviceCtx.code,
      startSeq: existing.startSeq,
      endSeq: existing.endSeq,
      count: existing.count,
      sampleStartInvoiceNo: sampleStart,
      sampleEndInvoiceNo: sampleEnd,
    };
  }

  const fiscalYear = getFiscalYear(now);
  const docType = `sale:dev:${deviceCtx.code}`;

  // 2. Atomically lock & increment sequence in doc_sequences
  const [seq] = await db
    .insert(schema.docSequences)
    .values({
      tenantId: deviceCtx.tenantId,
      storeId: deviceCtx.storeId,
      docType,
      fiscalYear,
      nextValue: count + 1,
    })
    .onConflictDoUpdate({
      target: [
        schema.docSequences.tenantId,
        schema.docSequences.storeId,
        schema.docSequences.docType,
        schema.docSequences.fiscalYear,
      ],
      set: { nextValue: sql`${schema.docSequences.nextValue} + ${count}` },
    })
    .returning({ nextValue: schema.docSequences.nextValue });

  const endSeq = seq.nextValue - 1;
  const startSeq = endSeq - count + 1;

  // 3. Validate formatting of sample boundaries
  const sampleStart = formatDeviceInvoiceNo({
    storeCode,
    deviceCode: deviceCtx.code,
    fiscalYear,
    sequence: startSeq,
  });
  const sampleEnd = formatDeviceInvoiceNo({
    storeCode,
    deviceCode: deviceCtx.code,
    fiscalYear,
    sequence: endSeq,
  });

  // 4. Record the reservation
  const [reservation] = await db
    .insert(schema.deviceInvoiceReservations)
    .values({
      tenantId: deviceCtx.tenantId,
      storeId: deviceCtx.storeId,
      deviceId: deviceCtx.deviceId,
      clientReservationId,
      fiscalYear,
      startSeq,
      endSeq,
      count,
    })
    .returning();

  return {
    reservationId: reservation.id,
    fiscalYear,
    storeCode,
    deviceCode: deviceCtx.code,
    startSeq,
    endSeq,
    count,
    sampleStartInvoiceNo: sampleStart,
    sampleEndInvoiceNo: sampleEnd,
  };
}

/**
 * Validates that an offline sale's invoice sequence and fiscal year match an
 * active reservation assigned to this device and store.
 */
export async function validateDeviceInvoiceNumber(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId: string;
    deviceId: string;
    fiscalYear: string;
    sequenceNumber: number;
    reservationId?: string;
  },
): Promise<void> {
  const { tenantId, storeId, deviceId, fiscalYear, sequenceNumber, reservationId } = params;

  const conditions = [
    eq(schema.deviceInvoiceReservations.tenantId, tenantId),
    eq(schema.deviceInvoiceReservations.storeId, storeId),
    eq(schema.deviceInvoiceReservations.deviceId, deviceId),
    eq(schema.deviceInvoiceReservations.fiscalYear, fiscalYear),
    lte(schema.deviceInvoiceReservations.startSeq, sequenceNumber),
    gte(schema.deviceInvoiceReservations.endSeq, sequenceNumber),
  ];

  if (reservationId) {
    conditions.push(eq(schema.deviceInvoiceReservations.id, reservationId));
  }

  const [matched] = await db
    .select({ id: schema.deviceInvoiceReservations.id })
    .from(schema.deviceInvoiceReservations)
    .where(and(...conditions))
    .limit(1);

  if (!matched) {
    throw new DomainError(
      "RESERVATION_MISMATCH",
      `Invoice sequence ${sequenceNumber} in FY ${fiscalYear} is not part of a valid reservation allocated to this device.`,
    );
  }
}
