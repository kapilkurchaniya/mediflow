import { cookies } from "next/headers";
import { db, schema, type DbOrTx } from "./db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const SESSION_COOKIE_NAME = "mediflow_session";
const SESSION_MAX_AGE_DAYS = 30;

/**
 * Generate a random opaque session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash the session token (to store in the database).
 */
function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new session in the database.
 */
export async function createSession(
  token: string,
  userId: string,
  tenantId?: string | null,
  storeId?: string | null
) {
  const sessionId = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * SESSION_MAX_AGE_DAYS);

  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    tenantId: tenantId ?? null,
    storeId: storeId ?? null,
    expiresAt,
  });

  return sessionId;
}

/**
 * Validates the session token. Extends expiration if needed.
 */
export async function validateSessionToken(token: string) {
  const sessionId = hashSessionToken(token);

  try {
    const result = await db
      .select({
        session: schema.sessions,
        user: schema.users,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (result.length === 0) {
      return { session: null, user: null };
    }

    const { session, user } = result[0];

    if (Date.now() >= session.expiresAt.getTime()) {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
      return { session: null, user: null };
    }

    // Extend session if less than 15 days left (non-blocking via next/server after)
    if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
      const nextExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * SESSION_MAX_AGE_DAYS);
      session.expiresAt = nextExpiresAt;
      const extendSession = () =>
        db
          .update(schema.sessions)
          .set({ expiresAt: nextExpiresAt })
          .where(eq(schema.sessions.id, session.id))
          .catch((e) => console.error("[auth] Failed to extend session:", e));
      try {
        const { after } = await import("next/server");
        after(extendSession);
      } catch {
        void extendSession();
      }
    }

    return { session, user };
  } catch (err) {
    console.error("[auth] Failed to validate session token:", err);
    return { session: null, user: null };
  }
}

/**
 * Invalidate a session (e.g. for logout).
 */
export async function invalidateSession(sessionId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/**
 * Updates the active store on an existing session.
 */
export async function updateSessionStore(
  sessionId: string,
  storeId: string,
  database: DbOrTx = db,
): Promise<void> {
  await database
    .update(schema.sessions)
    .set({ storeId })
    .where(eq(schema.sessions.id, sessionId));
}

/**
 * Retrieves the current session and user from the request cookies.
 */
export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!token) return { session: null, user: null };

  const { session, user } = await validateSessionToken(token);
  return { session, user };
}

/**
 * Retrieves the current session and ensures tenantId and storeId are present.
 * Throws an error otherwise.
 */
export async function requireAuth() {
  const { session, user } = await getCurrentSession();
  if (!session || !session.tenantId || !session.storeId || !user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
    throw new Error("Unauthorized");
  }
  return {
    session: {
      ...session,
      tenantId: session.tenantId,
      storeId: session.storeId,
    },
    user,
  };
}

/**
 * Sets the session cookie in the HTTP response.
 */
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * SESSION_MAX_AGE_DAYS),
    path: "/",
  });
}

/**
 * Deletes the session cookie (logout).
 */
export async function deleteSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

/**
 * Hash a password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a plaintext password against a hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
