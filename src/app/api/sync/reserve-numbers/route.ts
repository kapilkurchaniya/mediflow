import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { authenticateDevice } from "@/server/domain/devices/auth";
import { reserveDeviceInvoiceNumbers } from "@/server/domain/sync/numbers";
import {
  ReserveNumbersRequestSchema,
  syncErrorResponse,
} from "@/server/domain/sync/types";

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateDevice(db, req.headers.get("authorization"));

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const parsed = ReserveNumbersRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid reservation request", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = await reserveDeviceInvoiceNumbers(db, auth, parsed.data);

    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return syncErrorResponse(e);
  }
}
