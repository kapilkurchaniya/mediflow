/**
 * Canonical Security Headers and Content Security Policy (CSP) Configuration (Phase 6.4 - A6.4).
 * Single source of truth shared across next.config.ts and src/proxy.ts to prevent contradictory
 * or duplicated security policies.
 */

export interface SecurityHeaderPair {
  key: string;
  value: string;
}

/**
 * Builds the canonical Content Security Policy (CSP) string.
 *
 * Directives:
 * - default-src 'self': Only allow first-party resources by default.
 * - script-src: 'self' + inline scripts for Next.js runtime; 'unsafe-eval' in dev only.
 * - style-src: 'self' + 'unsafe-inline' for Tailwind CSS & styled elements.
 * - img-src: 'self', blobs, data URIs, and HTTPS external images (e.g. logos).
 * - font-src: 'self' and data URIs for web fonts.
 * - connect-src: 'self' plus explicit third-party APIs (Razorpay, WhatsApp/Meta Graph).
 * - object-src 'none': Disables legacy Flash/Java plugins.
 * - base-uri 'self': Prevents <base> tag injection.
 * - form-action 'self': Restricts form POST targets to first party.
 * - frame-ancestors 'none': Comprehensive anti-clickjacking (supersedes X-Frame-Options).
 * - upgrade-insecure-requests: Enforces HTTPS in production.
 */
export function buildContentSecurityPolicy(isDev: boolean = process.env.NODE_ENV === "development"): string {
  const scriptDirectives = ["'self'", "'unsafe-inline'"];
  if (isDev) {
    scriptDirectives.push("'unsafe-eval'");
  }

  const connectDirectives = [
    "'self'",
    "https://api.razorpay.com",
    "https://graph.facebook.com",
  ];

  const policyParts: string[] = [
    "default-src 'self'",
    `script-src ${scriptDirectives.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    `connect-src ${connectDirectives.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDev) {
    policyParts.push("upgrade-insecure-requests");
  }

  return policyParts.join("; ").trim();
}

/**
 * Returns the canonical list of HTTP security headers for Next.js.
 */
export function getSecurityHeaders(isDev: boolean = process.env.NODE_ENV === "development"): SecurityHeaderPair[] {
  const csp = buildContentSecurityPolicy(isDev);

  const headers: SecurityHeaderPair[] = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];

  // Only apply long-lived HSTS on non-development HTTPS responses
  if (!isDev) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}

/**
 * Mutates or attaches canonical security headers onto an existing web Headers object.
 */
export function applySecurityHeaders(target: Headers, isDev: boolean = process.env.NODE_ENV === "development"): void {
  const pairs = getSecurityHeaders(isDev);
  for (const { key, value } of pairs) {
    target.set(key, value);
  }
}
