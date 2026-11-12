import crypto from "node:crypto";
import { env } from "@/env";

export const OAUTH_TX_COOKIE = "mediflow_oauth_tx";
export const GOOGLE_SIGNUP_COOKIE = "mediflow_google_signup";
export const OAUTH_TX_TTL_SECONDS = 600; // 10 minutes
export const GOOGLE_SIGNUP_TTL_SECONDS = 900; // 15 minutes

export type GoogleOAuthMode = "login" | "register" | "link" | "invite";

export interface OAuthTxPayload {
  state: string;
  codeVerifier: string;
  mode: GoogleOAuthMode;
  next: string;
  inviteToken?: string;
  linkUserId?: string;
  exp: number;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export interface PendingGoogleSignupPayload {
  profile: GoogleProfile;
  next: string;
  exp: number;
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

/**
 * Derives the HMAC signing key for short-lived OAuth cookies.
 * Uses APP_ENCRYPTION_KEY in production; falls back to a deterministic hash of DATABASE_URL in dev/test.
 */
export function getOAuthSigningSecret(): string {
  if (env.APP_ENCRYPTION_KEY && env.APP_ENCRYPTION_KEY.length >= 16) {
    return env.APP_ENCRYPTION_KEY;
  }
  if (env.NODE_ENV === "production") {
    throw new Error("APP_ENCRYPTION_KEY is required in production for OAuth state signing.");
  }
  return crypto.createHash("sha256").update(`mediflow-oauth-dev:${env.DATABASE_URL}`).digest("hex");
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function computeCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** Prevents open redirects: only allows same-origin relative paths starting with a single `/`. */
export function sanitizeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  return trimmed;
}

export function getGoogleCallbackUrl(requestUrl: string): string {
  const base = env.APP_URL ? env.APP_URL.replace(/\/+$/, "") : new URL(requestUrl).origin;
  return `${base}/api/auth/google/callback`;
}

export function signSignedPayload<T extends { exp: number }>(payload: T, secret = getOAuthSigningSecret()): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySignedPayload<T extends { exp: number }>(
  token: string | undefined | null,
  secret = getOAuthSigningSecret(),
  nowMs = Date.now(),
): T | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
    if (!parsed || typeof parsed.exp !== "number" || parsed.exp <= nowMs) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  loginHint?: string;
}): string {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  if (params.loginHint) {
    url.searchParams.set("login_hint", params.loginHint);
  }
  return url.toString();
}

export async function exchangeGoogleCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ accessToken: string; idToken?: string }> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth credentials are not configured.");
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; id_token?: string };
  if (!json.access_token) {
    throw new Error("Google token response missing access_token.");
  }
  return { accessToken: json.access_token, idToken: json.id_token };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo request failed (${res.status}).`);
  }
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!data.sub || !data.email) {
    throw new Error("Google profile is missing required sub or email.");
  }
  if (data.email_verified !== true) {
    throw new Error("UNVERIFIED_GOOGLE_EMAIL");
  }
  const email = data.email.trim().toLowerCase();
  return {
    sub: data.sub,
    email,
    emailVerified: true,
    name: data.name?.trim() || email.split("@")[0] || "MediFlow User",
    picture: data.picture ?? null,
  };
}

