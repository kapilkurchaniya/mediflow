import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth";
import { isGoogleOAuthConfigured } from "@/server/oauth/google";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const { user } = await getCurrentSession();
  if (user) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const oauthError = sp.error_description || (sp.error ? "Could not sign in with Google. Please try again." : null);

  return <LoginForm googleEnabled={isGoogleOAuthConfigured()} oauthError={oauthError} />;
}
