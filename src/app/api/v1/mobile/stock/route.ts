import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { lookupMobileStock } from "@/server/domain/mobile/stock";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin", "pharmacist"],
    });
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || undefined;
    const barcode = searchParams.get("barcode") || undefined;
    const storeId = searchParams.get("storeId") || undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
    const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;

    const result = await lookupMobileStock(db, {
      tenantId: auth.context.tenantId,
      query,
      barcode,
      storeId,
      allowedStoreIds: auth.context.storeIds,
      allStores: auth.context.allStores,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("STORE_ACCESS_DENIED")) {
      return NextResponse.json({ success: false, error: "STORE_ACCESS_DENIED", message: msg }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
