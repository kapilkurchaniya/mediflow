import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { authenticatePosRequest } from "@/server/domain/pos/pos-auth";
import { createSale } from "@/server/domain/sales/create-sale";
import { SaleInput, type CreateSaleResult } from "@/server/domain/sales/types";
import { DomainError } from "@/server/errors";

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticatePosRequest(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "INVALID_JSON", message: "Malformed JSON payload" }, { status: 400 });
    }

    const parsed = SaleInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const input = parsed.data;

    // Idempotency conflict pre-check if clientSaleId provided
    if (input.clientSaleId) {
      const [existingKey] = await db
        .select({
          response: schema.idempotencyKeys.response,
        })
        .from(schema.idempotencyKeys)
        .where(
          and(
            eq(schema.idempotencyKeys.tenantId, ctx.tenantId),
            eq(schema.idempotencyKeys.scope, "sale"),
            eq(schema.idempotencyKeys.key, input.clientSaleId),
          ),
        );

      if (existingKey) {
        const resp = existingKey.response as Partial<CreateSaleResult> | undefined;
        if (resp && resp.saleId && resp.invoiceNo) {
          return NextResponse.json(
            {
              success: true,
              saleId: resp.saleId,
              invoiceNo: resp.invoiceNo,
              total: resp.total ?? 0,
              changeDue: resp.changeDue ?? 0,
              duplicate: true,
            },
            { status: 200, headers: { "Cache-Control": "no-store" } },
          );
        }
      }
    }

    // Execute atomic sale commit inside database transaction
    const result = await db.transaction((tx) => createSale(tx, ctx, input, { source: "pos" }));

    return NextResponse.json(
      {
        success: true,
        saleId: result.saleId,
        invoiceNo: result.invoiceNo,
        total: result.total,
        changeDue: result.changeDue,
        duplicate: result.duplicate ?? false,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    if (err instanceof DomainError) {
      const status =
        err.code === "UNAUTHORIZED" || err.code === "DEVICE_UNAUTHORIZED"
          ? 401
          : err.code === "SALE_IN_PROGRESS"
            ? 409
            : 400;
      return NextResponse.json({ success: false, error: err.code, message: err.message }, { status });
    }

    console.error("POS Sale Commit Error:", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to commit sale" },
      { status: 500 },
    );
  }
}
