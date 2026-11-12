import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth";
import {
  buildGoogleAuthUrl,
  computeCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  getGoogleCallbackUrl,
  isGoogleOAuthConfigured,
  OAUTH_TX_COOKIE,
  OAUTH_TX_TTL_SECONDS,
  sanitizeNextPath,
  signSignedPayload,
  type GoogleOAuthMode,
  type OAuthTxPayload,
} from "@/server/oauth/google";

const ALLOWED_MODES = new Set<GoogleOAuthMode>(["login", "register", "link", "invite"]);

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", request.url));
  }

  const sp = request.nextUrl.searchParams;
  const rawMode = (sp.get("mode") ?? "login") as GoogleOAuthMode;
  const mode: GoogleOAuthMode = ALLOWED_MODES.has(rawMode) ? rawMode : "login";
  const next = sanitizeNextPath(sp.get("next"), "/dashboard");
  const inviteToken = sp.get("inviteToken")?.trim() || undefined;
  const loginHint = sp.get("loginHint")?.trim() || undefined;

  let linkUserId: string | undefined;
  if (mode === "link") {
    const { user } = await getCurrentSession();
    if (!user) {
      return NextResponse.redirect(new URL("/login?error=session_required", request.url));
    }
    linkUserId = user.id;
  }

  if (mode === "invite" && !inviteToken) {
    return NextResponse.redirect(new URL("/login?error=invalid_invite", request.url));
  }

  const state = generateOAuthState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);
  const redirectUri = getGoogleCallbackUrl(request.url);

  const txPayload: OAuthTxPayload = {
    state,
    codeVerifier,
    mode,
    next,
    inviteToken,
    linkUserId,
    exp: Date.now() + OAUTH_TX_TTL_SECONDS * 1000,
  };

  const authUrl = buildGoogleAuthUrl({ state, codeChallenge, redirectUri, loginHint });
  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_TX_COOKIE, signSignedPayload(txPayload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_TX_TTL_SECONDS,
  });

  return response;
}

