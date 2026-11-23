"use client";

import React, { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Search,
  Stethoscope,
  User,
  Trash2,
  ScanLine,
  X,
  AlertCircle,
  ExternalLink,
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  UserPlus,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/app/components/ui";
import { createPrescription, getPrescriptions } from "@/app/actions/compliance";
import { MedicineAutocompleteInput } from "./MedicineAutocompleteInput";

export interface PrescriptionItem {
  id?: string;
  medicineName: string;
  dosage?: string;
  frequency?: string;
  durationDays?: number;
  quantityPrescribed: number;
  instructions?: string;
}

export type PrescriptionRecord = Awaited<ReturnType<typeof getPrescriptions>>[number];

export function PrescriptionsView({
  initialPrescriptions,
  doctorsList,
}: {
  initialPrescriptions: PrescriptionRecord[];
  doctorsList: Array<{ id: string; name: string; regNo: string }>;
}) {
  const router = useRouter();
  const [optimisticState, setOptimisticState] = useState<{
    base: PrescriptionRecord[];
    records: PrescriptionRecord[];
  } | null>(null);
  const prescriptions =
    optimisticState?.base === initialPrescriptions
      ? optimisticState.records
      : initialPrescriptions;
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState("");

  // New Prescription Form state
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState<number | "">("");
  const [patientGender, setPatientGender] = useState("male");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorRegNo, setDoctorRegNo] = useState("");
  const [doctorQualification, setDoctorQualification] = useState("");
  const [doctorSpecialization, setDoctorSpecialization] = useState("");
  const [doctorHospital, setDoctorHospital] = useState("");
  const [doctorPhone, setDoctorPhone] = useState("");
  const [doctorAddress, setDoctorAddress] = useState("");
  const [autoEnrollDoctor, setAutoEnrollDoctor] = useState(true);
  const [isScanningRx, setIsScanningRx] = useState(false);
  const [scanBanner, setScanBanner] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [rxNumber, setRxNumber] = useState("");
  const [prescriptionDate, setPrescriptionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [rxItems, setRxItems] = useState<PrescriptionItem[]>([
    { medicineName: "", dosage: "1 tab", frequency: "1-0-1", durationDays: 5, quantityPrescribed: 10 },
  ]);

  const handleDoctorSelect = (docId: string) => {
    setSelectedDoctorId(docId);
    const doc = doctorsList.find((d) => d.id === docId);
    if (doc) {
      setDoctorName(doc.name);
      setDoctorRegNo(doc.regNo);
      setAutoEnrollDoctor(false);
    }
  };

  const handleScanRxFile = async (file: File) => {
    setIsScanningRx(true);
    setFormError("");
    setScanBanner(null);
    setIsModalOpen(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ocr/prescription", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to scan prescription.");
        return;
      }

      const ex = data.extracted || {};
      if (ex.patientName) setPatientName(ex.patientName);
      if (ex.patientAge !== null && ex.patientAge !== undefined) setPatientAge(ex.patientAge);
      if (ex.patientGender) setPatientGender(ex.patientGender);
      if (ex.patientPhone) setPatientPhone(ex.patientPhone);
      if (ex.patientAddress) setPatientAddress(ex.patientAddress);
      if (ex.rxNumber) setRxNumber(ex.rxNumber);
      if (ex.prescriptionDate) setPrescriptionDate(ex.prescriptionDate);
      if (ex.diagnosis) setDiagnosis(ex.diagnosis);
      if (ex.notes) setNotes(ex.notes);

      if (data.matchedDoctor) {
        setSelectedDoctorId(data.matchedDoctor.id);
        setDoctorName(data.matchedDoctor.name);
        setDoctorRegNo(data.matchedDoctor.regNo || ex.doctorRegNo || "");
        setAutoEnrollDoctor(false);
        setScanBanner(
          `Scanned "${file.name}" — matched existing doctor ${data.matchedDoctor.name} and extracted ${ex.items?.length || 0} medicines.`
        );
      } else {
        setSelectedDoctorId("");
        if (ex.doctorName) setDoctorName(ex.doctorName);
        if (ex.doctorRegNo) setDoctorRegNo(ex.doctorRegNo);
        setDoctorQualification(ex.doctorQualification || "");
        setDoctorSpecialization(ex.doctorSpecialization || "");
        setDoctorHospital(ex.doctorHospital || "");
        setDoctorPhone(ex.doctorPhone || "");
        setDoctorAddress(ex.doctorAddress || "");
        setAutoEnrollDoctor(Boolean(ex.doctorName));
        setScanBanner(
          `Scanned "${file.name}" — extracted ${ex.items?.length || 0} medicines${
            ex.doctorName ? ` & new doctor "${ex.doctorName}" (will auto-enroll in Doctor Master on save)` : ""
          }. Please verify before saving.`
        );
      }

      if (Array.isArray(ex.items) && ex.items.length > 0) {
        setRxItems(ex.items);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to scan prescription");
    } finally {
      setIsScanningRx(false);
    }
  };

  const addRxItem = () => {
    setRxItems([
      ...rxItems,
      { medicineName: "", dosage: "1 tab", frequency: "1-0-1", durationDays: 5, quantityPrescribed: 10 },
    ]);
  };

  const removeRxItem = (index: number) => {
    if (rxItems.length <= 1) return;
    setRxItems(rxItems.filter((_, i) => i !== index));
  };

  const updateRxItem = <K extends keyof PrescriptionItem>(
    index: number,
    field: K,
    val: PrescriptionItem[K]
  ) => {
    const updated = [...rxItems];
    const item = updated[index];
    if (item) {
      updated[index] = { ...item, [field]: val };
      setRxItems(updated);
    }
  };

  const handleSavePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!patientName.trim()) {
      setFormError("Patient name is required");
      return;
    }
    if (!doctorName.trim()) {
      setFormError("Doctor name is required");
      return;
    }
    const validItems = rxItems.filter((i) => i.medicineName.trim().length > 0);
    if (validItems.length === 0) {
      setFormError("Please add at least one prescribed medicine");
      return;
    }

    startTransition(async () => {
      const res = await createPrescription({
        patientName,
        patientAge: patientAge === "" ? null : Number(patientAge),
        patientGender,
        patientPhone,
        patientAddress,
        doctorId: selectedDoctorId || null,
        doctorName,
        doctorRegNo,
        doctorQualification: doctorQualification || null,
        doctorSpecialization: doctorSpecialization || null,
        doctorHospital: doctorHospital || null,
        doctorPhone: doctorPhone || null,
        doctorAddress: doctorAddress || null,
        autoEnrollDoctor: !selectedDoctorId && autoEnrollDoctor,
        rxNumber,
        prescriptionDate,
        diagnosis,
        notes,
        items: validItems,
      });

      if (res.success && res.prescription) {
        setIsModalOpen(false);
        const newRecord: PrescriptionRecord = {
          rx: res.prescription,
          doctor: null,
          customer: null,
        };
        setOptimisticState({
          base: initialPrescriptions,
          records: [newRecord, ...prescriptions],
        });
        router.refresh();
      } else {
        setFormError(res.error || "Failed to save prescription");
      }
    });
  };

  const filteredPrescriptions = prescriptions.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.rx.patientName.toLowerCase().includes(q) ||
      p.rx.doctorName.toLowerCase().includes(q) ||
      (p.rx.rxNumber && p.rx.rxNumber.toLowerCase().includes(q)) ||
      (p.rx.doctorRegNo && p.rx.doctorRegNo.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance & Clinical • Prescription Repository"
        title="Prescriptions (Rx Master)"
        description="Digital prescription vault with prescriber verification, automatic refill tracking, and statutory compliance linking."
        backHref="/dashboard/compliance"
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={scanInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleScanRxFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => scanInputRef.current?.click()}
              disabled={isScanningRx}
              className="btn btn-secondary text-xs flex items-center gap-1.5 border-brand-300 text-brand-700 hover:bg-brand-50"
            >
              {isScanningRx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Scan Rx (Image / PDF)
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New Prescription
            </button>
          </div>
        }
      />

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by patient, doctor, Rx number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input text-xs pl-8 pr-3 py-2 w-full"
          />
          <Search className="h-4 w-4 text-ink-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Prescriptions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPrescriptions.length === 0 ? (
          <div className="col-span-full py-12">
            <EmptyState
              icon={FileText}
              title="No prescriptions found"
              description="Record digital prescriptions to enable one-click POS billing and statutory compliance linking."
              action={
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="btn btn-primary text-xs"
                >
                  Record First Prescription
                </button>
              }
            />
          </div>
        ) : (
          filteredPrescriptions.map(({ rx, doctor }) => (
            <div key={rx.id} className="card p-4 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-ink-500" />
                    <span className="font-semibold text-sm text-ink-900">{rx.patientName}</span>
                    {rx.patientAge && (
                      <span className="text-xs text-ink-400">({rx.patientAge}y, {rx.patientGender})</span>
                    )}
                  </div>
                  {rx.patientPhone && (
                    <div className="text-xs text-ink-500 mt-0.5">Ph: {rx.patientPhone}</div>
                  )}
                </div>

                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    rx.status === "active"
                      ? "bg-emerald-100 text-emerald-800"
                      : rx.status === "partially_dispensed"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {rx.status.replace("_", " ")}
                </span>
              </div>

              <div className="border-t border-ink-100 pt-2 space-y-1 text-xs text-ink-600">
                <div className="flex items-center gap-1.5 text-ink-900 font-medium">
                  <Stethoscope className="h-3.5 w-3.5 text-brand-600" />
                  Dr. {rx.doctorName}
                  {rx.doctorRegNo && (
                    <span className="text-[10px] font-mono bg-ink-100 px-1 py-0.2 rounded text-ink-600">
                      {rx.doctorRegNo}
                    </span>
                  )}
                </div>
                {rx.diagnosis && (
                  <div className="text-[11px] text-ink-500">
                    <span className="font-medium text-ink-700">Diagnosis:</span> {rx.diagnosis}
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-ink-400 pt-1">
                  <span>Rx Date: {new Date(rx.prescriptionDate).toLocaleDateString("en-IN")}</span>
                  {rx.rxNumber && <span className="font-mono">#{rx.rxNumber}</span>}
                </div>
              </div>

              <div className="pt-2 border-t border-ink-100 flex items-center justify-between">
                <Link
                  href={`/dashboard/sales/pos?rxId=${rx.id}`}
                  className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-brand-700 hover:text-brand-800 font-medium"
                >
                  <ScanLine className="h-3.5 w-3.5" />
                  Bill at Counter
                </Link>
                {rx.imageUrl && (
                  <a
                    href={rx.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-ink-500 hover:text-ink-800 flex items-center gap-1"
                  >
                    View Rx Scan <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Prescription Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-ink-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-ink-150 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-brand-600" />
                <h2 className="font-semibold text-ink-900 text-base">New Prescription Record</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="btn btn-ghost btn-icon text-ink-400 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePrescription} className="overflow-y-auto p-5 space-y-4 flex-1">
              {/* Scan / Drop Rx Strip */}
              <div
                onClick={() => !isScanningRx && scanInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f && !isScanningRx) void handleScanRxFile(f);
                }}
                className="rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50/70 p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5 text-xs">
                  <div className="w-8 h-8 rounded-lg bg-white border border-brand-200 flex items-center justify-center text-brand-600 shrink-0">
                    {isScanningRx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="font-semibold text-ink-900">
                      {isScanningRx
                        ? "Scanning prescription with AI OCR…"
                        : "Scan or drop Prescription (Photo, PDF, or Scanner file)"}
                    </div>
                    <div className="text-[11px] text-ink-500">
                      Auto-fills patient, doctor (+ Medical Council Reg No), diagnosis &amp; prescribed medicines
                    </div>
                  </div>
                </div>
                <span className="btn btn-secondary btn-xs shrink-0">Upload / Scan</span>
              </div>

              {scanBanner && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{scanBanner}</span>
                </div>
              )}

              {formError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Patient Section */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">Patient Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="label text-xs">Patient Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="9876543210"
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label text-xs">Age</label>
                    <input
                      type="number"
                      placeholder="35"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value === "" ? "" : Number(e.target.value))}
                      className="input text-xs"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Gender</label>
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value)}
                      className="input text-xs"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Patient Address</label>
                    <input
                      type="text"
                      placeholder="Street, City, Pincode"
                      value={patientAddress}
                      onChange={(e) => setPatientAddress(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Doctor Section */}
              <div className="space-y-2 pt-2 border-t border-ink-150">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">Prescribing Doctor</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Select from Doctor Registry</label>
                    <select
                      value={selectedDoctorId}
                      onChange={(e) => handleDoctorSelect(e.target.value)}
                      className="input text-xs"
                    >
                      <option value="">— Or enter new doctor below —</option>
                      {doctorsList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.regNo})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Doctor Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. A. K. Sharma"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Medical Council Reg No</label>
                    <input
                      type="text"
                      placeholder="e.g. MCI-2015-8849"
                      value={doctorRegNo}
                      onChange={(e) => setDoctorRegNo(e.target.value)}
                      className="input text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Rx Date *</label>
                    <input
                      type="date"
                      required
                      value={prescriptionDate}
                      onChange={(e) => setPrescriptionDate(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                </div>
                {!selectedDoctorId && doctorName.trim() && (
                  <label className="flex items-center gap-2 text-xs text-brand-800 bg-brand-50/60 border border-brand-200 rounded-lg px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoEnrollDoctor}
                      onChange={(e) => setAutoEnrollDoctor(e.target.checked)}
                    />
                    <UserPlus className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                    <span>
                      Auto-enroll <strong>{doctorName}</strong>
                      {doctorHospital ? ` (${doctorHospital})` : ""} into Doctor Master
                    </span>
                  </label>
                )}
              </div>

              {/* Prescribed Items Section */}
              <div className="space-y-2 pt-2 border-t border-ink-150">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Prescribed Medicines ({rxItems.length})
                  </h3>
                  <button
                    type="button"
                    onClick={addRxItem}
                    className="text-xs text-brand-600 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Medicine
                  </button>
                </div>

                <div className="space-y-2">
                  {rxItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-ink-50 p-2 rounded-lg text-xs">
                      <MedicineAutocompleteInput
                        value={item.medicineName}
                        onChangeName={(name) => updateRxItem(idx, "medicineName", name)}
                        onSelectOption={(opt) => {
                          if (opt.strength && !item.dosage) {
                            updateRxItem(idx, "dosage", opt.strength);
                          }
                        }}
                      />
                      <div className="w-24 shrink-0">
                        <input
                          type="text"
                          placeholder="Dosage (500mg)"
                          value={item.dosage}
                          onChange={(e) => updateRxItem(idx, "dosage", e.target.value)}
                          className="input text-xs bg-white py-1 px-2 h-7"
                        />
                      </div>
                      <div className="w-20 shrink-0">
                        <input
                          type="text"
                          placeholder="1-0-1"
                          value={item.frequency}
                          onChange={(e) => updateRxItem(idx, "frequency", e.target.value)}
                          className="input text-xs bg-white py-1 px-2 h-7"
                        />
                      </div>
                      <div className="w-16 shrink-0">
                        <input
                          type="number"
                          placeholder="Qty"
                          value={item.quantityPrescribed}
                          onChange={(e) => updateRxItem(idx, "quantityPrescribed", Number(e.target.value))}
                          className="input text-xs bg-white py-1 px-2 h-7 font-bold"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRxItem(idx)}
                        disabled={rxItems.length <= 1}
                        className="text-ink-400 hover:text-rose-600 disabled:opacity-30 p-1 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagnosis & Notes */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-ink-150">
                <div>
                  <label className="label text-xs">Diagnosis / Chief Complaint</label>
                  <input
                    type="text"
                    placeholder="e.g. Upper respiratory tract infection"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label text-xs">Rx Reference / Slip Number</label>
                  <input
                    type="text"
                    placeholder="e.g. RX-2026-091"
                    value={rxNumber}
                    onChange={(e) => setRxNumber(e.target.value)}
                    className="input text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-ink-150 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn btn-primary text-xs"
                >
                  {isPending ? "Saving..." : "Save Prescription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
