import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth";
import {
  GOOGLE_SIGNUP_COOKIE,
  verifySignedPayload,
  type PendingGoogleSignupPayload,
} from "@/server/oauth/google";
import { GoogleSignupForm } from "./GoogleSignupForm";

export const dynamic = "force-dynamic";

export default async function GoogleRegisterPage() {
  const { user } = await getCurrentSession();
  if (user) {
    redirect("/dashboard");
  }

  const jar = await cookies();
  const pending = verifySignedPayload<PendingGoogleSignupPayload>(jar.get(GOOGLE_SIGNUP_COOKIE)?.value);
  if (!pending) {
    redirect("/register?error=google_session_expired");
  }

  return <GoogleSignupForm name={pending.profile.name} email={pending.profile.email} />;
}

