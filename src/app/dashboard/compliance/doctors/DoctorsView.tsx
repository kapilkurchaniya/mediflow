"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Plus,
  Search,
  Building,
  Phone,
  Mail,
  MapPin,
  X,
  AlertCircle,
  Award,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/app/components/ui";
import { upsertDoctor } from "@/app/actions/compliance";

interface DoctorRecord {
  id: string;
  name: string;
  regNo: string;
  qualification: string | null;
  specialization: string | null;
  hospital: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
}

export function DoctorsView({
  initialDoctors,
}: {
  initialDoctors: DoctorRecord[];
}) {
  const router = useRouter();
  const [doctors, setDoctors] = useState<DoctorRecord[]>(initialDoctors);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState("");

  // Edit / Add Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [qualification, setQualification] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [hospital, setHospital] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const openAddModal = () => {
    setEditingId(null);
    setName("");
    setRegNo("");
    setQualification("MBBS");
    setSpecialization("");
    setHospital("");
    setPhone("");
    setEmail("");
    setAddress("");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (doc: DoctorRecord) => {
    setEditingId(doc.id);
    setName(doc.name);
    setRegNo(doc.regNo);
    setQualification(doc.qualification || "");
    setSpecialization(doc.specialization || "");
    setHospital(doc.hospital || "");
    setPhone(doc.phone || "");
    setEmail(doc.email || "");
    setAddress(doc.address || "");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    startTransition(async () => {
      const res = await upsertDoctor({
        id: editingId || undefined,
        name,
        regNo,
        qualification,
        specialization,
        hospital,
        phone,
        email,
        address,
      });

      if (res.success) {
        setIsModalOpen(false);
        router.refresh();
      } else {
        setFormError(res.error || "Failed to save doctor");
      }
    });
  };

  const filteredDoctors = doctors.filter((d) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.regNo.toLowerCase().includes(q) ||
      (d.hospital && d.hospital.toLowerCase().includes(q)) ||
      (d.specialization && d.specialization.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clinical Registry • Prescriber Verification"
        title="Doctor & Prescriber Master"
        description="Statutory Medical Council registration directory for prescription validation, Schedule H1 audit trails, and referral records."
        backHref="/dashboard/compliance"
        actions={
          <button
            onClick={openAddModal}
            className="btn btn-primary text-xs flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Doctor
          </button>
        }
      />

      {/* Search Bar */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="Search by name, Medical Council Reg No, hospital..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input text-xs pl-8 pr-3 py-2 w-full"
        />
        <Search className="h-4 w-4 text-ink-400 absolute left-2.5 top-2.5" />
      </div>

      {/* Doctors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDoctors.length === 0 ? (
          <div className="col-span-full py-12">
            <EmptyState
              icon={Stethoscope}
              title="No doctors in registry"
              description="Add prescribing doctors to automatically autocomplete registration numbers during POS billing and Schedule H1 logging."
              action={
                <button onClick={openAddModal} className="btn btn-primary text-xs">
                  Add First Doctor
                </button>
              }
            />
          </div>
        ) : (
          filteredDoctors.map((doc) => (
            <div
              key={doc.id}
              className="card p-4 space-y-3 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openEditModal(doc)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-ink-950">
                    <Stethoscope className="h-4 w-4 text-brand-600" />
                    Dr. {doc.name}
                  </div>
                  {doc.qualification && (
                    <div className="text-xs text-ink-500 font-medium mt-0.5 flex items-center gap-1">
                      <Award className="h-3 w-3 text-ink-400" />
                      {doc.qualification}
                      {doc.specialization && ` • ${doc.specialization}`}
                    </div>
                  )}
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-ink-100 text-ink-800 border border-ink-200">
                  {doc.regNo}
                </span>
              </div>

              <div className="border-t border-ink-100 pt-2 space-y-1 text-xs text-ink-600">
                {doc.hospital && (
                  <div className="flex items-center gap-1.5 text-ink-700">
                    <Building className="h-3 w-3 text-ink-400 shrink-0" />
                    <span className="truncate">{doc.hospital}</span>
                  </div>
                )}
                {doc.phone && (
                  <div className="flex items-center gap-1.5 text-ink-500">
                    <Phone className="h-3 w-3 text-ink-400 shrink-0" />
                    <span>{doc.phone}</span>
                  </div>
                )}
                {doc.address && (
                  <div className="flex items-start gap-1.5 text-ink-500">
                    <MapPin className="h-3 w-3 text-ink-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{doc.address}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-ink-100 flex items-center justify-between text-[11px] text-ink-400">
                <span>Verified Prescriber</span>
                <span className="text-brand-600 font-medium hover:underline">Edit details</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Doctor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-ink-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-ink-150 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-brand-600" />
                <h2 className="font-semibold text-ink-900 text-base">
                  {editingId ? "Edit Prescriber Details" : "Add Prescribing Doctor"}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="btn btn-ghost btn-icon text-ink-400 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label text-xs">Doctor Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Rajesh Verma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label text-xs">Medical Council Reg No *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MCI-2018-9921"
                    value={regNo}
                    onChange={(e) => setRegNo(e.target.value)}
                    className="input text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="label text-xs">Qualification</label>
                  <input
                    type="text"
                    placeholder="MBBS, MD (Medicine)"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Specialization</label>
                  <input
                    type="text"
                    placeholder="e.g. Cardiologist"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label text-xs">Hospital / Clinic Name</label>
                  <input
                    type="text"
                    placeholder="City Care Hospital"
                    value={hospital}
                    onChange={(e) => setHospital(e.target.value)}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label text-xs">Email Address</label>
                  <input
                    type="email"
                    placeholder="doctor@hospital.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="label text-xs">Clinic / Practice Address</label>
                <input
                  type="text"
                  placeholder="Cabin 4, Civil Lines, Near Metro Station"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div className="pt-3 border-t border-ink-150 flex items-center justify-end gap-2">
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
                  {isPending ? "Saving..." : editingId ? "Update Doctor" : "Add to Registry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
