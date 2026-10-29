import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let dbStatus = "connected";

  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    dbStatus = "unreachable";
  }

  const isHealthy = dbStatus === "connected";

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: dbStatus,
      latencyMs: Date.now() - startedAt,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

