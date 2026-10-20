/**
 * src/server/api-auth.ts
 *
 * Machine-to-machine API key authentication for /api/v1/* routes.
 *
 * Key format:  mf_live_<64 hex chars>  (32 random bytes → hex)
 * Stored as:   sha256(raw_key) in api_keys.key_hash  — the raw key is NEVER persisted.
 *
 * Usage:
 *   const auth = await authenticateApiKey(req, "stock.read");
 *   // auth.tenantId, auth.storeId, auth.keyId are now safe to use.
 *
 *   try { ... } catch (e) { return apiError(e); }
 *
 * B0.1 — audit S1, S2
 */
import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db, schema } from "@/server/db";
import { eq, isNull, and } from "drizzle-orm";

/** All valid API scopes. Extend as new endpoints are added. */
export type ApiScope = "stock.read" | "orders.write" | "orders.read";

export class ApiAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

/**
 * Validate a Bearer API key, verify it has the required scope,
 * and fire-and-forget an update to last_used_at.
 *
 * Throws ApiAuthError (401 | 403) on failure.
 */
export async function authenticateApiKey(req: Request, scope: ApiScope) {
  const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!raw?.startsWith("mf_live_")) {
    throw new ApiAuthError(401, "Missing or malformed API key. Use: Authorization: Bearer mf_live_<key>");
  }

  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const [key] = await db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.keyHash, hash), isNull(schema.apiKeys.revokedAt)))
    .limit(1);

  if (!key) {
    throw new ApiAuthError(401, "Invalid API key");
  }

  if (!key.scopes.includes(scope)) {
    throw new ApiAuthError(403, `Key does not have the '${scope}' scope`);
  }

  // Fire-and-forget — don't block the request on a non-critical write.
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, key.id))
    .catch(() => {/* ignore — metric only */});

  return {
    tenantId: key.tenantId,
    /** null means the key is tenant-wide (all stores). */
    storeId: key.storeId ?? null,
    keyId: key.id,
  };
}

/**
 * Maps any thrown error to an appropriate NextResponse.
 *   ApiAuthError → 401 / 403 JSON
 *   anything else → 500 (generic message, no internals leaked)
 */
export function apiError(e: unknown): NextResponse {
  if (e instanceof ApiAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[api-auth] Unexpected error:", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// ─── Key generation helpers (used by the api-keys action) ───────────────────

/** Generate a new raw API key. Show this to the user ONCE — never store it. */
export function generateRawKey(): string {
  return "mf_live_" + crypto.randomBytes(32).toString("hex");
}

/** Compute the hash to persist in the DB. */
export function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
