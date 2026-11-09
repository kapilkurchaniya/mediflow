import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { getMobileDashboardMetrics } from "@/server/domain/mobile/dashboard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin"],
    });
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId") || undefined;
    const dateStr = searchParams.get("date") || undefined;

    // Check consolidated all-stores reporting permission
    if (!storeId) {
      if (!auth.context.allStores && auth.context.role !== "owner") {
        return NextResponse.json(
          {
            success: false,
            error: "ALL_STORES_FORBIDDEN",
            message: "Consolidated multi-store reporting requires owner role or all-stores permission",
          },
          { status: 403 },
        );
      }
    } else {
      // Validate user has access to requested store
      if (!auth.context.allStores && !auth.context.storeIds.includes(storeId)) {
        return NextResponse.json(
          { success: false, error: "STORE_ACCESS_DENIED", message: "User does not have access to this store" },
          { status: 403 },
        );
      }
    }

    const data = await getMobileDashboardMetrics(db, {
      tenantId: auth.context.tenantId,
      storeId,
      dateStr,
    });

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message }, { status: 500 });
  }
}
