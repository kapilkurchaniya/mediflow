import dns from "node:dns";
import net from "node:net";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { env } from "../../env";

// BIGINT (int8) → JS number. All bigint columns are paise amounts / ids well within 2^53.
pg.types.setTypeParser(20, (v) => Number(v));
// NUMERIC → number (used by aggregate SUM results).
pg.types.setTypeParser(1700, (v) => Number(v));
// DATE → keep as 'YYYY-MM-DD' string (avoids timezone shifts).
pg.types.setTypeParser(1082, (v) => v);

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the DB. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

declare global {
  var __mediflowPool: pg.Pool | undefined;
  var __mediflowDnsInstalled: boolean | undefined;
}

/**
 * Prevents 2.5–5s+ glibc getaddrinfo stalls when local /etc/resolv.conf (e.g. Tailscale MagicDNS IPv6)
 * times out on AAAA or search-domain lookups whenever pg.Pool opens or refreshes a connection.
 */
function installFastDnsLookup() {
  if (globalThis.__mediflowDnsInstalled || env.NODE_ENV === "test") return;
  globalThis.__mediflowDnsInstalled = true;

  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    // ignore if unsupported
  }

  const origLookup = dns.lookup.bind(dns);
  const fastResolver = new dns.promises.Resolver({ timeout: 1500, tries: 2 });
  try {
    fastResolver.setServers(["1.1.1.1", "8.8.8.8"]);
  } catch {
    // fallback to default servers if restricted
  }

  const dnsCache = new Map<string, { ips: string[]; expiresAt: number }>();
  const DNS_TTL_MS = 5 * 60 * 1000;

  const patchedLookup = function (
    hostname: string,
    options: unknown,
    callback?: unknown,
  ) {
    let cb = callback as (
      err: NodeJS.ErrnoException | null,
      address?: string | dns.LookupAddress[],
      family?: number,
    ) => void;
    let opts: dns.LookupOptions = {};

    if (typeof options === "function") {
      cb = options as typeof cb;
    } else if (typeof options === "number") {
      opts = { family: options };
    } else if (options && typeof options === "object") {
      opts = options as dns.LookupOptions;
    }

    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".ts.net") ||
      net.isIP(hostname) !== 0
    ) {
      return (origLookup as (...args: unknown[]) => void)(hostname, options, callback);
    }

    const wantAll = Boolean(opts.all);
    const now = Date.now();
    const cached = dnsCache.get(hostname);
    if (cached && cached.expiresAt > now && cached.ips.length > 0) {
      if (wantAll) {
        const list = cached.ips.map((ip) => ({ address: ip, family: 4 }));
        return process.nextTick(() => cb(null, list));
      }
      return process.nextTick(() => cb(null, cached.ips[0], 4));
    }

    fastResolver
      .resolve4(hostname)
      .then((ips) => {
        if (ips && ips.length > 0) {
          dnsCache.set(hostname, { ips, expiresAt: Date.now() + DNS_TTL_MS });
          if (wantAll) {
            return cb(
              null,
              ips.map((ip) => ({ address: ip, family: 4 })),
            );
          }
          return cb(null, ips[0], 4);
        }
        (origLookup as (...args: unknown[]) => void)(hostname, options, callback);
      })
      .catch(() => {
        (origLookup as (...args: unknown[]) => void)(hostname, options, callback);
      });
  };

  try {
    (dns as unknown as { lookup: typeof patchedLookup }).lookup = patchedLookup;
  } catch {
    // ignore if read-only in current runtime
  }
}

installFastDnsLookup();

function normalizePoolConnectionString(rawUrl: string): string {
  if (!rawUrl || rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1")) {
    return rawUrl;
  }
  // Remove channel_binding=require to avoid extra SCRAM-SHA-256-PLUS round-trips over high-RTT links while keeping TLS sslmode intact
  return rawUrl
    .replace(/([?&])channel_binding=require(&?)/, (_, p1, p2) => (p2 ? p1 : ""))
    .replace(/[?&]$/, "");
}

function createPool(): pg.Pool {
  const instance = new pg.Pool({
    connectionString: normalizePoolConnectionString(env.DATABASE_URL),
    max: env.DB_POOL_MAX,
    min: env.DB_POOL_MIN,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  // Prevent unhandled pool idle socket errors from crashing the server
  instance.on("error", (err) => {
    console.warn("[db-pool] Background idle client error:", err.message);
  });

  // Pre-warm 2 connections in the background so user clicks never pay cold TLS handshake latency
  if (env.NODE_ENV !== "test" && !env.DATABASE_URL.includes("mediflow_build")) {
    Promise.all([
      instance.connect().then((c) => c.release()).catch(() => {}),
      instance.connect().then((c) => c.release()).catch(() => {}),
    ]).catch(() => {});
  }

  return instance;
}

// Reuse the pool across hot reloads and requests.
const pool = globalThis.__mediflowPool ?? createPool();
globalThis.__mediflowPool = pool;

export const db: DB = drizzle(pool, { schema });
export { schema, pool };
