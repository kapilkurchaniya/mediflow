/** Mobile Device Registration, Token-Family Session Rotation & Security (Lane A: A5.7.1) */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { eq, and, sql } from "drizzle-orm";
import { db as defaultDb } from "../../db";
import { mobileDevices, mobileSessions } from "../../db/schema/mobile";
import { users, memberships, roles, stores } from "../../db/schema/platform";

const JWT_SECRET = process.env.MOBILE_JWT_SECRET || process.env.AUTH_SECRET || "mediflow-mobile-secret-key-32-chars-long";

export interface MobileJwtPayload {
  sub: string; // userId
  tenantId: string;
  sid: string; // sessionId
  did: string; // deviceId
  role: string;
  exp: number; // unix seconds
}

export interface MobileAuthContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  deviceId: string;
  role: string;
  allStores: boolean;
  storeIds: string[];
}

export function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
const b64UrlEnc = (s: string) => Buffer.from(s).toString("base64url");
const b64UrlDec = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export function signAccessToken(payload: Omit<MobileJwtPayload, "exp">, ttlSeconds = 900): string {
  const fullPayload: MobileJwtPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const header = b64UrlEnc(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const data = `${header}.${b64UrlEnc(JSON.stringify(fullPayload))}`;
  return `${data}.${crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url")}`;
}

export function verifyAccessToken(token: string): MobileJwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(b64UrlDec(parts[1])) as MobileJwtPayload;
    return payload.exp < Math.floor(Date.now() / 1000) ? null : payload;
  } catch {
    return null;
  }
}

export async function registerDevice(
  db: typeof defaultDb,
  input: { tenantId: string; userId: string; deviceName: string; platform: "ios" | "android"; deviceUuid: string; pushToken?: string },
) {
  const existing = await db
    .select().from(mobileDevices)
    .where(and(eq(mobileDevices.tenantId, input.tenantId), eq(mobileDevices.userId, input.userId), eq(mobileDevices.deviceUuid, input.deviceUuid)))
    .limit(1);

  if (existing[0]) {
    if (existing[0].revokedAt) throw new Error("DEVICE_REVOKED: This device has been permanently revoked");
    return existing[0];
  }

  const [created] = await db.insert(mobileDevices).values({
    tenantId: input.tenantId, userId: input.userId, deviceName: input.deviceName,
    platform: input.platform, deviceUuid: input.deviceUuid, pushToken: input.pushToken,
    enrollmentStatus: "pending",
  }).returning();
  return created;
}

export async function approveDevice(db: typeof defaultDb, tenantId: string, deviceId: string) {
  const [updated] = await db
    .update(mobileDevices).set({ enrollmentStatus: "enrolled", revokedAt: null, lastActiveAt: new Date() })
    .where(and(eq(mobileDevices.tenantId, tenantId), eq(mobileDevices.id, deviceId))).returning();
  if (!updated) throw new Error("DEVICE_NOT_FOUND");
  return updated;
}

export async function revokeDevice(db: typeof defaultDb, tenantId: string, deviceId: string) {
  const [updated] = await db
    .update(mobileDevices).set({ enrollmentStatus: "revoked", revokedAt: new Date() })
    .where(and(eq(mobileDevices.tenantId, tenantId), eq(mobileDevices.id, deviceId))).returning();
  if (!updated) throw new Error("DEVICE_NOT_FOUND");
  await db.update(mobileSessions).set({ revokedAt: new Date() })
    .where(and(eq(mobileSessions.tenantId, tenantId), eq(mobileSessions.deviceId, deviceId)));
  return updated;
}

export async function loginMobile(
  db: typeof defaultDb,
  input: {
    email: string;
    password: string;
    deviceUuid: string;
    deviceName: string;
    platform: "ios" | "android";
    pushToken?: string;
  },
) {
  const userRows = await db
    .select({
      user: users,
      membership: memberships,
      role: roles,
    })
    .from(users)
    .innerJoin(memberships, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(eq(sql`lower(${users.email})`, input.email.toLowerCase().trim()))
    .limit(1);

  if (!userRows[0]) throw new Error("INVALID_CREDENTIALS");
  const { user, membership, role } = userRows[0];
  const validPw = await bcrypt.compare(input.password, user.passwordHash);
  if (!validPw) throw new Error("INVALID_CREDENTIALS");
  if (membership.status !== "active") throw new Error("MEMBERSHIP_INACTIVE");

  const device = await registerDevice(db, {
    tenantId: membership.tenantId,
    userId: user.id,
    deviceName: input.deviceName,
    platform: input.platform,
    deviceUuid: input.deviceUuid,
    pushToken: input.pushToken,
  });

  if (device.enrollmentStatus !== "enrolled") {
    throw new Error("DEVICE_PENDING_ENROLLMENT: Device registered. A manager must approve enrollment before first login.");
  }

  const rawRefreshToken = crypto.randomBytes(32).toString("hex");
  const refreshTokenHash = sha256(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const [session] = await db
    .insert(mobileSessions)
    .values({
      tenantId: membership.tenantId,
      userId: user.id,
      deviceId: device.id,
      refreshTokenHash,
      isConsumed: "false",
      expiresAt,
    })
    .returning();

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: membership.tenantId,
    sid: session.id,
    did: device.id,
    role: role.key,
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: role.key },
    device: { id: device.id, name: device.deviceName, status: device.enrollmentStatus },
    storeIds: membership.storeIds,
    allStores: membership.allStores,
  };
}

export async function refreshMobileSession(
  db: typeof defaultDb,
  input: { refreshToken: string },
) {
  const presentedHash = sha256(input.refreshToken);
  let replayDetected = false;

  const result = await db.transaction(async (tx) => {
    const sessionRes = await tx.execute(
      sql`SELECT s.id, s.tenant_id, s.user_id, s.device_id, s.family_id, s.session_version,
                 s.is_consumed, s.expires_at, s.revoked_at,
                 d.enrollment_status, d.revoked_at as dev_revoked_at,
                 m.status as mem_status, r.key as role_key
          FROM mobile_sessions s
          JOIN mobile_devices d ON s.tenant_id = d.tenant_id AND s.user_id = d.user_id AND s.device_id = d.id
          JOIN memberships m ON s.tenant_id = m.tenant_id AND s.user_id = m.user_id
          JOIN roles r ON m.role_id = r.id
          WHERE s.refresh_token_hash = ${presentedHash}
          FOR UPDATE OF s`,
    );

    const row = sessionRes.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("INVALID_REFRESH_TOKEN");

    const isConsumed = row.is_consumed === "true" || row.is_consumed === true;
    if (isConsumed) {
      // Replay detected! Revoke entire family in tx, then commit tx!
      await tx.execute(
        sql`UPDATE mobile_sessions SET revoked_at = now()
            WHERE tenant_id = ${row.tenant_id}::uuid AND family_id = ${row.family_id}::uuid AND revoked_at IS NULL`,
      );
      replayDetected = true;
      return null;
    }

    if (row.revoked_at || new Date(row.expires_at as string) <= new Date()) throw new Error("SESSION_REVOKED_OR_EXPIRED");
    if (row.dev_revoked_at || row.enrollment_status !== "enrolled") throw new Error("DEVICE_NOT_ENROLLED_OR_REVOKED");
    if (row.mem_status !== "active") throw new Error("MEMBERSHIP_INACTIVE");

    // Mark current consumed
    await tx.execute(sql`UPDATE mobile_sessions SET is_consumed = 'true' WHERE id = ${row.id}`);

    // Create next generation in family
    const nextRawToken = crypto.randomBytes(32).toString("hex");
    const nextHash = sha256(nextRawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [nextSession] = await tx
      .insert(mobileSessions)
      .values({
        tenantId: row.tenant_id as string,
        userId: row.user_id as string,
        deviceId: row.device_id as string,
        familyId: row.family_id as string,
        sessionVersion: Number(row.session_version) + 1,
        refreshTokenHash: nextHash,
        isConsumed: "false",
        expiresAt,
      })
      .returning();

    const accessToken = signAccessToken({
      sub: row.user_id as string,
      tenantId: row.tenant_id as string,
      sid: nextSession.id,
      did: row.device_id as string,
      role: row.role_key as string,
    });

    return { accessToken, refreshToken: nextRawToken };
  });

  if (replayDetected) {
    throw new Error("TOKEN_REUSE_DETECTED: Stolen refresh token replay detected; entire session family revoked");
  }

  return result!;
}

export async function validateMobileToken(
  db: typeof defaultDb,
  token: string,
): Promise<{ valid: true; context: MobileAuthContext } | { valid: false; error: string }> {
  const payload = verifyAccessToken(token);
  if (!payload) return { valid: false, error: "INVALID_OR_EXPIRED_JWT" };

  const res = await db.execute(
    sql`SELECT s.revoked_at as s_revoked, s.expires_at as s_exp,
               d.revoked_at as d_revoked, d.enrollment_status,
               m.status as m_status, m.all_stores, m.store_ids, r.key as role_key
        FROM mobile_sessions s
        JOIN mobile_devices d ON s.tenant_id = d.tenant_id AND s.user_id = d.user_id AND s.device_id = d.id
        JOIN memberships m ON s.tenant_id = m.tenant_id AND s.user_id = m.user_id
        JOIN roles r ON m.role_id = r.id
        WHERE s.id = ${payload.sid} AND d.id = ${payload.did} AND s.tenant_id = ${payload.tenantId}`,
  );

  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return { valid: false, error: "SESSION_NOT_FOUND" };
  if (row.s_revoked || new Date(row.s_exp as string) <= new Date()) return { valid: false, error: "SESSION_REVOKED" };
  if (row.d_revoked || row.enrollment_status !== "enrolled") return { valid: false, error: "DEVICE_REVOKED" };
  if (row.m_status !== "active") return { valid: false, error: "MEMBERSHIP_SUSPENDED" };

  return {
    valid: true,
    context: {
      userId: payload.sub,
      tenantId: payload.tenantId,
      sessionId: payload.sid,
      deviceId: payload.did,
      role: row.role_key as string,
      allStores: Boolean(row.all_stores),
      storeIds: Array.isArray(row.store_ids) ? (row.store_ids as string[]) : [],
    },
  };
}
