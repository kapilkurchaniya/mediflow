"use client";

import { useState, useEffect } from "react";
import { Stethoscope, User, ChevronDown, ChevronUp } from "lucide-react";
import type { PosDataSource, DoctorRow, MedicalRepRow } from "../_data/posData";
import type { ComplianceState } from "../_state/types";

interface CompliancePanelProps {
  compliance: ComplianceState;
  hasControlledItems: boolean;
  dataSource: PosDataSource;
  onChange: (patch: Partial<ComplianceState>) => void;
}

export function CompliancePanel({
  compliance,
  hasControlledItems,
  dataSource,
  onChange,
}: CompliancePanelProps) {
  const [isManuallyToggled, setIsManuallyToggled] = useState<boolean | null>(null);
  const isOpen = isManuallyToggled !== null ? isManuallyToggled : hasControlledItems;
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [medicalReps, setMedicalReps] = useState<MedicalRepRow[]>([]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const [docs, reps] = await Promise.all([
          dataSource.getDoctors(),
          dataSource.getMedicalReps(),
        ]);
        if (active) {
          setDoctors(docs);
          setMedicalReps(reps);
        }
      } catch (err) {
        console.error("Error loading doctors/reps:", err);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, [dataSource]);

  const handleDoctorSelect = (docId: string) => {
    if (!docId) {
      onChange({ doctorId: "", doctorName: "", doctorRegNo: "", doctorAddress: "" });
      return;
    }
    const doc = doctors.find((d) => d.id === docId);
    if (doc) {
      onChange({
        doctorId: doc.id,
        doctorName: doc.name,
        doctorRegNo: doc.regNo,
        doctorAddress: doc.hospital || "",
      });
    }
  };

  return (
    <div className="card shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setIsManuallyToggled(!isOpen)}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-ink-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-brand-600" />
          <span className="text-xs font-bold text-ink-900">
            Doctor & Prescription {hasControlledItems && <span className="text-rose-600">*</span>}
          </span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-ink-400" /> : <ChevronDown className="w-4 h-4 text-ink-400" />}
      </button>

      {isOpen && (
        <div className="p-3 pt-0 border-t border-ink-100 space-y-2.5 text-xs">
          {doctors.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Select Registered Doctor</label>
              <select
                value={compliance.doctorId}
                onChange={(e) => handleDoctorSelect(e.target.value)}
                className="select !py-1 text-xs mt-0.5"
              >
                <option value="">— Or type doctor name below —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.regNo})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Doctor Name {hasControlledItems && "*"}</label>
              <input
                type="text"
                value={compliance.doctorName}
                onChange={(e) => onChange({ doctorName: e.target.value })}
                placeholder="Dr. Name"
                className="input !py-1 text-xs mt-0.5"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Reg. No</label>
              <input
                type="text"
                value={compliance.doctorRegNo}
                onChange={(e) => onChange({ doctorRegNo: e.target.value })}
                placeholder="e.g. MCI-12345"
                className="input !py-1 text-xs mt-0.5 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Patient Age & Gender</label>
              <div className="flex gap-1.5 mt-0.5">
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={compliance.patientAge}
                  onChange={(e) => onChange({ patientAge: e.target.value ? parseInt(e.target.value, 10) : "" })}
                  placeholder="Age"
                  className="input !py-1 text-xs w-16"
                />
                <select
                  value={compliance.patientGender}
                  onChange={(e) => onChange({ patientGender: e.target.value })}
                  className="select !py-1 text-xs flex-1"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Prescription Date</label>
              <input
                type="date"
                value={compliance.prescriptionDate}
                onChange={(e) => onChange({ prescriptionDate: e.target.value })}
                className="input !py-1 text-xs mt-0.5"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-600">Prescription Ref / Notes</label>
            <input
              type="text"
              value={compliance.prescriptionRef}
              onChange={(e) => onChange({ prescriptionRef: e.target.value })}
              placeholder="e.g. Rx-9872 or clinic slip"
              className="input !py-1 text-xs mt-0.5"
            />
          </div>

          {medicalReps.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Medical Representative (Attribution)</label>
              <select
                value={compliance.medicalRepId}
                onChange={(e) => onChange({ medicalRepId: e.target.value })}
                className="select !py-1 text-xs mt-0.5"
              >
                <option value="">— None —</option>
                {medicalReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.companyName ? `(${r.companyName})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
