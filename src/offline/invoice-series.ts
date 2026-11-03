import type { PosDB } from "./db";
import type { OfflineNumberBlock, OfflineDeviceConfig } from "./types";
import type { ReserveNumbersResponse } from "@/server/domain/sync/types";
import { MAX_INVOICE_NO_LENGTH } from "@/lib/regulatory";

export class OfflineBlockExhaustedError extends Error {
  constructor(message = "All offline invoice numbers in reserved blocks have been exhausted.") {
    super(message);
    this.name = "OfflineBlockExhaustedError";
  }
}

/**
 * Formats a canonical offline device invoice number adhering strictly to GST Rule 46(b) (<= 16 chars).
 * Format: {storeCode(2)}{deviceCode(2)}-{fy4}-{seq(6)} e.g. ST01-2526-000001
 */
export function formatOfflineInvoiceNo(params: {
  storeCode: string;
  deviceCode: string;
  fiscalYear: string;
  sequence: number;
}): string {
  const { storeCode, deviceCode, fiscalYear, sequence } = params;

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
    throw new Error(
      `Generated invoice number "${docNo}" exceeds ${MAX_INVOICE_NO_LENGTH} characters.`,
    );
  }

  return docNo;
}

/**
 * Returns the current Indian fiscal year string (e.g. "2025-2026").
 */
export function getOfflineFiscalYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export interface AllocatedInvoice {
  invoiceNo: string;
  sequenceNumber: number;
  fiscalYear: string;
  reservationId: string;
  remaining: number;
  shouldReplenish: boolean;
}

/**
 * Atomically allocates the next consecutive invoice number from the device's local reservation block.
 * Uses a Dexie read-write transaction to guarantee no duplicate sequence issuance across concurrent tabs.
 */
export async function allocateNextInvoiceNumber(
  db: PosDB,
  storeId: string,
  deviceId: string,
): Promise<AllocatedInvoice> {
  return await db.transaction("rw", db.numberBlocks, async () => {
    const activeBlocks = await db.numberBlocks
      .where("[storeId+deviceId+active]")
      .equals([storeId, deviceId, 1])
      .toArray();

    // Sort by startSeq ASC to consume blocks consecutively
    activeBlocks.sort((a, b) => a.startSeq - b.startSeq);

    let activeBlock: OfflineNumberBlock | undefined;
    for (const b of activeBlocks) {
      if (b.nextSeq <= b.endSeq) {
        activeBlock = b;
        break;
      } else {
        b.active = 0;
        await db.numberBlocks.put(b);
      }
    }

    if (!activeBlock) {
      throw new OfflineBlockExhaustedError();
    }

    const seq = activeBlock.nextSeq;
    activeBlock.nextSeq += 1;

    if (activeBlock.nextSeq > activeBlock.endSeq) {
      activeBlock.active = 0;
    }

    await db.numberBlocks.put(activeBlock);

    const invoiceNo = formatOfflineInvoiceNo({
      storeCode: activeBlock.storeCode,
      deviceCode: activeBlock.deviceCode,
      fiscalYear: activeBlock.fiscalYear,
      sequence: seq,
    });

    const remainingInBlock =
      activeBlock.active === 1 ? activeBlock.endSeq - activeBlock.nextSeq + 1 : 0;

    // Also count other pending active blocks
    const otherBlocksRemaining = activeBlocks
      .filter((b) => b.id !== activeBlock?.id && b.active === 1)
      .reduce((sum, b) => sum + Math.max(0, b.endSeq - b.nextSeq + 1), 0);

    const totalRemaining = remainingInBlock + otherBlocksRemaining;

    return {
      invoiceNo,
      sequenceNumber: seq,
      fiscalYear: activeBlock.fiscalYear,
      reservationId: activeBlock.reservationId,
      remaining: totalRemaining,
      shouldReplenish: totalRemaining < 50,
    };
  });
}

/**
 * Calculates total available invoice numbers across all active blocks for this store and device.
 */
export async function getRemainingInvoiceNumbers(
  db: PosDB,
  storeId: string,
  deviceId: string,
): Promise<number> {
  const activeBlocks = await db.numberBlocks
    .where("[storeId+deviceId+active]")
    .equals([storeId, deviceId, 1])
    .toArray();

  return activeBlocks.reduce((sum, b) => sum + Math.max(0, b.endSeq - b.nextSeq + 1), 0);
}

/**
 * Requests a new block of invoice numbers from the backend API and stores it in Dexie.
 */
export async function replenishNumberBlock(
  db: PosDB,
  config: OfflineDeviceConfig,
  count = 200,
  fetchFn: typeof fetch = fetch,
): Promise<ReserveNumbersResponse> {
  const clientReservationId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const res = await fetchFn("/api/sync/reserve-numbers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deviceToken}`,
    },
    body: JSON.stringify({
      clientReservationId,
      count,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to reserve invoice numbers (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as ReserveNumbersResponse;

  await db.numberBlocks.put({
    id: data.reservationId,
    storeId: config.storeId,
    deviceId: config.deviceId,
    fiscalYear: data.fiscalYear,
    reservationId: data.reservationId,
    storeCode: data.storeCode,
    deviceCode: data.deviceCode,
    startSeq: data.startSeq,
    endSeq: data.endSeq,
    nextSeq: data.startSeq,
    active: 1,
  });

  return data;
}
