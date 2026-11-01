"use client";

import React, { useState } from "react";
import { Check, Database, FileSpreadsheet, ListFilter, CheckCircle2, Play } from "lucide-react";
import { ImportEntity } from "@/server/domain/import/types";
import { EntityStep } from "./steps/EntityStep";
import { UploadStep } from "./steps/UploadStep";
import { MappingStep } from "./steps/MappingStep";
import { ReviewStep } from "./steps/ReviewStep";
import { CommitProgressStep } from "./steps/CommitProgressStep";

interface ImportWizardProps {
  initialEntity?: ImportEntity;
  stores: { id: string; name: string; code: string }[];
  defaultStoreId: string;
}

export function ImportWizard({ initialEntity, stores, defaultStoreId }: ImportWizardProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1: Entity & Store
  const [selectedEntity, setSelectedEntity] = useState<ImportEntity>(initialEntity ?? "medicines");
  const [selectedStoreId, setSelectedStoreId] = useState<string>(defaultStoreId);

  // Step 2: Staged Job Data
  const [jobId, setJobId] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [suggestedMapping, setSuggestedMapping] = useState<Record<string, string>>({});

  // Step 4: Commit Options
  const [skipErrors, setSkipErrors] = useState<boolean>(true);

  const STEPS = [
    { num: 1, label: "Entity", icon: Database },
    { num: 2, label: "Upload", icon: FileSpreadsheet },
    { num: 3, label: "Map Columns", icon: ListFilter },
    { num: 4, label: "Review", icon: CheckCircle2 },
    { num: 5, label: "Commit", icon: Play },
  ];

  const handleReset = () => {
    setCurrentStep(1);
    setJobId("");
    setHeaders([]);
    setSampleRows([]);
    setSuggestedMapping({});
  };

  return (
    <div className="space-y-6">
      {/* Wizard Progress Stepper */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;

            return (
              <React.Fragment key={step.num}>
                <div className="flex flex-col items-center space-y-1.5">
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                      isCompleted
                        ? "bg-brand-600 text-white shadow-sm"
                        : isCurrent
                        ? "bg-brand-50 border-2 border-brand-600 text-brand-700 shadow-sm ring-2 ring-brand-500/20"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`text-[11px] font-medium hidden sm:inline-block ${
                      isCurrent ? "text-brand-700 font-semibold" : isCompleted ? "text-ink-800" : "text-ink-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 sm:mx-4 transition-all ${
                      currentStep > step.num ? "bg-brand-600" : "bg-slate-200"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step Content Container */}
      <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 bg-white shadow-xs min-h-[420px]">
        {currentStep === 1 && (
          <EntityStep
            selectedEntity={selectedEntity}
            onSelectEntity={setSelectedEntity}
            selectedStoreId={selectedStoreId}
            onSelectStore={setSelectedStoreId}
            stores={stores}
            onNext={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <UploadStep
            entity={selectedEntity}
            storeId={selectedEntity === "batches" ? selectedStoreId : undefined}
            onJobReady={(params) => {
              setJobId(params.jobId);
              setHeaders(params.headers);
              setSampleRows(params.sampleRows);
              setSuggestedMapping(params.suggestedMapping);
              setCurrentStep(3);
            }}
            onBack={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 3 && (
          <MappingStep
            jobId={jobId}
            entity={selectedEntity}
            headers={headers}
            sampleRows={sampleRows}
            initialMapping={suggestedMapping}
            onMappingSaved={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 4 && (
          <ReviewStep
            jobId={jobId}
            entity={selectedEntity}
            onProceedToCommit={(skip) => {
              setSkipErrors(skip);
              setCurrentStep(5);
            }}
            onBack={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 5 && (
          <CommitProgressStep
            jobId={jobId}
            entity={selectedEntity}
            storeId={selectedEntity === "batches" ? selectedStoreId : undefined}
            skipErrors={skipErrors}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}
