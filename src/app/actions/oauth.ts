"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { createSession, generateSessionToken, hashPassword, requireAuth, setSessionCookie } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { createGooglePharmacySignup, unlinkGoogleAccount } from "@/server/domain/oauth-login";
import {
  GOOGLE_SIGNUP_COOKIE,
  verifySignedPayload,
  type PendingGoogleSignupPayload,
} from "@/server/oauth/google";

export async function completeGoogleSignupAction(
  prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const pharmacyName = ((formData.get("pharmacyName") as string) ?? "").trim();
  const fullName = ((formData.get("fullName") as string) ?? "").trim();
  const rawPassword = (formData.get("password") as string) ?? "";

  if (pharmacyName.length < 2) {
    return { error: "Please enter your pharmacy name (at least 2 characters)." };
  }
  if (fullName.length < 2) {
    return { error: "Please enter your full name (at least 2 characters)." };
  }
  if (rawPassword.length > 0 && rawPassword.length < 8) {
    return { error: "Password must be at least 8 characters, or leave it blank to skip." };
  }

  const jar = await cookies();
  const pending = verifySignedPayload<PendingGoogleSignupPayload>(jar.get(GOOGLE_SIGNUP_COOKIE)?.value);
  if (!pending) {
    return { error: "Your Google sign-up session expired. Please continue with Google again." };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

  try {
    const passwordHash = rawPassword.length > 0 ? await hashPassword(rawPassword) : null;
    const created = await db.transaction((tx) =>
      createGooglePharmacySignup(tx, {
        profile: pending.profile,
        pharmacyName,
        fullName,
        passwordHash,
        ip,
      }),
    );
    const token = generateSessionToken();
    await createSession(token, created.userId, created.tenantId, created.storeId);
    await setSessionCookie(token);
    jar.delete(GOOGLE_SIGNUP_COOKIE);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    console.error("[completeGoogleSignupAction] Failed:", err);
    return { error: "Unable to create pharmacy account. Please try again." };
  }

  redirect("/dashboard");
}

export async function unlinkGoogleAccountAction(): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireAuth();
  try {
    await unlinkGoogleAccount(db, user.id);
    revalidatePath("/dashboard/settings/profile");
    return { ok: true };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not unlink Google account." };
  }
}

