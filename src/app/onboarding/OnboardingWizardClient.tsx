"use client";

import React, { useState } from "react";
import { type OnboardingStatus } from "@/server/domain/onboarding/types";
import { StepIndicator } from "./_components/StepIndicator";
import { Step1Business } from "./_components/Step1Business";
import { Step2Store } from "./_components/Step2Store";
import { Step3Inventory } from "./_components/Step3Inventory";
import { Step4Staff } from "./_components/Step4Staff";
import { Step5PrintDrill } from "./_components/Step5PrintDrill";
import {
  saveBusinessDetailsAction,
  saveStoreProfileAction,
  bootstrapInventoryAction,
  inviteOnboardingStaffAction,
  completeOnboardingAction,
} from "@/app/actions/onboarding";

interface OnboardingWizardClientProps {
  initialStatus: OnboardingStatus;
}

export function OnboardingWizardClient({ initialStatus }: OnboardingWizardClientProps) {
  const [currentStep, setCurrentStep] = useState<number>(initialStatus.currentStep || 1);
  const [status, setStatus] = useState<OnboardingStatus>(initialStatus);

  return (
    <div className="space-y-8">
      {/* Stepper Navigation */}
      <div className="card p-4 sm:p-6">
        <StepIndicator
          currentStep={currentStep}
          onStepClick={(step) => setCurrentStep(step)}
        />
      </div>

      {/* Step Views */}
      {currentStep === 1 && (
        <Step1Business
          initialData={{
            name: status.tenant.name,
            legalName: status.tenant.legalName,
            gstin: status.tenant.gstin,
            stateCode: status.tenant.stateCode,
            taxScheme: status.tenant.taxScheme,
          }}
          onSave={saveBusinessDetailsAction}
          onSuccess={({ stateCode }) => {
            setStatus((prev) => ({
              ...prev,
              tenant: { ...prev.tenant, stateCode },
            }));
            setCurrentStep(2);
          }}
        />
      )}

      {currentStep === 2 && (
        <Step2Store
          initialData={status.store}
          onBack={() => setCurrentStep(1)}
          onSave={saveStoreProfileAction}
          onSuccess={() => setCurrentStep(3)}
        />
      )}

      {currentStep === 3 && (
        <Step3Inventory
          currentCount={status.inventoryCount}
          onBack={() => setCurrentStep(2)}
          onBootstrap={bootstrapInventoryAction}
          onSuccess={() => setCurrentStep(4)}
        />
      )}

      {currentStep === 4 && (
        <Step4Staff
          onBack={() => setCurrentStep(3)}
          onInvite={inviteOnboardingStaffAction}
          onSuccess={() => setCurrentStep(5)}
        />
      )}

      {currentStep === 5 && (
        <Step5PrintDrill
          businessData={{
            legalName: status.tenant.legalName,
            gstin: status.tenant.gstin,
            stateCode: status.tenant.stateCode,
            stateName: status.tenant.stateName,
          }}
          storeData={status.store}
          onBack={() => setCurrentStep(4)}
          onComplete={completeOnboardingAction}
        />
      )}
    </div>
  );
}

