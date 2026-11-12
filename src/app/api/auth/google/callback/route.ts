import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { createSession, generateSessionToken, setSessionCookie } from "@/server/auth";
import { DomainError } from "@/server/errors";
import {
  acceptInviteWithGoogle,
  linkGoogleAccount,
  resolveGoogleAuth,
} from "@/server/domain/oauth-login";
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  getGoogleCallbackUrl,
  GOOGLE_SIGNUP_COOKIE,
  GOOGLE_SIGNUP_TTL_SECONDS,
  OAUTH_TX_COOKIE,
  sanitizeNextPath,
  signSignedPayload,
  verifySignedPayload,
  type OAuthTxPayload,
  type PendingGoogleSignupPayload,
} from "@/server/oauth/google";

function redirectError(request: NextRequest, path: string, errorCode: string, message?: string) {
  const url = new URL(path, request.url);
  url.searchParams.set("error", errorCode);
  if (message) url.searchParams.set("error_description", message);
  const res = NextResponse.redirect(url);
  res.cookies.delete(OAUTH_TX_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const oauthError = sp.get("error");
  if (oauthError) {
    return redirectError(request, "/login", "oauth_denied", "Google sign-in was cancelled.");
  }

  const code = sp.get("code");
  const state = sp.get("state");
  const txCookie = request.cookies.get(OAUTH_TX_COOKIE)?.value;
  const tx = verifySignedPayload<OAuthTxPayload>(txCookie);

  if (!code || !state || !tx || tx.state !== state) {
    return redirectError(request, "/login", "invalid_oauth_state", "Sign-in session expired. Please try again.");
  }

  const fallbackPath =
    tx.mode === "link"
      ? "/dashboard/settings/profile"
      : tx.mode === "invite" && tx.inviteToken
        ? `/invite/${encodeURIComponent(tx.inviteToken)}`
        : tx.mode === "register"
          ? "/register"
          : "/login";

  try {
    const redirectUri = getGoogleCallbackUrl(request.url);
    const { accessToken } = await exchangeGoogleCode({
      code,
      codeVerifier: tx.codeVerifier,
      redirectUri,
    });
    const profile = await fetchGoogleUserInfo(accessToken);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;

    if (tx.mode === "link" && tx.linkUserId) {
      await linkGoogleAccount(db, { userId: tx.linkUserId, profile });
      const res = NextResponse.redirect(new URL("/dashboard/settings/profile?google=linked", request.url));
      res.cookies.delete(OAUTH_TX_COOKIE);
      return res;
    }

    if (tx.mode === "invite" && tx.inviteToken) {
      const inviteToken = tx.inviteToken;
      const accepted = await db.transaction((trx) => acceptInviteWithGoogle(trx, { token: inviteToken, profile, ip }));
      const sessionToken = generateSessionToken();
      await createSession(sessionToken, accepted.userId, accepted.tenantId, accepted.storeId);
      await setSessionCookie(sessionToken);
      const res = NextResponse.redirect(new URL("/dashboard", request.url));
      res.cookies.delete(OAUTH_TX_COOKIE);
      return res;
    }

    const resolution = await resolveGoogleAuth(db, profile, ip);
    if (!resolution.ok) {
      return redirectError(request, fallbackPath, "google_auth_failed", resolution.error);
    }

    if (resolution.status === "authenticated") {
      const sessionToken = generateSessionToken();
      await createSession(sessionToken, resolution.userId, resolution.tenantId, resolution.storeId);
      await setSessionCookie(sessionToken);
      const target = sanitizeNextPath(tx.next, "/dashboard");
      const res = NextResponse.redirect(new URL(target, request.url));
      res.cookies.delete(OAUTH_TX_COOKIE);
      return res;
    }

    // New user: stash verified Google profile in signed HttpOnly cookie and ask for Pharmacy Name
    const pending: PendingGoogleSignupPayload = {
      profile: resolution.profile,
      next: "/onboarding",
      exp: Date.now() + GOOGLE_SIGNUP_TTL_SECONDS * 1000,
    };
    const res = NextResponse.redirect(new URL("/register/google", request.url));
    res.cookies.delete(OAUTH_TX_COOKIE);
    res.cookies.set(GOOGLE_SIGNUP_COOKIE, signSignedPayload(pending), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GOOGLE_SIGNUP_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    console.error("[google/callback] OAuth failed:", err);
    if (err instanceof DomainError) {
      return redirectError(request, fallbackPath, err.code.toLowerCase(), err.message);
    }
    if (err instanceof Error && err.message === "UNVERIFIED_GOOGLE_EMAIL") {
      return redirectError(request, fallbackPath, "unverified_email", "Your Google email must be verified.");
    }
    return redirectError(request, fallbackPath, "google_callback_error", "Could not complete Google sign-in.");
  }
}

