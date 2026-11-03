import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { can, loadAuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { createSale } from "@/server/domain/sales/create-sale";
import type { SaleInput } from "@/server/domain/sales/types";
import { runWithStockMovementPolicy } from "@/server/domain/stock";
import type { DeviceAuthCtx } from "@/server/domain/devices/types";
import { validateDeviceInvoiceNumber } from "./numbers";
import type {
  IngestOfflineSalesRequest,
  IngestOfflineSalesResponse,
  IngestSaleResult,
  OfflineSale,
} from "./types";

function computePayloadHash(sale: OfflineSale): string {
  return crypto.createHash("sha256").update(JSON.stringify(sale)).digest("hex");
}

/**
 * Ingests a batch of offline sales with per-sale transaction isolation,
 * device-scoped idempotency with payload hashing, reservation-backed invoice validation,
 * and cashier attribution checks.
 */
export async function ingestOfflineSales(
  db: DbOrTx,
  deviceCtx: DeviceAuthCtx,
  payload: IngestOfflineSalesRequest,
): Promise<IngestOfflineSalesResponse> {
  const results: IngestSaleResult[] = [];

  for (const s of payload.sales) {
    try {
      const result: IngestSaleResult = await db.transaction(async (tx) => {
        const payloadHash = computePayloadHash(s);

        // 1. Idempotency Gate (Device-scoped)
        const [existing] = await tx
          .select()
          .from(schema.deviceSyncIdempotency)
          .where(
            and(
              eq(schema.deviceSyncIdempotency.tenantId, deviceCtx.tenantId),
              eq(schema.deviceSyncIdempotency.deviceId, deviceCtx.deviceId),
              eq(schema.deviceSyncIdempotency.scope, "sale"),
              eq(schema.deviceSyncIdempotency.clientOperationId, s.clientSaleId),
            ),
          )
          .limit(1);

        if (existing) {
          if (existing.payloadHash !== payloadHash) {
            throw new DomainError(
              "IDEMPOTENCY_PAYLOAD_MISMATCH",
              `Sale ID ${s.clientSaleId} was already submitted with different payload parameters.`,
            );
          }
          const prior = existing.response as IngestSaleResult;
          if (prior.status === "created" || prior.status === "duplicate") {
            return {
              clientSaleId: prior.clientSaleId,
              status: "duplicate" as const,
              saleId: prior.saleId,
              invoiceNo: prior.invoiceNo,
              total: prior.total,
            };
          }
          return prior;
        }

        // 2. Cashier Authorization & Attribution
        const [cashierUser] = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, s.createdBy))
          .limit(1);

        if (!cashierUser) {
          throw new DomainError(
            "CASHIER_UNAUTHORIZED",
            `Cashier user ${s.createdBy} not found.`,
          );
        }

        let cashierCtx;
        try {
          cashierCtx = await loadAuthCtx(
            tx,
            { tenantId: deviceCtx.tenantId, storeId: deviceCtx.storeId },
            cashierUser,
          );
        } catch {
          throw new DomainError(
            "CASHIER_UNAUTHORIZED",
            `Cashier ${cashierUser.name} does not hold active access to this store.`,
          );
        }

        if (!can(cashierCtx, "sale.create")) {
          throw new DomainError(
            "CASHIER_UNAUTHORIZED",
            `Cashier ${cashierUser.name} lacks permission 'sale.create'.`,
          );
        }

        // 3. Invoice Reservation Range Check
        await validateDeviceInvoiceNumber(tx, {
          tenantId: deviceCtx.tenantId,
          storeId: deviceCtx.storeId,
          deviceId: deviceCtx.deviceId,
          fiscalYear: s.fiscalYear,
          sequenceNumber: s.sequenceNumber,
          reservationId: s.reservationId,
        });

        // 4. Execute Domain Sale with Offline Reconciliation Policy
        const saleInput: SaleInput = {
          clientSaleId: s.clientSaleId,
          customerId: s.customerId,
          lines: s.lines.map((l) => ({
            ...l,
            discountBp: l.discountBp ?? 0,
          })),
          payments: (s.payments ?? []).map((p) => ({
            method: p.method,
            amount: p.amount,
            reference: p.reference,
          })),
          billDiscountPaise: s.billDiscountPaise ?? 0,
          compliance: s.compliance,
          medicalRepId: s.medicalRepId,
          redeemPoints: 0,
        };

        const saleResult = await runWithStockMovementPolicy(
          {
            mode: "offline_reconciliation",
            deviceId: deviceCtx.deviceId,
            clientSaleId: s.clientSaleId,
          },
          async () =>
            createSale(tx, cashierCtx, saleInput, {
              source: "offline",
              allowNegativeStock: true,
              invoiceNo: s.invoiceNo,
              now: new Date(s.completedAt),
            }),
        );

        const outcome: IngestSaleResult = {
          clientSaleId: s.clientSaleId,
          status: saleResult.duplicate ? "duplicate" : "created",
          saleId: saleResult.saleId,
          invoiceNo: saleResult.invoiceNo,
          total: saleResult.total,
        };

        // 5. Store Idempotency Record (Atomic with sale transaction)
        await tx.insert(schema.deviceSyncIdempotency).values({
          tenantId: deviceCtx.tenantId,
          storeId: deviceCtx.storeId,
          deviceId: deviceCtx.deviceId,
          scope: "sale",
          clientOperationId: s.clientSaleId,
          payloadHash,
          response: outcome,
        });

        return outcome;
      });

      results.push(result);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      results.push({
        clientSaleId: s.clientSaleId,
        status: "rejected",
        code: error.code || "INGEST_FAILED",
        error: error.message || "Failed to ingest offline sale.",
      });
    }
  }

  // Update device last_sync_at
  await db
    .update(schema.devices)
    .set({ lastSyncAt: new Date() })
    .where(eq(schema.devices.id, deviceCtx.deviceId));

  return { results };
}
