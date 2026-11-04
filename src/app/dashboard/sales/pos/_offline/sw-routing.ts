export type CacheStrategy =
  | "network-only"
  | "cache-first"
  | "pos-navigation-fallback";

/**
 * Pure function to classify incoming Service Worker fetch requests.
 * Used both within public/sw.js and verified via automated unit tests.
 *
 * Directives:
 * 1. Under no circumstances do /api/* requests get served from Cache Storage (P0).
 * 2. Next.js React Server Component (RSC) requests must NEVER receive an HTML fallback (P0).
 * 3. Only document navigations to /dashboard/sales/pos receive the offline bootstrap fallback.
 */
export function classifyRequest(
  urlStr: string,
  mode: string,
  headers: Headers | Record<string, string | undefined>,
  method = "GET",
): CacheStrategy {
  // Only GET requests can be cached or served from cache
  if (method.toUpperCase() !== "GET") {
    return "network-only";
  }

  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return "network-only";
  }

  const pathname = url.pathname;

  // 1. All API routes are strictly network-only
  if (pathname.startsWith("/api/")) {
    return "network-only";
  }

  // 2. Next.js RSC Flight requests must NEVER receive HTML fallbacks
  const getHeader = (key: string): string | null => {
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(key);
    }
    const val = (headers as Record<string, string | undefined>)[key] ??
      (headers as Record<string, string | undefined>)[key.toLowerCase()];
    return val ?? null;
  };

  const isRscHeader = getHeader("RSC") === "1" || getHeader("Next-Router-State-Tree") !== null;
  const isRscParam = url.searchParams.has("_rsc");
  if (isRscHeader || isRscParam) {
    return "network-only";
  }

  // 3. Static hashed build assets, fonts, icons, images
  if (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js")
  ) {
    return "cache-first";
  }

  // 4. POS Document Navigation (full page reload or direct visit to POS terminal)
  if (mode === "navigate" && pathname === "/dashboard/sales/pos") {
    return "pos-navigation-fallback";
  }

  // 5. All other navigations (accounting, settings, etc.) remain network-only
  return "network-only";
}
