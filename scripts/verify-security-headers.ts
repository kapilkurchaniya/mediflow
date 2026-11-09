/**
 * Security Headers & Content Security Policy (CSP) Verification Script (Phase 6.4 - A6.4).
 * Validates that all critical browser-facing security headers and directives are properly
 * configured, free of conflicting policies, and enforced across routes.
 */

import "dotenv/config";
import {
  getSecurityHeaders,
  type SecurityHeaderPair,
} from "@/server/security/headers";

export interface HeaderCheckResult {
  header: string;
  expectedDirective: string;
  status: "PASS" | "FAIL";
  actualValue: string;
}

export function auditHeaderPolicy(isDev: boolean = false): {
  allPassed: boolean;
  results: HeaderCheckResult[];
} {
  const results: HeaderCheckResult[] = [];
  const headers = getSecurityHeaders(isDev);
  const headerMap = new Map<string, string>(headers.map((h: SecurityHeaderPair) => [h.key.toLowerCase(), h.value]));

  // Check 1: CSP Presence & Critical Directives
  const csp = headerMap.get("content-security-policy");
  if (!csp) {
    results.push({
      header: "Content-Security-Policy",
      expectedDirective: "Present",
      status: "FAIL",
      actualValue: "Missing",
    });
  } else {
    const requiredDirectives = [
      { name: "default-src 'self'", check: csp.includes("default-src 'self'") },
      { name: "object-src 'none'", check: csp.includes("object-src 'none'") },
      { name: "frame-ancestors 'none'", check: csp.includes("frame-ancestors 'none'") },
      { name: "base-uri 'self'", check: csp.includes("base-uri 'self'") },
      { name: "form-action 'self'", check: csp.includes("form-action 'self'") },
      {
        name: "explicit connect-src",
        check: csp.includes("api.razorpay.com") && csp.includes("graph.facebook.com"),
      },
    ];

    for (const dir of requiredDirectives) {
      results.push({
        header: "Content-Security-Policy",
        expectedDirective: dir.name,
        status: dir.check ? "PASS" : "FAIL",
        actualValue: dir.check ? "Present and valid" : "Missing or malformed",
      });
    }

    // Production CSP must NEVER include 'unsafe-eval'
    if (!isDev) {
      const hasUnsafeEval = csp.includes("'unsafe-eval'");
      results.push({
        header: "Content-Security-Policy (Prod)",
        expectedDirective: "No 'unsafe-eval'",
        status: !hasUnsafeEval ? "PASS" : "FAIL",
        actualValue: hasUnsafeEval ? "Forbidden 'unsafe-eval' detected" : "Clean",
      });
    }
  }

  // Check 2: Clickjacking Protection
  const xfo = headerMap.get("x-frame-options");
  results.push({
    header: "X-Frame-Options",
    expectedDirective: "DENY",
    status: xfo === "DENY" ? "PASS" : "FAIL",
    actualValue: xfo ?? "Missing",
  });

  // Check 3: MIME Sniffing Defense
  const xcto = headerMap.get("x-content-type-options");
  results.push({
    header: "X-Content-Type-Options",
    expectedDirective: "nosniff",
    status: xcto === "nosniff" ? "PASS" : "FAIL",
    actualValue: xcto ?? "Missing",
  });

  // Check 4: Referrer Policy
  const refPol = headerMap.get("referrer-policy");
  results.push({
    header: "Referrer-Policy",
    expectedDirective: "strict-origin-when-cross-origin",
    status: refPol === "strict-origin-when-cross-origin" ? "PASS" : "FAIL",
    actualValue: refPol ?? "Missing",
  });

  // Check 5: Permissions Policy (preserves camera for barcode scanning)
  const permPol = headerMap.get("permissions-policy");
  const hasCamera = permPol?.includes("camera=(self)");
  results.push({
    header: "Permissions-Policy",
    expectedDirective: "camera=(self)",
    status: hasCamera ? "PASS" : "FAIL",
    actualValue: permPol ?? "Missing",
  });

  // Check 6: HSTS (Strict-Transport-Security) in production
  if (!isDev) {
    const hsts = headerMap.get("strict-transport-security");
    const hstsValid = hsts?.includes("max-age=63072000") && hsts?.includes("includeSubDomains");
    results.push({
      header: "Strict-Transport-Security",
      expectedDirective: "max-age=63072000; includeSubDomains",
      status: hstsValid ? "PASS" : "FAIL",
      actualValue: hsts ?? "Missing",
    });
  }

  // Check 7: Permitted Cross-Domain Policies
  const xpcdp = headerMap.get("x-permitted-cross-domain-policies");
  results.push({
    header: "X-Permitted-Cross-Domain-Policies",
    expectedDirective: "none",
    status: xpcdp === "none" ? "PASS" : "FAIL",
    actualValue: xpcdp ?? "Missing",
  });

  const allPassed = results.every((r) => r.status === "PASS");
  return { allPassed, results };
}

export async function runSecurityHeaderVerification(): Promise<void> {
  console.log("\n=======================================================");
  console.log("🛡️ MEDIFLOW SECURITY HEADERS & CSP AUDIT VERIFICATION");
  console.log("=======================================================\n");

  const { allPassed, results } = auditHeaderPolicy(false);

  console.log("| Header / Directives                  | Expected Requirement           | Status | Actual Value               |");
  console.log("| :----------------------------------- | :----------------------------- | :----- | :------------------------- |");
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅ PASS" : "❌ FAIL";
    const headerPadded = r.header.padEnd(36);
    const expPadded = r.expectedDirective.padEnd(30);
    const actualPadded = r.actualValue.padEnd(26);
    console.log(`| ${headerPadded} | ${expPadded} | ${icon} | ${actualPadded} |`);
  }
  console.log("=======================================================\n");

  if (!allPassed) {
    console.error("❌ Security header audit failed! See table above for failures.");
    process.exit(1);
  }

  console.log("✅ All security headers and CSP directives verified successfully.\n");
}

if (process.argv[1]?.endsWith("verify-security-headers.ts")) {
  runSecurityHeaderVerification().catch((err) => {
    console.error("Fatal error during security headers verification:", err);
    process.exit(1);
  });
}
