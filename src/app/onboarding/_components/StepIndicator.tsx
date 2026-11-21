"use client";

import React from "react";
import { Check, Building2, Store, Pill, Users, Printer } from "lucide-react";

interface StepIndicatorProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

const STEPS = [
  { id: 1, title: "Business Identity", icon: Building2 },
  { id: 2, title: "Store & Licences", icon: Store },
  { id: 3, title: "Inventory Seed", icon: Pill },
  { id: 4, title: "Pharmacist & Team", icon: Users },
  { id: 5, title: "Thermal Print Drill", icon: Printer },
];

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <nav aria-label="Onboarding Progress" className="w-full">
      <ol className="flex items-center justify-between w-full">
        {STEPS.map((step, idx) => {
          const isDone = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const Icon = step.icon;

          return (
            <li
              key={step.id}
              className={`flex-1 flex items-center ${idx !== STEPS.length - 1 ? "pr-2 sm:pr-4" : ""}`}
            >
              <div
                onClick={() => onStepClick && isDone && onStepClick(step.id)}
                data-tooltip={`Step ${step.id}: ${step.title}`}
                className={`flex items-center gap-2 sm:gap-3 transition-colors ${
                  isDone ? "cursor-pointer text-emerald-700" : ""
                } ${isCurrent ? "text-brand-700 font-semibold" : "text-ink-400"}`}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 transition-all ${
                    isDone
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                      : isCurrent
                        ? "border-brand-600 bg-brand-50 text-brand-700 ring-4 ring-brand-100"
                        : "border-ink-200 bg-white text-ink-400"
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-[10.5px] uppercase tracking-wider font-mono text-ink-400">
                    Step {step.id}
                  </p>
                  <p className="text-xs sm:text-[13px] font-semibold leading-tight text-ink-800">
                    {step.title}
                  </p>
                </div>
              </div>

              {idx !== STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 sm:mx-4 transition-colors ${
                    currentStep > step.id ? "bg-emerald-500" : "bg-ink-150"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
