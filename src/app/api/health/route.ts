import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { env } from "@/env";
import { checkDatabase, runHealthDiagnostics } from "@/server/observability/health";

export const dynamic = "force-dynamic";

/**
 * Validates diagnostic secret using constant-time string comparison.
 */
function isValidSecret(provided: string | null, expected?: string): boolean {
  if (!provided || !expected) return false;
  const provBuf = Buffer.from(provided);
  const expBuf = Buffer.from(expected);
  if (provBuf.length !== expBuf.length) return false;
  return timingSafeEqual(provBuf, expBuf);
}

export async function GET(req?: NextRequest) {
  const secretHeader = req?.headers?.get ? req.headers.get("x-health-secret") : null;
  const configuredSecret = env.HEALTH_SECRET || env.CRON_SECRET;

  // Anti-caching headers for health probes
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  // Case 1: Caller provided a diagnostic secret -> Return protected full diagnostics
  if (secretHeader !== null) {
    if (!isValidSecret(secretHeader, configuredSecret)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );
    }

    const diagnostics = await runHealthDiagnostics(db);
    const httpStatus = diagnostics.database.status === "down" ? 503 : 200;

    return NextResponse.json(diagnostics, {
      status: httpStatus,
      headers,
    });
  }

  // Case 2: Public liveness probe
  const dbProbe = await checkDatabase(db);
  const isHealthy = dbProbe.status === "up";

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: isHealthy ? "connected" : "unreachable",
      latencyMs: dbProbe.latencyMs,
    },
    {
      status: isHealthy ? 200 : 503,
      headers,
    },
  );
}
