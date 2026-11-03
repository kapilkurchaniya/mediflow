import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { authenticateDevice } from "@/server/domain/devices/auth";
import { pullSyncDeltas } from "@/server/domain/sync/pull";
import {
  SyncEntityPageParamSchema,
  syncErrorResponse,
} from "@/server/domain/sync/types";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateDevice(db, req.headers.get("authorization"));

    const searchParams = req.nextUrl.searchParams;
    const queryObj: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryObj[key] = value;
    });

    const parsed = SyncEntityPageParamSchema.safeParse(queryObj);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = await pullSyncDeltas(db, auth, parsed.data);

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Vary: "Accept-Encoding",
      },
    });
  } catch (e) {
    return syncErrorResponse(e);
  }
}
