import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicRoutes = ["/login", "/register", "/api/webhook"]; // Routes that do not require authentication
const authRoutes = ["/login", "/register"]; // Routes for unauthenticated users only (redirect to dashboard if logged in)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let Next.js handle internal files, public assets, etc.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/trpc") || // If trpc is used
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for the session cookie
  // Note: We don't validate the token against the DB here because `proxy` runs in Node.js
  // but it's often more efficient to do DB checks in layouts/pages directly if we want granular data.
  // However, we can perform basic presence checks.
  const hasSession = request.cookies.has("mediflow_session");

  const isPublicRoute = publicRoutes.includes(pathname);
  const isAuthRoute = authRoutes.includes(pathname);

  if (isAuthRoute) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession && !isPublicRoute && pathname !== "/") {
    let from = pathname;
    if (request.nextUrl.search) {
      from += request.nextUrl.search;
    }
    
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(from)}`, request.url)
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
