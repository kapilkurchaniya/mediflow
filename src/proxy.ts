import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Routes that redirect authenticated users away (login/register pages). */
const authRoutes = ["/login", "/register"];

/**
 * API routes that authenticate themselves (API key, HMAC, etc.) and must NOT
 * be redirected to /login when the session cookie is absent.
 */
const selfAuthPrefixes = ["/api/v1", "/api/webhooks", "/api/cron", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let Next.js handle internal files, public assets, etc.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/trpc") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Self-authenticating API routes — pass through without session check.
  // They'll return 401 JSON if the key/signature is missing or invalid.
  if (selfAuthPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Invitation links are opened by people who have no account (and no session) yet; the token is the credential.
  if (pathname.startsWith("/invite/")) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has("mediflow_session");

  // Auth pages: redirect logged-in users to the dashboard.
  if (authRoutes.includes(pathname)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // All other /api/* routes (e.g. /api/chat) require a session.
  // Return 401 JSON instead of redirecting — clients can't follow cookie redirects.
  if (pathname.startsWith("/api/")) {
    if (!hasSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Dashboard and all other pages — redirect to login if no session.
  if (!hasSession && pathname !== "/") {
    let from = pathname;
    if (request.nextUrl.search) {
      from += request.nextUrl.search;
    }
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(from)}`, request.url),
    );
  }

  return NextResponse.next();
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
