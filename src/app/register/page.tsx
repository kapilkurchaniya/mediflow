import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth";
import { isGoogleOAuthConfigured } from "@/server/oauth/google";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const { user } = await getCurrentSession();
  if (user) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const oauthError = sp.error_description || (sp.error ? "Could not sign up with Google. Please try again." : null);

  return <RegisterForm googleEnabled={isGoogleOAuthConfigured()} oauthError={oauthError} />;
}
