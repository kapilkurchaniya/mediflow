// @ts-check
/// <reference lib="webworker" />

/**
 * Service Worker for MediFlow POS PWA.
 *
 * Core Directives:
 * 1. Under no circumstances do /api/* requests get cached in Cache Storage (P0).
 * 2. Next.js React Server Component (Flight) requests must NEVER receive an HTML fallback (P0).
 * 3. Controlled activation: new workers wait until idle or explicit user trigger (P0).
 * 4. Navigations to /dashboard/sales/pos fall back to precached /offline.html when offline.
 */

const CACHE_NAME = "mediflow-pos-v1";
const PRECACHE_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install: Precache offline shell and branding assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }),
  );
  // Deliberately do NOT call self.skipWaiting() here to avoid breaking active checkouts
});

// Activate: Clean up obsolete caches and claim clients safely
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith("mediflow-") && key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        }),
      );
    }).then(() => self.clients.claim()),
  );
});

// Message listener: Allows client to command worker activation at safe boundaries
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: Route-aware interceptor
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 1. Only intercept GET requests
  if (req.method !== "GET") {
    return;
  }

  const url = new URL(req.url);

  // 2. Strict API isolation: network-only
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 3. Next.js RSC Flight requests must NEVER receive HTML fallbacks
  const isRsc = req.headers.get("RSC") === "1" ||
    req.headers.has("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc");

  if (isRsc) {
    return;
  }

  // 4. Static assets: Cache-first with network fallback
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js");

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (!res || res.status !== 200 || res.type !== "basic") {
            return res;
          }
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        });
      }),
    );
    return;
  }

  // 5. Document Navigation: Network-first with /offline.html fallback for POS counter
  if (req.mode === "navigate" && url.pathname === "/dashboard/sales/pos") {
    event.respondWith(
      fetch(req).catch(async () => {
        const fallback = await caches.match("/offline.html");
        if (fallback) return fallback;
        return new Response("MediFlow POS is currently offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }),
    );
    return;
  }

  // All other navigations / requests remain standard network requests
});
