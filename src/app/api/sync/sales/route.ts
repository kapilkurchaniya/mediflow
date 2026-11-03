import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { authenticateDevice } from "@/server/domain/devices/auth";
import { ingestOfflineSales } from "@/server/domain/sync/sales";
import {
  IngestOfflineSalesRequestSchema,
  syncErrorResponse,
} from "@/server/domain/sync/types";

// Maximum 2MB payload for sales sync batch
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateDevice(db, req.headers.get("authorization"));

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "Payload exceeds 2MB limit" },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const parsed = IngestOfflineSalesRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid sales batch payload", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = await ingestOfflineSales(db, auth, parsed.data);

    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return syncErrorResponse(e);
  }
}
