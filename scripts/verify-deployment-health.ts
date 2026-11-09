/**
 * CLI Deployment Health & Smoke Check Script (Phase 6.3 - A6.3).
 * Verifies live deployment endpoints for both Liveness and Database Readiness.
 */

interface HealthCheckSummary {
  name: string;
  url: string;
  status: number;
  latencyMs: number;
  passed: boolean;
  details?: Record<string, unknown>;
}

async function probeEndpoint(
  name: string,
  url: string,
  headers: Record<string, string> = {}
): Promise<HealthCheckSummary> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    const latencyMs = Math.round(performance.now() - t0);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const passed = res.status === 200 && json.status === "healthy";

    return {
      name,
      url,
      status: res.status,
      latencyMs,
      passed,
      details: json,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - t0);
    return {
      name,
      url,
      status: 0,
      latencyMs,
      passed: false,
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function runDeploymentHealthCheck(
  baseUrl = "http://localhost:3000",
  secret?: string
): Promise<boolean> {
  console.log("\n=======================================================");
  console.log(`🔍 MEDIFLOW DEPLOYMENT HEALTH PROBE: ${baseUrl}`);
  console.log("=======================================================\n");

  const checks: HealthCheckSummary[] = [];

  // 1. Liveness probe (process responsive)
  const liveness = await probeEndpoint("Liveness Probe (Process)", `${baseUrl}/api/health`);
  checks.push(liveness);

  // 2. Readiness probe (DB connectivity & pool health)
  const readiness = await probeEndpoint(
    "Readiness Probe (DB + Traffic)",
    `${baseUrl}/api/health?ready=1`
  );
  checks.push(readiness);

  // 3. Protected Diagnostic Probe (if secret provided)
  if (secret) {
    const diagnostic = await probeEndpoint(
      "Diagnostic Probe (Protected Metrics)",
      `${baseUrl}/api/health`,
      { "x-health-secret": secret }
    );
    checks.push(diagnostic);
  }

  // Print results
  console.log("| Probe Name                           | HTTP | Latency | Result   |");
  console.log("| :----------------------------------- | :--- | :------ | :------- |");
  for (const c of checks) {
    const statusText = c.passed ? "✅ PASS" : "❌ FAIL";
    console.log(
      `| ${c.name.padEnd(36)} | ${String(c.status).padStart(4)} | ${(c.latencyMs + "ms").padStart(7)} | ${statusText.padEnd(8)} |`
    );
  }
  console.log("=======================================================\n");

  const allPassed = checks.every((c) => c.passed);
  if (!allPassed) {
    console.error("❌ Deployment health verification failed! Check details above.");
  } else {
    console.log("✅ All deployment health probes passed successfully.");
  }

  return allPassed;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let url = "http://localhost:3000";
  let secret: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) url = args[++i];
    if (args[i] === "--secret" && args[i + 1]) secret = args[++i];
  }

  runDeploymentHealthCheck(url, secret)
    .then((passed) => process.exit(passed ? 0 : 1))
    .catch((err) => {
      console.error("Fatal health probe error:", err);
      process.exit(1);
    });
}
