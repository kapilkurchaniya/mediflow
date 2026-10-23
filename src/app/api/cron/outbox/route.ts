import { NextResponse } from "next/server";
import { env } from "@/env";
import { processOutbox } from "@/server/jobs/outbox";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  // If CRON_SECRET is configured, enforce Bearer authentication
  if (env.CRON_SECRET && token !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const stats = await processOutbox(limit);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/outbox] Processing error:", message);
    return NextResponse.json(
      { success: false, error: "Outbox processing failed" },
      { status: 500 }
    );
  }
}

export const POST = GET;
