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
  const probeType = req?.nextUrl?.searchParams?.get("probe");

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

  // Case 2: Database readiness probe (?probe=readiness or ?ready=1)
  // Evaluates whether essential backing infrastructure (PostgreSQL) is ready to serve requests.
  if (probeType === "readiness" || req?.nextUrl?.searchParams?.get("ready") === "1") {
    const dbProbe = await checkDatabase(db);
    const isReady = dbProbe.status === "up";
    return NextResponse.json(
      {
        status: isReady ? "healthy" : "degraded",
        database: isReady ? "connected" : "unreachable",
        latencyMs: dbProbe.latencyMs,
      },
      {
        status: isReady ? 200 : 503,
        headers,
      },
    );
  }

  // Case 3: Public liveness probe (default or ?probe=liveness)
  // Determines if process is running. Strictly independent of database availability
  // so orchestrators do not restart healthy application instances during DB outages.
  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    {
      status: 200,
      headers,
    },
  );
}
