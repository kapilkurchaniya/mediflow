import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { authenticatePosRequest } from "@/server/domain/pos/pos-auth";
import { searchPosMedicines } from "@/server/domain/pos/search";
import { DomainError } from "@/server/errors";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticatePosRequest(req);
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 50) : 25;

    const items = await searchPosMedicines(db, ctx, query, limit);

    return NextResponse.json(
      { success: true, count: items.length, items },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    if (err instanceof DomainError) {
      const status = err.code === "UNAUTHORIZED" || err.code === "DEVICE_UNAUTHORIZED" ? 401 : 400;
      return NextResponse.json({ success: false, error: err.code, message: err.message }, { status });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "Failed to search medicines" }, { status: 500 });
  }
}
