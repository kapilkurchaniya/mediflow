import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applySecurityHeaders } from "@/server/security/headers";

/** Routes that redirect authenticated users away (login/register pages). */
const authRoutes = ["/login", "/register"];

/**
 * API routes that authenticate themselves (API key, HMAC, device token, etc.) and must NOT
 * be redirected to /login when the session cookie is absent.
 */
const selfAuthPrefixes = [
  "/api/v1",
  "/api/webhooks",
  "/api/cron",
  "/api/health",
  "/api/sync",
  "/api/pos",
];

function wrapResponse(res: NextResponse): NextResponse {
  applySecurityHeaders(res.headers);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let Next.js handle internal files, public assets, etc.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/trpc") ||
    pathname.includes(".")
  ) {
    return wrapResponse(NextResponse.next());
  }

  // Self-authenticating API routes — pass through without session check.
  // They'll return 401 JSON if the key/signature is missing or invalid.
  if (selfAuthPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return wrapResponse(NextResponse.next());
  }

  // Invitation links are opened by people who have no account (and no session) yet; the token is the credential.
  if (pathname.startsWith("/invite/")) {
    return wrapResponse(NextResponse.next());
  }

  const hasSession = request.cookies.has("mediflow_session");

  // Auth pages: redirect logged-in users to the dashboard.
  if (authRoutes.includes(pathname)) {
    if (hasSession) {
      return wrapResponse(NextResponse.redirect(new URL("/dashboard", request.url)));
    }
    return wrapResponse(NextResponse.next());
  }

  // All other /api/* routes (e.g. /api/chat) require a session.
  // Return 401 JSON instead of redirecting — clients can't follow cookie redirects.
  if (pathname.startsWith("/api/")) {
    if (!hasSession) {
      return wrapResponse(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }
    return wrapResponse(NextResponse.next());
  }

  // Dashboard and all other pages — redirect to login if no session.
  if (!hasSession && pathname !== "/") {
    let from = pathname;
    if (request.nextUrl.search) {
      from += request.nextUrl.search;
    }
    return wrapResponse(
      NextResponse.redirect(
        new URL(`/login?redirect=${encodeURIComponent(from)}`, request.url),
      ),
    );
  }

  return wrapResponse(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
