import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getOnboardingStatusAction } from "@/app/actions/onboarding";
import { OnboardingWizardClient } from "./OnboardingWizardClient";

export default async function OnboardingPage() {
  await requireAuth();
  const status = await getOnboardingStatusAction();

  return <OnboardingWizardClient initialStatus={status} />;
}

