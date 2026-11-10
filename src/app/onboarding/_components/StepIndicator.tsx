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
                className={`flex items-center gap-2 sm:gap-3 transition-colors ${
                  isDone ? "cursor-pointer text-emerald-600 dark:text-emerald-400" : ""
                } ${isCurrent ? "text-indigo-600 dark:text-indigo-400 font-semibold" : "text-slate-400"}`}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 transition-all ${
                    isDone
                      ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                      : isCurrent
                        ? "border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 ring-4 ring-indigo-100 dark:ring-indigo-950/60"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400"
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" /> : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs uppercase tracking-wider font-mono opacity-80">
                    Step {step.id}
                  </p>
                  <p className="text-xs sm:text-sm font-medium leading-tight">
                    {step.title}
                  </p>
                </div>
              </div>

              {idx !== STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 sm:mx-4 transition-colors ${
                    currentStep > step.id
                      ? "bg-emerald-500"
                      : "bg-slate-200 dark:bg-slate-700"
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

