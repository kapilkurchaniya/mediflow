"use client";

import { useState } from "react";
import {
  Users,
  Plus,
  Phone,
  Mail,
  Building,
  Check,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { createMedicalRep, toggleMedicalRepStatus } from "@/app/actions/medical-reps";
import clsx from "clsx";

interface MedicalRep {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  commissionRateBp: number;
  isActive: boolean;
}

export function MedicalRepsClient({ initialReps }: { initialReps: MedicalRep[] }) {
  const [reps, setReps] = useState(initialReps);
  const [showModal, setShowModal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (id: string, current: boolean) => {
    const res = await toggleMedicalRepStatus(id, current);
    if (res.success) {
      setReps((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: !current } : r)));
    }
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const res = await createMedicalRep(formData);

    if (res.error) {
      setError(res.error);
    } else if (res.rep) {
      setReps([...reps, res.rep]);
      setShowModal(false);
    }
    setPending(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-500">
          Manage pharma medical representatives (MRs), visiting consultants, and doctor commission rates.
        </p>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="btn btn-primary btn-sm"
        >
          <Plus className="h-4 w-4" /> Add Medical Rep
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reps.length === 0 ? (
          <div className="col-span-full card p-12 text-center text-ink-400">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No medical representatives registered yet. Click &ldquo;Add Medical Rep&rdquo; to create one.
          </div>
        ) : (
          reps.map((r) => (
            <div key={r.id} className="card p-5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm text-ink-900">{r.name}</h4>
                    <span className="text-xs text-ink-500 flex items-center gap-1 mt-0.5">
                      <Building className="h-3 w-3" />
                      {r.companyName || "Independent Representative"}
                    </span>
                  </div>
                  <span
                    className={clsx(
                      "badge text-[11px]",
                      r.isActive ? "badge-success" : "badge-neutral"
                    )}
                  >
                    {r.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="pt-2 border-t border-ink-100 space-y-1 text-xs text-ink-600">
                  {r.phone && (
                    <div className="flex items-center gap-1.5 font-mono">
                      <Phone className="h-3 w-3 text-ink-400" /> +{r.phone}
                    </div>
                  )}
                  {r.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-ink-400" /> {r.email}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-ink-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-ink-400 block">Commission Rate</span>
                  <span className="font-mono font-bold text-xs text-primary-700">
                    {(r.commissionRateBp / 100).toFixed(2)}% of Sales
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggle(r.id, r.isActive)}
                  className="btn btn-ghost btn-xs text-ink-500"
                >
                  {r.isActive ? (
                    <span className="text-rose-600">Deactivate</span>
                  ) : (
                    <span className="text-emerald-600">Activate</span>
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Rep Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-xl border border-ink-150 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">Add Medical Representative</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-ink-400 hover:text-ink-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4">
              {error && (
                <div className="alert-error text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Representative / Doctor Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Rahul Sharma"
                  className="input input-sm w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Pharma Company</label>
                  <input
                    type="text"
                    name="companyName"
                    placeholder="Sun Pharma, Cipla"
                    className="input input-sm w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    name="commissionRatePct"
                    defaultValue="2.0"
                    className="input input-sm w-full font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="9876543210"
                    className="input input-sm w-full font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    placeholder="rahul@example.com"
                    className="input input-sm w-full"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-150">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="btn btn-primary btn-sm"
                >
                  <Check className="h-4 w-4" /> {pending ? "Adding…" : "Save Representative"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
