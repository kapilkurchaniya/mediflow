"use client";

import { useState, useEffect } from "react";
import { Stethoscope, ChevronDown, ChevronUp, Plus, Loader2, AlertTriangle } from "lucide-react";
import type { PosDataSource, DoctorRow, MedicalRepRow } from "../_data/posData";
import type { ComplianceState } from "../_state/types";
import { upsertDoctor } from "@/app/actions/compliance";

interface CompliancePanelProps {
  compliance: ComplianceState;
  hasControlledItems: boolean;
  requiresStrictRegAndAddress?: boolean;
  forceOpen?: boolean;
  dataSource: PosDataSource;
  onChange: (patch: Partial<ComplianceState>) => void;
}

export function CompliancePanel({
  compliance,
  hasControlledItems,
  requiresStrictRegAndAddress = false,
  forceOpen = false,
  dataSource,
  onChange,
}: CompliancePanelProps) {
  const [isManuallyToggled, setIsManuallyToggled] = useState<boolean | null>(null);
  const isOpen = forceOpen || (isManuallyToggled !== null ? isManuallyToggled : hasControlledItems);
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [medicalReps, setMedicalReps] = useState<MedicalRepRow[]>([]);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocReg, setNewDocReg] = useState("");
  const [newDocHospital, setNewDocHospital] = useState("");
  const [docErr, setDocErr] = useState<string | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);

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

  const handleQuickAddDoctor = async () => {
    if (!newDocName.trim() || !newDocReg.trim()) {
      setDocErr("Doctor name and Registration No are required.");
      return;
    }
    setSavingDoc(true);
    setDocErr(null);
    try {
      const res = await upsertDoctor({
        name: newDocName.trim(),
        regNo: newDocReg.trim(),
        hospital: newDocHospital.trim() || null,
      });
      if (res.error || !res.doctorId) {
        setDocErr(res.error || "Failed to add doctor.");
        return;
      }
      const added: DoctorRow = {
        id: res.doctorId,
        name: newDocName.trim(),
        regNo: newDocReg.trim(),
        hospital: newDocHospital.trim() || null,
      };
      setDoctors((prev) => [added, ...prev]);
      onChange({
        doctorId: added.id,
        doctorName: added.name,
        doctorRegNo: added.regNo,
        doctorAddress: added.hospital || "",
      });
      setNewDocName("");
      setNewDocReg("");
      setNewDocHospital("");
      setShowAddDoc(false);
    } catch (e: unknown) {
      setDocErr(e instanceof Error ? e.message : "Failed to save doctor.");
    } finally {
      setSavingDoc(false);
    }
  };

  return (
    <div className={`card shadow-xs overflow-hidden ${forceOpen && hasControlledItems ? "ring-2 ring-amber-400" : ""}`}>
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
          {hasControlledItems && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] text-amber-900 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Scheduled / Rx items in bill — add Doctor &amp; Prescription details here to complete billing and auto-save to the Prescription Register.
              </span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-ink-600">Select Registered Doctor</label>
              <button
                type="button"
                onClick={() => {
                  setShowAddDoc((v) => !v);
                  setDocErr(null);
                }}
                className="text-[11px] font-semibold text-brand-700 hover:underline inline-flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                {showAddDoc ? "Close" : "New Doctor"}
              </button>
            </div>
            {doctors.length > 0 && (
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
            )}
          </div>

          {showAddDoc && (
            <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-2.5 space-y-2">
              <div className="text-[11px] font-semibold text-ink-800">Quick-Add Doctor</div>
              {docErr && <div className="text-[11px] text-rose-700 font-medium">{docErr}</div>}
              <input
                type="text"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Doctor Name (e.g. Dr. R. Sharma)"
                className="input !py-1 text-xs"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={newDocReg}
                  onChange={(e) => setNewDocReg(e.target.value)}
                  placeholder="Reg. No (MCI-...)"
                  className="input !py-1 text-xs font-mono"
                />
                <input
                  type="text"
                  value={newDocHospital}
                  onChange={(e) => setNewDocHospital(e.target.value)}
                  placeholder="Clinic / Hospital"
                  className="input !py-1 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={handleQuickAddDoctor}
                disabled={savingDoc}
                className="btn btn-primary btn-xs w-full justify-center inline-flex items-center gap-1"
              >
                {savingDoc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {savingDoc ? "Saving…" : "Save & Select Doctor"}
              </button>
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
                className={`input !py-1 text-xs mt-0.5 ${forceOpen && hasControlledItems && !compliance.doctorName.trim() ? "border-rose-400 bg-rose-50/50" : ""}`}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-600">
                Reg. No {requiresStrictRegAndAddress && "*"}
              </label>
              <input
                type="text"
                value={compliance.doctorRegNo}
                onChange={(e) => onChange({ doctorRegNo: e.target.value })}
                placeholder="e.g. MCI-12345"
                className={`input !py-1 text-xs mt-0.5 font-mono ${forceOpen && requiresStrictRegAndAddress && !compliance.doctorRegNo.trim() ? "border-rose-400 bg-rose-50/50" : ""}`}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-600">Patient Name</label>
            <input
              type="text"
              value={compliance.patientName ?? ""}
              onChange={(e) => onChange({ patientName: e.target.value })}
              placeholder="Patient name (or Walk-in Patient)"
              className="input !py-1 text-xs mt-0.5"
            />
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
            <label className="text-[11px] font-semibold text-ink-600">
              Prescription Ref / Rx No {hasControlledItems && "*"}
            </label>
            <input
              type="text"
              value={compliance.prescriptionRef}
              onChange={(e) => onChange({ prescriptionRef: e.target.value })}
              placeholder="e.g. Rx-9872 or clinic slip"
              className={`input !py-1 text-xs mt-0.5 ${forceOpen && hasControlledItems && !compliance.prescriptionRef.trim() ? "border-rose-400 bg-rose-50/50" : ""}`}
            />
          </div>

          {requiresStrictRegAndAddress && (
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Patient Address *</label>
              <input
                type="text"
                value={compliance.patientAddress}
                onChange={(e) => onChange({ patientAddress: e.target.value })}
                placeholder="Required for Schedule X / Narcotic"
                className={`input !py-1 text-xs mt-0.5 ${forceOpen && !compliance.patientAddress.trim() ? "border-rose-400 bg-rose-50/50" : ""}`}
              />
            </div>
          )}

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
