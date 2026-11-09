/**
 * Dependency Vulnerability Audit Analyzer (Phase 6.4 - A6.4).
 * Executes `npm audit --json`, validates report structure, and distinguishes operational failures
 * (network errors, invalid response) from non-blocking dependency vulnerability advisories.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";

interface AuditMetadata {
  vulnerabilities: {
    info: number;
    low: number;
    moderate: number;
    high: number;
    critical: number;
    total: number;
  };
  dependencies: {
    prod: number;
    dev: number;
    optional: number;
    peer: number;
    peerOptional: number;
    total: number;
  };
}

interface AuditReport {
  auditReportVersion?: number;
  metadata?: AuditMetadata;
  error?: {
    code: string;
    summary: string;
    detail: string;
  };
}

export function runDependencyAudit(): void {
  console.log("\n=======================================================");
  console.log("🛡️ MEDIFLOW DEPENDENCY VULNERABILITY AUDIT");
  console.log("=======================================================\n");

  let rawJson = "";
  try {
    rawJson = execSync("npm audit --json", {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err: unknown) {
    // npm audit exits with 1 when vulnerabilities exist. The stdout still contains the report JSON.
    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    if (execErr.stdout && execErr.stdout.trim().startsWith("{")) {
      rawJson = execErr.stdout;
    } else {
      console.error("❌ Fatal operational failure executing npm audit:");
      console.error(execErr.stderr || execErr);
      process.exit(1);
    }
  }

  let report: AuditReport;
  try {
    report = JSON.parse(rawJson);
  } catch (parseErr) {
    console.error("❌ Failed to parse npm audit JSON output. Output was malformed.");
    console.error(parseErr);
    process.exit(1);
  }

  // Detect operational errors returned inside JSON by npm
  if (report.error) {
    console.error(`❌ Operational audit error reported by npm registry: [${report.error.code}] ${report.error.summary}`);
    if (report.error.detail) console.error(report.error.detail);
    process.exit(1);
  }

  if (!report.metadata || !report.metadata.vulnerabilities) {
    console.error("❌ Invalid audit report: metadata or vulnerability summary missing.");
    process.exit(1);
  }

  const { info, low, moderate, high, critical, total } = report.metadata.vulnerabilities;

  console.log("| Severity Level | Count | Disposition                          |");
  console.log("| :------------- | :---- | :----------------------------------- |");
  console.log(`| Critical       | ${String(critical).padEnd(5)} | ${critical > 0 ? "⚠️ Advisory (Action required)" : "✅ Clean"}          |`);
  console.log(`| High           | ${String(high).padEnd(5)} | ${high > 0 ? "⚠️ Advisory (Action required)" : "✅ Clean"}          |`);
  console.log(`| Moderate       | ${String(moderate).padEnd(5)} | ${moderate > 0 ? "⚠️ Review in next cycle" : "✅ Clean"}          |`);
  console.log(`| Low / Info     | ${String(low + info).padEnd(5)} | ✅ Informational                     |`);
  console.log("=======================================================\n");

  const summary = `### 🛡️ Dependency Vulnerability Audit Summary
- **Total Vulnerabilities**: ${total} (Critical: ${critical}, High: ${high}, Moderate: ${moderate}, Low: ${low})
- **Scanned Dependencies**: ${report.metadata.dependencies.total}
- **Disposition**: Non-blocking dependency advisories recorded for ongoing maintenance.
`;

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath && fs.existsSync(summaryPath)) {
    fs.appendFileSync(summaryPath, summary, "utf-8");
  }

  if (critical > 0 || high > 0) {
    console.log(`::warning::Dependency audit found ${critical} critical and ${high} high severity advisories (non-blocking).`);
  } else {
    console.log("✅ Dependency audit passed cleanly with zero high or critical advisories.");
  }
}

if (process.argv[1]?.endsWith("verify-dependency-audit.ts")) {
  runDependencyAudit();
}
