import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { sanitizeNextPath } from "@/server/oauth/google";
import { SetupPasswordForm } from "./SetupPasswordForm";

export const metadata = {
  title: "Set Password — MediFlow",
};

export default async function SetupPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { user } = await requireAuth();
  const { next } = await searchParams;
  const safeNext = sanitizeNextPath(next, "/dashboard");

  // If password is already configured, proceed straight to target
  if (user.passwordHash) {
    redirect(safeNext);
  }

  return (
    <SetupPasswordForm
      userName={user.name}
      userEmail={user.email}
      nextPath={safeNext}
    />
  );
}

